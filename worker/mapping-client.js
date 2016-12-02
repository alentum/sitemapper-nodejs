"use strict";

var siteModels = require('../models/site-models');
var Promise = require('bluebird');

function MappingClient(siteRepository, config) {
    var _siteRepository = siteRepository;
    var _refreshPeriodInDays = (config && config.refreshPeriodInDays) || 7;

    this.getSite = function (domain, includeContents, contentsTimeStamp) {
        domain = siteModels.SiteInfo.normalizeDomain(domain);
        if (!siteModels.SiteInfo.isValidDomain(domain)) {
            return Promise.reject('Invalid domain');
        }

        return _siteRepository.getSite(domain, includeContents, contentsTimeStamp)
            .then(site => {
                var needToProcess = site == null;

                // Need to process as info is too old
                var msPerDay = 1000 * 60 * 60 * 24;
                var msPerHour = 1000 * 60 * 60;
                var msPerMinute = 1000 * 60;

                needToProcess = needToProcess ||
                    ((site != null) && (Date.now() - site.info.statusTime.getTime() > 7 * msPerDay));

                // Need to process as there was a connection or robots.txt error
                needToProcess = needToProcess || ((site != null) &&
                    ((site.info.status == siteModels.SiteStatus.ConnectionProblem) || (site.info.status == siteModels.SiteStatus.RobotsTxtProblem)) &&
                    (Date.now() - site.info.statusTime.getTime() > 10 * msPerMinute));

                // Need to process as processing seems to be interrupted
                needToProcess = needToProcess || ((site != null) &&
                    ((site.info.status == siteModels.SiteStatus.Added) || (site.info.status == siteModels.SiteStatus.Processing)) &&
                    (Date.now() - site.info.statusTime.getTime() > 1 * msPerHour));

                if ((site != null) && !site.info.refreshEnabled) {
                    needToProcess = false;
                }

                if (needToProcess) {
                    site = new siteModels.Site();
                    site.info.domain = domain;

                    return _siteRepository.saveSite(site)
                        .then(() => _siteRepository.queueSiteForProcessing(domain))
                        .then(() => site)
                        .catch(() => null);
                }

                return site;
            });
    };
}

module.exports = MappingClient;