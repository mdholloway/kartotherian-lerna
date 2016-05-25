'use strict';

var Promise = require('bluebird');
var _ = require('underscore');
var assert = require('assert');
var Job = require('../lib/Job');
var JobProcessor = require('../lib/JobProcessor');

describe('JobProcessor', function() {


    /**
     * Generates values as given by the iterator
     * @param {array} values
     * @param {int} [idxFrom]
     * @param {int} [idxBefore]
     * @returns {Function}
     */
    function generator(values, idxFrom, idxBefore) {
        var i = 0;
        return function () {
            var result = undefined;
            while (idxFrom !== undefined && i < values.length && values[i] < idxFrom) {
                i++;
            }
            if (i < values.length && (idxBefore === undefined || values[i] < idxBefore)) {
                result = {idx: values[i++]};
            }
            return Promise.resolve(result);
        }
    }


    /**
     * Checks that values generated by the iterator match expected values
     * Adapted from promistreamus tests
     */
    function assertInOrder(msg, expectedValues, iterator, nowrap) {
        var pos = 0;
        var processor = function () {
            return iterator().then(function (value) {
                if (value === undefined) {
                    assert.equal(pos, expectedValues.length, 'finished early');
                    return undefined;
                }
                assert(pos < expectedValues.length, 'too many values');
                var expectedVal = expectedValues[pos++];
                if (!nowrap) expectedVal = {idx: expectedVal};
                assert.deepEqual(value, expectedVal, 'unexpected value');

                return processor();
            });
        };
        return processor().catch(function (err) {
            err.message = msg + ': ' + err.message;
            assert.fail(err);
        });
    }

    function newJob(opts) {
        return {
            data: _.extend({
                storageId: 'sid',
                generatorId: 'gid'
            }, opts)
        };
    }


    it('simple iterations', function () {

        function test(msg, idxFrom, idxBefore, expectedValues) {
            var jp = new JobProcessor(undefined, newJob({zoom: 0, tiles: []}));
            return assertInOrder(msg, expectedValues, jp.getSimpleIterator(idxFrom, idxBefore));
        }

        return Promise.resolve(true)
            .then(function () {return test('a1', 0, 0, [])})
            .then(function () {return test('a2', 0, 1, [0])})
            .then(function () {return test('a2', 10, 14, [10, 11, 12, 13])})
        ;
    });

    it('invert iterations', function () {

        function test(msg, values, idxFrom, idxBefore, expectedValues) {
            var jp = new JobProcessor(undefined, newJob({zoom: 0, tiles: []}));
            return assertInOrder(msg, expectedValues, jp.invertIterator(generator(values), idxFrom, idxBefore));
        }

        return Promise.resolve(true)
            .then(function () {return test('b01', [], 0, 0, [])})
            .then(function () {return test('b02', [], 0, 1, [0])})
            .then(function () {return test('b03', [], 0, 2, [0, 1])})
            .then(function () {return test('b04', [0], 0, 1, [])})
            .then(function () {return test('b05', [0], 0, 2, [1])})
            .then(function () {return test('b06', [1], 0, 2, [0])})
            .then(function () {return test('b07', [0,1], 0, 2, [])})
            .then(function () {return test('b08', [1], 0, 3, [0,2])})
            .then(function () {return test('b09', [2], 0, 3, [0,1])})
            .then(function () {return test('b10', [2], 0, 5, [0,1,3,4])})
            .then(function () {return test('b11', [0,1], 0, 3, [2])})
            .then(function () {return test('b12', [1,2], 0, 3, [0])})
            .then(function () {return test('b13', [1,2], 0, 4, [0,3])})
            .then(function () {return test('b14', [0,2], 1, 2, [1])})
            .then(function () {return test('b15', [0,3], 1, 3, [1,2])})
            .then(function () {return test('b16', [0,2,4], 1, 3, [1])})
            .then(function () {return test('b17', [0,2,4], 1, 1, [])})
            .then(function () {return test('b18', [0,1,4,5], 1, 4, [2,3])})
            .then(function () {return test('b19', [0,1,4,5], 2, 4, [2,3])})
            .then(function () {return test('b20', [0,1,4,5], 1, 3, [2])})
            .then(function () {return test('b21', [0,1,4,5], 2, 3, [2])})
        ;
    });

    it('sequence iterations', function () {

        function test(msg, values, expectedValues) {
            var jp = new JobProcessor(undefined, newJob({zoom: 0, tiles: []}));
            return assertInOrder(msg, expectedValues, jp.sequenceToRangesIterator(generator(values)), true);
        }

        return Promise.resolve(true)
            .then(function () {return test('d1', [], [])})
            .then(function () {return test('d2', [0], [[0,1]])})
            .then(function () {return test('d3', [1,2], [[1,3]])})
            .then(function () {return test('d4', [1,3], [[1,2],[3,4]])})
            .then(function () {return test('d5', [1,2,4], [[1,3],[4,5]])})
            .then(function () {return test('d6', [1,3,4], [[1,2],[3,5]])})
            .then(function () {return test('d7', [1,2,4,5,7], [[1,3],[4,6],[7,8]])})
            ;
    });

    it('main iterator', function () {

        function test(msg, expectedValues, tiles, filters, sourceData, hasQuery) {
            if (hasQuery) {
                msg += '+';
                sourceData.gid.z2 = expectedValues;
            }
            var sources = {
                getHandlerById: function (id) {
                    return (hasQuery && id === 'gid') ? {
                        query: function (opts) {
                            assert(id in sourceData, msg + ' id in sourceData: ' + id);
                            var dat = sourceData[id];
                            assert.notStrictEqual(opts.zoom, undefined, msg + ' has no zoom');
                            var zid = 'z'+opts.zoom;
                            assert(zid in dat, msg + ' id in sourceData: ' + id);
                            return generator(dat[zid], opts.idxFrom, opts.idxBefore);
                        }
                    } : {};
                }
            };
            var jp = new JobProcessor(sources, newJob({zoom: 2, tiles: tiles, filters: filters}));
            jp.stats = {};
            jp.tileStore = sources.getHandlerById('sid');
            jp.tileGenerator = sources.getHandlerById('gid');
            return assertInOrder(msg, expectedValues, jp.getIterator())
                .then(function () {
                    if (!hasQuery) {
                        return test(msg, expectedValues, tiles, filters, sourceData, true);
                    }
                });
        }

        return Promise.resolve(true)
            .then(function () {return test('c01', [],        [],             undefined,   { gid:{} } )})
            .then(function () {return test('c02', [0],       [0],            undefined,   { gid:{} } )})
            .then(function () {return test('c03', [0,1,2],   [[0,3]],        undefined,   { gid:{} } )})
            .then(function () {return test('c04', [0,1,4],   [[0,2], [4,5]], undefined,   { gid:{} } )})
            .then(function () {return test('c05', [0,1,4],   [[0,2], [4,5]], undefined,   { gid:{} } )})
            // .then(function () {return test('c06', [4,5],     [[0,6]],        [{zoom:-1}], { gid:{}, sid:{z1:[1]} } )})
        ;
    });

});
