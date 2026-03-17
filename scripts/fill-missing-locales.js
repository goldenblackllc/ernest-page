const fs = require('fs');
const path = require('path');

const localesDir = path.join(__dirname, '../src/messages');
const enKeyData = require(path.join(localesDir, 'en.json'));

const locales = ['es.json', 'pt.json', 'fr.json'];

function fillMissingKeys(sourceObj, targetObj) {
  const result = { ...targetObj };
  
  for (const key in sourceObj) {
    if (typeof sourceObj[key] === 'object' && sourceObj[key] !== null && !Array.isArray(sourceObj[key])) {
      result[key] = fillMissingKeys(sourceObj[key], targetObj[key] || {});
    } else {
      if (!(key in targetObj)) {
        // Just copy the English string over as a fallback for now
        // A placeholder prefix helps identify untranslated strings
        result[key] = sourceObj[key]; 
      }
    }
  }
  
  return result;
}

locales.forEach(locale => {
  const filePath = path.join(localesDir, locale);
  const localeData = require(filePath);
  
  const updatedData = fillMissingKeys(enKeyData, localeData);
  
  fs.writeFileSync(filePath, JSON.stringify(updatedData, null, 2) + '\n');
  console.log(`Updated ${locale} with missing keys (using English fallbacks).`);
});
