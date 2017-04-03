'use strict';

let util = require('util'),
    _ = require('underscore'),
    Promise = require('bluebird'),
    zlib = require('zlib'),
    qidx = require('quadtile-index'),
    uptile = require('tilelive-promise'),
    toBuffer = require('typedarray-to-buffer'),
    checkType = require('@kartotherian/input-validator'),
    Err = require('@kartotherian/err');

Promise.promisifyAll(zlib);

// Make sure there is String.endsWith()
if (!String.prototype.endsWith) {
    String.prototype.endsWith = function endsWith(searchString, position) {
        let subjectString = this.toString();
        if (position === undefined || position > subjectString.length) {
            position = subjectString.length;
        }
        position -= searchString.length;
        let lastIndex = subjectString.indexOf(searchString, position);
        return lastIndex !== -1 && lastIndex === position;
    };
}

let core = {};
module.exports = core;

let _app, _packageConfig, _rootDir, _npmLoader, _npmResolver, _sources;

/**
 * Initializes the core
 * @param {Object} app main object from service-runner
 * @param {Object} app.conf configuration object defined in the config.yaml file
 * @param {Object} app.logger logger object that implements log(group, message) function
 * @param {Object} app.metrics object to send metrics data to
 * @param {Object} packageConfig configuration object defined in the package.json kartotherian tag
 * @param {string} rootDir Absolute path of the root directory of the main app
 * @param {function} npmLoader function that performs 'require(moduleName)'
 *   in the context of the main app
 * @param {function} npmResolver function that performs 'require.resolve(moduleName)'
 *   in the context of the main app
 *
 * TODO: Any suggestions about how to get rid of this ugly hack are welcome
 *
 */
core.init = function init(app, packageConfig, rootDir, npmLoader, npmResolver) {
    _app = app;
    _packageConfig = packageConfig;
    _rootDir = rootDir;
    _npmLoader = npmLoader;
    _npmResolver = npmResolver;

    core.log = app.logger.log.bind(app.logger);
    core.metrics = app.metrics;

    let tilelive = npmLoader('tilelive');
    Promise.promisifyAll(tilelive);
    core.tilelive = tilelive;

    let mapnik = npmLoader('mapnik');
    Promise.promisifyAll(mapnik.Map.prototype);
    Promise.promisifyAll(mapnik.VectorTile.prototype);
    Promise.promisifyAll(mapnik.Image);
    Promise.promisifyAll(mapnik.Image.prototype);

    mapnik.register_default_fonts();
    mapnik.register_system_fonts();
    mapnik.register_default_input_plugins();

    core.mapnik = mapnik;

    _.each(core.loadNpmModules('registerSourceLibs'), core.registerTileliveModule);
};

/**
 * Registers a tilelive.js or kartotherian module with the tilelive
 * @param module
 */
core.registerTileliveModule = function registerTileliveModule(module) {
    if (module.initKartotherian) {
        module.initKartotherian(core);
    } else if (module.registerProtocols) {
        module.registerProtocols(core.tilelive);
    } else {
        module(core.tilelive);
    }
};

/**
 * Log info - will get overriden during init() call
 */
core.log = function log(group, message) {
    console.log.apply(null, arguments);
};

/**
 * Attempt to convert Error to anything printable (with stacktrace)
 */
core.errToStr = function errToStr(err) {
    return (err.body && (err.body.stack || err.body.detail)) || err.stack || err;
};

/**
 * Performs 'require()' in the context of the main app
 */
core.resolveModule = function resolveModule(moduleName) {
    if (!_npmResolver) {
        throw new Err('core.init() has not been called');
    }
    return _npmResolver(moduleName);
};

/**
 * Returns the root dir of the app, as specified in the init() call
 */
core.getAppRootDir = function getAppRootDir() {
    if (!_rootDir) {
        throw new Err('core.init() has not been called');
    }
    return _rootDir;
};

/**
 * Returns the root dir of the app, as specified in the init() call
 */
