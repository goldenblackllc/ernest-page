/**
 * Extracts letter/response text from a post document.
 *
 * For legacy posts that have explicit `letter` and `response` fields,
 * those are returned directly. For newer posts that only have
 * `condensed_transcript`, the text is derived by joining all user
 * messages (→ letter) and all ideal_self messages (→ response).
 */
export function getPostText(post: Record<string, any>): { letter: string; response: string } {
    const letter = post.public_post?.letter || post.letter || post.tension;
    const response = post.public_post?.response || post.response || post.counsel;
    if (letter || response) return { letter: letter || '', response: response || '' };

    // Derive from condensed_transcript
    const ct = post.public_post?.condensed_transcript || post.condensed_transcript;
    if (!ct || ct.length === 0) return { letter: '', response: '' };

    const userMsgs = ct.filter((m: { role: string }) => m.role === 'user');
    const selfMsgs = ct.filter((m: { role: string }) => m.role === 'ideal_self');
    return {
        letter: userMsgs.map((m: { text: string }) => m.text).join('\n\n'),
        response: selfMsgs.map((m: { text: string }) => m.text).join('\n\n'),
    };
}
