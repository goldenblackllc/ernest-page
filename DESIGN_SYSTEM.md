# EARNEST PAGE - DESIGN SYSTEM & UI GUIDELINES

## 1. Core Philosophy
The aesthetic is "The Daily Truth." It is a digital newspaper/manifesto. It is stark, high-contrast, mechanical, and serious. 
* **NO** rounded corners (`rounded-none` everywhere).
* **NO** soft drop shadows (`shadow-none`).
* **NO** default browser focus rings (no blue halos).
* **NO** pastel or SaaS-style soft UI.

## 2. Color Palette
Strict monochrome with specific gray boundaries.
* **Backgrounds:** `bg-white` or `bg-gray-50` (for off-white canvas).
* **Text:** `text-black` (primary), `text-gray-500` (labels/metadata).
* **Borders:** `border-black` (structural/active), `border-gray-300` (inactive/form fields).

## 3. Typography
* **Headings (The Headlines):** Serif or bold sans-serif. High contrast. 
  * *Classes:* `text-3xl md:text-4xl font-extrabold tracking-tight text-black`
* **Body Text (The Story):** Clean, legible sans-serif or serif.
  * *Classes:* `text-base leading-relaxed text-gray-700`
* **Meta/Labels (The Structure):** Tiny, uppercase, tracked-out.
  * *Classes:* `text-[10px] md:text-xs font-bold uppercase tracking-[0.15em] text-gray-500`

## 4. Form Controls (Inputs, Textareas)
Forms must look like physical boxes on a printed page. 
* **Standard Input/Textarea:** `w-full border border-gray-300 bg-transparent px-4 py-3 text-black placeholder-gray-400 focus:outline-none focus:border-black focus:ring-0 rounded-none transition-colors`
* **Form Labels:** `block text-[10px] md:text-xs font-bold uppercase tracking-[0.15em] text-gray-900 mb-2`
* **Input Groups (e.g., with an icon/button attached):** Must be a flex container with `border border-gray-300`. Inner elements should have no individual borders to form a single continuous block.

## 5. Buttons
Buttons are heavy, brutalist, and solid.
* **Primary Button (Solid Black):**
  `bg-black text-white px-6 py-4 text-xs font-bold uppercase tracking-[0.15em] hover:bg-gray-800 focus:outline-none focus:ring-0 rounded-none border border-black transition-all w-full md:w-auto`
* **Secondary Button (Outline):**
  `bg-transparent text-black px-6 py-4 text-xs font-bold uppercase tracking-[0.15em] hover:bg-black hover:text-white focus:outline-none focus:ring-0 rounded-none border border-black transition-all w-full md:w-auto`
* **Ghost Button (Text Only):**
  `bg-transparent text-gray-500 px-4 py-2 text-xs font-bold uppercase tracking-[0.15em] hover:text-black transition-colors`

## 6. Layout & Cards
* **Cards/Containers:** Simple white boxes with crisp borders or just white backgrounds against a gray canvas.
* **Padding:** Generous and breathable. Use `p-6` or `p-8`.