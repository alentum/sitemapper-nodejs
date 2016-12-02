"use strict";

var Promise = require('bluebird');
var SiteCrawler = require('./site-crawler/site-crawler.js');
var log = require('../infrastructure/logger')('worker');

function MappingEngine(siteRepository, config) {
    var self = this;

    var _siteRepository = siteRepository;
    var _maxCapacity = (config && config.maxCapacity) || 10;

    var _stopRequested = false;
    var _siteCrawlers = new Map();
    var _sitePromises = new Map();

    this.stop = function () {
        _stopRequested = true;

        var siteCount = _siteCrawlers.size;

        for (let crawler of _siteCrawlers.values()) {
            crawler.cancelProcessing();
        }

        return Promise.all(Array.from(_sitePromises.values()))
            .then(() => log.info('Mapping engine: stopped processing all sites (%d)', siteCount));
    };

    this.start = function () {
        log.info('Mapping engine: started');

        return processTasks();
    };

    function processTasks() {
        if (!_stopRequested) {
            if (_siteCrawlers.length >= _maxCapacity) {
                return Promise.race(getTaskPromises())
                    .then(processTasks)
                    .catch(processTasks);
            }
            else {
                return _siteRepository.getNextSiteForProcessing()
                    .then(domain => {
                        if (!domain) {
                            return Promise.delay(1000)
                                .then(processTasks);
                        }

                        if (_siteCrawlers.has(domain)) {
                            return processTasks();
                        }

                        var crawler = new SiteCrawler(domain, _siteRepository);
                        var promise = crawler.crawl()
                            .finally(() => {
                                _siteCrawlers.delete(domain);
                                _sitePromises.delete(domain);
                            });

                        _siteCrawlers.set(domain, crawler);
                        _sitePromises.set(domain, promise);

                        return processTasks();
                    })
                    .catch(() => Promise.delay(1000).then(processTasks));
            }
        }
    }

    processTasks();
}

module.exports = MappingEngine;