'use strict';

let pathLib = require('path'),
    express = require('express');

module.exports = (cor, router) => {
    router.use('/editor', express.static(pathLib.resolve(__dirname, 'public')));
};
