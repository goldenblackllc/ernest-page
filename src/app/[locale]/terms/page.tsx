import type { Metadata } from 'next';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';

export const metadata: Metadata = {
    title: 'Terms of Service — Earnest Page',
    description: 'Terms of Service for the Earnest Page platform.',
};

export default async function TermsPage() {
    const t = await getTranslations('terms');
    const common = await getTranslations();

    return (
        <main className="min-h-screen bg-black text-white">
            {/* Nav */}
            <nav className="fixed top-0 w-full z-50 backdrop-blur-md bg-black/80 border-b border-white/[0.06]">
                <div className="max-w-3xl mx-auto flex items-center justify-between px-6 py-3">
                    <Link href="/" className="font-bold text-lg text-zinc-100 tracking-tight">
                        {t('navBrand')}
                    </Link>
                </div>
            </nav>

            {/* Content */}
            <article className="max-w-3xl mx-auto px-6 pt-24 pb-20">
                <p className="text-[11px] uppercase tracking-[0.3em] text-zinc-600 mb-4">
                    {t('legal')}
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
                    {/* 1 */}
                    <section>
                        <h2 className="text-base font-bold text-white mb-3">{t('s1.title')}</h2>
                        <p>{t('s1.p1')}</p>
                    </section>

                    {/* 2 */}
                    <section>
                        <h2 className="text-base font-bold text-white mb-3">{t('s2.title')}</h2>
                        <p>
                            {t('s2.p1')}<strong className="text-zinc-200">{t('s2.strong')}</strong>{t('s2.p2')}
                        </p>
                    </section>

                    {/* 3 */}
                    <section>
                        <h2 className="text-base font-bold text-white mb-3">{t('s3.title')}</h2>
                        <p>{t('s3.p1')}</p>
                    </section>

                    {/* 4 */}
                    <section>
                        <h2 className="text-base font-bold text-white mb-3">{t('s4.title')}</h2>
                        <p className="mb-3">{t('s4.p1')}</p>
                        <ul className="list-disc list-inside space-y-1 text-zinc-500">
                            <li>{t('s4.l1')}</li>
                            <li>{t('s4.l2')}</li>
                            <li>{t('s4.l3')}</li>
                            <li>{t('s4.l4')}</li>
                            <li>{t('s4.l5')}</li>
                        </ul>
                    </section>

                    {/* 5 */}
                    <section>
                        <h2 className="text-base font-bold text-white mb-3">{t('s5.title')}</h2>
                        <p className="mb-3">{t('s5.p1')}</p>
                        <ul className="list-disc list-inside space-y-1 text-zinc-500">
                            <li>{t('s5.l1')}</li>
                            <li>{t('s5.l2')}</li>
                            <li>{t('s5.l3')}</li>
                        </ul>
                    </section>

                    {/* 6 */}
                    <section>
                        <h2 className="text-base font-bold text-white mb-3">{t('s6.title')}</h2>
                        <p className="mb-3">{t('s6.p1')}</p>
                        <p>
                            {t('s6.p2')}
                            <Link href="/acceptable-use" className="text-zinc-200 underline hover:text-white transition-colors">
                                {t('footer.aup')}
                            </Link>.
                        </p>
                    </section>

                    {/* 7 */}
                    <section>
                        <h2 className="text-base font-bold text-white mb-3">{t('s7.title')}</h2>
                        <p className="mb-3">{t('s7.p1')}</p>
                        <p className="mb-3">
                            <strong className="text-zinc-200">{t('s7.strong1')}</strong>{t('s7.p1b')}
                        </p>
                        <p className="mb-3">
                            <strong className="text-zinc-200">{t('s7.strong1b')}</strong>{t('s7.p2')}
                        </p>
                        <p>
                            <strong className="text-zinc-200">{t('s7.strong2')}</strong>{t('s7.p3')}
                        </p>
                    </section>

                    {/* 8 */}
                    <section>
                        <h2 className="text-base font-bold text-white mb-3">{t('s8.title')}</h2>
                        <p>
                            {t('s8.p1')}
                            <Link href="/privacy" className="text-zinc-200 underline hover:text-white transition-colors">
                                {t('footer.privacy')}
                            </Link>{common('terms.s8_2.p2')}
                        </p>
                    </section>

                    {/* 9 */}
                    <section>
                        <h2 className="text-base font-bold text-white mb-3">{t('s9.title')}</h2>
                        <p className="mb-3">{t('s9.p1')}</p>
                        <p>
                            <strong className="text-zinc-200">{t('s9.strong1')}</strong>{t('s9.p2')}
                            <strong className="text-zinc-200">{t('s9.strong2')}</strong>{t('s9.p3')}
                        </p>
                    </section>

                    {/* 10 */}
                    <section>
                        <h2 className="text-base font-bold text-white mb-3">{t('s10.title')}</h2>
                        <p>{t('s10.p1')}</p>
                    </section>

                    {/* 11 */}
                    <section>
                        <h2 className="text-base font-bold text-white mb-3">{t('s11.title')}</h2>
                        <p>{t('s11.p1')}</p>
                    </section>

                    {/* 12 */}
                    <section>
                        <h2 className="text-base font-bold text-white mb-3">{t('s12.title')}</h2>
                        <p>{t('s12.p1')}</p>
                    </section>

                    {/* 13 */}
                    <section>
                        <h2 className="text-base font-bold text-white mb-3">{t('s13.title')}</h2>
                        <p>{t('s13.p1')}</p>
                    </section>

                    {/* 14 */}
                    <section>
                        <h2 className="text-base font-bold text-white mb-3">{t('s14.title')}</h2>
                        <p>
                            {t('s14.p1')}
                            <a href="mailto:legal@earnestpage.com" className="text-zinc-200 underline hover:text-white transition-colors">
                                legal@earnestpage.com
                            </a>.
                        </p>
                    </section>
                </div>
            </article>

            {/* Footer */}
            <footer className="border-t border-white/[0.06] px-6 py-10">
                <div className="max-w-3xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4 text-[11px] text-zinc-600">
                    <span>{t('footer.copyright', { year: new Date().getFullYear() })}</span>
                    <div className="flex items-center gap-4">
                        <span className="text-zinc-500">{t('footer.terms')}</span>
                        <Link href="/privacy" className="hover:text-zinc-400 transition-colors">{t('footer.privacy')}</Link>
                        <Link href="/acceptable-use" className="hover:text-zinc-400 transition-colors">{t('footer.aup')}</Link>
                    </div>
                </div>
            </footer>
        </main>
    );
}
