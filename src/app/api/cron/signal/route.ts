import { NextResponse } from 'next/server';
import { db } from '@/lib/firebase/admin';
import { generateWithFallback, SONNET_MODEL, SONNET_FALLBACK } from '@/lib/ai/models';
import { z } from 'zod';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

const NEWSDATA_API_KEY = process.env.NEWSDATA_API_KEY;
const NEWSDATA_BASE_URL = 'https://newsdata.io/api/1/latest';

// Categories for diverse coverage
const NEWS_CATEGORIES = ['world', 'science', 'health', 'technology', 'environment', 'politics'];
const BRIGHT_SPOT_KEYWORDS = 'breakthrough OR milestone OR "record low" OR solved OR restored OR recovered OR "first time" OR "new record"';

interface NewsDataArticle {
    article_id: string;
    title: string;
    description: string | null;
    content: string | null;
    link: string;
    source_name: string;
    source_url: string;
    image_url: string | null;
    category: string[];
    pubDate: string;
    language: string;
    country: string[];
    _layer?: 'recent' | 'trending' | 'bright';
}

interface ActiveThread {
    thread_id: string;
    thread_label: string;
    last_headline: string;
}

const signalSchema = z.object({
    signals: z.array(z.object({
        headline: z.string().describe('Neutral, factual headline — max 12 words. No sensationalism, no loaded adjectives.'),
        summary: z.string().describe('2-4 sentence neutral summary of what happened. Facts only.'),
        context: z.string().describe('The bigger picture: historical trends, relevant statistics, multiple perspectives people hold. 3-5 sentences. Include the Dalai Lama Lens where appropriate.'),
        category: z.string().describe('One of: world, science, health, technology, environment, culture, politics'),
        type: z.enum(['event', 'context', 'bright_spot']).describe('event for standard news, bright_spot for positive stories'),
        bright_spot_type: z.enum(['macro_trend', 'micro_moment']).nullable().describe('Only for bright_spot type signals'),
        source_index: z.number().describe('Index of the primary source article from the input array'),
        thread_id: z.string().nullable().describe('Short slug for an ongoing story thread, e.g. "iran-conflict-2026". Null for one-off stories. Use the SAME thread_id from ACTIVE THREADS if this is an update to an ongoing story.'),
        thread_label: z.string().nullable().describe('Human-readable label for the thread, e.g. "Iran Conflict". Null if no thread.'),
        is_update: z.boolean().describe('True if this signal is an update to an active story thread, false if it is new'),
    })),
});

export async function GET(req: Request) {
    // Cron auth
    const authHeader = req.headers.get('authorization');
    if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!NEWSDATA_API_KEY) {
        return NextResponse.json({ error: 'NEWSDATA_API_KEY is not configured' }, { status: 500 });
    }

    try {
        // 1. Fetch news articles (dual-layer: recent + trending)
        const articles = await fetchNewsArticles();
        if (articles.length === 0) {
            return NextResponse.json({ success: true, message: 'No articles found', signalsCreated: 0 });
        }

        // 2. Fetch active story threads (past 72h)
        const activeThreads = await getActiveThreads();

        // 3. Deduplicate against recent signals (past 24h)
        const recentHeadlines = await getRecentSignalHeadlines();

        // 4. Process through AI to generate balanced signal cards
        const signals = await processArticlesWithAI(articles, recentHeadlines, activeThreads);

        // 5. Store signals in Firestore
        let created = 0;
        for (const signal of signals) {
            const sourceArticle = articles[signal.source_index] || articles[0];

            await db.collection('signals').add({
                headline: signal.headline,
                summary: signal.summary,
                context: signal.context,
                category: signal.category,
                type: signal.type,
                bright_spot_type: signal.bright_spot_type || null,
                source_urls: [sourceArticle.link],
                source_names: [sourceArticle.source_name],
                image_url: sourceArticle.image_url || null,
                news_date: sourceArticle.pubDate?.split(' ')[0] || new Date().toISOString().split('T')[0],
                thread_id: signal.thread_id || null,
                thread_label: signal.thread_label || null,
                is_update: signal.is_update || false,
                created_at: new Date(),
                raw_article: {
                    title: sourceArticle.title,
                    description: sourceArticle.description,
                    source: sourceArticle.source_name,
                },
            });
            created++;
        }

        console.log(`[Signal Cron] Created ${created} signal cards from ${articles.length} articles (${activeThreads.length} active threads)`);
        return NextResponse.json({ success: true, signalsCreated: created, articlesProcessed: articles.length, activeThreads: activeThreads.length });

    } catch (error: any) {
        console.error('[Signal Cron] Error:', error);
        return NextResponse.json({ error: error.message || 'Signal generation failed' }, { status: 500 });
    }
}

