#!/usr/bin/env node
/**
 * Finds dead code in the website (src/) and Cloud Functions (functions/src/):
 *   1. Files not reachable from any entry point (pages, routes, layouts, functions/src/index.ts)
 *   2. Exports that nothing imports
 *   3. Translation namespaces in src/messages/en.json that nothing references
 *
 * Usage: node scripts/find-dead-code.mjs
 * Exits 1 when something is found, so it can gate a commit or CI step.
 *
 * Heuristic, not a compiler: dynamic imports with computed paths and
 * translation keys built at runtime are not followed. Check before deleting.
 */
import { readFileSync, readdirSync, statSync, existsSync } from 'fs';
import { join, dirname, relative, resolve } from 'path';

const ROOT = resolve(dirname(new URL(import.meta.url).pathname), '..');
const EXTS = ['.ts', '.tsx', '.js', '.mjs'];

function walk(dir) {
    if (!existsSync(dir)) return [];
    return readdirSync(dir).flatMap(name => {
        if (name === 'node_modules' || name.startsWith('.')) return [];
        const p = join(dir, name);
        return statSync(p).isDirectory() ? walk(p) : EXTS.some(e => p.endsWith(e)) ? [p] : [];
    });
}

const files = [...walk(join(ROOT, 'src')), ...walk(join(ROOT, 'functions/src'))];
const source = new Map(files.map(f => [f, readFileSync(f, 'utf8')]));
const isTest = f => f.includes('__tests__') || /\.test\.[tj]sx?$/.test(f) || f.includes('/src/test/');

// ─── Import resolution (@/ → src, @functions/ → functions/src, relative, .js → .ts) ───
function resolveImport(from, spec) {
    let base;
    if (spec.startsWith('@/')) base = join(ROOT, 'src', spec.slice(2));
    else if (spec.startsWith('@functions/')) base = join(ROOT, 'functions/src', spec.slice('@functions/'.length));
    else if (spec.startsWith('.')) base = resolve(dirname(from), spec);
    else return null;
    const stripped = base.replace(/\.js$/, '');
    for (const c of [base, ...EXTS.map(e => stripped + e), ...EXTS.map(e => join(stripped, 'index' + e))]) {
        if (source.has(c)) return c;
    }
    return null;
}

const IMPORT_RE = /(?:import|export)\s+(?:type\s+)?([\s\S]*?)\s+from\s*['"]([^'"]+)['"]|import\(\s*['"]([^'"]+)['"]\s*\)|^import\s+['"]([^'"]+)['"]/gm;
const imports = new Map(); // file -> [{ target, names: Set|'*' }]
for (const [file, text] of source) {
    const list = [];
    for (const m of text.matchAll(IMPORT_RE)) {
        const spec = m[2] || m[3] || m[4];
        const target = resolveImport(file, spec);
        if (!target) continue;
        let names = '*';
        const clause = m[1];
        if (clause && !/\*/.test(clause)) {
            const braces = clause.match(/\{([\s\S]*)\}/);
            names = new Set(braces
                ? braces[1].split(',').map(s => s.trim().replace(/^type\s+/, '').split(/\s+as\s+/)[0]).filter(Boolean)
                : []);
            if (!braces || /^\s*\w+\s*,/.test(clause)) names.add('default');
        }
        list.push({ target, names });
    }
    imports.set(file, list);
}

// ─── 1. Unreachable files ───
const isEntry = f => {
    const r = relative(ROOT, f);
    return r === 'functions/src/index.ts'
        || /^src\/app\/.*\/?(page|layout|route|loading|error|not-found|template|default|sitemap|robots|manifest|opengraph-image)\.(tsx?|js)$/.test(r)
        || /^src\/app\/[^/]+\.tsx?$/.test(r)
        || /^src\/(middleware|proxy)\.ts$/.test(r)
        || r.startsWith('src/i18n/')
        || isTest(f);
};
const reachable = new Set();
const stack = files.filter(isEntry);
while (stack.length) {
    const f = stack.pop();
    if (reachable.has(f)) continue;
    reachable.add(f);
    for (const { target } of imports.get(f) || []) stack.push(target);
}
const unreachable = files.filter(f => !reachable.has(f));

// ─── 2. Unused exports ───
const used = new Map(); // file -> Set of imported names, or '*'
for (const list of imports.values()) {
    for (const { target, names } of list) {
        if (names === '*') { used.set(target, '*'); continue; }
        const cur = used.get(target);
        if (cur === '*') continue;
        const set = cur || new Set();
        names.forEach(n => set.add(n));
        used.set(target, set);
    }
}
const unusedExports = [];
for (const [file, text] of source) {
    if (isEntry(file) || !reachable.has(file) || used.get(file) === '*') continue;
    const names = [...text.matchAll(/^export\s+(?:async\s+)?(?:function|const|let|class|interface|type|enum)\s+(\w+)/gm)].map(m => m[1]);
    const usedNames = used.get(file) || new Set();
    // Exports also used inside their own file are kept (they're still live code)
    for (const name of names) {
        if (usedNames.has(name)) continue;
        const localUses = text.match(new RegExp(`\\b${name}\\b`, 'g'))?.length || 0;
        if (localUses <= 1) unusedExports.push(`${relative(ROOT, file)}: ${name}`);
    }
}

// ─── 3. Unused translation namespaces ───
const messages = JSON.parse(readFileSync(join(ROOT, 'src/messages/en.json'), 'utf8'));
const allSource = [...source.entries()].filter(([f]) => f.includes('/src/') && !f.includes('functions/')).map(([, t]) => t).join('\n');
const unusedNamespaces = Object.keys(messages).filter(ns => {
    const esc = ns.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    // useTranslations('ns'), t('ns.key'), or a root translator called with the bare key: common('ns')
    return !new RegExp(`(useTranslations|getTranslations)\\(\\s*(\\{[^}]*namespace:\\s*)?['"\`]${esc}['"\`.]|['"\`]${esc}\\.|\\(\\s*['"\`]${esc}['"\`]\\s*[,)]`).test(allSource);
});

// ─── Report ───
const sections = [
    ['Files nothing imports', unreachable.map(f => relative(ROOT, f))],
    ['Exports nothing uses', unusedExports],
    ['Translation namespaces nothing references', unusedNamespaces],
];
let found = 0;
for (const [title, items] of sections) {
    console.log(`\n${title}: ${items.length}`);
    items.forEach(i => console.log(`  ${i}`));
    found += items.length;
}
process.exit(found ? 1 : 0);
