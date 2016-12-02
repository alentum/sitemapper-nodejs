"use strict";

var FileStreamRotator = require('file-stream-rotator');
var fs = require('fs');
var morgan = require('morgan');
var path = require('path');
var mkdirp = require('mkdirp');
var config = require('../config');

// setup the logger
var logDirectory = path.join(__dirname, '..', config.get('web:accessLogPath'));

// create directoy if doesn't exist
mkdirp.sync(logDirectory);

// create a rotating write stream
var accessLogStream = FileStreamRotator.getStream({
    filename: logDirectory + '/access-%DATE%.log',
    frequency: 'daily',
    verbose: false,
    date_format: "YYYYMMDD"
});

module.exports = morgan('combined', {stream: accessLogStream})