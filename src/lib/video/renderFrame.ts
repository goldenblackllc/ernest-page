import sharp from 'sharp';
import { readFile } from 'fs/promises';

interface RenderFrameOptions {
    heroPath: string;
    avatarPath?: string;
    title: string;
    authorName: string;
    timestamp: string;
    fontBoldPath: string;
    fontRegularPath: string;
}

/**
 * Renders the complete video frame as a 1080×1920 PNG using sharp + SVG text.
 * Fonts are embedded as base64 @font-face in the SVG to avoid fontconfig dependency.
 */
export async function renderFrame(opts: RenderFrameOptions): Promise<Buffer> {
    const WIDTH = 1080;
    const HEIGHT = 1920;

    // Load fonts as base64 for embedding in SVG (Lambda has no fontconfig)
    const [boldFontData, regularFontData] = await Promise.all([
        readFile(opts.fontBoldPath),
        readFile(opts.fontRegularPath),
    ]);
    const boldB64 = boldFontData.toString('base64');
    const regularB64 = regularFontData.toString('base64');

    // Load and resize hero to fill 1080x1920
    const hero = sharp(opts.heroPath).resize(WIDTH, HEIGHT, {
        fit: 'cover',
        position: 'centre',
    });

    // Build SVG overlay with embedded fonts + gradients + text
    const titleLines = wrapText(opts.title, 48);

    // Layout constants (matching the site's short card UI)
    const PADDING = 40;
    const AVATAR_SIZE = 80;
    const AUTHOR_ROW_Y = 60;        // pushed down from top edge
    const TITLE_START_Y = AUTHOR_ROW_Y + AVATAR_SIZE + 40;  // below avatar row
    const TITLE_LINE_HEIGHT = 50;

    const titleSvg = titleLines
        .map((line, i) => {
            const y = TITLE_START_Y + i * TITLE_LINE_HEIGHT;
            return `<text x="${PADDING}" y="${y}" font-family="HKBold" font-size="38" fill="white" filter="url(#shadow)">${escapeXml(line)}</text>`;
        })
        .join('\n');

    // Avatar: if provided, load as base64 and embed in SVG
    let avatarSvg = '';
    let authorTextX = PADDING;
    if (opts.avatarPath) {
        try {
            const avatarBuf = await sharp(opts.avatarPath)
                .resize(AVATAR_SIZE, AVATAR_SIZE, { fit: 'cover' })
                .png()
                .toBuffer();
            const avatarB64 = avatarBuf.toString('base64');
            const cx = PADDING + AVATAR_SIZE / 2;
            const cy = AUTHOR_ROW_Y + AVATAR_SIZE / 2;
            avatarSvg = `
                <clipPath id="avatarClip">
                    <circle cx="${cx}" cy="${cy}" r="${AVATAR_SIZE / 2}"/>
                </clipPath>
                <image href="data:image/png;base64,${avatarB64}" x="${PADDING}" y="${AUTHOR_ROW_Y}" width="${AVATAR_SIZE}" height="${AVATAR_SIZE}" clip-path="url(#avatarClip)"/>
            `;
            authorTextX = PADDING + AVATAR_SIZE + 20;
        } catch (e) {
            console.log('[Video] Avatar embed failed, skipping');
        }
    }

    const authorNameY = AUTHOR_ROW_Y + AVATAR_SIZE / 2 - 5;
    const timestampY = authorNameY + 30;

    const svg = `<svg width="${WIDTH}" height="${HEIGHT}" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink">
        <defs>
            <style>
                @font-face {
                    font-family: 'HKBold';
                    src: url('data:font/truetype;base64,${boldB64}') format('truetype');
                }
                @font-face {
                    font-family: 'HKRegular';
                    src: url('data:font/truetype;base64,${regularB64}') format('truetype');
                }
            </style>
            <filter id="shadow" x="-10%" y="-10%" width="120%" height="120%">
                <feDropShadow dx="2" dy="2" stdDeviation="2" flood-color="black" flood-opacity="0.7"/>
            </filter>
            <linearGradient id="topGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stop-color="black" stop-opacity="0.75"/>
                <stop offset="100%" stop-color="black" stop-opacity="0"/>
            </linearGradient>
            <linearGradient id="botGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stop-color="black" stop-opacity="0"/>
                <stop offset="100%" stop-color="black" stop-opacity="0.85"/>
            </linearGradient>
        </defs>

        <!-- Top gradient -->
        <rect x="0" y="0" width="${WIDTH}" height="400" fill="url(#topGrad)"/>
        <!-- Bottom gradient -->
        <rect x="0" y="${HEIGHT - 400}" width="${WIDTH}" height="400" fill="url(#botGrad)"/>

        ${avatarSvg}

        <!-- Author name -->
        <text x="${authorTextX}" y="${authorNameY}" font-family="HKBold" font-size="34" fill="white" fill-opacity="0.9" filter="url(#shadow)">
            ${escapeXml(opts.authorName)}
        </text>

        <!-- Timestamp -->
        <text x="${authorTextX}" y="${timestampY}" font-family="HKRegular" font-size="24" fill="white" fill-opacity="0.5">
            ${escapeXml(opts.timestamp)}
        </text>

        <!-- Title -->
        ${titleSvg}
    </svg>`;

    // Composite SVG overlay onto hero
    const svgBuffer = Buffer.from(svg);
    const result = await hero
        .composite([{ input: svgBuffer, top: 0, left: 0 }])
        .png()
        .toBuffer();

    return result;
}

/** Word-wrap text at approximately maxChars characters per line */
function wrapText(text: string, maxChars: number): string[] {
    const words = text.split(' ');
    const lines: string[] = [];
    let current = '';
    for (const word of words) {
        if (current.length + word.length + 1 > maxChars && current.length > 0) {
            lines.push(current.trim());
            current = word;
        } else {
            current += (current ? ' ' : '') + word;
        }
    }
    if (current) lines.push(current.trim());
    return lines;
}

/** Escape special XML characters for SVG text */
function escapeXml(text: string): string {
    return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');
}
