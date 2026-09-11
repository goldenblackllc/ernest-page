const fs = require('fs');
const file = '/Users/davidjohnson/Development/earnest-page/src/components/MirrorChat.tsx';
let content = fs.readFileSync(file, 'utf8');

// Change Props
content = content.replace(/bible: CharacterBible \| null;\n    identity\?: CharacterIdentity \| null;/, 'profile: any | null;');
content = content.replace(/\{ isOpen, onClose, bible, identity, uid, initialContext, defaultPostRouting \}/, '{ isOpen, onClose, profile, uid, initialContext, defaultPostRouting }');

// Change accesses
content = content.replace(/bible\?\.voice_id/g, "profile?.voice?.id");
content = content.replace(/identity\?\.character_name/g, "profile?.name");
content = content.replace(/bible\?\.character_name/g, "profile?.name");
content = content.replace(/identity\?\.title/g, "profile?.defining_words?.join(', ')");
content = content.replace(/bible\?\.source_code\?\.archetype/g, "profile?.defining_words?.join(', ')");
content = content.replace(/bible\?\.compiled_output\?\.avatar_url/g, "profile?.avatar?.url");

fs.writeFileSync(file, content);
