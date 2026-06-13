import sharp from 'sharp';

const WIDTH = 1080;
const HEIGHT = 1920;
const FONT_FAMILY = 'HK Grotesk, Inter, sans-serif';
const BG_COLOR = '#0a0a0a';
const GOLD_ACCENT = 'rgba(232,197,135,0.8)';
const GOLD_MUTED = 'rgba(232,197,135,0.6)';
const BRAND_FILL = 'rgba(255,255,255,0.15)';

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Escape XML special chars for SVG text elements */
function escapeXml(text: string): string {
    return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');
}

/**
 * Word-wrap a line of text for SVG rendering.
 * Breaks at spaces to fit within maxChars per line.
 */
function wrapText(text: string, maxChars: number): string[] {
    const words = text.split(/\s+/);
    const lines: string[] = [];
    let current = '';
    for (const word of words) {
        if (current && (current.length + 1 + word.length) > maxChars) {
            lines.push(current);
            current = word;
        } else {
            current = current ? `${current} ${word}` : word;
        }
    }
    if (current) lines.push(current);
    return lines;
}

/** Render the "Earnest Page" brand mark centered at the bottom of the canvas. */
function brandMark(): string {
    const brandY = HEIGHT - 120;
    return `<text x="${WIDTH / 2}" y="${brandY}" text-anchor="middle" font-family="${FONT_FAMILY}" font-size="24" font-weight="400" fill="${BRAND_FILL}">Earnest Page</text>`;
}

/** Render a thin centered accent line */
function accentLine(y: number, widthPct = 0.4): string {
    const lineWidth = WIDTH * widthPct;
    const x = (WIDTH - lineWidth) / 2;
    return `<rect x="${x}" y="${y}" width="${lineWidth}" height="1" fill="rgba(255,255,255,0.08)" rx="0.5"/>`;
}

/** Composite an SVG string onto a #0a0a0a background and return a PNG buffer. */
async function renderSvgToBuffer(svg: string): Promise<Buffer> {
    return sharp({
        create: {
            width: WIDTH,
            height: HEIGHT,
            channels: 4,
            background: { r: 10, g: 10, b: 10, alpha: 1 },
        },
    })
        .composite([{ input: Buffer.from(svg), top: 0, left: 0 }])
        .png()
        .toBuffer();
}

// ─── 1. Comparison Card ─────────────────────────────────────────────────────

/**
 * Renders a two-column comparison card (e.g. "IS / IS NOT", "DO / DON'T").
 *
 * @param heading     – The card's title (e.g. "A Gentleman")
 * @param leftLabel   – Positive column label (e.g. "IS")
 * @param leftItems   – Up to 5 positive traits
 * @param rightLabel  – Negative column label (e.g. "IS NOT")
 * @param rightItems  – Up to 5 negative traits
 * @returns PNG buffer (1080×1920)
 */
