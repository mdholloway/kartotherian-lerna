"use strict";

var fs = require("fs"),
    path = require("path"),
    url = require("url"),
    util = require("util");

var Bridge = require("tilelive-bridge"),
    carto = require("carto"),
    yaml = require("js-yaml");

var tm = {};

// Named projections.
tm.srs = {
  'WGS84': '+proj=longlat +ellps=WGS84 +datum=WGS84 +no_defs',
  '900913': '+proj=merc +a=6378137 +b=6378137 +lat_ts=0.0 +lon_0=0.0 +x_0=0.0 +y_0=0.0 +k=1.0 +units=m +nadgrids=@null +wktext +no_defs +over'
};

// Return an object with sorted keys, ignoring case.
tm.sortkeys = function(obj) {
  try {
    return obj.map(tm.sortkeys);
  } catch(e) {};
  try {
    return Object.keys(obj).sort(function(a, b) {
      a = a.toLowerCase();
      b = b.toLowerCase();
      if (a === 'id') return -1;
      if (b === 'id') return 1;
      if (a > b) return 1;
      if (a < b) return -1;
      return 0;
    }).reduce(function(memo, key) {
      memo[key] = tm.sortkeys(obj[key]);
      return memo;
    }, {});
  } catch(e) { return obj };
};

var toXML = function(data, callback) {
  // Include params to be written to XML.
  var opts = [
    "name",
    "description",
    "attribution",
    "bounds",
    "center",
    "format",
    "minzoom",
    "maxzoom"
  ].reduce(function(memo, key) {
    if (key in data) {
      memo[key] = data[key];
    }

    return memo;
  }, {});

  opts.srs = tm.srs['900913'];

  opts.Layer = data.Layer.map(function(l) {
    l.srs = l.srs || tm.srs["900913"];
    l.name = l.id;
    return l;
  });

  opts.json = JSON.stringify({
    vector_layers: data.vector_layers
  });

  return new carto.Renderer().render(tm.sortkeys(opts), callback);
};


var TMSource = function(uri, callback) {
  uri = url.parse(uri);

  var self = this,
      filename = path.join(uri.hostname + uri.pathname, "data.yml");

  return fs.readFile(filename, "utf8", function(err, data) {
    if (err) {
      return callback(err);
    }

    try {
      self.info = yaml.load(data);
    } catch (err) {
      return callback(err);
    }

    // TODO (tm2) data.yml does not include format
    self.info.format = "pbf";

    return toXML(self.info, function(err, xml) {
      if (err) {
        return callback(err);
      }

      uri.xml = xml;
      uri.base = uri.hostname + uri.pathname;

      return Bridge.call(self, uri, callback);
    });
  });
};

TMSource.prototype.getInfo = function(callback) {
  return callback(this.info);
};

util.inherits(TMSource, Bridge);

TMSource.registerProtocols = function(tilelive) {
  tilelive.protocols["tmsource:"] = this;
};

module.exports = function(tilelive, options) {
  TMSource.registerProtocols(tilelive);

  return TMSource;
};