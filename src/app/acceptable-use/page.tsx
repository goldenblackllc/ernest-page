import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
    title: 'Acceptable Use Policy — Earnest Page',
    description: 'Acceptable Use Policy for the Earnest Page platform.',
};

export default function AcceptableUsePage() {
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
                    Acceptable Use Policy
                </h1>
                <p className="text-sm text-zinc-600 mb-12">
                    Last updated: March 11, 2026
                </p>

                <div className="space-y-10 text-sm text-zinc-400 leading-relaxed">
                    <section>
                        <p>
                            This Acceptable Use Policy (&ldquo;AUP&rdquo;) governs your use of Earnest Page.
                            By using the Service, you agree to comply with this policy. Violation may result
                            in suspension or termination of your account.
                        </p>
                    </section>

                    {/* 1 */}
                    <section>
                        <h2 className="text-base font-bold text-white mb-3">1. Prohibited Content</h2>
                        <p className="mb-3">You may not use the Service to create, transmit, or store content that:</p>
                        <ul className="list-disc list-inside space-y-1 text-zinc-500">
                            <li>Is illegal under applicable law</li>
                            <li>Promotes or incites violence against any person or group</li>
                            <li>Contains sexually explicit material involving minors</li>
                            <li>Constitutes harassment, bullying, or targeted abuse</li>
                            <li>Contains discriminatory content based on race, ethnicity, gender, sexual orientation, religion, disability, or national origin</li>
                            <li>Glorifies or promotes self-harm or suicide</li>
                            <li>Contains malware, phishing attempts, or other malicious code</li>
                        </ul>
                    </section>

                    {/* 2 */}
                    <section>
                        <h2 className="text-base font-bold text-white mb-3">2. Prohibited Conduct</h2>
                        <p className="mb-3">You may not:</p>
                        <ul className="list-disc list-inside space-y-1 text-zinc-500">
                            <li>Share or expose another person&apos;s private information</li>
                            <li>Use the platform to plan, coordinate, or carry out harm against any person</li>
                            <li>Attempt to circumvent the Contact Firewall, Proximity Blind Spot, or other privacy features</li>
                            <li>Attempt to de-anonymize other users or identify post authors</li>
                            <li>Use automated scripts, bots, or scrapers to access the Service</li>
                            <li>Attempt to reverse-engineer, exploit, or compromise the AI models or platform infrastructure</li>
                            <li>Create multiple accounts to circumvent bans or restrictions</li>
                            <li>Impersonate another person or entity</li>
                        </ul>
                    </section>

                    {/* 3 */}
                    <section>
                        <h2 className="text-base font-bold text-white mb-3">3. Safety &amp; Crisis</h2>
                        <p className="mb-3">
                            Earnest Page is a self-actualization tool, not a mental health service. If the
                            AI detects language indicating suicidal ideation, self-harm, or intent to harm
                            others, it will pause the conversation and provide crisis resources.
                        </p>
                        <p>
                            <strong className="text-zinc-200">
                                If you or someone you know is in immediate danger, call 911 or your local
                                emergency services. For mental health crises, contact the 988 Suicide &amp;
                                Crisis Lifeline (call or text 988).
                            </strong>
                        </p>
                    </section>

                    {/* 4 */}
                    <section>
                        <h2 className="text-base font-bold text-white mb-3">4. Content Moderation</h2>
                        <p>
                            AI-generated posts are reviewed by automated content filters before publication
                            to the public feed. Posts that violate this policy may be withheld from the feed,
                            flagged for review, or removed. We reserve the right to take action against
                            accounts that repeatedly produce flagged content.
                        </p>
                    </section>

                    {/* 5 */}
                    <section>
                        <h2 className="text-base font-bold text-white mb-3">5. Reporting</h2>
                        <p>
                            If you encounter content or behavior that violates this policy, please report it
                            to{' '}
                            <a href="mailto:safety@earnestpage.com" className="text-zinc-200 underline hover:text-white transition-colors">
                                safety@earnestpage.com
                            </a>.
                            We will review reports promptly and take appropriate action.
                        </p>
                    </section>

                    {/* 6 */}
                    <section>
                        <h2 className="text-base font-bold text-white mb-3">6. Enforcement</h2>
                        <p>
                            Violations of this policy may result in: content removal, temporary suspension,
                            permanent account termination, or reporting to law enforcement when legally
                            required (e.g., credible threats of violence or child exploitation).
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
                        <Link href="/privacy" className="hover:text-zinc-400 transition-colors">Privacy</Link>
                        <span className="text-zinc-500">Acceptable Use</span>
                    </div>
                </div>
            </footer>
        </main>
    );
}
