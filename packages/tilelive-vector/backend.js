var tilelive = require('tilelive');
var mapnik = require('mapnik');
var util = require('util');
var zlib = require('zlib');

module.exports = Backend;

function Task(callback) {
    this.err = null;
    this.headers = {};
    this.access = +new Date;
    this.done;
    this.body;
    this.once('done', callback);
};
util.inherits(Task, require('events').EventEmitter);

function Backend(opts, callback) {
    this._vectorCache = {};
    this._vectorTimeout = null;
    this._scale = opts.scale || 1;
    this._maxAge = typeof opts.maxAge === 'number' ? opts.maxAge : 60e3;
    this._deflate = typeof opts.deflate === 'boolean' ? opts.deflate : true;
    this._reap = typeof opts.reap === 'number' ? opts.reap : 60e3;
    this._source = null;
    var backend = this;

    if (opts.source) {
        setsource(opts.source, opts);
    } else if (opts.uri) {
        tilelive.load(opts.uri, function(err, source) {
            if (err) return callback(err);
            source.getInfo(function(err, info) {
                if (err) return callback(err);
                setsource(source, info);
            });
        });
    } else {
        if (callback) callback(new Error('opts.uri or opts.source must be set'));
    }

    function setsource(source, info) {
        backend._minzoom = info.minzoom || 0;
        backend._maxzoom = info.maxzoom || 22;
        // @TODO some sources filter out custom keys @ getInfo forcing us
        // to access info/data properties directly. Fix this.
        if ('maskLevel' in info) {
            backend._maskLevel = parseInt(info.maskLevel, 10);
        } else if (source.data && 'maskLevel' in source.data) {
            backend._maskLevel = source.data.maskLevel;
        }
        backend._source = source;
        if (callback) callback(null, backend);
    }
};

Backend.prototype.getInfo = function(callback) {
    if (!this._source) return callback(new Error('Tilesource not loaded'));
    this._source.getInfo(callback);
};

// Wrapper around backend.getTile that implements a "locking" cache.
Backend.prototype.getTile = function(z, x, y, callback) {
    if (!this._source) return callback(new Error('Tilesource not loaded'));

    var backend = this;
    var source = backend._source;
    var now = +new Date;
    var key = z + '/' + x + '/' + y;
    var cache = backend._vectorCache[key];

    // Reap cached vector tiles with stale access times on an interval.
    if (backend._reap && !backend._vectorTimeout) backend._vectorTimeout = setTimeout(function() {
        var now = +new Date;
        Object.keys(backend._vectorCache).forEach(function(key) {
            if ((now - backend._vectorCache[key].access) < backend._maxAge) return;
            delete backend._vectorCache[key];
        });
        delete backend._vectorTimeout;
    }, backend._reap);

    // Expire cached tiles when they are past maxAge.
    if (cache && (now-cache.access) >= backend._maxAge) cache = false;

    // Return cache if finished.
    if (cache && cache.done) return callback(null, cache.body, cache.headers);

    // Otherwise add listener if task is in progress.
    if (cache) return cache.once('done', callback);

    var task = new Task(callback);
    backend._vectorCache[key] = task;

    var size = 0;
    var headers = {};

    // If scale > 1 adjusts source data zoom level inversely.
    // scale 2x => z-1, scale 4x => z-2, scale 8x => z-3, etc.
    var d = Math.round(Math.log(backend._scale)/Math.log(2));
    var bz = (z - d) > backend._minzoom ? z - d : backend._minzoom;
    var bx = Math.floor(x / Math.pow(2, z - bz));
    var by = Math.floor(y / Math.pow(2, z - bz));

    // Overzooming support.
    if (bz > backend._maxzoom) {
        bz = backend._maxzoom;
        bx = Math.floor(x / Math.pow(2, z - bz));
        by = Math.floor(y / Math.pow(2, z - bz));
    }

    source.getTile(bz, bx, by, function sourceGet(err, body, head) {
        if (typeof backend._maskLevel === 'number' &&
            err && err.message === 'Tile does not exist' &&
            bz > backend._maskLevel) {
            bz = backend._maskLevel;
            bx = Math.floor(x / Math.pow(2, z - bz));
            by = Math.floor(y / Math.pow(2, z - bz));
            return source.getTile(bz, bx, by, sourceGet);
        }
        if (err && err.message !== 'Tile does not exist') return done(err);

        if (!body) {
            return makevtile();
        } else {
            size = body.length;
            headers = head || {};
            return backend._deflate ? zlib.inflate(body, makevtile) : makevtile(null, body);
        }
    });

    function done(err, body, headers) {
        if (err) delete backend._vectorCache[key];
        task.done = true;
        task.body = body;
        task.headers = headers;
        task.emit('done', err, body, headers);
    };

    function makevtile(err, data) {
        if (err && err.message !== 'Tile does not exist') return done(err);
        var vtile = new mapnik.VectorTile(bz, bx, by);
        vtile._srcbytes = size;

        // null/zero length data is a solid tile be painted.
        if (!data) return done(null, vtile, headers);

        try {
            vtile.setData(data);
        } catch (err) {
            return done(err);
        }
        done(null, vtile, headers);
    };
};

