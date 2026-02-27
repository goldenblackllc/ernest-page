/**
 * Parses a markdown string into sections based on bolded subheadings.
 * Example: "**Subheading:** Body text" becomes { subHeading: "Subheading", body: "Body text" }
 */
export function parseMarkdownToSections(content: string): Array<{ subHeading: string, body: string }> {
    if (!content) return [];

    // Regex to match **Title** or **Title:** and capture the text after it until the next match
    const regex = /\*\*(.*?)\*\*:?\s*/;

    // If there are no bold headers, return the whole thing as an Overview
    if (!regex.test(content)) {
        return [{ subHeading: "Overview", body: content.trim() }];
    }

    // Split the content by the regex, capturing the headings in parts
    const parts = content.split(new RegExp(regex, 'g'));
    const sections: Array<{ subHeading: string, body: string }> = [];

    // parts[0] is the text before the first bold header (if any)
    const preamble = parts[0].trim();
    if (preamble) {
        sections.push({ subHeading: "Overview", body: preamble });
    }

    // The rest of the parts come in pairs: the matched bold text (subheading) and the body text following it.
    // split with global flag doesn't capture the group in the same way with `string.split(re)` unless used specifically.
    // Actually, `split(/(?:\*\*(.*?)\*\*:?\s*)/)` works better to keep the capturing groups.
    return fallbackParse(content);
}

function fallbackParse(content: string) {
    const regexStr = /\*\*(.*?)\*\*:?\s*/;
    if (!regexStr.test(content)) {
        return [{ subHeading: "Overview", body: content.trim() }];
    }

    const parts = content.split(/\*\*(.*?)\*\*:?\s*/);
    const sections: Array<{ subHeading: string, body: string }> = [];

    const preamble = parts[0]?.trim();
    if (preamble) {
        sections.push({ subHeading: "Overview", body: preamble });
    }

    for (let i = 1; i < parts.length; i += 2) {
        let subHeading = parts[i]?.trim();
        const body = parts[i + 1]?.trim();

        if (subHeading) {
            subHeading = subHeading.replace(/:+$/, '').trim();
            sections.push({ subHeading, body: body || "" });
        }
    }

    return sections;
}
