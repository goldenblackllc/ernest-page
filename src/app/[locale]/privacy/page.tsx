import type { Metadata } from 'next';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';

export const metadata: Metadata = {
    title: 'Privacy Policy — Earnest Page',
    description: 'Privacy Policy for the Earnest Page platform.',
};

export default async function PrivacyPage() {
    const t = await getTranslations('privacy');
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
                    {/* 1 */}
                    <section>
                        <h2 className="text-base font-bold text-white mb-3">{t('s1.title')}</h2>
                        <p>{t('s1.p1')}</p>
                    </section>

                    {/* 2 */}
                    <section>
                        <h2 className="text-base font-bold text-white mb-3">{t('s2.title')}</h2>

                        <h3 className="text-sm font-bold text-zinc-300 mb-2 mt-4">{t('s2.t1')}</h3>
                        <p className="mb-3">
                            {t('s2.p1')}
                            <strong className="text-zinc-200">
                                {t('s2.strong1')}
                            </strong>{t('s2.p2')}
                        </p>

                        <h3 className="text-sm font-bold text-zinc-300 mb-2 mt-4">{t('s2.t2')}</h3>
                        <p className="mb-3">{t('s2.p3')}</p>

                        <h3 className="text-sm font-bold text-zinc-300 mb-2 mt-4">{t('s2.t3')}</h3>
                        <p className="mb-3">
                            {t('s2.p4')}
                            <code className="text-zinc-300 bg-zinc-900 px-1.5 py-0.5 rounded text-xs">{t('s2.code')}</code>
                            {t('s2.p5')}
                            <strong className="text-zinc-200">{t('s2.strong2')}</strong>{t('s2.p6')}
                        </p>

                        <h3 className="text-sm font-bold text-zinc-300 mb-2 mt-4">{t('s2.t4')}</h3>
                        <p className="mb-3">{t('s2.p7')}</p>

                        <h3 className="text-sm font-bold text-zinc-300 mb-2 mt-4">{t('s2.t5')}</h3>
                        <p>{t('s2.p8')}</p>
                    </section>

                    {/* 3 */}
                    <section>
                        <h2 className="text-base font-bold text-white mb-3">{t('s3.title')}</h2>
                        <ul className="list-disc list-inside space-y-1 text-zinc-500">
                            <li>{t('s3.l1')}</li>
                            <li>{t('s3.l2')}</li>
                            <li>{t('s3.l3')}</li>
                            <li>{t('s3.l4')}</li>
                            <li>{t('s3.l5')}</li>
                            <li>{t('s3.l6')}</li>
                            <li>{t('s3.l7')}</li>
                        </ul>
                    </section>

                    {/* 4 */}
                    <section>
                        <h2 className="text-base font-bold text-white mb-3">{t('s4.title')}</h2>
                        <p className="mb-3">{t('s4.p1')}</p>
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm border border-zinc-800 rounded-lg overflow-hidden">
                                <thead>
                                    <tr className="border-b border-zinc-800 bg-zinc-900/50">
                                        <th className="text-left px-4 py-2 text-zinc-300 font-bold text-xs uppercase tracking-wider">{t('s4.th1')}</th>
                                        <th className="text-left px-4 py-2 text-zinc-300 font-bold text-xs uppercase tracking-wider">{t('s4.th2')}</th>
                                        <th className="text-left px-4 py-2 text-zinc-300 font-bold text-xs uppercase tracking-wider">{t('s4.th3')}</th>
                                    </tr>
                                </thead>
                                <tbody className="text-zinc-500">
                                    <tr className="border-b border-zinc-800/50">
                                        <td className="px-4 py-2 text-zinc-300">{t('s4.td1_1')}</td>
                                        <td className="px-4 py-2">{t('s4.td1_2')}</td>
                                        <td className="px-4 py-2">{t('s4.td1_3')}</td>
                                    </tr>
                                    <tr className="border-b border-zinc-800/50">
                                        <td className="px-4 py-2 text-zinc-300">{t('s4.td2_1')}</td>
                                        <td className="px-4 py-2">{t('s4.td2_2')}</td>
                                        <td className="px-4 py-2">{t('s4.td2_3')}</td>
                                    </tr>
                                    <tr className="border-b border-zinc-800/50">
                                        <td className="px-4 py-2 text-zinc-300">{t('s4.td3_1')}</td>
                                        <td className="px-4 py-2">{t('s4.td3_2')}</td>
                                        <td className="px-4 py-2">{t('s4.td3_3')}</td>
                                    </tr>
                                    <tr className="border-b border-zinc-800/50">
                                        <td className="px-4 py-2 text-zinc-300">{t('s4.td4_1')}</td>
                                        <td className="px-4 py-2">{t('s4.td4_2')}</td>
                                        <td className="px-4 py-2">{t('s4.td4_3')}</td>
                                    </tr>
                                    <tr className="border-b border-zinc-800/50">
                                        <td className="px-4 py-2 text-zinc-300">{t('s4.td5_1')}</td>
                                        <td className="px-4 py-2">{t('s4.td5_2')}</td>
                                        <td className="px-4 py-2">{t('s4.td5_3')}</td>
                                    </tr>
                                    <tr>
                                        <td className="px-4 py-2 text-zinc-300">{t('s4.td6_1')}</td>
                                        <td className="px-4 py-2">{t('s4.td6_2')}</td>
                                        <td className="px-4 py-2">{t('s4.td6_3')}</td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>
                    </section>

                    {/* 5 */}
                    <section>
                        <h2 className="text-base font-bold text-white mb-3">{t('s5.title')}</h2>
                        <p className="mb-3">{t('s5.p1')}</p>
                        <p>
                            {t('s5.p2')}
                            <strong className="text-zinc-200">{t('s5.strong1')}</strong>{t('s5.p3')}
                        </p>
                    </section>

                    {/* 6 */}
                    <section>
                        <h2 className="text-base font-bold text-white mb-3">{t('s6.title')}</h2>
                        <ul className="list-disc list-inside space-y-1 text-zinc-500">
                            <li>{t('s6.l1')}</li>
                            <li>{t('s6.l2')}</li>
                            <li>{t('s6.l3')}</li>
                            <li>{t('s6.l4')}</li>
                            <li>{t('s6.l5')}</li>
                            <li>{t('s6.l6')}</li>
                        </ul>
                    </section>

                    {/* 7 — Lawful Basis (GDPR) */}
                    <section>
                        <h2 className="text-base font-bold text-white mb-3">{t('s7.title')}</h2>
                        <p className="mb-4">{t('s7.p1')}</p>
                        <div className="space-y-4 ml-1">
                            <div>
                                <h3 className="text-sm font-bold text-zinc-300 mb-1">{t('s7.t1')}</h3>
                                <p className="text-zinc-500">{t('s7.b1')}</p>
                            </div>
                            <div>
                                <h3 className="text-sm font-bold text-zinc-300 mb-1">{t('s7.t2')}</h3>
                                <p className="text-zinc-500">{t('s7.b2')}</p>
                            </div>
                            <div>
                                <h3 className="text-sm font-bold text-zinc-300 mb-1">{t('s7.t3')}</h3>
                                <p className="text-zinc-500">{t('s7.b3')}</p>
                            </div>
                            <div>
                                <h3 className="text-sm font-bold text-zinc-300 mb-1">{t('s7.t4')}</h3>
                                <p className="text-zinc-500">{t('s7.b4')}</p>
                            </div>
                        </div>
                        <p className="mt-4 text-zinc-500">{t('s7.p2')}</p>
                    </section>

                    {/* 8 — International Data Transfers */}
                    <section>
                        <h2 className="text-base font-bold text-white mb-3">{t('s8.title')}</h2>
                        <p className="mb-3">{t('s8.p1')}</p>
                        <p className="mb-3">{t('s8.p2')}</p>
                        <ul className="list-disc list-inside space-y-1 text-zinc-500 mb-3">
                            <li>{t('s8.l1')}</li>
                            <li>{t('s8.l2')}</li>
                            <li>{t('s8.l3')}</li>
                        </ul>
                        <p>{t('s8.p3')}</p>
                    </section>

                    {/* 9 — Your Rights (expanded) */}
                    <section>
                        <h2 className="text-base font-bold text-white mb-3">{t('s9.title')}</h2>
                        <p className="mb-3">{t('s9.p1')}</p>

                        <h3 className="text-sm font-bold text-zinc-300 mb-2 mt-4">{t('s9.t1')}</h3>
                        <ul className="list-disc list-inside space-y-1 text-zinc-500">
                            <li><strong className="text-zinc-300">{t('s9.strong1')}</strong>{t('s9.l1')}</li>
                            <li><strong className="text-zinc-300">{t('s9.strong2')}</strong>{t('s9.l2')}</li>
                            <li><strong className="text-zinc-300">{t('s9.strong3')}</strong>{t('s9.l3')}</li>
                            <li><strong className="text-zinc-300">{t('s9.strong4')}</strong>{t('s9.l4')}</li>
                            <li><strong className="text-zinc-300">{t('s9.strong5')}</strong>{t('s9.l5')}</li>
                        </ul>

                        <h3 className="text-sm font-bold text-zinc-300 mb-2 mt-4">{t('s9.t2')}</h3>
                        <ul className="list-disc list-inside space-y-1 text-zinc-500">
                            <li><strong className="text-zinc-300">{t('s9.strong6')}</strong>{t('s9.l6')}</li>
                            <li><strong className="text-zinc-300">{t('s9.strong7')}</strong>{t('s9.l7')}</li>
                            <li><strong className="text-zinc-300">{t('s9.strong8')}</strong>{t('s9.l8')}</li>
                            <li><strong className="text-zinc-300">{t('s9.strong9')}</strong>{t('s9.l9')}</li>
                            <li><strong className="text-zinc-300">{t('s9.strong10')}</strong>{t('s9.l10')}</li>
                        </ul>

                        <h3 className="text-sm font-bold text-zinc-300 mb-2 mt-4">{t('s9.t3')}</h3>
                        <ul className="list-disc list-inside space-y-1 text-zinc-500">
                            <li>{t('s9.l11')}</li>
                            <li>{t('s9.l12')}</li>
                            <li>{t('s9.l13')}</li>
                            <li>{t('s9.l14')}</li>
                        </ul>

                        <p className="mt-3">
                            {t('s9.p2')}
                            <a href="mailto:privacy@earnestpage.com" className="text-zinc-200 underline hover:text-white transition-colors">
                                privacy@earnestpage.com
                            </a>.
                        </p>
                        <p className="mt-2 text-zinc-500">{t('s9.p3')}</p>
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

                    {/* 13 — Data Protection Contact */}
                    <section>
                        <h2 className="text-base font-bold text-white mb-3">{t('s13.title')}</h2>
                        <p className="mb-2">{t('s13.p1')}</p>
                        <div className="ml-4 text-zinc-500">
                            <p className="text-zinc-300 font-medium">{t('s13.p2')}</p>
                            <p>{t('s13.p3')}</p>
                            <p>
                                {t('s13.p4')}
                                <a href="mailto:privacy@earnestpage.com" className="text-zinc-200 underline hover:text-white transition-colors">
                                    privacy@earnestpage.com
                                </a>
                            </p>
                        </div>
                    </section>

                    {/* 14 */}
                    <section>
                        <h2 className="text-base font-bold text-white mb-3">{t('s14.title')}</h2>
                        <p>
                            {t('s14.p1')}
                            <a href="mailto:privacy@earnestpage.com" className="text-zinc-200 underline hover:text-white transition-colors">
                                privacy@earnestpage.com
                            </a>.
                        </p>
                    </section>
                </div>
            </article>

            {/* Footer */}
            <footer className="border-t border-white/[0.06] px-6 py-10">
                <div className="max-w-3xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4 text-[11px] text-zinc-600">
                    <span>{common('terms.footer.copyright', { year: new Date().getFullYear() })}</span>
                    <div className="flex items-center gap-4">
                        <Link href="/terms" className="hover:text-zinc-400 transition-colors">{common('terms.footer.terms')}</Link>
                        <span className="text-zinc-500">{common('terms.footer.privacy')}</span>
                        <Link href="/acceptable-use" className="hover:text-zinc-400 transition-colors">{common('terms.footer.aup')}</Link>
                    </div>
                </div>
            </footer>
        </main>
    );
}
