var Format = {
    /**
     * Select a format
     *
     * @param {String} format the extension of the tile.
     * @return {Function} renderer function.
     */
    select: function(format) {
        for (i in Format) {
            // don't consider this function
            if (Format[i].hasOwnProperty('find')) {
                if (format.match(Format[i].find)) {
                    return Format[i].render;
                }
            }
        }
    },

    png: {
        /**
         * Generate a PNG file and call callback
         *
         * @param {Object} tile tile object.
         * @param {Function} callback the function to call when
         *  data is rendered.
         */
        'render': function(tile, callback) {
            // @TODO Synchronous tile render. Switch to version below once
            // upstream bug in .render() method is fixed.
            var map = tile.map.mapnik_map();
            map.zoom_to_box(tile.bbox);
            callback(null, [
                map.render_to_string('png'),
                {'Content-Type': 'image/png'}
            ]);
        },
        'find': /png/
    },


    jpg: {
        /**
         * Generate a JPG file and call callback
         *
         * @param {Object} tile tile object.
         * @param {Function} callback the function to call when
         *  data is rendered.
         */
        'render': function(tile, callback) {
            /*
             * TODO: mapnik driver only supports png
            tile.map.mapnik_map().render(
                tile.bbox,
                function(image) {
                    callback(null, [
                        image, {
                            'Content-Type': 'image/jpeg'
                        }]);
                }
            );
            */
        },
        'find': /(jpg|jpeg)/
    },

    grid: {
        /**
         * Generate a grid file and call callback
         *
         * @param {Object} tile tile object.
         * @param {Function} callback the function to call when
         *  data is rendered.
         */
        'render': function(tile, callback) {
            tile.map.mapnik_map().zoom_to_box(tile.bbox);
            callback(null, [
                tile.map.mapnik_map().query_map_point(0, 4, 'COUNTRY_ID'), {
                    'Content-Type': 'application/json'
            }]);
        },
        'find': /json/
    },

    geojson: {
        'render': function(callback) { },
        'find': /geojson/
    }
};

module.exports = Format;
