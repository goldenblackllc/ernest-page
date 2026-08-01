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

    // Load and resize hero to fill 1920x1080
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

/**
 * Renders a solid black 1920x1080 PNG buffer for the question phase.
 * Text rendering is handled by ASS subtitles.
 */
export async function renderTextFrame(): Promise<Buffer> {
    return sharp({
        create: {
            width: 1920,
            height: 1080,
            channels: 3,
            background: { r: 0, g: 0, b: 0 },
        },
    }).png().toBuffer();
}

/**
 * Renders the "Ask Earnest." end card.
 * A 1920x1080 black background with warm white text centered.
 */
export async function renderEndFrame(): Promise<Buffer> {
    const WIDTH = 1920;
    const HEIGHT = 1080;

    const svg = `<svg width="${WIDTH}" height="${HEIGHT}" xmlns="http://www.w3.org/2000/svg">
        <text x="50%" y="50%" text-anchor="middle" dominant-baseline="middle"
              font-family="sans-serif" font-weight="600" font-size="72"
              fill="#F5F0EB">Ask Earnest.</text>
    </svg>`;

    return sharp({
        create: {
            width: WIDTH,
            height: HEIGHT,
            channels: 3,
            background: { r: 0, g: 0, b: 0 },
        },
    })
    .composite([{ input: Buffer.from(svg), top: 0, left: 0 }])
    .png()
    .toBuffer();
}
