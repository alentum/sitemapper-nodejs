"use strict";

var winston = require('winston');
var path = require('path');
var mkdirp = require('mkdirp');
var config = require('../config');

winston.handleExceptions(new winston.transports.File({
    filename: path.join(__dirname, '..', config.get('exceptionLogPath'))
}), new winston.transports.Console({
    humanReadableUnhandledException: true
}));

var webLogPath = path.join(__dirname, '..', config.get('web:logPath'));
mkdirp.sync(path.dirname(webLogPath));

winston.loggers.add('web', {
    console: {
        colorize: true,
        label: 'web'
    },
    file: {
        filename: webLogPath,
        json: false
    }
});

var workerLogPath = path.join(__dirname, '..', config.get('worker:logPath'));
mkdirp.sync(path.dirname(workerLogPath));

winston.loggers.add('worker', {
    console: {
        colorize: true,
        label: 'worker'
    },
    file: {
        filename: workerLogPath,
        json: false
    }
});

module.exports = function (area) {
    return winston.loggers.get(area);
};