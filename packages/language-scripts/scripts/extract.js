'use strict';

const fs = require('fs');
const path = require('path');
const stringify = require("json-stringify-pretty-compact");
let languageData;

try {
    languageData = require("cldr-data/supplemental/languageData");
} catch (err) {
    console.log('Use `npm run init-cldr` first');
    return;
}

languageData = languageData.supplemental.languageData;
const result = {};

for (const key of Object.keys(languageData)) {
    const value = languageData[key];
    if (key.endsWith('-alt-secondary') || !value._scripts) {
        continue;
    }
    result[key] = value._scripts[0];
    if (value._scripts.length > 1) {
        for (const script of value._scripts) {
            result[key + '-' + script] = script;
        }
    }
}

fs.writeFileSync(path.resolve(__dirname, '../data.json'), stringify(result));
