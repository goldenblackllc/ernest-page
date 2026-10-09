// In-memory stand-in for the firebase-admin Firestore surface the API routes use.
// Use it from a test file with:
//   vi.mock("@/lib/firebase/admin", async () => (await import("@/test/fakeFirestore")).adminModuleMock());
//   vi.mock("firebase-admin/firestore", async () => (await import("@/test/fakeFirestore")).firestoreModuleMock());
//   vi.mock("firebase-admin/auth", async () => (await import("@/test/fakeFirestore")).authModuleMock());
// then seed documents with fakeDb.seed(...). Tokens equal to VALID_TOKEN verify as uid TEST_UID.
import { vi } from "vitest";

type DocData = Record<string, unknown>;

export const VALID_TOKEN = "valid-test-token";
export const TEST_UID = "test-user-uid";

interface FakeSnapshot {
    id: string;
    exists: boolean;
    data: () => DocData | undefined;
    ref: FakeDocRef;
}

interface FakeDocRef {
    id: string;
    path: string;
    get: () => Promise<FakeSnapshot>;
    set: (data: DocData) => Promise<void>;
    update: (data: DocData) => Promise<void>;
    delete: () => Promise<void>;
    collection: (sub: string) => FakeQuery;
}

interface Write {
    op: "set" | "update" | "add" | "delete";
    path: string;
    data?: unknown;
}

class FakeDb {
    docs = new Map<string, DocData>();
    writes: Write[] = [];
    /** When set, every collection() call throws this error. */
    failWith: Error | null = null;
    private autoId = 0;

    seed(path: string, data: DocData) {
        this.docs.set(path, data);
    }

    reset() {
        this.docs.clear();
        this.writes = [];
        this.failWith = null;
        this.autoId = 0;
    }

    collection(path: string) {
        if (this.failWith) throw this.failWith;
        return new FakeQuery(this, path);
    }

    snapshot(path: string): FakeSnapshot {
        const data = this.docs.get(path);
        const id = path.split("/").pop()!;
        return {
            id,
            exists: data !== undefined,
            data: () => (data === undefined ? undefined : { ...data }),
            ref: this.docRef(path),
        };
    }

    docRef(path: string): FakeDocRef {
        return {
            id: path.split("/").pop()!,
            path,
            get: async () => this.snapshot(path),
            set: async (data: DocData) => {
                this.writes.push({ op: "set", path, data });
            },
            update: async (data: DocData) => {
                this.writes.push({ op: "update", path, data });
            },
            delete: async () => {
                this.writes.push({ op: "delete", path });
            },
            collection: (sub: string) => this.collection(`${path}/${sub}`),
        };
    }

    nextId() {
        this.autoId += 1;
        return `auto-${this.autoId}`;
    }
}

class FakeQuery {
    private filters: [string, unknown][] = [];
    private max = Infinity;

    constructor(private db: FakeDb, private path: string) {}

    doc(id?: string) {
        return this.db.docRef(`${this.path}/${id ?? this.db.nextId()}`);
    }

    async add(data: DocData) {
        const ref = this.doc();
        this.db.writes.push({ op: "add", path: ref.path, data });
        return ref;
    }

    where(field: string, op: string, value: unknown) {
        if (op === "==") this.filters.push([field, value]);
        return this;
    }

    orderBy() {
        return this;
    }

    startAfter() {
        return this;
    }

    limit(n: number) {
        this.max = n;
        return this;
    }

    async get() {
        const depth = this.path.split("/").length + 1;
        const docs = [...this.db.docs.keys()]
            .filter((p) => p.startsWith(`${this.path}/`) && p.split("/").length === depth)
            .filter((p) => this.filters.every(([f, v]) => this.db.docs.get(p)![f] === v))
            .slice(0, this.max)
            .map((p) => this.db.snapshot(p));
        return { empty: docs.length === 0, size: docs.length, docs };
    }
}

export const fakeDb = new FakeDb();

const FieldValue = {
    serverTimestamp: () => ({ __op: "serverTimestamp" }),
    increment: (n: number) => ({ __op: "increment", n }),
    arrayUnion: (...items: unknown[]) => ({ __op: "arrayUnion", items }),
    delete: () => ({ __op: "delete" }),
};

const Timestamp = {
    fromDate: (d: Date) => ({ _seconds: Math.floor(d.getTime() / 1000), _nanoseconds: 0 }),
    now: () => ({ _seconds: Math.floor(Date.now() / 1000), _nanoseconds: 0 }),
};

export function adminModuleMock() {
    return { db: fakeDb, FieldValue };
}

export function firestoreModuleMock() {
    return { FieldValue, Timestamp, getFirestore: () => fakeDb };
}

export const verifyIdToken = vi.fn(async (token: string) => {
    if (token === VALID_TOKEN) return { uid: TEST_UID };
    throw new Error("auth/invalid-id-token");
});

export function authModuleMock() {
    return {
        getAuth: () => ({
            verifyIdToken,
            deleteUser: vi.fn(async () => {}),
            createCustomToken: vi.fn(async () => "custom-token"),
        }),
    };
}

/** A Request with an optional bearer token and JSON body. */
export function makeRequest(
    url: string,
    { method = "POST", token, body }: { method?: string; token?: string; body?: unknown } = {},
) {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (token) headers.Authorization = `Bearer ${token}`;
    return new Request(url, {
        method,
        headers,
        body: body === undefined || method === "GET" ? undefined : JSON.stringify(body),
    });
}
