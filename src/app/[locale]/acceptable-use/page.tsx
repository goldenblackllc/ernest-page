import type { Metadata } from 'next';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';

export const metadata: Metadata = {
    title: 'Acceptable Use Policy — Earnest Page',
    description: 'Acceptable Use Policy for the Earnest Page platform.',
};

export default async function AcceptableUsePage() {
    const t = await getTranslations('acceptableUse');
    const common = await getTranslations();

    return (
        <main className="min-h-screen bg-black text-white">
            {/* Nav */}
            <nav className="fixed top-0 w-full z-50 backdrop-blur-md bg-black/80 border-b border-white/[0.06]">
                <div className="max-w-3xl mx-auto flex items-center justify-between px-6 py-3">
                    <Link href="/" className="font-bold text-lg text-zinc-100 tracking-tight">
                        Earnest Page
                    </Link>
                </div>
            </nav>

            {/* Content */}
            <article className="max-w-3xl mx-auto px-6 pt-24 pb-20">
                <p className="text-[11px] uppercase tracking-[0.3em] text-zinc-600 mb-4">
                    Legal
                </p>
                <h1 className="text-3xl sm:text-4xl font-black tracking-tight mb-2">
                    {t('title')}
                </h1>
                <p className="text-sm text-zinc-600 mb-6">
                    {t('lastUpdated')}
                </p>

                <div className="mb-12 p-4 border border-zinc-800 bg-zinc-900/50 rounded-lg text-xs text-zinc-400">
                    {common('legalDisclaimer')}
                </div>

                <div className="space-y-10 text-sm text-zinc-400 leading-relaxed">
                    <section>
                        <p>{t('intro')}</p>
                    </section>

                    {/* 1 */}
                    <section>
                        <h2 className="text-base font-bold text-white mb-3">{t('s1.title')}</h2>
                        <p className="mb-3">{t('s1.p1')}</p>
                        <ul className="list-disc list-inside space-y-1 text-zinc-500">
                            <li>{t('s1.l1')}</li>
                            <li>{t('s1.l2')}</li>
                            <li>{t('s1.l3')}</li>
                            <li>{t('s1.l4')}</li>
                            <li>{t('s1.l5')}</li>
                            <li>{t('s1.l6')}</li>
                            <li>{t('s1.l7')}</li>
                        </ul>
                    </section>

                    {/* 2 */}
                    <section>
                        <h2 className="text-base font-bold text-white mb-3">{t('s2.title')}</h2>
                        <p className="mb-3">{t('s2.p1')}</p>
                        <ul className="list-disc list-inside space-y-1 text-zinc-500">
                            <li>{t('s2.l1')}</li>
                            <li>{t('s2.l2')}</li>
                            <li>{t('s2.l3')}</li>
                            <li>{t('s2.l4')}</li>
                            <li>{t('s2.l5')}</li>
                            <li>{t('s2.l6')}</li>
                            <li>{t('s2.l7')}</li>
                            <li>{t('s2.l8')}</li>
                        </ul>
                    </section>

                    {/* 3 */}
                    <section>
                        <h2 className="text-base font-bold text-white mb-3">{t('s3.title')}</h2>
                        <p className="mb-3">{t('s3.p1')}</p>
                        <p>
                            <strong className="text-zinc-200">{t('s3.strong')}</strong>
                        </p>
                    </section>

                    {/* 4 */}
                    <section>
                        <h2 className="text-base font-bold text-white mb-3">{t('s4.title')}</h2>
                        <p>{t('s4.p1')}</p>
                    </section>

                    {/* 5 */}
                    <section>
                        <h2 className="text-base font-bold text-white mb-3">{t('s5.title')}</h2>
                        <p>
                            {t('s5.p1')}
                            <a href="mailto:safety@earnestpage.com" className="text-zinc-200 underline hover:text-white transition-colors">
                                safety@earnestpage.com
                            </a>
                            {common('acceptableUse.s5_2.p2')}
                        </p>
                    </section>

                    {/* 6 */}
                    <section>
                        <h2 className="text-base font-bold text-white mb-3">{t('s6.title')}</h2>
                        <p>{t('s6.p1')}</p>
                    </section>
                </div>
            </article>

            {/* Footer */}
            <footer className="border-t border-white/[0.06] px-6 py-10">
                <div className="max-w-3xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4 text-[11px] text-zinc-600">
                    <span>{common('terms.footer.copyright', { year: new Date().getFullYear() })}</span>
                    <div className="flex items-center gap-4">
                        <Link href="/terms" className="hover:text-zinc-400 transition-colors">{common('terms.footer.terms')}</Link>
                        <Link href="/privacy" className="hover:text-zinc-400 transition-colors">{common('terms.footer.privacy')}</Link>
                        <span className="text-zinc-500">{common('terms.footer.aup')}</span>
                    </div>
                </div>
            </footer>
        </main>
    );
}
