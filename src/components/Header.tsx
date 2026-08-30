'use client';
import { Link } from "@/i18n/navigation";
import { useTranslations, useFormatter } from 'next-intl';

export function Header() {
    const t = useTranslations('header');
    const format = useFormatter();
    return (
        <header className="border-b-4 border-black py-6 mb-8 text-center sticky top-0 bg-white z-50">
            <h1 className="text-5xl md:text-7xl font-black uppercase tracking-tighter hover:tracking-wide transition-all duration-500 cursor-pointer">
                <Link href="/">{t('title')}</Link>
            </h1>
            <div className="flex justify-between max-w-4xl mx-auto mt-4 px-4 border-t border-black pt-2 font-sans font-bold uppercase tracking-widest text-xs">
                <span>{t('volume')}</span>
                <span>{format.dateTime(new Date(), { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</span>
                <span>{t('price')}</span>
            </div>
        </header>
    );
}