core.loadNpmModules = function loadNpmModules(pkgConfigList) {
    return _.map(core.getAppConfiguration()[pkgConfigList], lib => _npmLoader(lib));
};

/**
 * Throw "standard" tile does not exist error.
 * The error message string is often used to check if tile existance, so it has to be exact
 */
core.throwNoTile = function throwNoTile() {
    throw new Error('Tile does not exist');
};

/**
 * Checks if the error indicates the tile does not exist
 */
core.isNoTileError = function isNoTileError(err) {
    return err.message === 'Tile does not exist';
};

core.uncompressAsync = function uncompressAsync(data) {
    return Promise.try(() => {
        if (data && data.length) {
            if (data[0] == 0x1F && data[1] == 0x8B) {
                return zlib.gunzipAsync(data);
            } else if (data[0] == 0x78 && data[1] == 0x9C) {
                return zlib.inflateAsync(data);
            }
        }
        return data;
    });
};

/**
 * Extract portion of a higher zoom tile as a new tile
 * @param baseTileRawPbf uncompressed vector tile pbf
 * @param z desired zoom of the sub-tile
 * @param x sub-tile's x
 * @param y sub-tile's y
 * @param bz source tile's zoom
 * @param bx source tile's x
 * @param by source tile's y
 * @returns {string|*}
 */
core.extractSubTileAsync = function extractSubTileAsync(baseTileRawPbf, z, x, y, bz, bx, by) {
    return Promise
        .try(() => {
            if (bz >= z) {
                throw new Err('Base tile zoom is not less than z');
            }
            let baseTile = new core.mapnik.VectorTile(bz, bx, by);
            // TODO: setData has an async version - we might want to use it instead
            baseTile.setData(baseTileRawPbf);
            let subTile = new core.mapnik.VectorTile(+z, +x, +y);
            // TODO: should we do a ".return(subTile)" after compositeAsync()?
            return subTile.compositeAsync([baseTile]);
        }).then(tile => tile.getData());
};

core.compressPbfAsync2 = function compressPbfAsync2(data, headers) {
    if (!data || data.length === 0) {
        return [data, headers];
    }
    if (!(data instanceof Buffer)) {
        // gzip does not handle typed buffers like Uint8Array
        data = toBuffer(data);
    }
    return zlib
        .gzipAsync(data)
        .then(pbfz => {
            headers['Content-Encoding'] = 'gzip';
            return [pbfz, headers];
        });
};

/**
 * Wrapper around the backwards-style getTile() call,
 * where extra args are passed by attaching them to the callback
 */
core.getTitleWithParamsAsync = function getTitleWithParamsAsync(source, z, x, y, opts) {
    return new Promise((resolve, reject) => {
        try {
            let callback = (err, data, headers) => {
                if (err) {
                    reject(err);
                } else {
                    resolve([data, headers]);
                }
            };
            source.getTile(z, x, y, opts ? _.extend(callback, opts) : callback);
        } catch (err) {
            reject(err);
        }
    });
};

// /**
//  * Utility method to validate getTileAsync parameters, such as zoom, x, y, ...
//  */
// core.validateGetTileOpts = function validateGetTileOpts(opts) {
//     checkType(opts, 'zoom', 'zoom', true);
//
//     let hasIndex = checkType(opts, 'index', 'integer', false, 0, Math.pow(4, opts.zoom)),
//         hasCoords = checkType(opts, 'x', 'integer') && checkType(opts, 'y', 'integer');
//     if (!hasIndex) {
//         if (!hasCoords) {
//             throw new Err('Options must contain either both x and y fields, or an index field');
//         }
//         opts.index = qidx.xyToIndex(opts.x, opts.y, opts.zoom);
//     } else if (!hasCoords) {
//         let xy = qidx.indexToXY(opts.index);
//         opts.x = xy[0];
//         opts.y = xy[1];
//     }
// };

