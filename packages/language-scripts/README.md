[![Build Status](https://travis-ci.org/kartotherian/language-scripts.svg?branch=master)](https://travis-ci.org/kartotherian/language-scripts)

# language-scripts
Converts language code to script ID

# data

Maps language codes to scripts, as defined in CLDR unicode database. The object is a singleton, and should not be modified.

```js
const lsdata = require('language-scripts').data;

console.log(lsdata['en']); // ==> Latn
console.log(lsdata['ru']); // ==> Cyrl
```

# adjust(opts)

Clones `data` values, and can adjust key prefixes and add/remove values from the default.

```js
const lsdata = require('language-scripts').adjust({
    override: { 'be-tarask': 'Cyrl', 'fr': null},
    prefix: 'name:'
});

console.log(lsdata['name:en']);       // ==> Latn
console.log(lsdata['name:be-tarsk']); // ==> Cyrl
console.log(lsdata['name:fr']);       // ==> undefined

```

# updating database

```bash
git clone https://github.com/kartotherian/language-scripts.git
cd language-scripts
npm install
npm run init-cldr
npm run extracts
```
