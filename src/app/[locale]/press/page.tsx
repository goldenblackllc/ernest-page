"use client";

import { Header } from "@/components/Header";
import { Button } from "@/components/ui/Button";
import { MasterAction } from "@/lib/firebase/schema";
import { useLocked } from "@/context/LockedContext";
import { useRouter } from "next/navigation";
import { Timestamp } from "firebase/firestore";
import { useTranslations } from "next-intl";

const MOCK_ACTIONS: MasterAction[] = [
    { id: '101', title: "Write 500 words of truth.", excitement_score: 8, created_at: Timestamp.now() },
    { id: '102', title: "Call a friend and ask about their fears.", excitement_score: 9, created_at: Timestamp.now() },
    { id: '103', title: "Sit in silence for 15 minutes.", excitement_score: 6, created_at: Timestamp.now() },
];

export default function PressPage() {
    const { lockApp } = useLocked();
    const router = useRouter();
    const t = useTranslations('press');

    const handleSelect = (action: MasterAction) => {
        lockApp(action);
        router.push('/');
    };

    return (
        <main className="min-h-screen pb-20">
            <Header />
            <div className="container mx-auto px-4 max-w-4xl text-center">
                <h2 className="text-4xl font-black mb-8">{t('title')}</h2>
                <p className="text-xl mb-12 uppercase tracking-widest text-black">{t('subtitle')}</p>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                    {MOCK_ACTIONS.map((action) => (
                        <div key={action.id} className="border-2 border-black p-8 flex flex-col justify-between hover:bg-black hover:text-white transition-colors group">
                            <h3 className="text-3xl font-bold mb-4">{action.title}</h3>
                            <div className="mt-8">
                                <span className="block text-xs uppercase tracking-widest mb-2 border-b border-black pb-1 group-hover:border-white">
                                    {t('excitementIndex', { score: action.excitement_score })}
                                </span>
                                <Button onClick={() => handleSelect(action)} className="w-full mt-4 group-hover:border-white group-hover:bg-white group-hover:text-black">
                                    {t('initialize')}
                                </Button>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </main>
    );
}
