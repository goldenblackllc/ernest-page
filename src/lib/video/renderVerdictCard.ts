import sharp from 'sharp';
import satori from 'satori';
import { readFileSync } from 'fs';
import { join } from 'path';
import type { ReactNode } from 'react';
import React from 'react';

const WIDTH = 1080;
const HEIGHT = 1920;

// Load the font buffer once at module level
let fontBuffer: Buffer;
try {
    fontBuffer = readFileSync(join(process.cwd(), 'public', 'fonts', 'hkgrotesk', 'hkgrotesk-bold-webfont.ttf'));
} catch {
    try {
        fontBuffer = readFileSync(join(__dirname, '..', '..', '..', '..', 'public', 'fonts', 'hkgrotesk', 'hkgrotesk-bold-webfont.ttf'));
    } catch {
        console.error('[RenderVerdictCard] Could not load HK Grotesk Bold font from any path');
        fontBuffer = Buffer.alloc(0);
    }
}

/**
 * Renders a verdict card: photo background + verdict text overlay.
 *
 * Uses Satori to convert text to SVG paths (no system fonts needed),
 * then composites onto the photo with sharp.
 */
export async function renderVerdictCard(
    photoBuffer: Buffer,
    verdict: string,
): Promise<Buffer> {
    const resizedPhoto = await sharp(photoBuffer)
        .resize(WIDTH, HEIGHT, { fit: 'cover', position: 'center' })
        .toBuffer();

    const { fontSize, lineHeight } = getAdaptiveSizing(verdict.length);
    const strokePx = Math.max(4, Math.round(fontSize / 8));

    // Build the JSX element for Satori
    const element = React.createElement(
        'div',
        {
            style: {
                width: '100%',
                height: '100%',
                display: 'flex',
                flexDirection: 'column' as const,
                alignItems: 'center',
                justifyContent: 'center',
                paddingBottom: '200px',
            },
        },
        // Verdict text
        React.createElement(
            'div',
            {
                style: {
                    fontSize: `${fontSize}px`,
                    fontWeight: 700,
                    fontFamily: 'HK Grotesk',
                    color: 'white',
                    textAlign: 'center' as const,
                    lineHeight: `${lineHeight}px`,
                    textShadow: `0 0 ${Math.round(fontSize / 4)}px rgba(0,0,0,0.9), 0 0 ${Math.round(fontSize / 3)}px rgba(0,0,0,0.7), 0 0 ${fontSize}px rgba(0,0,0,0.5)`,
                    padding: '0 60px',
                    maxWidth: '100%',
                },
            },
            verdict
        ),
        // Brand mark
        React.createElement(
            'div',
            {
                style: {
                    position: 'absolute' as const,
                    bottom: '100px',
                    fontSize: '26px',
                    fontWeight: 700,
                    fontFamily: 'HK Grotesk',
                    color: 'rgba(255,255,255,0.5)',
                    letterSpacing: '3px',
                    textShadow: '0 0 4px rgba(0,0,0,0.8)',
                },
            },
            'EARNEST PAGE'
        )
    );

    // Satori converts text to SVG paths using the font buffer directly
    const textSvg = await satori(
        element as ReactNode,
        {
            width: WIDTH,
            height: HEIGHT,
            fonts: [
                {
                    name: 'HK Grotesk',
                    data: fontBuffer,
                    weight: 700,
                    style: 'normal' as const,
                },
            ],
        }
    );

    // Composite the Satori SVG (text rendered as vector paths) over the photo
    return await sharp(resizedPhoto)
        .composite([{ input: Buffer.from(textSvg), top: 0, left: 0 }])
        .png()
        .toBuffer();
}

// ─── Adaptive sizing ─────────────────────────────────────────────────────────
function getAdaptiveSizing(charCount: number): { fontSize: number; lineHeight: number } {
    if (charCount <= 40) return { fontSize: 108, lineHeight: 124 };
    if (charCount <= 80) return { fontSize: 84, lineHeight: 100 };
    if (charCount <= 120) return { fontSize: 72, lineHeight: 88 };
    if (charCount <= 170) return { fontSize: 64, lineHeight: 78 };
    if (charCount <= 250) return { fontSize: 56, lineHeight: 70 };
    return { fontSize: 48, lineHeight: 62 };
}
