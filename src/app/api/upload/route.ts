import { NextRequest, NextResponse } from "next/server";
import { storage } from "@/lib/firebase/admin";

export async function POST(req: NextRequest) {
    try {
        const formData = await req.formData();
        const file = formData.get("file") as File;
        const userId = formData.get("userId") as string;

        if (!file || !userId) {
            return NextResponse.json({ error: "Missing file or userId" }, { status: 400 });
        }

        const buffer = Buffer.from(await file.arrayBuffer());
        const filename = `${Date.now()}_${file.name.replace(/\s+/g, '_')}`;
        const path = `users/${userId}/visual_board/${filename}`;

        const bucketName = process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET;
        if (!bucketName) {
            throw new Error("Storage bucket not configured");
        }
        const bucket = storage.bucket(bucketName);
        const fileRef = bucket.file(path);

        await fileRef.save(buffer, {
            metadata: {
                contentType: file.type,
            },
        });

        // Generate a signed URL with far future expiration
        const [url] = await fileRef.getSignedUrl({
            action: 'read',
            expires: '03-01-2500',
        });

        return NextResponse.json({ url });
    } catch (error: any) {
        console.error("Upload server error:", error);
        return NextResponse.json({
            error: "Upload failed"
        }, { status: 500 });
    }
}
