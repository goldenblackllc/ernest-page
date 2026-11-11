const MAX_SIDE = 1600;
const QUALITY = 0.85;

/**
 * A photo for a Now post, as a JPEG at most MAX_SIDE pixels on its longer side, so
 * it uploads quickly and fits the request limit. Drawing it anew also drops the
 * location and other data phones store in photos.
 */
export async function resizePhoto(file: Blob): Promise<Blob> {
    const url = URL.createObjectURL(file);
    try {
        const image = await new Promise<HTMLImageElement>((resolve, reject) => {
            const img = new Image();
            img.onload = () => resolve(img);
            img.onerror = () => reject(new Error("The photo could not be read"));
            img.src = url;
        });
        const scale = Math.min(1, MAX_SIDE / Math.max(image.naturalWidth, image.naturalHeight));
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
        canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
        const context = canvas.getContext("2d");
        if (!context) throw new Error("No canvas to draw the photo on");
        context.drawImage(image, 0, 0, canvas.width, canvas.height);
        return await new Promise<Blob>((resolve, reject) => {
            canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("The photo could not be saved"))), "image/jpeg", QUALITY);
        });
    } finally {
        URL.revokeObjectURL(url);
    }
}

/** The photo as a data URL, to preview it with nothing to release afterwards. */
export function photoPreview(photo: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(photo);
    });
}
