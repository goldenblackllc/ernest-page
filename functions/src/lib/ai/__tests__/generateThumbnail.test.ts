// @vitest-environment node
import { describe, it, expect, vi } from 'vitest';

vi.mock('../generateImage.js', () => ({ generateImage: vi.fn() }));
vi.mock('../loadUserReferenceImage.js', () => ({ loadUserReferenceImage: vi.fn() }));
vi.mock('../../firebase/storage.js', () => ({ uploadPublicFile: vi.fn() }));

import { buildBriefThumbnailPrompt } from '../generateThumbnail.js';

const brief = {
    insight: 'Enough, as I am',
    action: 'Send the portfolio to one gallery today',
    scene: 'At a sunlit kitchen table, pressing send on a laptop, a cup of coffee beside it.',
};

describe('buildBriefThumbnailPrompt', () => {
    it('shows the scene with the insight as the only words', () => {
        const prompt = buildBriefThumbnailPrompt(brief, true);
        expect(prompt).toContain(brief.scene);
        expect(prompt).toContain(`"${brief.insight}"`);
        expect(prompt).toContain('no other text');
        expect(prompt).toContain('reference image');
    });

    it('leaves the reference line out when there is no avatar', () => {
        expect(buildBriefThumbnailPrompt(brief, false)).not.toContain('reference image');
    });
});
