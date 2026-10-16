/**
 * A user's Character Bible as one Markdown document (`bible.text`, see
 * lib/character/bibleText.ts). Empty when there is none.
 */
export function getBibleText(userData: FirebaseFirestore.DocumentData | undefined): string {
    const text = userData?.bible?.text;
    return typeof text === 'string' ? text : '';
}