export async function renderComparisonCard(
    heading: string,
    leftLabel: string,
    leftItems: string[],
    rightLabel: string,
    rightItems: string[]
): Promise<Buffer> {
    // Clamp to 5 items per column
    const left = leftItems.slice(0, 5);
    const right = rightItems.slice(0, 5);

    // ── Heading ──
    const headingY = HEIGHT * 0.2;
    const headingLines = wrapText(heading, 20);
    const headingLineHeight = 80 * 1.25;
    const headingElements = headingLines.map((line, i) =>
        `<text x="${WIDTH / 2}" y="${headingY + i * headingLineHeight}" text-anchor="middle" font-family="${FONT_FAMILY}" font-size="80" font-weight="700" fill="white">${escapeXml(line)}</text>`
    ).join('\n        ');

    // ── Accent line ──
    const accentY = headingY + headingLines.length * headingLineHeight + 24;

    // ── Columns layout ──
    const GAP = 80;
    const colWidth = (WIDTH - GAP) / 2 - 60; // padding from edges
    const leftColX = 80;
    const rightColX = WIDTH / 2 + GAP / 2;

    // Column labels
    const labelY = accentY + 70;
    const labelElements = `
        <text x="${leftColX}" y="${labelY}" font-family="${FONT_FAMILY}" font-size="40" font-weight="700" fill="${GOLD_ACCENT}">${escapeXml(leftLabel)}</text>
        <text x="${rightColX}" y="${labelY}" font-family="${FONT_FAMILY}" font-size="40" font-weight="700" fill="rgba(255,255,255,0.5)">${escapeXml(rightLabel)}</text>`;

    // Column items
    const itemFontSize = 32;
    const itemLineHeight = itemFontSize * 1.3;
    const itemSpacing = 50;
    const itemStartY = labelY + 60;

    function renderColumnItems(
        items: string[],
        x: number,
        prefix: string,
        fill: string
    ): string {
        let currentY = itemStartY;
        return items.map((item) => {
            const wrapped = wrapText(item, 20);
            const elements = wrapped.map((line, li) => {
                const text = li === 0 ? `${prefix} ${escapeXml(line)}` : `   ${escapeXml(line)}`;
                const el = `<text x="${x}" y="${currentY}" font-family="${FONT_FAMILY}" font-size="${itemFontSize}" font-weight="400" fill="${fill}">${text}</text>`;
                currentY += itemLineHeight;
                return el;
            }).join('\n        ');
            currentY += itemSpacing - itemLineHeight; // net spacing between items
            return elements;
        }).join('\n        ');
    }

    const leftElements = renderColumnItems(left, leftColX, '✦', 'rgba(255,255,255,0.7)');
    const rightElements = renderColumnItems(right, rightColX, '✧', 'rgba(255,255,255,0.7)');

    // ── Vertical divider ──
    const dividerX = WIDTH / 2;
    const dividerTop = labelY - 30;
    const dividerBottom = itemStartY + Math.max(left.length, right.length) * (itemLineHeight + itemSpacing) + 20;
    const divider = `<line x1="${dividerX}" y1="${dividerTop}" x2="${dividerX}" y2="${dividerBottom}" stroke="rgba(255,255,255,0.06)" stroke-width="1"/>`;

    const svg = `<svg width="${WIDTH}" height="${HEIGHT}" xmlns="http://www.w3.org/2000/svg">
        <rect width="${WIDTH}" height="${HEIGHT}" fill="${BG_COLOR}"/>
        ${headingElements}
        ${accentLine(accentY)}
        ${labelElements}
        ${divider}
        ${leftElements}
        ${rightElements}
        ${brandMark()}
    </svg>`;

    return renderSvgToBuffer(svg);
}

// ─── 2. List Card ───────────────────────────────────────────────────────────

/**
 * Renders a numbered-list card (steps, traits, rules).
 *
 * @param heading – The card's title
 * @param items   – Up to 6 list items
 * @returns PNG buffer (1080×1920)
 */
export async function renderListCard(
    heading: string,
    items: string[]
): Promise<Buffer> {
    const clamped = items.slice(0, 6);

    // ── Heading ──
    const headingY = HEIGHT * 0.18;
    const headingLines = wrapText(heading, 20);
    const headingLineHeight = 80 * 1.25;
    const headingElements = headingLines.map((line, i) =>
        `<text x="${WIDTH / 2}" y="${headingY + i * headingLineHeight}" text-anchor="middle" font-family="${FONT_FAMILY}" font-size="80" font-weight="700" fill="white">${escapeXml(line)}</text>`
    ).join('\n        ');

    // ── Accent line ──
    const accentY = headingY + headingLines.length * headingLineHeight + 24;

    // ── List items ──
    const itemFontSize = 36;
    const itemLineHeight = itemFontSize * 1.3;
    const itemSpacing = 70;
    const circleDiameter = 48;
    const circleRadius = circleDiameter / 2;

    // Vertically center items in remaining space
    const availableTop = accentY + 60;
    const availableBottom = HEIGHT - 180; // room for brand mark
    const totalItemsHeight = clamped.length * itemSpacing;
    const listStartY = availableTop + (availableBottom - availableTop - totalItemsHeight) / 2;

    const leftPad = 120; // left edge of numbered circles
    const textX = leftPad + circleDiameter + 24; // text starts after circle + gap

    const listElements = clamped.map((item, idx) => {
        const y = listStartY + idx * itemSpacing;
        const circleCx = leftPad + circleRadius;
        const circleCy = y;

        // Numbered circle
        const circle = `<circle cx="${circleCx}" cy="${circleCy}" r="${circleRadius}" fill="rgba(255,255,255,0.08)" stroke="rgba(255,255,255,0.15)" stroke-width="1"/>`;
        const number = `<text x="${circleCx}" y="${circleCy + 1}" text-anchor="middle" dominant-baseline="central" font-family="${FONT_FAMILY}" font-size="24" font-weight="600" fill="white">${idx + 1}</text>`;

        // Item text with word wrap
        const wrapped = wrapText(item, 25);
        const textEls = wrapped.map((line, li) => {
            const lineY = circleCy + (li - (wrapped.length - 1) / 2) * itemLineHeight;
            return `<text x="${textX}" y="${lineY}" dominant-baseline="central" font-family="${FONT_FAMILY}" font-size="${itemFontSize}" font-weight="400" fill="rgba(255,255,255,0.8)">${escapeXml(line)}</text>`;
        }).join('\n        ');

        return `${circle}\n        ${number}\n        ${textEls}`;
    }).join('\n        ');

    const svg = `<svg width="${WIDTH}" height="${HEIGHT}" xmlns="http://www.w3.org/2000/svg">
        <rect width="${WIDTH}" height="${HEIGHT}" fill="${BG_COLOR}"/>
        ${headingElements}
        ${accentLine(accentY)}
        ${listElements}
        ${brandMark()}
    </svg>`;

    return renderSvgToBuffer(svg);
}

