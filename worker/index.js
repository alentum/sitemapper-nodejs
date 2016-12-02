"use strict";

var config = require('../config');
var SiteRepository = require('../data-access/site-repository');
var MappingClient = require('../worker/mapping-client');
var MappingEngine = require('../worker/mapping-engine');
var log = require('../infrastructure/logger')('worker');

var siteRepository = new SiteRepository();

log.info('Worker started');

// Worker
var mappingEngine, mappingEnginePromise;
mappingEngine = new MappingEngine(siteRepository);
mappingEnginePromise = mappingEngine.start();

function onExit() {
    if (mappingEngine && mappingEnginePromise) {
        mappingEngine.stop();

        mappingEnginePromise
            .then(() => siteRepository.close())
            .then(() => process.exit(0));
    }
}

process.on('SIGINT', onExit);