core.loadSource = function loadSource(sourceUri) {
    return core.tilelive.loadAsync(sourceUri).then(handler => {
        if (!handler) {
            throw new Err('Tilelive handler for %j failed to instantiate',
                (_.isObject(sourceUri)
                    ? sourceUri.protocol || 'unknown'
                    : sourceUri).split(':', 1)[0]);
        }
        // Annoyingly, Tilesource API has a few functions that break the typical NodeJS callback
        // pattern of function(error, result), and instead have multiple results.  For them,
        // we need to promisify them with the { multiArgs: true }
        // API:  https://github.com/mapbox/tilelive/blob/master/API.md
        // See also: http://bluebirdjs.com/docs/api/promise.promisifyall.html#option-multiargs
        Promise.promisifyAll(handler, {
            filter: function (name) {
                return name === 'getTile' || name === 'getGrid';
            },
            multiArgs: true
        });
        // Promisify the rest of the methods
        Promise.promisifyAll(handler);

        // Inject getAsync()
        uptile(handler);

        return handler;
    });
};

core.validateZoom = function validateZoom(zoom, source) {
    zoom = checkType.strToInt(zoom);
    if (!qidx.isValidZoom(zoom)) {
        throw new Err('invalid zoom').metrics('err.req.coords');
    }
    if (source.minzoom !== undefined && zoom < source.minzoom) {
        throw new Err('Minimum zoom is %d', source.minzoom).metrics('err.req.zoom');
    }
    if (source.maxzoom !== undefined && zoom > source.maxzoom) {
        throw new Err('Maximum zoom is %d', source.maxzoom).metrics('err.req.zoom');
    }
    return zoom;
};

core.validateScale = function validateScale(scale, source) {
    if (scale !== undefined) {
        if (!source.scales) {
            throw new Err('Scaling is not enabled for this source').metrics('err.req.scale');
        }
        if (!_.contains(source.scales, scale.toString())) {
            throw new Err('This scaling is not allowed for this source. Allowed: %j',
                source.scales.join()
            ).metrics('err.req.scale');
        }
        scale = parseFloat(scale);
    }
    return scale;
};

core.reportError = function reportError(errReporterFunc, err) {
    try {
        errReporterFunc(err);
    } catch (e2) {
        console.error('Unable to report: ' +
            core.errToStr(err) +
            '\n\nDue to: ' + core.errToStr(e2));
    }
};

core.reportRequestError = function reportRequestError(err, res) {
    core.reportError(err => {
        res
            .status(400)
            .header('Cache-Control', 'public, s-maxage=30, max-age=30')
            .json(err.message || 'error/unknown');
        // Any error that has metrics setting does not need to go into the error log
        core.log(err.metrics ? 'info' : 'error', err);
        core.metrics.increment(err.metrics || 'err.unknown');
    }, err);
};

core.getAppConfiguration = function getAppConfiguration() {
    return _packageConfig;
};

core.getConfiguration = function getConfiguration() {
    return _app.conf;
};

core.setSources = function setSources(sources) {
    _sources = sources;
};

core.getSources = function getSources() {
    if (!_sources) {
        throw new Err('The service has not started yet');
    }
    return _sources;
};

core.getPublicSource = function getPublicSource(srcId) {
    let source = core.getSources().getSourceById(srcId, true);
    if (!source) {
        throw new Err('Unknown source').metrics('err.req.source');
    }
    if (!source.public && !core.getConfiguration().allSourcesPublic) {
        throw new Err('Source is not public').metrics('err.req.source');
    }
    return source;
};

/**
 * Set headers on the response object
 * @param res
 * @param source
 * @param dataHeaders
 */
core.setResponseHeaders = function setResponseHeaders(res, source, dataHeaders) {
    let conf = core.getConfiguration();
    if (conf.defaultHeaders) {
        res.set(conf.defaultHeaders);
    }
    if (source && source.defaultHeaders) {
        res.set(source.defaultHeaders);
    }
    if (dataHeaders) {
        res.set(dataHeaders);
    }
    if (conf.overrideHeaders) {
        res.set(conf.overrideHeaders);
    }
    if (source && source.headers) {
        res.set(source.headers);
    }
};
