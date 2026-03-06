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
        id: "breadstand",
        brand: "Breadstand",
        title: "Master your cash flow. The financial clarity tool for entrepreneurs.",
        cta: "Open Breadstand",
        link: "https://breadstand.us",
        imageColor: "bg-emerald-900",
        meta: "Ecosystem Partner",
    },
    {
        id: "jasper-goose",
        brand: "Jasper Goose",
        title: "Deep focus for deep work. The productivity engine.",
        cta: "Get Focused",
        link: "https://jaspergoose.com",
        imageColor: "bg-indigo-900",
        meta: "Ecosystem Partner",
    },
    {
        id: "earnest-coaching",
        brand: "Earnest",
        title: "Go deeper than the app. 1-on-1 executive coaching.",
        cta: "Apply Now",
        link: "https://earnest.com/coaching",
        imageColor: "bg-zinc-800",
        meta: "Sponsored",
    }
];
