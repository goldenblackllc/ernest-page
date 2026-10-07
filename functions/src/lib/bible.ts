/**
 * A user's compiled Character Bible sections: the current `bible.sections`,
 * or the legacy `character_bible.compiled_output.ideal`. Empty when neither exists.
 */
export function getCompiledBible(userData: FirebaseFirestore.DocumentData | undefined): any[] {
    return userData?.bible?.sections || userData?.character_bible?.compiled_output?.ideal || [];
}
