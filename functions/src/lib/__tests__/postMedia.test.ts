// @vitest-environment node
import { describe, it, expect, vi } from 'vitest';

vi.mock('../firebase/admin.js', () => ({ db: {}, storage: {} }));
vi.mock('../ai/processPostContent.js', () => ({ generatePostMedia: vi.fn() }));
vi.mock('../ai/generatePostImage.js', () => ({ generateMessageImages: vi.fn() }));
vi.mock('../ai/loadUserReferenceImage.js', () => ({ loadUserReferenceImage: vi.fn() }));
vi.mock('../ai/condensedTranscript.js', () => ({ generateCondensedTranscript: vi.fn() }));

import { hasPostMedia, isPostExposed, postMediaUrls, storagePathFromUrl } from '../postMedia.js';
import { exposureAction, STALE_GENERATION_MS } from '../../postExposure.js';

const BUCKET = 'earnest-page.firebasestorage.app';
const AUDIO = `https://storage.googleapis.com/${BUCKET}/post-audio/p1_conv_1.mp3`;
const IMAGE = `https://storage.googleapis.com/${BUCKET}/post-images/p1_imagen_1.jpg`;
const NOW = 1_800_000_000_000;

describe('isPostExposed', () => {
    it.each([
        [{ visibility: 'private' }, false],
        [{}, false],
        [{ visibility: 'private', shareToken: 'abc' }, true],
        [{ visibility: 'community' }, true],
        [{ visibility: 'public' }, true],
        [{ is_public: true }, true], // older posts without visibility
        [undefined, false],
    ])('%j → %s', (post, expected) => {
        expect(isPostExposed(post)).toBe(expected);
    });
});

describe('postMediaUrls', () => {
    it('collects every media URL once, ignoring gaps', () => {
        const post = {
            audio_url: AUDIO,
            imagen_url: IMAGE,
            imagen_urls: [IMAGE],
            message_images: [IMAGE, null, 'https://other'],
        };
        expect(postMediaUrls(post).sort()).toEqual([AUDIO, IMAGE, 'https://other'].sort());
        expect(hasPostMedia(post)).toBe(true);
        expect(hasPostMedia({ message_images: [null], imagen_urls: [] })).toBe(false);
    });

    it('leaves out the thumbnail, which a private post keeps', () => {
        const post = { thumbnail_url: 'https://thumb' };
        expect(postMediaUrls(post)).toEqual([]);
        expect(hasPostMedia(post)).toBe(false);
    });
});

describe('storagePathFromUrl', () => {
    it('reads both URL forms in our bucket', () => {
        expect(storagePathFromUrl(AUDIO, BUCKET)).toBe('post-audio/p1_conv_1.mp3');
        const download = `https://firebasestorage.googleapis.com/v0/b/${BUCKET}/o/videos%2Fp1.mp4?alt=media&token=t`;
        expect(storagePathFromUrl(download, BUCKET)).toBe('videos/p1.mp4');
    });

    it('never points outside our bucket', () => {
        expect(storagePathFromUrl('https://storage.googleapis.com/other-bucket/x.jpg', BUCKET)).toBeNull();
        expect(storagePathFromUrl('https://example.com/x.jpg', BUCKET)).toBeNull();
        expect(storagePathFromUrl('not a url', BUCKET)).toBeNull();
    });
});

describe('exposureAction', () => {
    const privatePost = { visibility: 'private', media_status: 'deferred' };

    it('generates media when a private post is shared or published', () => {
        expect(exposureAction(privatePost, { ...privatePost, shareToken: 't' }, NOW)).toBe('generate');
        expect(exposureAction(privatePost, { ...privatePost, visibility: 'public' }, NOW)).toBe('generate');
    });

    it('does nothing for a private post that stays private', () => {
        expect(exposureAction(privatePost, { ...privatePost, title: 'edited' }, NOW)).toBeNull();
    });

    it('removes media when the link is turned off or the post goes private', () => {
        const shared = { visibility: 'private', shareToken: 't', media_status: 'ready', audio_url: AUDIO };
        expect(exposureAction(shared, { ...shared, shareToken: undefined }, NOW)).toBe('remove');
        const pub = { visibility: 'public', media_status: 'ready', audio_url: AUDIO };
        expect(exposureAction(pub, { ...pub, visibility: 'private' }, NOW)).toBe('remove');
        // Older posts without media_status
        const legacy = { visibility: 'public', imagen_url: IMAGE, thumbnail_url: 'https://thumb' };
        expect(exposureAction(legacy, { ...legacy, visibility: 'private' }, NOW)).toBe('remove');
    });

    it('leaves an exposed post with media alone, so its own writes do not loop', () => {
        const ready = { visibility: 'public', media_status: 'ready', audio_url: AUDIO };
        expect(exposureAction(ready, { ...ready, like_count: 3 }, NOW)).toBeNull();
    });

    it('lets a generation in progress finish, and restarts a stale one', () => {
        const generating = { shareToken: 't', media_status: 'generating', media_started_at: NOW - 60_000 };
        expect(exposureAction(generating, generating, NOW)).toBeNull();
        expect(exposureAction({ ...generating, shareToken: 't' }, { ...generating, shareToken: undefined }, NOW)).toBeNull();
        const stale = { ...generating, media_started_at: NOW - STALE_GENERATION_MS - 1 };
        expect(exposureAction(stale, stale, NOW)).toBe('generate');
    });

    it('retries a failed generation only when the post is shared again', () => {
        const failed = { visibility: 'private', shareToken: 't', media_status: 'failed' };
        expect(exposureAction(failed, failed, NOW)).toBeNull();
        expect(exposureAction({ ...failed, shareToken: undefined }, failed, NOW)).toBe('generate');
    });
});

describe('exposureAction with a thumbnail-only private post', () => {
    it('does not try to remove anything when it is unshared before media exists', () => {
        const shared = { visibility: 'private', shareToken: 't', media_status: 'failed', thumbnail_url: 'https://thumb' };
        expect(exposureAction(shared, { ...shared, shareToken: undefined }, NOW)).toBeNull();
    });

    it('removes a rewrite even when no media was made', () => {
        const shared = { visibility: 'private', shareToken: 't', media_status: 'ready', public_post: { condensed_transcript: [{ role: 'user', text: 'x' }] } };
        expect(exposureAction(shared, { ...shared, shareToken: undefined }, NOW)).toBe('remove');
    });
});
