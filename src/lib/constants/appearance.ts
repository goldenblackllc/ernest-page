// Appearance options shared by IdentityForm and OnboardingForm. Values are stored as-is
// on the user profile; labels come from onboarding.form.<prefix><optionKey(value)>.

export const SKIN_TONE_OPTIONS = ['Fair', 'Light', 'Medium', 'Olive', 'Tan', 'Brown', 'Dark Brown', 'Deep'];
export const HAIR_COLOR_OPTIONS = ['Black', 'Dark Brown', 'Brown', 'Light Brown', 'Auburn', 'Red', 'Blonde', 'Gray', 'White'];
export const HAIR_TEXTURE_OPTIONS = ['Straight', 'Wavy', 'Curly', 'Coily'];
export const HAIR_VOLUME_OPTIONS = ['Thick', 'Full', 'Thinning', 'Receding', 'Bald/Shaved'];
export const EYE_COLOR_OPTIONS = ['Brown', 'Hazel', 'Green', 'Blue', 'Gray', 'Amber'];
export const HEIGHT_OPTIONS = [
    `4'8"`, `4'9"`, `4'10"`, `4'11"`,
    `5'0"`, `5'1"`, `5'2"`, `5'3"`, `5'4"`, `5'5"`, `5'6"`, `5'7"`, `5'8"`, `5'9"`, `5'10"`, `5'11"`,
    `6'0"`, `6'1"`, `6'2"`, `6'3"`, `6'4"`, `6'5"`, `6'6"`, `6'7"`, `6'8"`,
];

/** Translation-key suffix for an option value: 'Dark Brown' → 'DarkBrown', 'Bald/Shaved' → 'BaldShaved'. */
export function optionKey(value: string): string {
    return value.replace(/[^A-Za-z]/g, '');
}
