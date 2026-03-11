import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
    title: 'Terms of Service — Earnest Page',
    description: 'Terms of Service for the Earnest Page platform.',
};

export default function TermsPage() {
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
                    Terms of Service
                </h1>
                <p className="text-sm text-zinc-600 mb-12">
                    Last updated: March 11, 2026
                </p>

                <div className="space-y-10 text-sm text-zinc-400 leading-relaxed">
                    {/* 1 */}
                    <section>
                        <h2 className="text-base font-bold text-white mb-3">1. Agreement to Terms</h2>
                        <p>
                            By accessing or using Earnest Page (&ldquo;the Service&rdquo;), you agree to be
                            bound by these Terms of Service (&ldquo;Terms&rdquo;). If you do not agree, do
                            not use the Service. The Service is operated by Golden Black LLC
                            (&ldquo;we,&rdquo; &ldquo;us,&rdquo; or &ldquo;our&rdquo;).
                        </p>
                    </section>

                    {/* 2 */}
                    <section>
                        <h2 className="text-base font-bold text-white mb-3">2. Eligibility</h2>
                        <p>
                            You must be at least <strong className="text-zinc-200">13 years of age</strong> to
                            use the Service. By creating an account, you represent and warrant that you meet
                            this minimum age requirement. If you are under 18, you affirm that you have the
                            consent of a parent or legal guardian.
                        </p>
                    </section>

                    {/* 3 */}
                    <section>
                        <h2 className="text-base font-bold text-white mb-3">3. Account &amp; Authentication</h2>
                        <p>
                            Accounts are created via phone number verification. Your phone number is used
                            solely for authentication and is never stored in our database. A cryptographic
                            hash of your phone number is used for contact-exclusion features. You are
                            responsible for maintaining the security of your device and account access.
                        </p>
                    </section>

                    {/* 4 */}
                    <section>
                        <h2 className="text-base font-bold text-white mb-3">4. Description of Service</h2>
                        <p className="mb-3">
                            Earnest Page is a self-actualization platform that provides:
                        </p>
                        <ul className="list-disc list-inside space-y-1 text-zinc-500">
                            <li>An AI-powered conversational interface (&ldquo;Mirror Chat&rdquo;) that simulates dialogue with your defined Ideal Self</li>
                            <li>An AI-maintained personal dossier based on your conversations</li>
                            <li>Anonymous publishing of AI-synthesized posts to a social feed (&ldquo;Dear Earnest&rdquo;)</li>
                            <li>Action planning and directive tracking</li>
                            <li>Character profile building and avatar generation</li>
                        </ul>
                    </section>

                    {/* 5 */}
                    <section>
                        <h2 className="text-base font-bold text-white mb-3">5. AI Processing &amp; Content Generation</h2>
                        <p className="mb-3">
                            By using the Service, you acknowledge and consent to the following:
                        </p>
                        <ul className="list-disc list-inside space-y-1 text-zinc-500">
                            <li>Your conversations with Mirror Chat are processed by third-party AI models (Anthropic Claude) to generate responses, action plans, and personal insights.</li>
                            <li>Conversations may be synthesized into anonymous, AI-ghostwritten posts that are published to the public feed. All personally identifiable information is removed before publication.</li>
                            <li>AI-generated content is not professional advice. The Service is not a substitute for therapy, counseling, medical care, or any professional service.</li>
                        </ul>
                    </section>

                    {/* 6 */}
                    <section>
                        <h2 className="text-base font-bold text-white mb-3">6. User Content &amp; Conduct</h2>
                        <p className="mb-3">
                            You retain ownership of the content you provide (your identity information,
                            conversations, and inputs). By using the Service, you grant us a limited license
                            to process, anonymize, and publish derivative content as described in Section 5.
                        </p>
                        <p>
                            You agree not to use the Service in any manner described in
                            our{' '}
                            <Link href="/acceptable-use" className="text-zinc-200 underline hover:text-white transition-colors">
                                Acceptable Use Policy
                            </Link>.
                        </p>
                    </section>

                    {/* 7 */}
                    <section>
                        <h2 className="text-base font-bold text-white mb-3">7. Payment &amp; Subscription</h2>
                        <p className="mb-3">
                            Access to the Service requires a paid subscription. Payments are processed
                            securely through Stripe. By subscribing, you authorize the applicable charge.
                        </p>
                        <p className="mb-3">
                            <strong className="text-zinc-200">Cancellation.</strong>{' '}
                            You may cancel your membership at any time from the Security &amp; Routing panel
                            in your profile. If you cancel within 7 days of your subscription date, your
                            payment will be refunded in full. After 7 days, your access continues until the
                            end of your paid period, and no refund is issued.
                        </p>
                        <p>
                            <strong className="text-zinc-200">Expired Subscriptions.</strong>{' '}
                            When your subscription period ends, you retain read-only access to your profile,
                            dossier, and monthly reviews. The Mirror Chat and character editing features are
                            disabled until you resubscribe.
                        </p>
                    </section>

                    {/* 8 */}
                    <section>
                        <h2 className="text-base font-bold text-white mb-3">8. Privacy</h2>
                        <p>
                            Your use of the Service is also governed by our{' '}
                            <Link href="/privacy" className="text-zinc-200 underline hover:text-white transition-colors">
                                Privacy Policy
                            </Link>,
                            which describes how we collect, use, and protect your information.
                        </p>
                    </section>

                    {/* 9 */}
                    <section>
                        <h2 className="text-base font-bold text-white mb-3">9. Disclaimers</h2>
                        <p className="mb-3">
                            THE SERVICE IS PROVIDED &ldquo;AS IS&rdquo; AND &ldquo;AS AVAILABLE&rdquo;
                            WITHOUT WARRANTIES OF ANY KIND, EXPRESS OR IMPLIED. We do not warrant that the
                            Service will be uninterrupted, error-free, or secure.
                        </p>
                        <p>
                            <strong className="text-zinc-200">The Service is not a mental health service.</strong>{' '}
                            AI-generated responses do not constitute therapy, medical advice, or professional
                            counseling. If you are in crisis, please contact emergency services or the{' '}
                            <strong className="text-zinc-200">988 Suicide &amp; Crisis Lifeline</strong> (call or
                            text 988 in the US).
                        </p>
                    </section>

                    {/* 10 */}
                    <section>
                        <h2 className="text-base font-bold text-white mb-3">10. Limitation of Liability</h2>
                        <p>
                            To the maximum extent permitted by law, Golden Black LLC shall not be liable for
                            any indirect, incidental, special, consequential, or punitive damages, or any
                            loss of profits or revenues, whether incurred directly or indirectly, arising from
                            your use of the Service.
                        </p>
                    </section>

                    {/* 11 */}
                    <section>
                        <h2 className="text-base font-bold text-white mb-3">11. Termination</h2>
                        <p>
                            We reserve the right to suspend or terminate your account at any time for
                            violation of these Terms, the Acceptable Use Policy, or for any other reason at
                            our sole discretion. Upon termination, your right to use the Service ceases
                            immediately.
                        </p>
                    </section>

                    {/* 12 */}
                    <section>
                        <h2 className="text-base font-bold text-white mb-3">12. Changes to Terms</h2>
                        <p>
                            We may update these Terms from time to time. If we make material changes, we will
                            notify you through the Service or by other means. Continued use of the Service
                            after changes constitutes acceptance of the updated Terms.
                        </p>
                    </section>

                    {/* 13 */}
                    <section>
                        <h2 className="text-base font-bold text-white mb-3">13. Governing Law</h2>
                        <p>
                            These Terms shall be governed by the laws of the Commonwealth of Massachusetts,
                            without regard to conflict of law provisions.
                        </p>
                    </section>

                    {/* 14 */}
                    <section>
                        <h2 className="text-base font-bold text-white mb-3">14. Contact</h2>
                        <p>
                            For questions about these Terms, contact us at{' '}
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
                    <span>&copy; {new Date().getFullYear()} Earnest Page. All rights reserved.</span>
                    <div className="flex items-center gap-4">
                        <span className="text-zinc-500">Terms</span>
                        <Link href="/privacy" className="hover:text-zinc-400 transition-colors">Privacy</Link>
                        <Link href="/acceptable-use" className="hover:text-zinc-400 transition-colors">Acceptable Use</Link>
                    </div>
                </div>
            </footer>
        </main>
    );
}
