'use strict';

const assert = require('assert');
const ls = require('..');


describe('Tests', () => {
    it('data', () => {
        assert.strictEqual(typeof ls.data, 'object');
        assert.strictEqual(Array.isArray(ls.data), false);
        assert.notStrictEqual(ls.data, null);
        assert(Object.keys(ls.data).length > 0);
        assert.strictEqual(ls.data['en'], 'Latn');
        assert.strictEqual(ls.data['ru'], 'Cyrl');
    });

    it('override', () => {
        const data = ls.adjust({override: {ru:'Test', en: null}});
        assert.strictEqual(typeof data, 'object');
        assert.strictEqual(Array.isArray(data), false);
        assert.notStrictEqual(data, null);
        assert(Object.keys(data).length > 0);
        assert.strictEqual(data['en'], undefined);
        assert.strictEqual(data['ru'], 'Test');
    });

    it('key prefix', () => {
        const data = ls.adjust({override: {ru:'Test'}, prefix: 'name:'});
        assert.strictEqual(typeof data, 'object');
        assert.strictEqual(Array.isArray(data), false);
        assert.notStrictEqual(data, null);
        assert(Object.keys(data).length > 0);
        assert.strictEqual(data['en'], undefined);
        assert.strictEqual(data['ru'], undefined);
        assert.strictEqual(data['name:en'], 'Latn');
        assert.strictEqual(data['name:ru'], 'Test');
    });
});
