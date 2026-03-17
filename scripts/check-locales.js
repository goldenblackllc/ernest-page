const fs = require('fs');
const path = require('path');

const localesDir = path.join(__dirname, '../src/messages');
const enKeyData = require(path.join(localesDir, 'en.json'));

const locales = ['es.json', 'pt.json', 'fr.json'];

function getKeys(obj, prefix = '') {
  let keys = [];
  for (const key in obj) {
    const newPrefix = prefix ? `${prefix}.${key}` : key;
    if (typeof obj[key] === 'object' && obj[key] !== null && !Array.isArray(obj[key])) {
      keys = keys.concat(getKeys(obj[key], newPrefix));
    } else {
      keys.push(newPrefix);
    }
  }
  return keys;
}

const enKeys = new Set(getKeys(enKeyData));

let hasErrors = false;

locales.forEach(locale => {
  const filePath = path.join(localesDir, locale);
  if (!fs.existsSync(filePath)) {
    console.error(`❌ ${locale} is missing entirely.`);
    hasErrors = true;
    return;
  }
  
  const localeData = require(filePath);
  const localeKeys = new Set(getKeys(localeData));
  
  const missingKeys = [...enKeys].filter(x => !localeKeys.has(x));
  const extraKeys = [...localeKeys].filter(x => !enKeys.has(x));
  
  if (missingKeys.length > 0) {
    console.error(`\n❌ ${locale} is MISSING the following keys:`);
    missingKeys.forEach(k => console.error(`   - ${k}`));
    hasErrors = true;
  }
  
  if (extraKeys.length > 0) {
    console.error(`\n⚠️  ${locale} has EXTRA keys (not in en.json):`);
    extraKeys.forEach(k => console.error(`   - ${k}`));
  }
  
  if (missingKeys.length === 0 && extraKeys.length === 0) {
    console.log(`✅ ${locale} matches en.json perfectly.`);
  }
});

if (hasErrors) {
  process.exit(1);
} else {
  console.log("\nAll locales verified successfully.");
}
