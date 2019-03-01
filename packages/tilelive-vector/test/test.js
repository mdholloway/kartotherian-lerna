var assert = require('assert');
var Vector = require('..');
var path = require('path');
var fs = require('fs');
var imageEqualsFile = require('./image.js');

// Load fixture data.
var xml = {
    a: fs.readFileSync(path.resolve(__dirname + '/test-a.xml'), 'utf8'),
    b: fs.readFileSync(path.resolve(__dirname + '/test-b.xml'), 'utf8')
};
var infos = {
    a: { minzoom:0, maxzoom:1 },
    b: { minzoom:0, maxzoom:2, maskLevel:1 }
};
var tiles = {
    a: fs.readdirSync(path.resolve(__dirname + '/test-a')).reduce(function(memo, basename) {
        var key = basename.split('.').slice(0,3).join('.');
        memo[key] = fs.readFileSync(path.resolve(__dirname + '/test-a/' + basename));
        return memo;
    }, {}),
    b: fs.readdirSync(path.resolve(__dirname + '/test-b')).reduce(function(memo, basename) {
        var key = basename.split('.').slice(0,3).join('.');
        memo[key] = fs.readFileSync(path.resolve(__dirname + '/test-b/' + basename));
        return memo;
    }, {})
};

// Tilelive test source.
function Testsource(uri, callback) {
    this.uri = uri;
    if (uri) this.data = {
        minzoom: infos[uri].minzoom,
        maxzoom: infos[uri].maxzoom,
        maskLevel: infos[uri].maskLevel
    };
    this.stats = {};
    return callback && callback(null, this);
};
Testsource.prototype.getTile = function(z,x,y,callback) {
    var key = [z,x,y].join('.');

    // Count number of times each key is requested for tests.
    this.stats[key] = this.stats[key] || 0;
    this.stats[key]++;

    if (!tiles[this.uri][key]) {
        return callback(new Error('Tile does not exist'));
    } else {
        return callback(null, tiles[this.uri][key], {});
    }
};
Testsource.prototype.getInfo = function(callback) {
    return callback(null, this.data);
};

describe('init', function() {
    it('should fail without backend', function(done) {
        new Vector({}, function(err) {
            assert.equal(err.message, 'No datatile backend');
            done();
        });
    });
    it('should fail without xml', function(done) {
        new Vector({ backend: new Testsource() }, function(err) {
            assert.equal(err.message, 'No xml');
            done();
        });
    });
    it('should load with callback', function(done) {
        new Vector({ backend: new Testsource(), xml: xml.a }, function(err, source) {
            assert.ifError(err);
            assert.ok(source);
            done();
        });
    });
    it('#open should call all listeners', function(done) {
        var v = new Vector({ backend: new Testsource(), xml: xml.a });
        var remaining = 3;
        for (var i = 0; i < remaining; i++) v.open(function(err, source) {
            assert.ifError(err);
            assert.ok(source);
            if (!--remaining) done();
        });
    });
    it('should get info', function(done) {
        new Vector({ backend: new Testsource(), xml: xml.a }, function(err, source) {
            assert.ifError(err);
            assert.ok(source);
            source.getInfo(function(err, info) {
                assert.ifError(err);
                assert.equal('test-a', info.name);
                assert.equal(0, info.minzoom);
                assert.equal(8, info.maxzoom);
                assert.deepEqual([0,0,2], info.center);
                assert.deepEqual([-180,-85.0511,180,85.0511], info.bounds);
                done();
            });
        });
    });
    it('should update xml', function(done) {
        new Vector({ backend: new Testsource(), xml: xml.a }, function(err, source) {
            assert.ifError(err);
            assert.ok(source);
            source.getInfo(function(err, info) {
                assert.ifError(err);
                assert.equal('test-a', info.name);
                source.update({xml:xml.b}, function(err) {
                    assert.ifError(err);
                    source.getInfo(function(err, info) {
                        assert.ifError(err);
                        assert.equal('test-b', info.name);
                        done();
                    });
                });
            });
        });
    });
    it('should update backend', function(done) {
        new Vector({ backend: new Testsource('a'), xml: xml.a }, function(err, source) {
            assert.ifError(err);
            assert.ok(source);
            assert.equal('a',source._backend.uri);
            source.update({backend: new Testsource('b')}, function(err) {
                assert.ifError(err);
                assert.equal('b',source._backend.uri);
                done();
            });
        });
    });
});

