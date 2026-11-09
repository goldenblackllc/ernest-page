#!/usr/bin/env node
/**
 * Checks what each deployed Cloud Function is running. Every function is deployed
 * with its own copy of the source, so deploying one doesn't update the code
 * another one runs. For each function, this compares the source it was deployed
 * with against a branch and against the working folder, file by file, over the
 * files that function imports, and lists the files that differ.
 *
 * Usage (needs gcloud signed in to both projects):
 *   node scripts/check-deploys.mjs              # beta and live, against origin/main
 *   node scripts/check-deploys.mjs --beta       # or --live
 *   node scripts/check-deploys.mjs --ref origin/beta
 */
import { execFileSync } from 'child_process';
import { createHash } from 'crypto';
import { existsSync, readFileSync, readdirSync, statSync } from 'fs';
import { dirname, join, normalize, relative, resolve } from 'path';
import { inflateRawSync } from 'zlib';

const ROOT = resolve(dirname(new URL(import.meta.url).pathname), '..');
const FUNCTIONS = join(ROOT, 'functions');
const arg = (name) => {
    const i = process.argv.indexOf(name);
    return i > 0 ? process.argv[i + 1] : undefined;
};
const ref = arg('--ref') || 'origin/main';
const projects = process.argv.includes('--beta') ? ['earnest-page-beta']
    : process.argv.includes('--live') ? ['earnest-page']
    : ['earnest-page-beta', 'earnest-page'];

/** Git's id for a file's contents, so the three versions compare by hash. */
const blobId = (bytes) => createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex');
const isTest = (path) => path.includes('__tests__') || path.endsWith('.test.ts');

// The branch and the working folder, as paths relative to functions/ (src/…)
const atRef = Object.fromEntries(
    execFileSync('git', ['-C', ROOT, 'ls-tree', '-r', ref, 'functions/src'], { encoding: 'utf8' })
        .trim().split('\n').filter(Boolean)
        .map(line => {
            const [meta, path] = line.split('\t');
            return [path.slice('functions/'.length), meta.split(' ')[2]];
        }),
);
function walk(dir) {
    return readdirSync(dir).flatMap(name => {
        const path = join(dir, name);
        return statSync(path).isDirectory() ? walk(path) : [path];
    });
}
const working = Object.fromEntries(walk(join(FUNCTIONS, 'src')).map(f => [relative(FUNCTIONS, f), blobId(readFileSync(f))]));

// Which files each function imports, from the working folder
function imports(path) {
    const full = join(FUNCTIONS, path);
    if (!existsSync(full)) return [];
    return [...readFileSync(full, 'utf8').matchAll(/(?:from|import)\s*\(?\s*['"](\.{1,2}\/[^'"]+)['"]/g)].map(([, spec]) => {
        const base = normalize(join(dirname(path), spec)).replace(/\.js$/, '');
        return existsSync(join(FUNCTIONS, `${base}.ts`)) ? `${base}.ts` : join(base, 'index.ts');
    });
}
function closure(entry) {
    const seen = new Set();
    const todo = [entry];
    while (todo.length) {
        const file = todo.pop();
        if (seen.has(file)) continue;
        seen.add(file);
        todo.push(...imports(file));
    }
    return [...seen].filter(f => !isTest(f));
}
const entryOf = {};
for (const [, names, mod] of readFileSync(join(FUNCTIONS, 'src/index.ts'), 'utf8').matchAll(/export\s*\{([^}]*)\}\s*from\s*'\.\/([^']+)\.js'/g)) {
    for (const name of names.split(',')) entryOf[name.trim()] = `src/${mod}.ts`;
}

/** The .ts files under src/ in a zip, by path, as blob ids. Stored and deflated entries only. */
function sourcesInZip(zip) {
    const end = zip.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
    let at = zip.readUInt32LE(end + 16);
    const out = {};
    for (let i = 0; i < zip.readUInt16LE(end + 10); i++) {
        const method = zip.readUInt16LE(at + 10);
        const size = zip.readUInt32LE(at + 20);
        const nameLength = zip.readUInt16LE(at + 28);
        const extra = zip.readUInt16LE(at + 30) + zip.readUInt16LE(at + 32);
        const local = zip.readUInt32LE(at + 42);
        const name = zip.toString('utf8', at + 46, at + 46 + nameLength);
        at += 46 + nameLength + extra;
        if (!name.startsWith('src/') || !name.endsWith('.ts') || isTest(name)) continue;
        const dataAt = local + 30 + zip.readUInt16LE(local + 26) + zip.readUInt16LE(local + 28);
        const data = zip.subarray(dataAt, dataAt + size);
        out[name] = blobId(method === 8 ? inflateRawSync(data) : data);
    }
    return out;
}

for (const project of projects) {
    console.log(`\n== ${project === 'earnest-page' ? 'LIVE' : 'BETA'} (${project}), against ${ref} and the working folder`);
    const functions = JSON.parse(execFileSync('gcloud', ['functions', 'list', `--project=${project}`, '--format=json'], { encoding: 'utf8' }));
    functions.sort((a, b) => b.updateTime.localeCompare(a.updateTime));
    for (const fn of functions) {
        const name = fn.name.split('/').pop();
        const { bucket, object } = fn.buildConfig.source.storageSource;
        const deployed = sourcesInZip(execFileSync('gcloud', ['storage', 'cat', `gs://${bucket}/${object}`], { maxBuffer: 256 * 1024 * 1024 }));
        const files = entryOf[name] ? closure(entryOf[name]) : [];
        const differ = (versions) => files.filter(f => deployed[f] !== versions[f]).map(f => f.slice('src/'.length)).sort();
        const when = new Date(fn.updateTime).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
        const vsRef = differ(atRef).join(', ') || 'same';
        const vsWorking = differ(working).join(', ') || 'same';
        console.log(`${name.padEnd(22)} ${when.padEnd(18)} vs ${ref}: ${vsRef.padEnd(40)} vs working folder: ${vsWorking}`);
    }
}
