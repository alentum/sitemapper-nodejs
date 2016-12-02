"use strict";

var siteModels = require('../../models/site-models');

function SiteMapDataModel(site, config) {
    var self = this;

    this.domain = null;
    this.status = null;
    this.processing = false;
    this.contentsTimeStamp = null;
    this.nodes = [];
    this.links = [];

    var maxNodesToShow = (config && config.maxNodesToShow) || 200;

    init(site);

    function getFolder(fileName) {
        var i = fileName.lastIndexOf('/');
        if (i >= 0) {
            return fileName.substring(0, i + 1);
        }
        else {
            return fileName;
        }
    }

    function getSiteStatus(site)
    {
        // Problem with this domain
        if (site == null)
        {
            return 'Cannot get information on this domain';
        }

        if ((site.info.status == siteModels.SiteStatus.Processing) || (site.info.status == siteModels.SiteStatus.Added))
        {
            return "Processing: " + Math.floor(site.info.progress) + "%";
        }

        return null;
    }

    function getErrorByHttpStatus(httpStatus) {
        if (httpStatus == null) {
            return "Cannot retrieve the page";
        }

        if (httpStatus < 400) {
            return null;
        }

        switch (httpStatus) {
            case 400:
                return '400 Bad Request';
            case 401:
                return '401 Unauthorized';
            case 402:
                return '402 Payment Required';
            case 403:
                return '403 Forbidden';
            case 404:
                return '404 Not Found';
            case 405:
                return '405 Method Not Allowed';
            case 406:
                return '406 Not Acceptable';
            case 407:
                return '407 Proxy Authentication Required';
            case 408:
                return '408 Request Timeout';
            case 409:
                return '409 Conflict';
            case 410:
                return '410 Gone';
            case 411:
                return '411 Length Required';
            case 412:
                return '412 Precondition Failed';
            case 413:
                return '413 Request Entity Too Large';
            case 414:
                return '414 Request-URI Too Long';
            case 415:
                return '415 Unsupported Media Type';
            case 416:
                return '416 Requested Range Not Satisfiable';
            case 417:
                return '417 Expectation Failed';
            case 500:
                return '500 Internal Server Error';
            case 501:
                return '501 Not Implemented';
            case 502:
                return '502 Bad Gateway';
            case 503:
                return '503 Service Unavailable';
            case 504:
                return '504 Gateway Timeout';
            case 505:
                return '505 HTTP Version Not Supported';
            case 511:
                return '511 Network Authentication Required';
            default:
                return 'Unknown error';
        }
    }

    function init(site) {
        // Domain & status
        self.domain = site.info.domain;
        self.status = getSiteStatus(site) || site.info.statusDescription;
        self.processing = (site.info.status == siteModels.SiteStatus.Processing) || (site.info.status == siteModels.SiteStatus.Added);
        if (site.info.statusTime) {
            self.contentsTimeStamp = site.info.statusTime.getTime();
        }

        // Nodes & links
        if (!site.contents || !site.contents.pages) {
            site.contents = new siteModels.SiteContents();
        }

        if (site.contents.pages.length == 0) {
            // Error with processing, no pages available
            if (!self.processing) {
                return;
            }

            var page = new siteModels.Page();
            page.id = 0;
            page.url = 'http://' + self.domain + '/';
            page.status = siteModels.PageStatus.Processed;
            page.httpStatus = 0;
            page.distanceFromRoot = 0;

            site.contents.pages.push(page);
        }

        var pages = [];

        // Preparing top pages to show
        var level = 0;
        do
        {
            var currentLevelPages = [];

            site.contents.pages.forEach(page => {
                if ((page.distanceFromRoot == level) ||
                    ((level > 20) && ((page.distanceFromRoot > 20) || (page.distanceFromRoot < 0)))) {
                    currentLevelPages.push(page);
                }
            });

            if (pages.length + currentLevelPages.length <= maxNodesToShow) {
                Array.prototype.push.apply(pages, currentLevelPages);
            }
            else {
                if (pages.length < maxNodesToShow / 2)
                {
                    var i = 0;
                    while (pages.length < maxNodesToShow)
                    {
                        pages.push(currentLevelPages[i]);
                        i++;
                    }
                }

                break;
            }

            level++;
        }
        while (pages.length < site.contents.pages.length);

        // Preparing nodes
        var pageIndexes = new Map();
        var pageGroupes = new Map();
        var index = 0;
        var groupCount = 0;

        pages.forEach(page => {
            var path = getFolder(page.url);

            var group = pageGroupes.get(path);
            if (group === undefined)
            {
                group = groupCount;
                pageGroupes.set(path, group);
                groupCount++;
            }

            var errorInfo = getErrorByHttpStatus(page.httpStatus);

            if (errorInfo) {
                self.nodes.push({
                    title: page.title,
                    url: page.url,
                    group: group,
                    error: errorInfo
                });
            }
            else {
                self.nodes.push({
                    title: page.title,
                    url: page.url,
                    group: group
                });
            }

            pageIndexes.set(page.id, index);
            index++;
        });

        // Links
        site.contents.pages.forEach(page => {
            page.linksTo.forEach(endPageId => {
                var startNodeIndex = pageIndexes.get(page.id);
                var endNodeIndex = pageIndexes.get(endPageId);

                if ((startNodeIndex != null) && (endNodeIndex != null) && (startNodeIndex != endNodeIndex)) {
                    self.links.push({
                        source: startNodeIndex,
                        target: endNodeIndex
                    });
                }
            });
        });

        // Finishing
        if ((self.status == null) && (pages.length < site.contents.pages.length)) {
            self.status = 'Top ' + pages.length + ' pages are shown';
        }
    }
}

exports.SiteMapDataModel = SiteMapDataModel;