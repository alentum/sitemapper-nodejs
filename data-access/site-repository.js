"use strict";

var mongoose = require('mongoose');
var Promise = require('bluebird');
mongoose.Promise = Promise;
var config = require('../config/index');

// Models
var models = require('./site-repository-models');
var siteModels = require('../models/site-models');
var SiteInfo = models.SiteInfo;
var SiteContents = models.SiteContents;
var mongoDbQueue = require('../third_party_libs/mongodb-queue-fixed/mongodb-queue');

function SiteRepository() {
    var queueAddCount = 0;

    mongoose.connect(config.get('siteDatabase:uri'), config.get('siteDatabase:options'));

    var queuePromise = new Promise(function (resolve, reject) {
        mongoose.connection.on('open', function () {
            var queue = Promise.promisifyAll(mongoDbQueue(mongoose.connection.db, 'sitequeue'));

            queue.ensureIndexesAsync()
                .then(() => queue.cleanAsync())
                .then(() => resolve(queue));
        });

        mongoose.connection.on('error', function (err) {
            reject(err);
        });
    });

    this.close = function () {
        return mongoose.connection.close();
    };

    function saveSiteInfo(info, overwrite, updateOnly) {
        if (overwrite === undefined) {
            overwrite = true;
        }

        if (updateOnly === undefined) {
            updateOnly = false;
        }

        if (info == null) {
            return Promise.reject('info is null');
        }

        if (!siteModels.SiteInfo.isValidDomain(info.domain)) {
            return Promise.reject('Invalid domain');
        }

        var siteInfo = new SiteInfo(info);
        siteInfo.set('_id', info.domain);
        if (overwrite) {
            return SiteInfo.findOneAndUpdate({ _id: info.domain }, siteInfo, { upsert: !updateOnly });
        }
        else {
            return siteInfo.save();
        }
    }

    function saveSiteContents(domain, contents, overwrite, updateOnly) {
        if (overwrite === undefined) {
            overwrite = true;
        }

        if (updateOnly === undefined) {
            updateOnly = false;
        }

        if (!siteModels.SiteInfo.isValidDomain(domain)) {
            return Promise.reject('Invalid domain');
        }

        if (contents == null) {
            return Promise.reject('contents is null');
        }

        var siteContents = new SiteContents(contents);
        siteContents.set('_id', domain);
        if (overwrite) {
            return SiteContents.findOneAndUpdate({ _id: domain }, siteContents, { upsert: !updateOnly });
        }
        else {
            return siteContents.save();
        }
    }

    function getSiteInfo(domain) {
        if (!siteModels.SiteInfo.isValidDomain(domain)) {
            return Promise.reject('Invalid domain');
        }

        return SiteInfo.findById(domain)
            .then(res => {
                if (res) {
                    var info = res.toObject();
                    info.domain = res.get('_id');
                    return info;
                }
                else {
                    return null;
                }
            });
    }

    function getSiteContents(domain) {
        if (!siteModels.SiteInfo.isValidDomain(domain)) {
            return Promise.reject('Invalid domain');
        }

        return SiteContents.findById(domain)
            .then(res => res ? res.toObject() : null);
    }

    function deleteSiteInfo(domain) {
        if (!siteModels.SiteInfo.isValidDomain(domain)) {
            return Promise.reject('Invalid domain');
        }

        return SiteInfo.findByIdAndRemove(domain);
    }

    function deleteSiteContents(domain) {
        if (!siteModels.SiteInfo.isValidDomain(domain)) {
            return Promise.reject('Invalid domain');
        }

        return SiteContents.findByIdAndRemove(domain);
    }

    this.saveSite = function (site, overwrite) {
        if (overwrite === undefined) {
            overwrite = true;
        }

        return saveSiteInfo(site.info, overwrite)
            .then(() => saveSiteContents(site.info.domain, site.contents, overwrite));
    };

    this.updateSiteInfo = function (siteInfo) {
        return saveSiteInfo(siteInfo, true, true);
    };

    this.getSite = function (domain, includeContents, contentsTimeStamp) {
        var site = new siteModels.Site();
        return getSiteInfo(domain)
            .then(info => {
                site.info = info;

                if (info && includeContents && ((contentsTimeStamp == null) || (site.info.statusTime == null) ||
                    (contentsTimeStamp != site.info.statusTime.getTime()))) {
                    return getSiteContents(domain);
                }
            })
            .then(contents => {
                if (contents) {
                    site.contents = contents;
                }

                return site.info ? site : null;
            });
    };

    this.removeSite = function (domain) {
        if (!siteModels.SiteInfo.isValidDomain(domain)) {
            return Promise.reject('Invalid domain');
        }

        return deleteSiteInfo(domain)
            .then(() => deleteSiteContents(domain));
    };

    this.siteExists = function () {
        if (!siteModels.SiteInfo.isValidDomain(domain)) {
            return Promise.resolve(false);
        }

        return getSiteInfo()
            .then(info => !!info);
    };

    this.queueSiteForProcessing = function (domain)
    {
        queueAddCount++;

        return queuePromise
            .then(queue => {
                return queue.addAsync(domain)
                    .then(res => {
                        if (queueAddCount > 1000) {
                            queueAddCount = 0;
                            return queue.cleanAsync()
                                .then(() => res);
                        }
                        else {
                            return res;
                        }
                    });
            });
    };

    this.getProcessQueueSize = function ()
    {
        return queuePromise
            .then(queue => queue.sizeAsync());
    };

    this.getNextSiteForProcessing = function ()
    {
        return queuePromise
            .then(queue => {
                return queue.getAsync()
                    .then(msg => {
                        if (msg && msg.id) {
                            return queue.ackAsync(msg.ack)
                                .then(() => msg.payload);
                        }
                        else {
                            return null;
                        }
                    });
            });
    }
};

module.exports = SiteRepository;