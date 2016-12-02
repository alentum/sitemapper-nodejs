"use strict";

var SiteCrawler = require('../site-crawler.js');

//var siteDomain = process.argv[2];
var siteDomain = 'www.alentum.com';

var SiteRepository = require('../../../data-access/site-repository');
var siteRepository = new SiteRepository();

var siteCrawler = new SiteCrawler(siteDomain, siteRepository);
siteCrawler.crawl()
    .then(site => console.log(JSON.stringify(site, null, 4)))
    .catch(err => console.log('Cannot process site: %s', err))
    .finally(() => siteRepository.close());