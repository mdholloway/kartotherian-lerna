var tiledata = new Buffer(1024);

module.exports = Timedsource;

function Timedsource(uri, callback) {
    this.time = uri.time || 5;
    this.maxzoom = uri.maxzoom || 3;
    this.emptymax = uri.emptymax || false;
    this.stopped = false;
    if (callback) callback(null, this);
    return this;
}

Timedsource.prototype.getInfo = function(callback) {
    return callback(null, {
        name: 'source (' + this.timeout + ')',
        description: 'timed I/O source',
        minzoom: 0,
        maxzoom: this.maxzoom,
        bounds: [-180,-85,180,85],
        center: [0,0,3]
    });
};

Timedsource.prototype.getTile = function(z, x, y, callback) {
    setTimeout(function() {
        if (x >= (Math.pow(2,z)/2)) {
            callback(new Error('Tile does not exist'));
        } else if (false && y >= (Math.pow(2,z)/2)) {
            var solid = new Buffer(1024);
            solid.solid = [(x%256),(x%256),(y%256),1].join(',');
            callback(null, solid, {});
        } else {
            callback(null, tiledata, {});
        }
    }, this.time);
};

Timedsource.prototype.putInfo = function(data, callback) {
    setTimeout(function() {
        callback();
    }, this.time);
};

Timedsource.prototype.putTile = function(z, x, y, data, callback) {
    setTimeout(function() {
        callback();
    }, this.time);
};

Timedsource.prototype.stopWriting = function(callback) {
    this.stopped = true;
    return callback();
};

