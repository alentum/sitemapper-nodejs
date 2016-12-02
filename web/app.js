"use strict";

var express = require('express');
var path = require('path');
var favicon = require('serve-favicon');
var logger = require('morgan');
var cookieParser = require('cookie-parser');
var bodyParser = require('body-parser');
var compression = require('compression');
var swig = require('swig');
var morgan = require('morgan');
var _ = require('lodash');

var rootRoutes = require('./routes/root');
var mapRoutes = require('./routes/map');

var config = require('../config');
var SiteRepository = require('../data-access/site-repository');
var MappingClient = require('../worker/mapping-client');
var MappingEngine = require('../worker/mapping-engine');

var siteRepository = new SiteRepository();

// Worker
var mappingEngine, mappingEnginePromise;
var useWorker = config.get('web:startWorker') !== false;
if (useWorker) {
    mappingEngine = new MappingEngine(siteRepository);
    mappingEnginePromise = mappingEngine.start();
}

function getAssetWithHash(path) {
    var version = config.get('web:assetsVersion');
    return path + (version ? '?' + version : '');
}

// Web app
function getBundles() {
    var bundles = {
        js: {},
        css: {}
    };

    if (app.get('env') === 'development') {
        bundles.js = _.mapValues(config.get("web:bundles:js"),
            (value, key) => value.map(file => '/' + _.trimLeft(file, '/')));
        bundles.css = _.mapValues(config.get("web:bundles:css"),
            (value, key) => value.map(file => '/' + _.trimLeft(file, '/')));
    }
    else {
        bundles.js = _.mapValues(config.get("web:bundles:js"),
            (value, key) => [getAssetWithHash('/js/' + key + '.js')]);
        bundles.css = _.mapValues(config.get("web:bundles:css"),
            (value, key) => [getAssetWithHash('/css/' + key + '.css')]);
    }

    return { bundles };
}

var app = express();
var public_path = (app.get('env') === 'development') ? 'public' : 'public_dist';

// Global shared objects
app.set('siteRepository', siteRepository);
app.set('mappingClient', new MappingClient(siteRepository, {
    refreshPeriodInDays: config.get('mapper:refreshPeriodInDays')
}));
app.set('appConfig', config);

// view engine setup
app.engine('html', swig.renderFile);
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'html');

swig.setDefaults({ locals: _.assign({ now: function () { return new Date(); } }, getBundles())});

if (app.get('env') === 'development') {
    swig.setDefaults({cache: false});
}

app.use(compression());
// uncomment after placing your favicon in /public
//app.use(favicon(path.join(__dirname, public_path, 'favicon.ico')));
app.use(logger('dev'));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({extended: false}));
app.use(cookieParser());
//app.use(require('less-middleware')(path.join(__dirname, public_path)));
app.use(require('../infrastructure/accessLogger'));
app.use(express.static(path.join(__dirname, public_path)));

app.use('/', rootRoutes);
app.use('/', mapRoutes);

// error 404
app.use(function (req, res, next) {
    res.status(404);
    res.render('errors/404', {
        url: req.path
    });
});

// error handler
if (app.get('env') === 'development') {
    app.use(function (err, req, res, next) {
        res.status(err.status || 500);
        res.render('errors/500', {
            message: err.message,
            error: err
        });
    });
}

// production error handler
// no stacktraces leaked to user
app.use(function (err, req, res, next) {
    res.status(err.status || 500);
    res.render('errors/500', {
        message: err.message,
        error: {}
    });
});

function onExit() {
    if (mappingEngine && mappingEnginePromise) {
        mappingEngine.stop();

        mappingEnginePromise
            .then(() => siteRepository.close())
            .then(() => process.exit(0));
    }
}

if (useWorker) {
    process.on('SIGINT', onExit);
}

module.exports = app;
