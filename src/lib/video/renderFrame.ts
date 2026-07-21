import sharp from 'sharp';

interface RenderFrameOptions {
    heroPath: string;
}

/**
 * Renders the video background frame as a 1080×1920 PNG.
 * Only handles: hero image resize + gradient overlays.
 * ALL text is handled by ASS subtitles (sharp can't render custom fonts on Lambda).
 * Avatar is NOT rendered — it's always hidden behind platform UIs
 * (TikTok, Instagram, YouTube Shorts all overlay their own profile picture).
 */
export async function renderFrame(opts: RenderFrameOptions): Promise<Buffer> {
    const WIDTH = 1080;
    const HEIGHT = 1920;

    // Load and resize hero to fill 1080x1920
    const hero = sharp(opts.heroPath).resize(WIDTH, HEIGHT, {
        fit: 'cover',
        position: 'centre',
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
        <rect x="0" y="0" width="${WIDTH}" height="550" fill="url(#topGrad)"/>
        <!-- Bottom gradient -->
        <rect x="0" y="${HEIGHT - 550}" width="${WIDTH}" height="550" fill="url(#botGrad)"/>
    </svg>`;

    const svgBuffer = Buffer.from(svg);
    const result = await hero
        .composite([{ input: svgBuffer, top: 0, left: 0 }])
        .png()
        .toBuffer();

    return result;
}

