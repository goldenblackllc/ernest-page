import { randomUUID } from "node:crypto";
import { getStorage } from "firebase-admin/storage";
import "@/lib/firebase/admin"; // initializes the app with the storage bucket

/**
 * Now posts' photos (functions/src/lib/now.ts), in `now_posts/{uid}/` in the default
 * bucket. They are never made public: each is read through a Firebase download
 * token that only its author's feed is sent.
 */

const folder = (uid: string) => `now_posts/${uid}/`;

/** Whether the bytes are a JPEG. The Now sheet always sends one (lib/now/resizePhoto.ts). */
export function isJpeg(bytes: Uint8Array): boolean {
    return bytes.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
}

export async function saveNowPhoto(uid: string, postId: string, jpeg: Buffer): Promise<{ path: string; url: string }> {
    const bucket = getStorage().bucket();
    const path = `${folder(uid)}${postId}/${randomUUID()}.jpg`;
    const token = randomUUID();
    await bucket.file(path).save(jpeg, {
        resumable: false,
        metadata: {
            contentType: "image/jpeg",
            cacheControl: "private, max-age=31536000",
            metadata: { firebaseStorageDownloadTokens: token },
        },
    });
    const url = `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodeURIComponent(path)}?alt=media&token=${token}`;
    return { path, url };
}

export async function deleteNowPhoto(path: string): Promise<void> {
    await getStorage().bucket().file(path).delete({ ignoreNotFound: true });
}

/** Every Now photo of a person, for account deletion. */
export async function deleteAllNowPhotos(uid: string): Promise<void> {
    await getStorage().bucket().deleteFiles({ prefix: folder(uid) });
}
