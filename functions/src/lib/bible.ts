/** A compiled bible section. Legacy entries may carry other fields instead of heading/content. */
export interface BibleSection {
    heading?: string;
    content?: string;
    [key: string]: unknown;
}

/**
 * A user's compiled Character Bible sections: the current `bible.sections`,
 * or the legacy `character_bible.compiled_output.ideal`. Empty when neither exists.
 */
export function getCompiledBible(userData: FirebaseFirestore.DocumentData | undefined): BibleSection[] {
    return userData?.bible?.sections || userData?.character_bible?.compiled_output?.ideal || [];
}
