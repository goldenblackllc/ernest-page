import { db } from '@/lib/firebase/admin';
import { FieldValue } from 'firebase-admin/firestore';
import { generateTextWithFallback, OPUS_MODEL, OPUS_FALLBACK } from '@/lib/ai/models';

export interface PexelsVideo {
  id: number;
  downloadUrl: string;
  duration: number;
}

/**
 * Generates search keywords for stock video based on Q&A
 * @param question The question string
 * @param answer The answer string
 * @returns Array of 2-3 search phrases
 */
export async function generateVideoKeywords(question: string, answer: string): Promise<string[]> {
  console.log('[StockVideo] Generating keywords for Q&A');
  const systemPrompt = `You generate search keywords for stock video footage. Given a Q&A advice conversation, output 2-3 short search phrases that would find relevant, real-life lifestyle footage on a stock video site.

Rules:
- Each phrase should be 2-4 words
- Focus on the SITUATION described, not abstract emotions
- Prefer specific, visual scenarios over generic terms
- Output ONLY the phrases, one per line, nothing else

Examples:
- For a post about dieting: "woman cooking healthy", "kitchen meal prep", "morning walk park"
- For a post about job hunting: "person laptop cafe", "typing resume", "business interview"
- For a post about dating: "couple dinner restaurant", "woman phone night", "city street evening"`;

  const prompt = `Question: ${question}\nAnswer: ${answer}`;

  try {
    const result = await generateTextWithFallback({
      primaryModelId: OPUS_MODEL,
      fallbackModelId: OPUS_FALLBACK,
      system: systemPrompt,
      prompt: prompt,
      maxTokens: 100,
    });

    const keywords = result.text
      .split('\n')
      .map((line: string) => line.replace(/^["\-•*]+\s*/, '').replace(/["]+$/, '').trim())
      .filter((line: string) => line.length > 0 && line.length < 50);
      
    console.log(`[StockVideo] Generated keywords: ${keywords.join(', ')}`);
    return keywords;
  } catch (error) {
    console.error('[StockVideo] Error generating keywords:', error);
    return [];
  }
}

/**
 * Searches the Pexels API for videos matching the keyword
 * @param keyword The search keyword
 * @returns Array of valid PexelsVideo objects
 */
export async function searchPexelsVideo(keyword: string): Promise<PexelsVideo[]> {
  console.log(`[StockVideo] Searching Pexels for: ${keyword}`);
  
  if (!process.env.PEXELS_API_KEY) {
    console.warn('[StockVideo] PEXELS_API_KEY is not set');
    return [];
  }

  try {
    const url = `https://api.pexels.com/videos/search?query=${encodeURIComponent(keyword)}&orientation=landscape&size=medium&per_page=15`;
    const response = await fetch(url, {
      headers: {
        'Authorization': process.env.PEXELS_API_KEY,
      },
    });

    if (!response.ok) {
      console.error(`[StockVideo] Pexels API error: ${response.status} ${response.statusText}`);
      return [];
    }

    const data = await response.json();
    const videos: PexelsVideo[] = [];

    for (const video of (data.videos || [])) {
      if (video.duration < 10) {
        continue;
      }

      // Find best video file
      const videoFiles = video.video_files || [];
      const hdFile = videoFiles.find((f: any) => f.quality === 'hd' && f.file_type === 'video/mp4');
      const bestFile = hdFile || videoFiles.find((f: any) => f.file_type === 'video/mp4');

      if (bestFile) {
        videos.push({
          id: video.id,
          downloadUrl: bestFile.link,
          duration: video.duration,
        });
      }
    }

    return videos;
  } catch (error) {
    console.error(`[StockVideo] Error searching Pexels for ${keyword}:`, error);
    return [];
  }
}

/**
 * Gets the set of clip IDs that have already been used
 * @returns Set of used clip IDs
 */
export async function getUsedClipIds(): Promise<Set<number>> {
  console.log('[StockVideo] Fetching used clip IDs');
  try {
    const snapshot = await db.collection('stock_clips_used').get();
    const ids = new Set<number>();
    snapshot.forEach(doc => {
      const data = doc.data();
      if (data.clipId) {
        ids.add(data.clipId);
      }
    });
    console.log(`[StockVideo] Found ${ids.size} used clips`);
    return ids;
  } catch (error) {
    console.error('[StockVideo] Error fetching used clips:', error);
    return new Set<number>();
  }
}

/**
 * Marks a clip ID as used in Firestore
 * @param clipId The ID of the clip to mark
 */
export async function markClipUsed(clipId: number): Promise<void> {
  console.log(`[StockVideo] Marking clip ${clipId} as used`);
  try {
    await db.collection('stock_clips_used').add({
      clipId,
      usedAt: FieldValue.serverTimestamp(),
    });
  } catch (error) {
    console.error(`[StockVideo] Error marking clip ${clipId} used:`, error);
  }
}

/**
 * Fetches an unused stock video for the given Q&A
 * @param question The question
 * @param answer The answer
 * @returns The video buffer and duration, or null if none found
 */
export async function fetchStockVideo(question: string, answer: string): Promise<{ buffer: Buffer; duration: number } | null> {
  console.log('[StockVideo] Starting stock video fetch process');
  
  const keywords = await generateVideoKeywords(question, answer);
  if (keywords.length === 0) {
    console.warn('[StockVideo] No keywords generated');
    return null;
  }

  const usedClips = await getUsedClipIds();
  let selectedVideo: PexelsVideo | null = null;

  for (const keyword of keywords) {
    const videos = await searchPexelsVideo(keyword);
    
    for (const video of videos) {
      if (!usedClips.has(video.id)) {
        selectedVideo = video;
        break;
      }
    }

    if (selectedVideo) {
      console.log(`[StockVideo] Found unused video ${selectedVideo.id} for keyword: "${keyword}"`);
      break;
    }
  }

  if (!selectedVideo) {
    console.warn('[StockVideo] No unused videos found for any keywords');
    return null;
  }

  console.log(`[StockVideo] Downloading video from ${selectedVideo.downloadUrl}`);
  try {
    const response = await fetch(selectedVideo.downloadUrl);
    if (!response.ok) {
      console.error(`[StockVideo] Failed to download video: ${response.status} ${response.statusText}`);
      return null;
    }

    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    await markClipUsed(selectedVideo.id);

    return {
      buffer,
      duration: selectedVideo.duration,
    };
  } catch (error) {
    console.error('[StockVideo] Error downloading video:', error);
    return null;
  }
}
