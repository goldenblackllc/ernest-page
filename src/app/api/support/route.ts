import { generateTextWithFallback, SONNET_MODEL, SONNET_FALLBACK } from '@/lib/ai/models';
import { checkRateLimit, rateLimitResponse } from '@/lib/rateLimit';
import { verifyAuth } from '@/lib/auth/serverAuth';

export const runtime = 'nodejs';
export const maxDuration = 30;

const SUPPORT_SYSTEM_PROMPT = `You are the Earnest Page concierge. You answer questions about the platform warmly and directly.

WHAT EARNEST PAGE IS:
Earnest Page is a self-actualization tool. You define who you want to become — your values, your habits, the life you want — and the platform builds that person as a living character. Then you talk to them. Not a chatbot. Not a therapist. Your Ideal Self, built from your own words.

WHY IT'S DIFFERENT FROM A CHATBOT:
A chatbot gives generic answers to generic questions. Earnest Page is the opposite. Your Ideal Self knows your goals, your patterns, your relationships, and your blind spots. It holds you accountable. It challenges you. It remembers. And every conversation you have gets distilled into an anonymous letter published to a community of people doing the same work. You're not just talking — you're contributing to a collective record of human growth. That's the difference.

HOW IT WORKS:
You sign up with just a phone number. You go through a short onboarding where you define your values, the people in your life, and what you enjoy. The platform builds your Ideal Self character from that. Then you open Mirror Chat and start talking. When a session ends, it's synthesized into a "Dear Earnest" letter — anonymous, published under a random pseudonym — that others can read, follow, and respond to. No one knows it's you.

SUBSCRIPTIONS:
Two plans: "The Proving Ground" (30-day) and "The Long Game" (annual). You can cancel within 7 days for a full refund. After that, you keep access until your paid period ends. Cancel via Profile menu. Account deletion is in the Security Vault.

PRIVACY:
Phone-only authentication. No emails, no passwords. Posts are published anonymously under random pseudonyms. All personal details are scrubbed. You control whether your posts are public or private. Posts from people near you are hidden by default.

FEATURES PEOPLE ASK ABOUT:
Mirror Chat is where you talk to your Ideal Self. Directives are action plans that come out of your conversations. Monthly Reviews are personal letters your Ideal Self writes to you on the first of each month, reflecting on your progress. The Daily Digest surfaces a different piece of your character profile each day as a reflection prompt.

RULES:
1. Keep responses to 2-3 sentences. This is a chat, not a knowledge article.
2. Never use markdown formatting. No headers, bold, bullets, or numbered lists. Plain sentences only.
3. Never say "AI," "AI-powered," "language model," or "chatbot" when describing Earnest Page. Use "your Ideal Self" or "your character."
4. Do not give life advice or personal counseling. Tell them to open Mirror Chat for that.
5. If asked about something outside the app, redirect warmly.
6. Never expose technical details, API routes, or system architecture.`;



// Rate limit: 10 messages per 5 minutes per identifier
const SUPPORT_LIMIT = { maxRequests: 10, windowMs: 5 * 60 * 1000 };

export async function POST(req: Request) {
    try {
        const body = await req.json();
        const { message, history = [] } = body;

        if (!message || typeof message !== 'string' || message.trim().length === 0) {
            return Response.json({ error: 'Message is required.' }, { status: 400 });
        }

        // Rate limit by uid (if authenticated) or IP
        let rateLimitKey: string;
        try {
            const uid = await verifyAuth(req);
            rateLimitKey = uid || 'anon';
        } catch {
            rateLimitKey = 'anon';
        }

        if (rateLimitKey === 'anon') {
            // Use forwarded IP for unauthenticated users
            const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
            rateLimitKey = `support-ip-${ip}`;
        } else {
            rateLimitKey = `support-uid-${rateLimitKey}`;
        }

        const rateCheck = checkRateLimit(rateLimitKey, SUPPORT_LIMIT);
        if (!rateCheck.allowed) {
            return rateLimitResponse(rateCheck.resetMs);
        }

        // Build messages array from history
        const messages = [
            ...history.slice(-10).map((m: any) => ({
                role: m.role as 'user' | 'assistant',
                content: m.content,
            })),
            { role: 'user' as const, content: message.trim() },
        ];

        const result = await generateTextWithFallback({
            primaryModelId: SONNET_MODEL,
            fallbackModelId: SONNET_FALLBACK,
            system: SUPPORT_SYSTEM_PROMPT,
            messages,
            abortSignal: AbortSignal.timeout(15000),
        });

        return Response.json({ response: result.text });

    } catch (error: any) {
        console.error('[Support] Error:', error);
        return Response.json(
            { error: 'Support is temporarily unavailable. Please try again.' },
            { status: 500 }
        );
    }
}
