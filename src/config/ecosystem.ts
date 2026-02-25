export interface EcosystemAd {
    id: string;
    title: string;
    description: string;
    cta: string;
    link: string;
    imageColor: string;
}

export const ecosystemAds: EcosystemAd[] = [
    {
        id: "breadstand",
        title: "Master your cash flow. The financial clarity tool for entrepreneurs.",
        description: "",
        cta: "Open Breadstand",
        link: "https://breadstand.com", // Assuming a link, can be updated
        imageColor: "bg-emerald-900",
    },
    {
        id: "jasper-goose",
        title: "Deep focus for deep work. The productivity engine.",
        description: "",
        cta: "Get Focused",
        link: "https://jaspergoose.com", // Assuming a link
        imageColor: "bg-indigo-900",
    },
    {
        id: "earnest-coaching",
        title: "Go deeper than the app. 1-on-1 executive coaching.",
        description: "",
        cta: "Apply Now",
        link: "https://earnest.com/coaching", // Assuming a link
        imageColor: "bg-zinc-800",
    }
];