// ─── DUAL-LAYER FETCHING ─────────────────────────────────────────────

async function fetchNewsArticles(): Promise<NewsDataArticle[]> {
    const allArticles: NewsDataArticle[] = [];

    // LAYER A — "Right Now": Top recent headlines across categories
    try {
        const categoryParam = NEWS_CATEGORIES.join(',');
        const url = `${NEWSDATA_BASE_URL}?apikey=${NEWSDATA_API_KEY}&language=en&category=${categoryParam}&size=15`;
        const res = await fetch(url);
        if (res.ok) {
            const data = await res.json();
            if (data.results) {
                allArticles.push(...data.results.map((a: any) => ({ ...a, _layer: 'recent' })));
            }
        } else {
            console.error('[Signal] Layer A fetch failed:', await res.text());
        }
    } catch (err) {
        console.error('[Signal] Layer A error:', err);
    }

    // LAYER B — "Big Stories": 24h trending (high-coverage stories)
    try {
        const url = `${NEWSDATA_BASE_URL}?apikey=${NEWSDATA_API_KEY}&language=en&size=10&prioritydomain=top`;
        const res = await fetch(url);
        if (res.ok) {
            const data = await res.json();
            if (data.results) {
                allArticles.push(...data.results.map((a: any) => ({ ...a, _layer: 'trending' })));
            }
        } else {
            console.error('[Signal] Layer B fetch failed:', await res.text());
        }
    } catch (err) {
        console.error('[Signal] Layer B error:', err);
    }

    // BRIGHT SPOTS — Positive news search
    try {
        const url = `${NEWSDATA_BASE_URL}?apikey=${NEWSDATA_API_KEY}&language=en&q=${encodeURIComponent(BRIGHT_SPOT_KEYWORDS)}&size=5`;
        const res = await fetch(url);
        if (res.ok) {
            const data = await res.json();
            if (data.results) {
                allArticles.push(...data.results.map((a: any) => ({ ...a, _layer: 'bright' })));
            }
        }
    } catch (err) {
        console.error('[Signal] Bright spots error:', err);
    }

    // Deduplicate by article_id
    const seen = new Set<string>();
    return allArticles.filter(a => {
        if (!a.article_id || seen.has(a.article_id)) return false;
        seen.add(a.article_id);
        return true;
    });
}

// ─── STORY THREAD PERSISTENCE ────────────────────────────────────────

async function getActiveThreads(): Promise<ActiveThread[]> {
    const cutoff = new Date();
    cutoff.setHours(cutoff.getHours() - 72);

    try {
        const snap = await db.collection('signals')
            .where('created_at', '>=', cutoff)
            .where('thread_id', '!=', null)
            .orderBy('created_at', 'desc')
            .limit(50)
            .get();

        // Deduplicate to latest per thread
        const threadMap = new Map<string, ActiveThread>();
        snap.docs.forEach(doc => {
            const data = doc.data();
            if (data.thread_id && !threadMap.has(data.thread_id)) {
                threadMap.set(data.thread_id, {
                    thread_id: data.thread_id,
                    thread_label: data.thread_label || data.thread_id,
                    last_headline: data.headline || '',
                });
            }
        });

        return Array.from(threadMap.values());
    } catch {
        return [];
    }
}

async function getRecentSignalHeadlines(): Promise<string[]> {
    const cutoff = new Date();
    cutoff.setHours(cutoff.getHours() - 24);

    try {
        const snap = await db.collection('signals')
            .where('created_at', '>=', cutoff)
            .orderBy('created_at', 'desc')
            .limit(30)
            .get();

        return snap.docs.map(doc => doc.data().headline || '');
    } catch {
        return [];
    }
}

// ─── AI PROCESSING ───────────────────────────────────────────────────

