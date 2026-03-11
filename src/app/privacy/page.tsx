import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
    title: 'Privacy Policy — Earnest Page',
    description: 'Privacy Policy for the Earnest Page platform.',
};

export default function PrivacyPage() {
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
                    Privacy Policy
                </h1>
                <p className="text-sm text-zinc-600 mb-12">
                    Last updated: March 11, 2026
                </p>

                <div className="space-y-10 text-sm text-zinc-400 leading-relaxed">
                    {/* 1 */}
                    <section>
                        <h2 className="text-base font-bold text-white mb-3">1. Introduction</h2>
                        <p>
                            Golden Black LLC (&ldquo;we,&rdquo; &ldquo;us,&rdquo; or &ldquo;our&rdquo;) operates
                            Earnest Page. This Privacy Policy describes how we collect, use, store, and protect
                            your personal information when you use our platform. We are committed to
                            transparency and to protecting your privacy.
                        </p>
                    </section>

                    {/* 2 */}
                    <section>
                        <h2 className="text-base font-bold text-white mb-3">2. Information We Collect</h2>

                        <h3 className="text-sm font-bold text-zinc-300 mb-2 mt-4">2.1 Authentication Data</h3>
                        <p className="mb-3">
                            We use phone-based authentication via Twilio Verify. Your phone number is used
                            solely to send a one-time verification code during login.{' '}
                            <strong className="text-zinc-200">
                                We do not store your phone number in our database.
                            </strong>{' '}
                            A one-way cryptographic hash (SHA-256) of your phone number is stored for the
                            Contact Firewall feature, which allows you to exclude people you know from your
                            anonymous feed.
                        </p>

                        <h3 className="text-sm font-bold text-zinc-300 mb-2 mt-4">2.2 Profile &amp; Identity Data</h3>
                        <p className="mb-3">
                            Information you voluntarily provide during onboarding and profile editing:
                            gender, age, ethnicity (optional), life vision, important people in your life,
                            and personal interests. This data is used exclusively to build your Character
                            Bible and personalize your AI interactions.
                        </p>

                        <h3 className="text-sm font-bold text-zinc-300 mb-2 mt-4">2.3 Conversation Data</h3>
                        <p className="mb-3">
                            Your conversations with Mirror Chat are temporarily stored in Firebase Firestore
                            during the active session. After a session closes, the conversation is processed
                            to update your dossier and (if you have chosen public routing) generate an
                            anonymous post. The raw conversation transcript is stored as{' '}
                            <code className="text-zinc-300 bg-zinc-900 px-1.5 py-0.5 rounded text-xs">content_raw</code>{' '}
                            and is{' '}
                            <strong className="text-zinc-200">never visible to any user other than you</strong>.
                            &ldquo;Burn on Close&rdquo; sessions are deleted immediately with zero data retention.
                        </p>

                        <h3 className="text-sm font-bold text-zinc-300 mb-2 mt-4">2.4 Location Data</h3>
                        <p className="mb-3">
                            If you grant browser geolocation permission, your approximate coordinates (latitude
                            and longitude) are used for the Proximity Blind Spot feature, which filters posts
                            from within a 200-mile radius to protect your anonymity. You may also manually set
                            a location anchor via zip code. Your precise coordinates are never displayed to
                            other users or included in API responses.
                        </p>

                        <h3 className="text-sm font-bold text-zinc-300 mb-2 mt-4">2.5 Payment Data</h3>
                        <p>
                            Payment processing is handled entirely by Stripe. We do not store credit card
                            numbers, bank account details, or other payment credentials on our servers. We
                            store only your subscription status, plan type, and Stripe payment intent
                            identifiers.
                        </p>
                    </section>

                    {/* 3 */}
                    <section>
                        <h2 className="text-base font-bold text-white mb-3">3. How We Use Your Information</h2>
                        <ul className="list-disc list-inside space-y-1 text-zinc-500">
                            <li>To authenticate your identity and manage your account</li>
                            <li>To power the AI-driven Mirror Chat, dossier updates, and character compilation</li>
                            <li>To generate anonymous, AI-ghostwritten posts for the public feed (with your consent via routing settings)</li>
                            <li>To generate AI-powered hero images for posts</li>
                            <li>To provide proximity-based anonymity filtering</li>
                            <li>To process payments and manage subscriptions</li>
                            <li>To improve the Service and fix technical issues</li>
                        </ul>
                    </section>

                    {/* 4 */}
                    <section>
                        <h2 className="text-base font-bold text-white mb-3">4. Third-Party Services</h2>
                        <p className="mb-3">We use the following third-party services to operate the platform:</p>
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm border border-zinc-800 rounded-lg overflow-hidden">
                                <thead>
                                    <tr className="border-b border-zinc-800 bg-zinc-900/50">
                                        <th className="text-left px-4 py-2 text-zinc-300 font-bold text-xs uppercase tracking-wider">Service</th>
                                        <th className="text-left px-4 py-2 text-zinc-300 font-bold text-xs uppercase tracking-wider">Purpose</th>
                                        <th className="text-left px-4 py-2 text-zinc-300 font-bold text-xs uppercase tracking-wider">Data Shared</th>
                                    </tr>
                                </thead>
                                <tbody className="text-zinc-500">
                                    <tr className="border-b border-zinc-800/50">
                                        <td className="px-4 py-2 text-zinc-300">Firebase</td>
                                        <td className="px-4 py-2">Authentication, database, storage</td>
                                        <td className="px-4 py-2">Account data, profile, posts</td>
                                    </tr>
                                    <tr className="border-b border-zinc-800/50">
                                        <td className="px-4 py-2 text-zinc-300">Anthropic (Claude)</td>
                                        <td className="px-4 py-2">AI conversation, content synthesis</td>
                                        <td className="px-4 py-2">Conversation content, character data</td>
                                    </tr>
                                    <tr className="border-b border-zinc-800/50">
                                        <td className="px-4 py-2 text-zinc-300">Google (Imagen)</td>
                                        <td className="px-4 py-2">Image generation for posts</td>
                                        <td className="px-4 py-2">AI-generated text prompts only</td>
                                    </tr>
                                    <tr className="border-b border-zinc-800/50">
                                        <td className="px-4 py-2 text-zinc-300">Stripe</td>
                                        <td className="px-4 py-2">Payment processing</td>
                                        <td className="px-4 py-2">Payment details (handled by Stripe)</td>
                                    </tr>
                                    <tr className="border-b border-zinc-800/50">
                                        <td className="px-4 py-2 text-zinc-300">Twilio</td>
                                        <td className="px-4 py-2">SMS verification codes</td>
                                        <td className="px-4 py-2">Phone number (for OTP delivery only)</td>
                                    </tr>
                                    <tr>
                                        <td className="px-4 py-2 text-zinc-300">Vercel</td>
                                        <td className="px-4 py-2">Hosting and deployment</td>
                                        <td className="px-4 py-2">Server logs, request metadata</td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>
                    </section>

                    {/* 5 */}
                    <section>
                        <h2 className="text-base font-bold text-white mb-3">5. Anonymity &amp; Public Content</h2>
                        <p className="mb-3">
                            When a conversation is published to the Dear Earnest feed, it is processed by AI
                            to create a fully anonymized, ghostwritten version. All personally identifiable
                            information — including names, locations, employers, and specific details — is
                            scrubbed and replaced with pseudonyms before publication.
                        </p>
                        <p>
                            The raw conversation transcript is{' '}
                            <strong className="text-zinc-200">never accessible to any user other than the author</strong>.
                            We do not display like counts, follower counts, or engagement metrics to other users.
                        </p>
                    </section>

                    {/* 6 */}
                    <section>
                        <h2 className="text-base font-bold text-white mb-3">6. Data Retention</h2>
                        <ul className="list-disc list-inside space-y-1 text-zinc-500">
                            <li>Active chat sessions are deleted within 15 minutes of closing.</li>
                            <li>&ldquo;Burn on Close&rdquo; sessions are purged immediately with no data retained.</li>
                            <li>Published posts are retained until you delete them or delete your account.</li>
                            <li>Your dossier and character profile are retained for the duration of your account.</li>
                        </ul>
                    </section>

                    {/* 7 */}
                    <section>
                        <h2 className="text-base font-bold text-white mb-3">7. Your Rights</h2>
                        <p className="mb-3">Depending on your jurisdiction, you may have the right to:</p>
                        <ul className="list-disc list-inside space-y-1 text-zinc-500">
                            <li><strong className="text-zinc-300">Access</strong> the personal data we hold about you</li>
                            <li><strong className="text-zinc-300">Delete</strong> your account and all associated data</li>
                            <li><strong className="text-zinc-300">Export</strong> your data in a portable format</li>
                            <li><strong className="text-zinc-300">Opt out</strong> of public publishing by setting your default routing to Private</li>
                            <li><strong className="text-zinc-300">Restrict</strong> location data collection by denying browser geolocation</li>
                        </ul>
                        <p className="mt-3">
                            To exercise any of these rights, contact us at{' '}
                            <a href="mailto:privacy@earnestpage.com" className="text-zinc-200 underline hover:text-white transition-colors">
                                privacy@earnestpage.com
                            </a>.
                        </p>
                    </section>

                    {/* 8 */}
                    <section>
                        <h2 className="text-base font-bold text-white mb-3">8. Children&apos;s Privacy</h2>
                        <p>
                            The Service is available to users aged 13 and older. We do not knowingly collect
                            personal information from children under 13. If we learn that we have collected
                            data from a child under 13, we will promptly delete that information.
                        </p>
                    </section>

                    {/* 9 */}
                    <section>
                        <h2 className="text-base font-bold text-white mb-3">9. Security</h2>
                        <p>
                            We employ industry-standard security measures including encrypted data transmission
                            (TLS), cryptographic hashing (SHA-256) for sensitive identifiers, Firebase security
                            rules, and Stripe&apos;s PCI-compliant payment infrastructure. However, no method of
                            electronic storage or transmission is 100% secure.
                        </p>
                    </section>

                    {/* 10 */}
                    <section>
                        <h2 className="text-base font-bold text-white mb-3">10. Changes to This Policy</h2>
                        <p>
                            We may update this Privacy Policy from time to time. If we make material changes,
                            we will provide notice through the Service. Continued use of the Service after
                            changes constitutes acceptance of the updated policy.
                        </p>
                    </section>

                    {/* 11 */}
                    <section>
                        <h2 className="text-base font-bold text-white mb-3">11. Contact</h2>
                        <p>
                            For privacy-related questions or requests, contact us at{' '}
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
                    <span>&copy; {new Date().getFullYear()} Earnest Page. All rights reserved.</span>
                    <div className="flex items-center gap-4">
                        <Link href="/terms" className="hover:text-zinc-400 transition-colors">Terms</Link>
                        <span className="text-zinc-500">Privacy</span>
                        <Link href="/acceptable-use" className="hover:text-zinc-400 transition-colors">Acceptable Use</Link>
                    </div>
                </div>
            </footer>
        </main>
    );
}
