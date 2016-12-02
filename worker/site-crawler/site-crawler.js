"use strict";

module.exports = SiteCrawler;

var $ = require('cheerio');
var _ = require('lodash');
var Promise = require('bluebird');
var requestretry = require('requestretry');
var urlModule = require('url');
var robots = require('robots');
var iconv = require('iconv-lite');
var charset = require('charset');
var jschardet = require('jschardet');
var siteModels = require('../../models/site-models');
var log = require('../../infrastructure/logger')('worker');

function SiteCrawler(domain, siteRepository, config) {
    var self = this;

    if (!siteModels.SiteInfo.isValidDomain(domain)) {
        throw new Error("Invalid domain");
    }

    if (siteRepository == null) {
        throw new Error("siteRepository is null");
    }

    var _desiredNumberOfPages = (config && config.desiredNumberOfPages) || 220;
    var _crawlDelay = (config && config.crawlDelay) || 100;
    var _maxSimultaneousRequests = (config && config.maxSimultaneousRequests) || 20;
    var _siteRepository = siteRepository;

    var _domain = domain;
    var _rawDomain = _domain.startsWith("www.") ? _domain.substring(4) : _domain;

    this.getDomain = function () {
        return _domain;
    };

    var _site;
    var _pageTasks;
    var _pageCache;
    var _processedPages;
    var _lastProcessedPages;
    var _lastSavedPages;
    var _processingProblemDescription;
    var _binaryExtensions = "arc arj bin com csv dll exe gz pdf rar tar txt zip bz2 cab msi gif jpg jpeg png mpeg mpg iso js css";
    _binaryExtensions = ' ' + _binaryExtensions + ' ';
    var _cannotProcessRoot;
    var _connectionProblem;
    var _robotsTxtProblem;
    var _cancellationRequested = false;
    var _robotsParser;
    var _crawlingPromise;

    Object.defineProperty(this, 'crawlingPromise', {
        get: function() {
            return _crawlingPromise;
        },
        enumerable: true
    });

    this.crawl = function () {
        _site = new siteModels.Site();
        _site.info.domain = _domain;
        _site.info.status = siteModels.SiteStatus.Processing;
        _site.contents = new siteModels.SiteContents();
        _pageCache = {};
        _processingProblemDescription = null;
        _processedPages = 0;
        _lastProcessedPages = 0;
        _lastSavedPages = 0;
        _cannotProcessRoot = false;
        _connectionProblem = false;
        _robotsTxtProblem = false;
        _pageTasks = [];

        log.info('Crawler (%s): Starting processing domain', domain);

        return _crawlingPromise = saveSite()
            .catch(() => {})
            .then(() => retrieveRobotsTxt())
            .catch(() => {})
            .then(() => {
                if (_cancellationRequested) {
                    return _siteRepository.removeSite(_domain)
                        .then(() => {
                            log.info('Crawler (%s): Cancellation requested, deleted site', _domain);
                            return null;
                        })
                        .catch(() => {
                            log.info('Crawler (%s): Cancellation requested, delete site failed', _domain);
                            return null;
                        });
                }

                var rootPage = addPage("http://" + _domain + "/");
                rootPage.distanceFromRoot = 0;

                return addAndProcessPages()
                    .then(() => {
                        if (_cancellationRequested) {
                            return _siteRepository.removeSite(_domain)
                                .then(() => {
                                    log.info('Crawler (%s): Cancellation requested, deleted site', _domain);
                                    return null;
                                })
                                .catch(() => {
                                    log.info('Crawler (%s): Cancellation requested, delete site failed', _domain);
                                    return null;
                                });
                        }
                        else {
                            if (_connectionProblem) {
                                _site.info.status = siteModels.SiteStatus.ConnectionProblem;
                            }
                            else if (_robotsTxtProblem) {
                                _site.info.status = siteModels.SiteStatus.RobotsTxtProblem;
                            }
                            else {
                                _site.info.status = _processingProblemDescription ? siteModels.SiteStatus.Processed : siteModels.SiteStatus.ProcessedWithProblems;
                            }

                            _site.info.statusDescription = _processingProblemDescription;
                            return saveSite()
                                .then(savedSite => {
                                    log.info('Crawler (%s): finished processing domain, saved %d pages and %d links',
                                        _domain, savedSite.info.pageCount, savedSite.info.linkCount);

                                    return savedSite;
                                })
                                .catch(error => {
                                    log.info('Crawler (%s): finished processing domain, save failed',
                                        _domain);

                                    throw 'Saving site failed';
                                });
                        }
                    });
            });
    };

    this.cancelProcessing = function () {
        _cancellationRequested = true;
        log.info('Crawler (%s): cancellation requested', _domain);
    };

    function addAndProcessPages() {
        if (!_cancellationRequested) {
            if (_processedPages > _lastProcessedPages + 20) {
                return saveSite()
                    .catch(() => {})
                    .then(() => {
                        _lastProcessedPages = _processedPages;
                        return addAndProcessPages();
                    });
            }

            return addPagesForProcessing()
                .then((res) => {
                    if (res || (_pageTasks.length > 0)) {
                        if (_pageTasks.length > 0) {
                            return Promise.race(_pageTasks)
                                .then(addAndProcessPages)
                        }
                        else {
                            return Promise.delay(_crawlDelay)
                                .then(addAndProcessPages);
                        }
                    }
                    else {
                        return _site;
                    }
                });
        }
    }

    function addPagesForProcessing() {
        var added = false;
        var pagesToAdd = [];
        var pagesToAddCount;

        if ((_lastSavedPages >= _desiredNumberOfPages) || (_processedPages >= _desiredNumberOfPages * 2)) {
            return Promise.resolve(added);
        }

        pagesToAddCount = _maxSimultaneousRequests - _pageTasks.length;
        if (pagesToAddCount > 0) {
            pagesToAdd = _site.contents.pages
                .filter(p => p.status == siteModels.PageStatus.Unprocessed)
                .sort((a, b) => a.distanceFromRoot - b.distanceFromRoot)
                .slice(0, pagesToAddCount);
        }
        else {
            return Promise.resolve(added);
        }

        return Promise.each(pagesToAdd, page => {
            page.status = siteModels.PageStatus.Processing;
            var promise = null;
            promise = processSinglePage(page)
                .then(() => _.pull( _pageTasks, promise));
            _pageTasks.push(promise);

            added = true;

            return Promise.delay(_crawlDelay);
        }).then(() => added);
    }

    function isSuccessHttpStatusCode(statusCode) {
        return (statusCode >= 200) && (statusCode <= 299);
    }

    function isRedirectHttpStatusCode(statusCode) {
        return (statusCode >= 300) && (statusCode <= 399);
    }

    function isErrorHttpStatusCode(statusCode) {
        return (statusCode >= 400) && (statusCode <= 599);
    }

    function processSinglePage(page) {
        return new Promise(function (resolve, reject) {
            if (_cancellationRequested) {
                return resolve();
            }

            if (page.status != siteModels.PageStatus.Processing) {
                return resolve();
            }

            _processedPages++;
            if (_processedPages > _desiredNumberOfPages * 2) {
                return resolve();
            }

            var url = urlModule.parse(page.url);

            // Checking if robots.txt allows spider to process the page
            if (_robotsParser && !_robotsParser.canFetchSync(SiteCrawler.userAgent, url.path)) {
                page.status = siteModels.PageStatus.UnprocessedBecauseOfRobotsTxt;
                if (page.id === 0) { // Root
                    _cannotProcessRoot = true;
                    _robotsTxtProblem = true;
                    _processingProblemDescription = "Cannot process the site because of the robots.txt settings";
                }
                return resolve();
            }

            // Retrieving page
            var links;

            var requestOptions = {
                method: 'GET',
                url: page.url,
                timeout: 40 * 1000,
                followRedirect: false,
                encoding: null, // body will be binary instead of string
                headers: {
                    'User-Agent': SiteCrawler.userAgent
                },
                // retry settings
                maxAttempts: 3,
                retryDelay: 5000,
                retryStrategy: requestretry.RetryStrategies.NetworkError
            };

            requestretry(requestOptions, function (error, response, body) {
                if (error || isErrorHttpStatusCode(response.statusCode)) {
                    if (response && response.statusCode) {
                        page.httpStatus = response.statusCode;
                    }

                    page.status = siteModels.PageStatus.Error;

                    if (page.id === 0) { // Root
                        _cannotProcessRoot = true;
                        _connectionProblem = !!error;
                        _processingProblemDescription = 'Cannot get the home page of this site';
                    }

                    return resolve();
                }

                // Parsing page
                var title = '';
                page.httpStatus = response.statusCode;

                if ((page.httpStatus == 301) || (page.httpStatus == 302) || (page.httpStatus == 303) || (page.httpStatus == 307) || (page.httpStatus == 308)) {
                    links = new Set();

                    var location = response.headers.location;
                    if (location) {
                        var link = urlModule.resolve(page.url, location);

                        if ((page.id === 0) && isExternalLink((link))) { // Root
                            _cannotProcessRoot = true;
                            _processingProblemDescription = "Home page of this site is redirected to another domain (" + link + ")";
                        }

                        if (link) {
                            links.add(link);
                        }
                    }
                }
                else if ((page.httpStatus >= 200) && (page.httpStatus <= 299)) {
                    var contentType = (response.headers['content-type'] || '').toLowerCase();
                    if (!contentType.startsWith('text/html') && !contentType.startsWith('application/xhtml+xml')) {
                        page.status = siteModels.PageStatus.Binary;

                        if (page.id == 0) { // Root
                            _cannotProcessRoot = true;
                            _processingProblemDescription = "Cannot get the home page of this site";
                        }

                        return resolve();
                    }

                    var linkResult = getLinksAndTitleFromHtmlDocument(body, response.headers, page.url);
                    links = linkResult.links;
                    title = linkResult.title;
                }
                else if (page.id == 0) // Root
                {
                    _cannotProcessRoot = true;
                    _processingProblemDescription = "Cannot get the home page of this site";
                }

                // Adding links
                if (links && (links.size > 0)) {
                    var linkHash = new Set();
                    links.forEach(link => {
                       if (!isExternalLink(link) && !hasBinaryExtension(link)) {
                           linkHash.add(link);
                       }
                    });

                    processAddedLinks(page, linkHash);
                }

                page.status = siteModels.PageStatus.Processed;
                page.title = title;

                return resolve();
            });
        });
    }

    function getLinksAndTitleFromHtmlDocument(body, headers, url) {
        var title = '';
        var links = new Set();
        var currentUrl = url;
        var baseUrl = url;

        var html;
        try {
            var encoding = charset(headers, body);
            encoding = encoding || jschardet.detect(body).encoding.toLowerCase();
            html = $.load(iconv.decode(body, encoding));
        }
        catch (ex) {
            html = $.load(body);
        }

        // Getting base URL if specified on page
        var st = html('head>base').attr('href');
        if (st) {
            st = _.trim(st, ' /');
            if (!st.toLowerCase().startsWith('http://') && !st.toLowerCase().startsWith('https://')) {
                st = 'http://' + st;
            }
            baseUrl = st;
        }

        // Getting title
        title = html('head>title').text();

        // Getting links
        var rawUrls = [];

        html('a').each(function (i, elem) {
            var href = $(elem).attr('href');

            if (href) {
                rawUrls.push(href);
            }
        });

        html('frameset>frame').each(function (i, elem) {
            var src = $(elem).attr('src');

            if (src) {
                rawUrls.push(src);
            }
        });

        rawUrls.forEach(url => {
            if (!url.trim().toLowerCase().startsWith('javascript')) {
                var link = urlModule.resolve(baseUrl, url);
                if (link && (link != currentUrl)) {
                    var iHash = link.indexOf('#');
                    if (iHash != -1) {
                        link = link.substring(0, iHash);
                    }

                    if (((link.toLowerCase().startsWith("http://") || (link.toLowerCase().startsWith("https://")) && !links.has(link)))) {
                        links.add(link);
                    }
                }
            }
        });

        return {
            links,
            title
        };
    }

    function hasBinaryExtension(url) {
        var parsedUrl = urlModule.parse(url);

        if (parsedUrl && parsedUrl.pathname) {
            var st = parsedUrl.pathname;
            var i = st.lastIndexOf('.');
            if (i > 0) {
                st = st.substring(i + 1);
                return st && _binaryExtensions.includes(' ' + st.toLowerCase() + ' ');
            }
        }

        return false;
    }

    function processAddedLinks(page, links) {
        links.forEach(link => {
            var linkedPage = getPage(link);

            if (linkedPage != page) {
                if (linkedPage == null) {
                    linkedPage = addPage(link);
                    linkedPage.distanceFromRoot = page.distanceFromRoot + 1;
                }
                else if (linkedPage.distanceFromRoot > page.distanceFromRoot + 1) {
                    linkedPage.distanceFromRoot = page.distanceFromRoot + 1;
                }

                page.linksTo.push(linkedPage.id);
            }
        });
    }

    function addPage(url) {
        var page = _pageCache[url];

        if (!page) {
            page = new siteModels.Page();
            page.url = url;
            page.id = _site.contents.pages.length;
            page.status = siteModels.PageStatus.Unprocessed;
            _pageCache[url] = page;
            _site.contents.pages.push(page);
        }

        return page;
    }

    function getPage(url) {
        return _pageCache[url];
    }

    function normalizeUrlForDomain(url) {
        var parsedUrl = urlModule.parse(url);
        var st = parsedUrl.host && parsedUrl.host.toLowerCase();

        if (st == _domain) {
            return url;
        }

        // The same domain (+/- www)
        if ((st == _rawDomain) || (st.startsWith("www.") && (st.substring(4) == _rawDomain)))
        {
            var i = url.toLowerCase().indexOf(st);
            if (i != -1)
            {
                url = url.substring(0, i) + _domain + url.substring(i + st.length);
            }
        }

        return url;
    }

    function saveSite() {
        var site = new siteModels.Site();
        site.info.domain = _site.info.domain;
        site.info.progress = (_site.info.status == siteModels.SiteStatus.Processing) ?
            Math.min(99, Math.floor(_processedPages * 100 / (_desiredNumberOfPages * 2))) : 100;
        site.info.status = _site.info.status;
        site.info.statusDescription = _site.info.statusDescription;
        site.info.statusTime = new Date();

        if (_cannotProcessRoot)
        {
            return _siteRepository.saveSite(site)
                .then(() => site);
        }

        // Creating contents
        site.contents = new siteModels.SiteContents();

        var idsToPages = new Map();
        var urlsToPages = new Map();

        // Adding pages to dictionaries
        site.contents.pages = [];
        _site.contents.pages.forEach(page => {
            if ((page.status == siteModels.PageStatus.Processed) || (page.status == siteModels.PageStatus.Error)) {
                var pageToAdd = page.clone();
                idsToPages.set(pageToAdd.id, pageToAdd);
                urlsToPages.set(pageToAdd.url, pageToAdd);
            }
        });

        // Creating link hash
        var linkHash = new Set();
        _site.contents.pages.forEach(page => {
            page.linksTo.forEach(endPageId => {
                if (idsToPages.has(endPageId))
                {
                    var id1 = page.id, id2 = endPageId;

                    var st = normalizeUrlForDomain(page.url);
                    if ((st != page.url) && urlsToPages.has(st)) {
                        id1 = urlsToPages.get(st).id;
                    }

                    var page2 = idsToPages.get(id2);
                    st = normalizeUrlForDomain(page2.url);
                    if ((st != page2.url) && urlsToPages.has(st)) {
                        id2 = urlsToPages.get(st).id;
                    }

                    if (id1 != id2) {
                        linkHash.add(id1 + '-' + id2);
                    }
                }
            });
        });

        // Adding page from this domain
        for (let page of idsToPages.values()) {
            var st = normalizeUrlForDomain(page.url);
            if (st == page.url) {
                site.contents.pages.push(page);
            }
        }

        // Adding non-duplicate pages from the domain with/without www
        for (let page of idsToPages.values()) {
            var st = normalizeUrlForDomain(page.url);
            if (st != page.url) {
                if (!urlsToPages.has(st)) {
                    page.url = st;
                    site.contents.pages.push(page);
                }
                else
                {
                    var existingPage = urlsToPages.get(st);
                    if (!existingPage.title && page.title) {
                        existingPage.title = page.title;
                    }
                }
            }
        }

        // Adding links
        linkHash.forEach(pair => {
            var i = pair.indexOf('-');
            var id1 = Number(pair.substring(0, i));
            var id2 = Number(pair.substring(i + 1));

            var page = idsToPages.get(id1);
            page.linksTo.push(id2);
        });

        for (let page of site.contents.pages) {
            page.linksTo.sort((a, b) => a - b);
        }

        site.info.pageCount = site.contents.pages.length;
        site.info.linkCount = linkHash.size;

        _lastSavedPages = site.info.pageCount;

        site.info.progress = (_site.info.status == siteModels.SiteStatus.Processing) ?
            Math.min(99, Math.floor(site.contents.pages.length * 100 / _desiredNumberOfPages)) : 100;

        return _siteRepository.saveSite(site)
            .then(() => site);
    }

    function getRawDomain(url) {
        var parsedUrl = urlModule.parse(url);

        if (parsedUrl.hostname) {
            var st = parsedUrl.hostname;
            if (st.startsWith('www.')) {
                st = st.substring(4);
            }

            return st;
        }
        else {
            return url;
        }
    }

    function isExternalLink(link) {
        var domain = getRawDomain(link);

        // The same domain (+/- www)
        if (domain === _rawDomain) {
            return false;
        }

        // Subdomain
        var i = domain.lastIndexOf("." + _rawDomain);
        if ((i > 0) && (i == domain.length - _rawDomain.length - 1)) {
            return false;
        }

        // External
        return true;
    }

    function retrieveRobotsTxt() {
        return new Promise(function (resolve, reject) {
            _robotsParser = null;

            var requestOptions = {
                method: 'GET',
                url: 'http://' + _domain + '/robots.txt',
                timeout: 30 * 1000,
                followRedirect: true,
                headers: {
                    'User-Agent': SiteCrawler.userAgent
                },
                // retry settings
                maxAttempts: 3,
                retryDelay: 5000,
                retryStrategy: requestretry.RetryStrategies.NetworkError
            };

            requestretry(requestOptions, function (error, response, body) {
                if (!error && isSuccessHttpStatusCode(response.statusCode) && body) {
                    _robotsParser = new robots.RobotsParser();
                    _robotsParser.parse(body.split(/\r\n|\r|\n/));
                }

                if (!error) {
                    resolve();
                }
                else {
                    reject(error);
                }
            });
        });
    }
}

Object.defineProperty(SiteCrawler, 'userAgent', {
    value: 'Mozilla/5.0 (compatible; VSMCrawler; http://www.visualsitemapper.com/crawler/)'
});

Object.defineProperty(SiteCrawler, 'userAgentForRobotsTxt', {
    value: 'VSMCrawler'
});