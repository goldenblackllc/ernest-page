export interface EcosystemAd {
    id: string;
    brand: string;
    title: string;
    headline?: string;
    body?: string;
    description?: string;
    cta: string;
    link: string;
    imageColor: string;
    imageUrl?: string;
    meta?: string;
}

export const ecosystemAds: EcosystemAd[] = [
    {
        id: "breadstand-jura",
        brand: "Breadstand",
        title: "Stop waiting for a better morning. Demand it.",
        headline: "Stop waiting for a better morning. Demand it.",
        body: "A better life is built on better choices. Stop settling for the quick fix or the compromise cup. A Jura automatic machine is the everyday standard you deserve—flawless coffee, fresh beans, and the smart financial choice at $0.40 a cup. Take control of your daily ritual.",
        cta: "Take Control of Your Morning",
        link: "https://breadstand.us",
        imageColor: "bg-zinc-900",
        imageUrl: "/ads/breadstand1.jpeg",
        meta: "Ecosystem Partner",
    },
    {
        id: "breadstand-jura-2",
        brand: "Breadstand",
        title: "Quality isn't a luxury. It's a decision.",
        headline: "Quality isn't a luxury. It's a decision.",
        body: "You dictate the standard of your own life. Choosing an authorized Jura from BreadStand means rejecting disposable, short-term traps and investing in true Swiss engineering. It's the intentional, empowering choice that pays for itself every single day.",
        cta: "Make the Decision",
        link: "https://breadstand.us",
        imageColor: "bg-zinc-900",
        imageUrl: "/ads/breadstand2.jpeg",
        meta: "Ecosystem Partner",
    },
    {
        id: "breadstand-jura-3",
        brand: "Breadstand",
        title: "Live with purpose. Brew with precision.",
        headline: "Live with purpose. Brew with precision.",
        body: "Don't let your morning happen to you. Define it. With a Jura, there is no waiting in line, no messy filters, and zero friction. Just the absolute best, freshly ground coffee right in your kitchen, at the touch of a button. Because you shouldn't have to compromise on your everyday necessities.",
        cta: "Define Your Morning",
        link: "https://breadstand.us",
        imageColor: "bg-zinc-900",
        imageUrl: "/ads/breadstand3.jpeg",
        meta: "Ecosystem Partner",
    }
];