async function processArticlesWithAI(
    articles: NewsDataArticle[],
    recentHeadlines: string[],
    activeThreads: ActiveThread[]
): Promise<z.infer<typeof signalSchema>['signals']> {

    // Format articles with their layer labels
    const articleSummaries = articles.map((a, i) => (
        `[${i}] [${(a._layer || 'unknown').toUpperCase()}] ${a.title}\nSource: ${a.source_name}\nDescription: ${a.description || 'N/A'}\nContent preview: ${(a.content || '').substring(0, 300)}\nCategory: ${(a.category || []).join(', ')}`
    )).join('\n\n');

    const recentHeadlinesList = recentHeadlines.length > 0
        ? `\n\nRECENT SIGNALS ALREADY CREATED (avoid exact duplicates, but updates to ongoing stories are welcome):\n${recentHeadlines.join('\n')}`
        : '';

    const activeThreadsList = activeThreads.length > 0
        ? `\n\nACTIVE STORY THREADS (ongoing events from the past 72 hours — if today's articles contain updates to these, use the SAME thread_id and mark is_update: true):\n${activeThreads.map(t => `- thread_id: "${t.thread_id}" | ${t.thread_label} | Last: "${t.last_headline}"`).join('\n')}`
        : '';

    const prompt = `You are The Signal — a calm, clear-eyed analyst who helps people understand reality without panic and without dismissal.

People come to you because they WANT to know what's happening in the world. They want to feel connected and informed. But they also want a better lens — one that doesn't leave them anxious and helpless.

Here are today's news articles, gathered in two layers:
- RECENT = latest headlines from the past few hours
- TRENDING = high-coverage stories from top-priority news sources in the past 24 hours
- BRIGHT = positive news search results

${articleSummaries}
${recentHeadlinesList}
${activeThreadsList}

YOUR TASK: Create 6-8 signal cards covering the most important stories.

COVERAGE RULES:
1. PRIORITIZE MAJOR ONGOING EVENTS. If a war, crisis, or major geopolitical event appears in TRENDING or in the ACTIVE THREADS, it MUST be included — even if it's not in RECENT. People need to stay informed about ongoing events.
2. If an article is an update to an ACTIVE THREAD, use the same thread_id and set is_update to true. For new ongoing stories, create a new thread_id (short slug, e.g. "iran-conflict-2026").
3. One-off stories that are not part of an ongoing situation should have thread_id: null.
4. At least 1 of the signals must be a bright_spot.
5. AIM FOR DIVERSITY across categories — don't cluster all signals on one story.

RULES FOR EVERY SIGNAL:
1. STATE WHAT HAPPENED — factually, neutrally, in 2-4 sentences. No adjectives designed to provoke emotion. No loaded language. Don't dismiss or minimize — but don't dramatize either.
2. PROVIDE THE BIGGER PICTURE — What's the historical trend? What are the different perspectives people hold? What relevant statistics exist? What does this event look like zoomed out over years or decades?
3. APPLY THE DALAI LAMA LENS where appropriate: "This is in the news because it is abnormal. That, in itself, tells us something about what is normal." A war is news because peace is the norm. A murder is news because most people don't murder.
4. ACKNOWLEDGE MULTIPLE PERSPECTIVES — not as false "both sides" equivalence, but as genuine recognition that different people experience the same event differently. What does this mean for different communities?
5. Never use fear-based language ("devastating", "terrifying", "alarming")
6. Never editorialize or take a political side
7. Always include at least one contextualizing fact, statistic, or historical reference

FOR BRIGHT SPOTS:
- If any article describes genuine progress, a breakthrough, a positive trend, or a community doing something good — mark it as bright_spot
- Macro trends: declining poverty, medical advances, environmental recovery, etc.
- Micro moments: a town solving a problem, a community initiative working, a person's breakthrough

Use the source_index to reference which input article each signal is based on.`;

    const result = await generateWithFallback({
        primaryModelId: SONNET_MODEL,
        fallbackModelId: SONNET_FALLBACK,
        schema: signalSchema,
        prompt,
        abortSignal: AbortSignal.timeout(60_000),
    });

    const parsed = result?.object as z.infer<typeof signalSchema> | null;
    return parsed?.signals || [];
}
