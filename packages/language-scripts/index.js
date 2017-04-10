'use strict';

exports.data = require('./data.json');

exports.adjust = (opts) => {
    const override = opts.override || {};
    const prefix = opts.prefix || false;

    const result = {};

    for (const key of Object.keys(exports.data).concat(Object.keys(override))) {
        let value = override[key];
        if (value !== null) {
            if (value === undefined) {
                value = exports.data[key];
            }
            result[prefix ? (prefix + key) : key] = value;
        }
    }

    return result;
};
