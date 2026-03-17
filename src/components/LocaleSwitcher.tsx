"use client";

import { useLocale, useTranslations } from 'next-intl';
import { usePathname, useRouter } from '@/i18n/navigation';
import { useTransition } from 'react';
import { useAuth } from '@/lib/auth/AuthContext';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase/config';
import { Globe } from 'lucide-react';
import { cn } from '@/lib/utils';

export function LocaleSwitcher({ className }: { className?: string }) {
    const [isPending, startTransition] = useTransition();
    const locale = useLocale();
    const router = useRouter();
    const pathname = usePathname();
    const { user } = useAuth();

    const onSelectChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
        const nextLocale = event.target.value;
        
        // Update user preference in Firestore if logged in
        if (user) {
            try {
                updateDoc(doc(db, 'users', user.uid), { preferred_locale: nextLocale });
            } catch (err) {
                console.error("Failed to save preferred_locale:", err);
            }
        }
        
        startTransition(() => {
            router.replace(pathname, { locale: nextLocale });
        });
    };

    return (
        <div className={cn("relative flex items-center text-zinc-400 hover:text-white transition-colors bg-zinc-900/50 hover:bg-zinc-800/80 rounded-md border border-white/5", className)}>
            <Globe className="absolute left-2 w-4 h-4 pointer-events-none" />
            <select
                className="appearance-none bg-transparent border-none pl-8 pr-6 py-1.5 focus:ring-0 cursor-pointer text-sm font-medium w-full text-zinc-300"
                defaultValue={locale}
                disabled={isPending}
                onChange={onSelectChange}
            >
                <option value="en" className="bg-zinc-900 text-white">EN</option>
                <option value="es" className="bg-zinc-900 text-white">ES</option>
                <option value="fr" className="bg-zinc-900 text-white">FR</option>
                <option value="pt" className="bg-zinc-900 text-white">PT</option>
            </select>
            <div className="absolute right-2 pointer-events-none">
                <svg className="w-3 h-3 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
            </div>
        </div>
    );
}