describe('tiles', function() {
    var sources = {
        a: new Vector({ backend: new Testsource('a'), xml: xml.a }),
        b: new Vector({ backend: new Testsource('b'), xml: xml.b }),
        c: new Vector({ backend: new Testsource('b'), xml: xml.b, scale:2 })
    };
    var tests = {
        // 2.0.0, 2.0.1 test overzooming.
        // 1.1.2 tests that solid bg tiles are generated even when no backend
        // tile exists.
        a: ['0.0.0', '1.0.0', '1.0.1', '1.1.0', '1.1.1', '1.1.2', '2.0.0', '2.0.1'],
        // 2.1.1 should use z2 datatile -- a coastline shapefile
        // 2.1.2 should use maskLevel -- place dots, like the others
        b: ['0.0.0', '1.0.0', '1.0.1', '1.1.0', '1.1.1', '2.1.1', '2.1.2'],
        // test scale factor. unlike previous test, 3.2.2/3.2.3 will be coast
        // and 3.2.4 should fallback to the maskLevel
        c: ['0.0.0', '1.0.0', '1.0.1', '1.1.0', '1.1.1', '2.1.1', '2.1.2', '3.2.2', '3.2.3', '3.2.4']
    };
    Object.keys(tests).forEach(function(source) {
        before(function(done) { sources[source].open(done); });
    });
    Object.keys(tests).forEach(function(source) {
        tests[source].forEach(function(key) {
            var z = key.split('.')[0] | 0;
            var x = key.split('.')[1] | 0;
            var y = key.split('.')[2] | 0;
            it('should render ' + source + ' (' + key + ')', function(done) {
                sources[source].getTile(z,x,y, function(err, buffer, headers) {
                    assert.ifError(err);
                    imageEqualsFile(buffer, __dirname + '/expected/' + source + '.' + key + '.png', function(err) {
                        assert.ifError(err);
                        done();
                    });
                    // fs.writeFileSync(__dirname + '/expected/' + source + '.' + key + '.png', buffer);
                    // done();
                });
            });
        });
    });
});

describe('cache', function() {
    var source = new Vector({
        backend: new Testsource('a'),
        xml: xml.a,
        maxAge: 1000
    });
    var requests = ['0.0.0', '1.0.0', '1.0.1', '1.1.0', '1.1.1', '2.0.0', '2.0.1'];
    before(function(done) { source.open(done); });
    requests.forEach(function(key) {
        var z = key.split('.')[0] | 0;
        var x = key.split('.')[1] | 0;
        var y = key.split('.')[2] | 0;
        before(function(done) {
            // Request each tile twice.
            source.getTile(z, x, y, function(err, buffer, headers) {
                assert.ifError(err);
                source.getTile(z, x, y, function(err, buffer, headers) {
                    assert.ifError(err);
                    done();
                });
            });
        });
    });
    it('lockingcache should singleton requests to backend', function(done) {
        assert.equal(source._backend.stats['0.0.0'], 1);
        assert.equal(source._backend.stats['1.0.0'], 1);
        assert.equal(source._backend.stats['1.0.1'], 1);
        assert.equal(source._backend.stats['1.1.0'], 1);
        assert.equal(source._backend.stats['1.1.1'], 1);
        assert.equal(source._backend.stats['2.0.0'], undefined);
        assert.equal(source._backend.stats['2.0.1'], undefined);
        done();
    });
    it('cached tiles should expire after maxAge', function(done) {
        source.getTile(0, 0, 0, function(err, buffer, headers) {
            assert.ifError(err);
            setTimeout(function() {
                source.getTile(1, 0, 0, function(err, buffer, headers) {
                    assert.ifError(err);
                    assert.equal(source._backend.stats['0.0.0'], 1);
                    assert.equal(source._backend.stats['1.0.0'], 2);
                    done();
                });
            }, 1000);
        });
    });
});

describe('reap', function() {
    var source = new Vector({
        backend: new Testsource('a'),
        xml: xml.a,
        maxAge: 1000,
        reap: 500
    });
    var requests = ['0.0.0', '1.0.0', '1.0.1', '1.1.0', '1.1.1'];
    before(function(done) { source.open(done); });
    requests.forEach(function(key) {
        var z = key.split('.')[0] | 0;
        var x = key.split('.')[1] | 0;
        var y = key.split('.')[2] | 0;
        before(function(done) {
            source.getTile(z, x, y, function(err, buffer, headers) {
                assert.ifError(err);
                done();
            });
        });
    });
    it('backend should have a populated cache', function(done) {
        assert.equal(Object.keys(source._backend._vectorCache).length, 5);
        done();
    });
    it('backend should reap expired tiles', function(done) {
        setTimeout(function() {
            source.getTile(0, 0, 0, function(err, buffer, headers) {
                assert.ifError(err);
                setTimeout(function() {
                    assert.equal(Object.keys(source._backend._vectorCache).length, 1);
                    done();
                }, 500);
            });
        }, 500);
    });
});
