var sys = require('sys'),
    Pool = require('./mappool'),
    MBTiles = require('./mbtiles'),
    Tile = require('./tile'),
    Step = require('step'),
    SphericalMercator = require('./sphericalmercator');

// Batch tile generation class.
//
// Required `options` keys:
// - `bbox` {Array} bounding box coordinates in 900913 units and in the order
//   `[w, s, e, n]`
// - `minzoom` {Number} minimum zoom level to render (inclusive)
// - `maxzoom` {Number} maximum zoom level to render (inclusive)
// - `filepath` {String} path to target filename to which the mbtiles database
//   will be written
// - `datasource` {String|Object} datasource for the tile, one of the
//   acceptable datasource formats accepted by the `Tile` class.
// - `mapfile_dir` {String} path to data cache directory
// - `metadata` {Object} hash of metadata to be written to the mbtiles database
//
// Optional:
// - `interactivity` {Object} interactivity options to be passed through
//   to `Format.grid.render()` as `tile.format_options` (see `format.js`).
// - `batchsize` {Number} number of images/grids to render at a time
// - `compress` {Boolean} whether the MBTiles database should use compression
// - `format` {String} the image format to use for tiles, e.g. `png`
var TileBatch = function(options) {
    this.options = options || {};
    this.options.batchsize = this.options.batchsize || 10;
    this.options.levels = this.options.maxzoom + 1;
    this.options.compress = (typeof this.options.compress !== 'undefined') ? this.options.compress : true;
    this.options.format = this.options.format || 'png';

    this.options.interactivity = this.options.interactivity || false;

    SphericalMercator.call(this, this.options);

    // Vars needed for tile calculation/generation.
    this.minzoom = this.options.minzoom;
    this.maxzoom = this.options.maxzoom;
    this.tiles_current = 0;
    this.tiles_total = 0;

    // Precalculate the tile int bounds for each zoom level.
    this.zoomBounds = [];
    for (var z = this.minzoom; z <= this.maxzoom; z++) {
        this.zoomBounds[z] = this.bbox_to_xyz(this.options.bbox, z, true);
        this.tiles_total += (this.zoomBounds[z].maxX - this.zoomBounds[z].minX + 1) * (this.zoomBounds[z].maxY - this.zoomBounds[z].minY + 1);
    }

    // MBTiles database for storage.
    this.mbtiles = new MBTiles(options.filepath);
};

sys.inherits(TileBatch, SphericalMercator);

// Setup the MBTiles database.
TileBatch.prototype.setup = function(callback) {
    var that = this;
    Step(
        function() {
            that.mbtiles.open(this);
        },
        function() {
            that.mbtiles.setup(this);
        },
        function() {
            that.mbtiles.insertMetadata(that.options.metadata, this);
        },
        function() {
            callback();
        }
    );
};

// Insert grid feature data for all features on the interactivity layer.
// Requires `this.options.interactivity` to be defined.
TileBatch.prototype.fillGridData = function(callback) {
    // This function is meaningless without interactivity settings
    if (!this.options.interactivity) {
        callback('Interactivity must be supported to add grid data');
        return;
    }

    var that = this;
    var map;
    Step(
        // Acquire a raw map object
        function() {
            Pool.acquire('map', that.options.datasource, {}, this);
        },
        function(err, res) {
            if (err) throw err;

            map = res;
            var i = 0;
            var CHUNK_SIZE = 100;
            var group = this.group();
            do {
                features = map.mapnik.features(
                    that.options.interactivity.layer,
                    i,
                    i + CHUNK_SIZE
                );
                features.forEach(function(feature) {
                    that.mbtiles.insertGridData(feature,
                        that.options.interactivity.key_name,
                        group());
                });
                // Forward this pointer
                i += CHUNK_SIZE;
            } while (features.length > 0);
        },
        function(err) {
            Pool.release('map', that.options.datasource, map);
            callback(err);
        }
    );
};

// Render an image/grid batch of size `this.options.batchsize` and insert into
// the MBTiles. `callback(err, tiles)` should call `renderChunk()` again to
// render the next batch of tiles. If `tiles` is false, there are no batches
// left to be rendered.
TileBatch.prototype.renderChunk = function(callback) {
    // @TODO handle tile compression
    var tiles = this.next(this.options.batchsize);
    this.last_render = tiles;
    var that = this;

    if (!tiles) {
        return callback(null, false);
    }

    Step(
        function() {
            var group = this.group();
            for (var i = 0; i < tiles.length; i++) {
                var tile = new Tile({
                    format: that.options.format,
                    xyz: [tiles[i][1], tiles[i][2], tiles[i][0]],
                    datasource: that.options.datasource,
                    mapfile_dir: that.options.mapfile_dir
                });
                tile.render(group());
            }
        },
        function(err, renders) {
            if (err) return this(err);
            var renders = (function(r) {
                var o = [];
                for (var i = 0; i < renders.length; i++) {
                    o.push(renders[i][0]);
                }
                return o;
            })(renders);
            that.mbtiles.insertTiles(tiles, renders, that.options.compress, this);
        },
        function(err) {
            if (err || !that.options.interactivity) return this(err);
            var group = this.group();
            for (var i = 0; i < tiles.length; i++) {
                var tile = new Tile({
                    format: 'grid.json',
                    format_options: that.options.interactivity,
                    xyz: [tiles[i][1], tiles[i][2], tiles[i][0]],
                    datasource: that.options.datasource,
                    mapfile_dir: that.options.mapfile_dir
                });
                tile.render(group());
            }
        },
        function(err, renders) {
            if (err || !that.options.interactivity) return this(err);
            that.mbtiles.insertGrids(
                tiles,
                renders,
                that.options.compress,
                this
            );
        },
        function(err) {
            callback(err, tiles);
        }
    );
};

// Finish batch generation.
TileBatch.prototype.finish = function(callback) {
    this.mbtiles.db.close(callback);
};

// Retrieve an array of tiles that should be rendered next. Returns `false` if
// there are no more tiles to be generated.
TileBatch.prototype.next = function(count) {
    var count = count || 1;
    var triplets = [];

    this.curZ = (typeof this.curZ === 'undefined') ? this.minzoom : this.curZ;
    for (var z = this.curZ; z <= this.maxzoom; z++) {
        this.curX = (typeof this.curX === 'undefined') ?
            this.zoomBounds[z].minX : this.curX;
        this.curY = (typeof this.curY === 'undefined') ?
            this.zoomBounds[z].minY : this.curY;

        for (var x = this.curX; x <= this.zoomBounds[z].maxX; x++) {
            for (var y = this.curY; y <= this.zoomBounds[z].maxY; y++) {
                this.curX = x;
                this.curY = y;
                this.curZ = z;
                if (triplets.length < count) {
                    triplets.push([z, x, y]);
                    this.tiles_current++;
                } else if (triplets.length === count) {
                    return triplets;
                }
            }
            // End of row, reset Y cursor.
            this.curY = this.zoomBounds[z].minY;
        }

        // End of the zoom layer, pass through and reset XY cursors.
        delete this.curX;
        delete this.curY;
    }
    // We're done, set our cursor outside usable bounds.
    this.curZ = this.maxzoom + 1;
    this.curX = this.zoomBounds[this.maxzoom].maxX + 1;
    this.curY = this.zoomBounds[this.maxzoom].maxY + 1;
    if (!triplets.length) {
        return false;
    }
    return triplets;
};

module.exports = TileBatch;
