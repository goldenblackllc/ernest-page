import sharp from 'sharp';

interface RenderFrameOptions {
    heroPath: string;
}

/**
 * Renders the video background frame as a 1920×1080 PNG.
 * Only handles: hero image resize + gradient overlays.
 * ALL text is handled by ASS subtitles (sharp can't render custom fonts on Lambda).
 * Avatar is NOT rendered — it's always hidden behind platform UIs
 * (TikTok, Instagram, YouTube Shorts all overlay their own profile picture).
 */
export async function renderFrame(opts: RenderFrameOptions): Promise<Buffer> {
    const WIDTH = 1920;
    const HEIGHT = 1080;

    // Load and resize hero to fit within 1920x1080 (letterbox/pillarbox on black)
    // Matches feed player's object-contain behavior — no cropping
    const hero = sharp(opts.heroPath).resize(WIDTH, HEIGHT, {
        fit: 'contain',
        background: { r: 0, g: 0, b: 0 },
    });

    // Build SVG overlay with gradients only (no text, no avatar)
    const svg = `<svg width="${WIDTH}" height="${HEIGHT}" xmlns="http://www.w3.org/2000/svg">
        <defs>
            <linearGradient id="topGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stop-color="black" stop-opacity="0.85"/>
                <stop offset="100%" stop-color="black" stop-opacity="0"/>
            </linearGradient>
            <linearGradient id="botGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stop-color="black" stop-opacity="0"/>
                <stop offset="100%" stop-color="black" stop-opacity="0.92"/>
            </linearGradient>
        </defs>

        <!-- Top gradient -->
        <rect x="0" y="0" width="${WIDTH}" height="250" fill="url(#topGrad)"/>
        <!-- Bottom gradient -->
        <rect x="0" y="${HEIGHT - 250}" width="${WIDTH}" height="250" fill="url(#botGrad)"/>
    </svg>`;

    const svgBuffer = Buffer.from(svg);
    const result = await hero
        .composite([{ input: svgBuffer, top: 0, left: 0 }])
        .png()
        .toBuffer();

    return result;
}
