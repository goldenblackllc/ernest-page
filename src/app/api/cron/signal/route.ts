import { NextResponse } from 'next/server';
import { db, storage } from '@/lib/firebase/admin';
import { generateWithFallback, SONNET_MODEL, SONNET_FALLBACK } from '@/lib/ai/models';
import { z } from 'zod';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

const NEWSAPI_AI_KEY = process.env.NEWSAPI_AI_KEY;
const NEWSAPI_BASE_URL = 'https://eventregistry.org/api/v1/article/getArticles';

// Categories for diverse coverage (NewsAPI.ai uses dmoz-style category URIs)
const BRIGHT_SPOT_KEYWORDS = 'breakthrough OR milestone OR solved OR restored OR recovered OR "first time" OR "new record"';

interface NewsArticle {
    uri: string;
    title: string;
    body: string | null;
    url: string;
    source: { title: string; uri: string } | null;
    image: string | null;
    categories: { label: string }[] | null;
    dateTimePub: string;
    lang: string;
    sentiment: number | null;
    _layer?: 'recent' | 'trending' | 'bright';
}

interface ActiveThread {
    thread_id: string;
    thread_label: string;
    last_headline: string;
}

const signalSchema = z.object({
    signals: z.array(z.object({
        headline: z.string().describe('Compelling, scroll-stopping headline — max 15 words. Answer "why should I care?" Make the reader FEEL something. Use conversational language, stakes, surprise, or specificity. No clickbait lies — but make it human and vivid. Think viral tweet, not wire service.'),
        summary: z.string().describe('2-4 sentence summary that tells the STORY — what happened, who it affects, and why it matters. Lead with the most surprising or consequential detail. Be vivid and specific, not clinical.'),
        context: z.string().describe('The bigger picture: historical trends, relevant statistics, multiple perspectives people hold. 3-5 sentences. Include the Dalai Lama Lens where appropriate.'),
        category: z.string().describe('One of: world, science, health, technology, environment, culture, politics'),
        type: z.enum(['event', 'context', 'bright_spot']).describe('event for standard news, bright_spot for positive stories'),
        bright_spot_type: z.enum(['macro_trend', 'micro_moment']).nullable().describe('Only for bright_spot type signals'),
        source_index: z.number().describe('Index of the primary source article from the input array'),
        image_prompt: z.string().describe('A cinematic visual description for AI image generation. Describe the KEY VISUAL SYMBOL of this story — a specific object, scene, or moment. Be cinematic: include lighting, mood, color palette, and composition. Think like a film director choosing a still frame. Example: "Close-up of a judge\'s gavel mid-strike on a courtroom desk, dramatic side lighting, shallow depth of field, dark wood tones". NEVER describe text, logos, or recognizable faces. Highly photorealistic. Instagram-quality.'),
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

    if (!NEWSAPI_AI_KEY) {
        return NextResponse.json({ error: 'NEWSAPI_AI_KEY is not configured' }, { status: 500 });
    }

    try {
        // 1. Fetch news articles (dual-layer: recent + trending)
        console.log('[Signal Cron] Step 1: Fetching news articles...');
        const articles = await fetchNewsArticles();
        console.log(`[Signal Cron] Step 1 complete: ${articles.length} articles fetched`);
        if (articles.length === 0) {
            return NextResponse.json({ success: true, message: 'No articles found', signalsCreated: 0 });
        }

        // 2. Fetch active story threads (past 72h)
        console.log('[Signal Cron] Step 2: Fetching active threads...');
        const activeThreads = await getActiveThreads();
        console.log(`[Signal Cron] Step 2 complete: ${activeThreads.length} active threads`);

        // 3. Deduplicate against recent signals (past 24h)
        console.log('[Signal Cron] Step 3: Fetching recent headlines for dedup...');
        const recentHeadlines = await getRecentSignalHeadlines();
        console.log(`[Signal Cron] Step 3 complete: ${recentHeadlines.length} recent headlines`);

        // 4. Process through AI to generate balanced signal cards
        console.log('[Signal Cron] Step 4: Processing articles with AI...');
        const signals = await processArticlesWithAI(articles, recentHeadlines, activeThreads);
        console.log(`[Signal Cron] Step 4 complete: ${signals.length} signals generated`);

        // 5. Store signals in Firestore
        console.log('[Signal Cron] Step 5: Storing signals in Firestore...');
        let created = 0;
        for (const signal of signals) {
            const sourceArticle = articles[signal.source_index] || articles[0];

            // Generate hero image via Imagen
            let image_url: string | null = null;
            try {
                const imagenRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/imagen-4.0-generate-001:predict?key=${process.env.GEMINI_API_KEY || process.env.GOOGLE_GENERATIVE_AI_API_KEY}`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        instances: [{ prompt: signal.image_prompt }],
                        parameters: { sampleCount: 1, aspectRatio: "16:9" }
                    })
                });

                if (imagenRes.ok) {
                    const data = await imagenRes.json();
                    if (data.predictions?.[0]?.bytesBase64Encoded) {
                        const base64Data = data.predictions[0].bytesBase64Encoded;
                        const buffer = Buffer.from(base64Data, 'base64');
                        const bucket = storage.bucket();
                        const signalId = `signal-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
                        const fileName = `signal-images/${signalId}.jpg`;
                        const file = bucket.file(fileName);

                        await file.save(buffer, {
                            metadata: { contentType: 'image/jpeg' },
                            public: true
                        });

                        image_url = `https://storage.googleapis.com/${bucket.name}/${fileName}`;
                        console.log(`[Signal Cron] Generated image for: ${signal.headline.slice(0, 50)}...`);
                    }
                } else {
                    console.error('[Signal Cron] Imagen API error:', await imagenRes.text());
                }
            } catch (imgErr: any) {
                console.error('[Signal Cron] Image generation failed:', imgErr.message);
                // Gracefully fall back to no image
            }

            await db.collection('signals').add({
                headline: signal.headline,
                summary: signal.summary,
                context: signal.context,
                category: signal.category,
                type: signal.type,
                bright_spot_type: signal.bright_spot_type || null,
                source_urls: [sourceArticle.url],
                source_names: [sourceArticle.source?.title || 'Unknown'],
                image_url: image_url,
                image_prompt: signal.image_prompt,
                news_date: sourceArticle.dateTimePub?.split('T')[0] || new Date().toISOString().split('T')[0],
                thread_id: signal.thread_id || null,
                thread_label: signal.thread_label || null,
                is_update: signal.is_update || false,
                created_at: new Date(),
                raw_article: {
                    title: sourceArticle.title,
                    body: (sourceArticle.body || '').substring(0, 500),
                    source: sourceArticle.source?.title || 'Unknown',
                },
            });
            created++;
        }

        console.log(`[Signal Cron] ✅ Complete: Created ${created} signal cards from ${articles.length} articles (${activeThreads.length} active threads)`);
        return NextResponse.json({ success: true, signalsCreated: created, articlesProcessed: articles.length, activeThreads: activeThreads.length });

    } catch (error: any) {
        console.error('[Signal Cron] ❌ FAILED:', error.message || error);
        console.error('[Signal Cron] Stack:', error.stack);
        return NextResponse.json({ error: error.message || 'Signal generation failed' }, { status: 500 });
    }
}

// ─── DUAL-LAYER FETCHING (NewsAPI.ai) ────────────────────────────────

async function fetchNewsArticles(): Promise<NewsArticle[]> {
    const allArticles: NewsArticle[] = [];

    // LAYER A — "Right Now": Top recent articles sorted by date
    try {
        const res = await fetch(NEWSAPI_BASE_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                action: 'getArticles',
                keyword: 'world news OR politics OR conflict OR economy OR science OR health',
                lang: 'eng',
                articlesPage: 1,
                articlesCount: 30,
                articlesSortBy: 'date',
                articlesSortByAsc: false,
                dataType: ['news'],
                apiKey: NEWSAPI_AI_KEY,
            }),
        });
        if (res.ok) {
            const data = await res.json();
            const articles = data.articles?.results || [];
            allArticles.push(...articles.map((a: any) => ({ ...a, _layer: 'recent' as const })));
            console.log(`[Signal] Layer A: ${articles.length} recent articles`);
        } else {
            console.error('[Signal] Layer A fetch failed:', await res.text());
        }
    } catch (err) {
        console.error('[Signal] Layer A error:', err);
    }

    // LAYER B — "Big Stories": Top articles by social score (most covered)
    try {
        const res = await fetch(NEWSAPI_BASE_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                action: 'getArticles',
                lang: 'eng',
                articlesPage: 1,
                articlesCount: 20,
                articlesSortBy: 'socialScore',
                articlesSortByAsc: false,
                dataType: ['news'],
                apiKey: NEWSAPI_AI_KEY,
            }),
        });
        if (res.ok) {
            const data = await res.json();
            const articles = data.articles?.results || [];
            allArticles.push(...articles.map((a: any) => ({ ...a, _layer: 'trending' as const })));
            console.log(`[Signal] Layer B: ${articles.length} trending articles`);
        } else {
            console.error('[Signal] Layer B fetch failed:', await res.text());
        }
    } catch (err) {
        console.error('[Signal] Layer B error:', err);
    }

    // BRIGHT SPOTS — Positive news search
    try {
        const res = await fetch(NEWSAPI_BASE_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                action: 'getArticles',
                keyword: BRIGHT_SPOT_KEYWORDS,
                lang: 'eng',
                articlesPage: 1,
                articlesCount: 10,
                articlesSortBy: 'date',
                articlesSortByAsc: false,
                dataType: ['news'],
                apiKey: NEWSAPI_AI_KEY,
            }),
        });
        if (res.ok) {
            const data = await res.json();
            const articles = data.articles?.results || [];
            allArticles.push(...articles.map((a: any) => ({ ...a, _layer: 'bright' as const })));
            console.log(`[Signal] Bright spots: ${articles.length} articles`);
        }
    } catch (err) {
        console.error('[Signal] Bright spots error:', err);
    }

    // Deduplicate by uri
    const seen = new Set<string>();
    return allArticles.filter(a => {
        if (!a.uri || seen.has(a.uri)) return false;
        seen.add(a.uri);
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
    articles: NewsArticle[],
    recentHeadlines: string[],
    activeThreads: ActiveThread[]
): Promise<z.infer<typeof signalSchema>['signals']> {

    // Format articles with their layer labels — now with full body text from NewsAPI.ai
    const articleSummaries = articles.map((a, i) => (
        `[${i}] [${(a._layer || 'unknown').toUpperCase()}] ${a.title}\nSource: ${a.source?.title || 'Unknown'}\nBody: ${(a.body || 'N/A').substring(0, 500)}\nCategories: ${(a.categories || []).map(c => c.label).join(', ') || 'N/A'}\nSentiment: ${a.sentiment ?? 'N/A'}`
    )).join('\n\n');

    const recentHeadlinesList = recentHeadlines.length > 0
        ? `\n\nRECENT SIGNALS ALREADY CREATED (avoid exact duplicates, but updates to ongoing stories are welcome):\n${recentHeadlines.join('\n')}`
        : '';

    const activeThreadsList = activeThreads.length > 0
        ? `\n\nACTIVE STORY THREADS (ongoing events from the past 72 hours — if today's articles contain updates to these, use the SAME thread_id and mark is_update: true):\n${activeThreads.map(t => `- thread_id: "${t.thread_id}" | ${t.thread_label} | Last: "${t.last_headline}"`).join('\n')}`
        : '';

    const prompt = `You are The Signal — a sharp, compelling storyteller who helps people understand reality. You write like the best of The Atlantic meets a viral tweet: smart, vivid, impossible to scroll past.

People come to you because they WANT to know what's happening in the world. They want to feel connected, informed, and empowered. Your job is to make them STOP SCROLLING, read, and think.

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

HEADLINE RULES (THIS IS CRITICAL):
- Every headline must answer: "Why should I care RIGHT NOW?"
- Use specific details: names, numbers, places. "A professor in Idaho" beats "a person."
- Create a curiosity gap or emotional stakes. Make the reader NEED to know more.
- Use conversational, punchy language. Think viral tweet, not wire service.
- NO clickbait lies. Every word must be true. But boring is NOT the same as honest.
- Bad: "Global Child Mortality Reaches Historic Low, Decades of Progress Documented"
- Good: "Fewer Kids Are Dying Than Any Point in Human History"
- Bad: "TikToker Ordered to Pay $10 Million Over False Murder Accusation"
- Good: "A TikTok Psychic Ruined a Professor's Life — a Jury Just Handed Down $10M"

SUMMARY RULES:
- Lead with the most surprising or consequential detail, not the most obvious.
- Tell the STORY — this happened, then this happened, and here's why it matters.
- Use vivid, specific language. "A 24-year-old content creator with 3 million followers" beats "an influencer."
- Still accurate, still fair. But make it feel like a story, not a report.

CONTEXT RULES (KEEP THESE — THIS IS YOUR SUPERPOWER):
1. PROVIDE THE BIGGER PICTURE — What's the historical trend? What are the different perspectives people hold? What relevant statistics exist? What does this event look like zoomed out over years or decades?
2. APPLY THE DALAI LAMA LENS where appropriate: "This is in the news because it is abnormal. That, in itself, tells us something about what is normal." A war is news because peace is the norm. A murder is news because most people don't murder.
3. ACKNOWLEDGE MULTIPLE PERSPECTIVES — not as false "both sides" equivalence, but as genuine recognition that different people experience the same event differently. What does this mean for different communities?
4. Always include at least one contextualizing fact, statistic, or historical reference

TONE GUARDRAILS:
- Never use fear-mongering language ("devastating", "terrifying", "alarming") — but DO use vivid, emotional language that is grounded in truth
- Never editorialize or take a political side
- Never lie or exaggerate. Accuracy is sacred. But accuracy and engagement are NOT opposites.

FOR BRIGHT SPOTS:
- If any article describes genuine progress, a breakthrough, a positive trend, or a community doing something good — mark it as bright_spot
- Macro trends: declining poverty, medical advances, environmental recovery, etc.
- Micro moments: a town solving a problem, a community initiative working, a person's breakthrough
- Bright spot headlines should make people feel HOPE, not just "oh that's nice." Make the scale of the achievement clear.

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
