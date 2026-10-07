// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { update, doc, collection } = vi.hoisted(() => {
    const update = vi.fn().mockResolvedValue(undefined);
    const doc = vi.fn(() => ({ update }));
    const collection = vi.fn(() => ({ doc }));
    return { update, doc, collection };
});

vi.mock('../firebase/admin.js', () => ({ db: { collection } }));

import { savePostImages, getPostAuthorId } from '../posts.js';

const IMG_A = 'https://img/a.jpg';
const IMG_B = 'https://img/b.jpg';

function writtenFields() {
    expect(update).toHaveBeenCalledTimes(1);
    return update.mock.calls[0][0] as Record<string, unknown>;
}

beforeEach(() => {
    update.mockClear();
    doc.mockClear();
    collection.mockClear();
});

describe('getPostAuthorId', () => {
    it('returns uid when present', () => {
        expect(getPostAuthorId({ uid: 'u1', authorId: 'a1' })).toBe('u1');
    });
    it('falls back to authorId when uid is missing', () => {
        expect(getPostAuthorId({ authorId: 'a1' })).toBe('a1');
    });
    it('falls back to authorId when uid is empty', () => {
        expect(getPostAuthorId({ uid: '', authorId: 'a1' })).toBe('a1');
    });
    it('returns undefined when neither field exists', () => {
        expect(getPostAuthorId({})).toBeUndefined();
    });
});

describe('savePostImages: publish rule truth table', () => {
    // complete × hasImage × hasAudio × visibility
    type Row = { complete: boolean; hasImage: boolean; hasAudio: boolean; visibility: string | undefined };
    const rows: Row[] = [];
    for (const complete of [true, false])
        for (const hasImage of [true, false])
            for (const hasAudio of [true, false])
                for (const visibility of ['public', 'private', undefined])
                    rows.push({ complete, hasImage, hasAudio, visibility });

    it.each(rows)(
        'complete=$complete image=$hasImage audio=$hasAudio visibility=$visibility',
        async ({ complete, hasImage, hasAudio, visibility }) => {
            // Two prompts. "complete" needs every prompt filled, or acceptPartial.
            let urls: string[];
            let acceptPartial = false;
            if (complete && hasImage) urls = [IMG_A, IMG_B];
            else if (complete && !hasImage) { urls = ['', '']; acceptPartial = true; }
            else if (!complete && hasImage) urls = [IMG_A, ''];
            else urls = ['', ''];

            const postData: Record<string, unknown> = { image_prompts: ['p1', 'p2'] };
            if (hasAudio) postData.audio_url = 'https://audio/x.mp3';
            if (visibility !== undefined) postData.visibility = visibility;

            const result = await savePostImages('post1', postData, urls, { acceptPartial });

            const shouldPublish = complete && hasImage && hasAudio && visibility === 'public';
            expect(result.complete).toBe(complete);
            expect(result.published).toBe(shouldPublish);

            const fields = writtenFields();
            expect(fields.images_complete).toBe(complete);
            if (shouldPublish) expect(fields.is_public).toBe(true);
            else expect(fields).not.toHaveProperty('is_public');
        },
    );
});

describe('savePostImages: written fields', () => {
    it('updates the post doc by id in the posts collection', async () => {
        await savePostImages('abc', { image_prompts: ['p'] }, [IMG_A]);
        expect(collection).toHaveBeenCalledWith('posts');
        expect(doc).toHaveBeenCalledWith('abc');
    });

    it('writes message_images index-aligned with null gaps', async () => {
        await savePostImages('p', { image_prompts: ['a', 'b', 'c'] }, ['', IMG_B, undefined as unknown as string]);
        expect(writtenFields().message_images).toEqual([null, IMG_B, null]);
    });

    it('writes imagen_urls with only the valid urls', async () => {
        await savePostImages('p', { image_prompts: ['a', 'b', 'c'] }, ['', IMG_B, IMG_A]);
        expect(writtenFields().imagen_urls).toEqual([IMG_B, IMG_A]);
    });

    it('sets imagen_url to the first valid image', async () => {
        await savePostImages('p', { image_prompts: ['a', 'b'] }, ['', IMG_B]);
        expect(writtenFields().imagen_url).toBe(IMG_B);
    });

    it('omits imagen_url when there is no image', async () => {
        await savePostImages('p', { image_prompts: ['a'] }, ['']);
        expect(writtenFields()).not.toHaveProperty('imagen_url');
    });

    it('never writes is_public: false (does not unpublish)', async () => {
        await savePostImages('p', { image_prompts: ['a'], visibility: 'private', audio_url: 'x' }, [IMG_A]);
        expect(writtenFields()).not.toHaveProperty('is_public');
    });

    it('returns the filled count', async () => {
        const r = await savePostImages('p', { image_prompts: ['a', 'b', 'c'] }, [IMG_A, '', IMG_B]);
        expect(r.filledCount).toBe(2);
    });
});

describe('savePostImages: partial images and retries', () => {
    const base = { image_prompts: ['a', 'b'], audio_url: 'x', visibility: 'public' };

    it('a partial set is not complete and not published', async () => {
        const r = await savePostImages('p', base, [IMG_A, '']);
        expect(r).toEqual({ filledCount: 1, complete: false, published: false });
        expect(writtenFields().imagen_url).toBe(IMG_A);
    });

    it('acceptPartial (retries exhausted) completes and publishes a partial set', async () => {
        const r = await savePostImages('p', base, [IMG_A, ''], { acceptPartial: true });
        expect(r).toEqual({ filledCount: 1, complete: true, published: true });
        expect(writtenFields()).toMatchObject({ images_complete: true, is_public: true, message_images: [IMG_A, null] });
    });

    it('acceptPartial with zero images completes but does not publish', async () => {
        const r = await savePostImages('p', base, ['', ''], { acceptPartial: true });
        expect(r).toEqual({ filledCount: 0, complete: true, published: false });
    });

    it('fewer urls than prompts is not complete', async () => {
        const r = await savePostImages('p', base, [IMG_A]);
        expect(r.complete).toBe(false);
    });

    it('a post with no image_prompts is complete but unpublished without images', async () => {
        const r = await savePostImages('p', { audio_url: 'x', visibility: 'public' }, []);
        expect(r).toEqual({ filledCount: 0, complete: true, published: false });
    });

    it('treats any non-private visibility as publishable', async () => {
        const r = await savePostImages('p', { ...base, visibility: 'anonymous' }, [IMG_A, IMG_B]);
        expect(r.published).toBe(true);
    });

    it('treats an empty visibility as private', async () => {
        const r = await savePostImages('p', { ...base, visibility: '' }, [IMG_A, IMG_B]);
        expect(r.published).toBe(false);
    });
});
