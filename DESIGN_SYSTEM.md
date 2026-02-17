# Earnest Page - Design System (Cinematic Dark Mode)

## Core Philosophy
"A Dark Mode Operating System for Reality."
Immersive, cinematic, premium. No longer clinical.

## Colors
- **Canvas**: `bg-zinc-950` (Deep Charcoal/Black)
- **Text**: `text-zinc-300` (Off-white/Grey)
- **Headings**: `text-zinc-100` (White)
- **Accents**: 
    - `zinc-800` (Borders/Separators)
    - `zinc-500` (Metadata/Tags)

## Typography
- **Headings**: Sans-serif, variable weight, typically `font-black`, `tracking-tighter`, or `uppercase tracking-widest`.
- **Body**: Serif or readable Sans-serif. "Book page" aesthetic.
- **Data/Tags**: Monospace (`font-mono`), uppercase, small.

## UI Components

### Cards (Feed/Ledger)
- **Background**: `bg-zinc-900/50` (Semi-transparent)
- **Border**: `border border-zinc-800` (Subtle)
- **Shadow**: Minimal or none, rely on layer depth.

### Buttons & Interactive
- **General**: Sharp edges (`rounded-none`) default, but relaxed for specific distinct elements.
- **FAB (Floating Action Button)**: **Circular** (`rounded-full`), glowing, floating.
    - Background: Deep Black or Accent (Rust/Gold).
    - Effect: `shadow-2xl`, `shadow-zinc-900/50`.

### Navigation (Header)
- **Style**: Floating glass.
- **Background**: `bg-zinc-950/80`
- **Effect**: `backdrop-blur-md`
- **Border**: None or extremely subtle `border-b border-white/5`.

### Status Indicators
- **Live**: Pulsing green dot.

## Negative Constraints (DO NOT DO)
- **No Video Game UI:** Avoid HP bars, XP bars, or "Level Up" animations that look like a game.
- **No Sci-Fi / HUD:** Avoid "techy" fonts, scanning lines, holographic effects, or "Terminator" vision.
- **No Dashboard:** Avoid dense data tables or admin-panel aesthetics.
- **Rule of Thumb:** If it wouldn't look out of place on an influencer's phone (Instagram/TikTok), it's correct. If it looks like a cockpit, it's wrong.