"use strict";

var mongoose = require('mongoose'),
    Schema = mongoose.Schema;

// Schemas
var pageSchema = new Schema({
    id: Number,
    url: String,
    title: String,
    distanceFromRoot: Number,
    httpStatus: Number,
    status: Number,
    linksTo: [Number]
}, {
    _id: false
});

var siteInfoSchema = new Schema({
    _id: String,
    progress: Number,
    status: Number,
    statusDescription: String,
    statusTime: Date,
    pageCount: Number,
    linkCount: Number,
    refreshEnabled: Boolean
});

var siteContentsSchema = new Schema({
    _id: String,
    pages: [pageSchema]
});

// Models
exports.SiteInfo = mongoose.model('SiteInfo', siteInfoSchema, 'siteinfo');
exports.SiteContents = mongoose.model('SiteContents', siteContentsSchema, 'sitecontents');