// ─── 3. Quote Card ──────────────────────────────────────────────────────────

/**
 * Renders a large, centered quote/insight card.
 *
 * @param quote       – The quote text
 * @param attribution – Who said it
 * @returns PNG buffer (1080×1920)
 */
export async function renderQuoteCard(
    quote: string,
    attribution: string
): Promise<Buffer> {
    // ── Quote text ──
    const quoteFontSize = 64;
    const quoteLineHeight = quoteFontSize * 1.4;
    const quoteLines = wrapText(quote, 22);
    const totalQuoteHeight = quoteLines.length * quoteLineHeight;

    // Center the quote block vertically (shift up slightly for visual balance)
    const quoteBlockStartY = (HEIGHT - totalQuoteHeight) / 2 - 40;

    // ── Large decorative quotation mark ──
    const bigQuoteY = quoteBlockStartY - 40;
    const bigQuoteMark = `<text x="${WIDTH / 2}" y="${bigQuoteY}" text-anchor="middle" font-family="Georgia, serif" font-size="200" font-weight="400" fill="rgba(255,255,255,0.05)">\u201C</text>`;

    // ── Quote text elements ──
    const quoteElements = quoteLines.map((line, i) =>
        `<text x="${WIDTH / 2}" y="${quoteBlockStartY + i * quoteLineHeight + quoteFontSize}" text-anchor="middle" font-family="${FONT_FAMILY}" font-size="${quoteFontSize}" font-weight="500" fill="rgba(255,255,255,0.9)">${escapeXml(line)}</text>`
    ).join('\n        ');

    // ── Attribution ──
    const attrY = quoteBlockStartY + totalQuoteHeight + quoteFontSize + 60;
    const attrElement = `<text x="${WIDTH / 2}" y="${attrY}" text-anchor="middle" font-family="${FONT_FAMILY}" font-size="28" font-weight="400" fill="${GOLD_MUTED}">\u2014 ${escapeXml(attribution)}</text>`;

    // ── Radial glow background ──
    const radialGlow = `
        <defs>
            <radialGradient id="glow" cx="50%" cy="45%" r="55%" fx="50%" fy="45%">
                <stop offset="0%" stop-color="rgba(232,197,135,0.04)"/>
                <stop offset="100%" stop-color="rgba(232,197,135,0)"/>
            </radialGradient>
        </defs>
        <rect width="${WIDTH}" height="${HEIGHT}" fill="url(#glow)"/>`;

    const svg = `<svg width="${WIDTH}" height="${HEIGHT}" xmlns="http://www.w3.org/2000/svg">
        <rect width="${WIDTH}" height="${HEIGHT}" fill="${BG_COLOR}"/>
        ${radialGlow}
        ${bigQuoteMark}
        ${quoteElements}
        ${attrElement}
        ${brandMark()}
    </svg>`;

    return renderSvgToBuffer(svg);
}
