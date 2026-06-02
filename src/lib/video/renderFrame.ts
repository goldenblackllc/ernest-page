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
 * This replaces ffmpeg's drawtext filter (which is not available in the
 * ffmpeg-static Linux binary on Vercel).
 */
export async function renderFrame(opts: RenderFrameOptions): Promise<Buffer> {
    const WIDTH = 1080;
    const HEIGHT = 1920;

    // Load and resize hero to fill 1080x1920
    let hero = sharp(opts.heroPath).resize(WIDTH, HEIGHT, {
        fit: 'cover',
        position: 'centre',
    });

    // Build SVG overlay with gradients + text
    const titleLines = wrapText(opts.title, 48);
    const titleSvg = titleLines
        .map((line, i) => {
            const y = 170 + i * 50;
            return `<text x="40" y="${y}" font-family="HK Grotesk, sans-serif" font-weight="700" font-size="38" fill="white">
                <tspan filter="url(#shadow)">${escapeXml(line)}</tspan>
            </text>`;
        })
        .join('\n');

    // Avatar: if provided, load as base64 and embed in SVG
    let avatarSvg = '';
    let authorTextX = 40;
    if (opts.avatarPath) {
        try {
            // Resize avatar to 80x80 circle
            const avatarBuf = await sharp(opts.avatarPath)
                .resize(80, 80, { fit: 'cover' })
                .png()
                .toBuffer();
            const avatarB64 = avatarBuf.toString('base64');
            avatarSvg = `
                <defs>
                    <clipPath id="avatarClip">
                        <circle cx="80" cy="82" r="40"/>
                    </clipPath>
                </defs>
                <image href="data:image/png;base64,${avatarB64}" x="40" y="42" width="80" height="80" clip-path="url(#avatarClip)"/>
            `;
            authorTextX = 140;
        } catch (e) {
            // Skip avatar if it fails
            console.log('[Video] Avatar embed failed, skipping');
        }
    }

    const svg = `<svg width="${WIDTH}" height="${HEIGHT}" xmlns="http://www.w3.org/2000/svg">
        <defs>
            <filter id="shadow" x="-10%" y="-10%" width="120%" height="120%">
                <feDropShadow dx="2" dy="2" stdDeviation="2" flood-color="black" flood-opacity="0.7"/>
            </filter>
            <linearGradient id="topGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stop-color="black" stop-opacity="0.7"/>
                <stop offset="100%" stop-color="black" stop-opacity="0"/>
            </linearGradient>
            <linearGradient id="botGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stop-color="black" stop-opacity="0"/>
                <stop offset="100%" stop-color="black" stop-opacity="0.85"/>
            </linearGradient>
        </defs>

        <!-- Top gradient -->
        <rect x="0" y="0" width="${WIDTH}" height="350" fill="url(#topGrad)"/>
        <!-- Bottom gradient -->
        <rect x="0" y="${HEIGHT - 350}" width="${WIDTH}" height="350" fill="url(#botGrad)"/>

        ${avatarSvg}

        <!-- Author name -->
        <text x="${authorTextX}" y="75" font-family="HK Grotesk, sans-serif" font-weight="700" font-size="34" fill="white" fill-opacity="0.9" filter="url(#shadow)">
            ${escapeXml(opts.authorName)}
        </text>

        <!-- Timestamp -->
        <text x="${authorTextX}" y="105" font-family="HK Grotesk, sans-serif" font-weight="400" font-size="24" fill="white" fill-opacity="0.5">
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
