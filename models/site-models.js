"use strict";

var validator = require('validator');
var _ = require('lodash');

function defineConstField(obj, name, value) {
    Object.defineProperty(obj, name, {
        value: value,
        writable: false,
        enumerable: true,
        configurable: true
    });
}

// SiteStatus
var SiteStatus = {};
defineConstField(SiteStatus, 'Added', 0);
defineConstField(SiteStatus, 'Processed', 1);
defineConstField(SiteStatus, 'ProcessedWithProblems', 2);
defineConstField(SiteStatus, 'Processing', 3);
defineConstField(SiteStatus, 'ConnectionProblem', 4);
defineConstField(SiteStatus, 'RobotsTxtProblem', 5);

// PageStatus
var PageStatus = {};
defineConstField(PageStatus, 'Unprocessed', 0);
defineConstField(PageStatus, 'Processed', 1);
defineConstField(PageStatus, 'Error', 2);
defineConstField(PageStatus, 'UnprocessedBecauseOfRobotsTxt', 3);
defineConstField(PageStatus, 'Binary', 4);
defineConstField(PageStatus, 'Processing', 5);

// Page
function Page() {
    var self = this;

    this.id = null;
    this.url = null;
    this.title = null;
    this.distanceFromRoot = null;
    this.httpStatus = null;
    this.status = null;
    this.linksTo = [];

    this.clone = function() {
        var clonedPage = new Page();
        clonedPage.id = self.id;
        clonedPage.url = self.url;
        clonedPage.title = self.title;
        clonedPage.distanceFromRoot = self.distanceFromRoot;
        clonedPage.httpStatus = self.httpStatus;
        clonedPage.status = self.status;

        return clonedPage;
    };
}

// SiteInfo
function SiteInfo() {
    this.domain = null;
    this.progress = 0;
    this.status = SiteStatus.Added;
    this.statusDescription = null;
    this.statusTime = new Date();
    this.pageCount = 0;
    this.linkCount = 0;
    this.refreshEnabled = true;
}

SiteInfo.isValidDomain = function (domain) {
    if (domain == null) {
        return false;
    }

    return validator.isFQDN(domain);
};

SiteInfo.normalizeDomain = function (domain)
{
    if (!domain) {
        return null;
    }

    domain = _.trim(domain, ' /').toLowerCase();

    var i = domain.indexOf('://');
    if (i != -1)
    {
        domain = domain.substring(i + 3);
    }

    var i = domain.indexOf('/');
    if (i != -1)
    {
        domain = domain.substring(0, i);
    }

    var i = domain.indexOf('#');
    if (i != -1)
    {
        domain = domain.substring(0, i);
    }

    return domain;
};

// SiteContents
function SiteContents() {
    this.pages = [];
}

// Site
function Site() {
    this.info = new SiteInfo();
    this.contents = new SiteContents();
}

// Exports
exports.SiteStatus = SiteStatus;
exports.PageStatus = PageStatus;
exports.Page = Page;
exports.SiteInfo = SiteInfo;
exports.SiteContents = SiteContents;
exports.Site = Site;