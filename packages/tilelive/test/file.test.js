var assert = require('assert');
var Scheme = require('../lib/scheme');
var FileScheme = require('../lib/filescheme');

describe('file enumeration scheme', function() {
    ['flat', 'json'].forEach(function(format) {
        it('should parse ' +format+ ' input', function(done) {
            var scheme = new FileScheme({ list: __dirname + '/fixtures/filescheme.' + format });
            assert.deepEqual(scheme, {
                type: 'file',
                concurrency: 8,
                list: [
                    { z: 0, x: 0, y: 0, key: false, id: 0 },
                    { z: 1, x: 0, y: 0, key: false, id: 1 },
                    { z: 1, x: 1, y: 0, key: false, id: 3 },
                    { z: 1, x: 0, y: 1, key: false, id: 2 },
                    { z: 1, x: 1, y: 1, key: false, id: 4 }
                ],
                stats: {
                    history: [],
                    total: 5
                },
                pending: []
            });
            var tiles = [];
            scheme.task = {
                render: function(tile) {
                    tiles.push(tile.toString());
                    scheme.unique(tile);
                },
                finished: function() {
                    assert.deepEqual(tiles, ['0/0/0', '1/0/0', '1/1/0', '1/0/1', '1/1/1']);
                    done();
                }
            };
            scheme.start()
        });
    });
});

