var express = require('express');
var router = express.Router();
var siteModels = require('../../models/site-models');

// Home page
router.get('/', function (req, res) {
    res.render('root/index', {});
});

router.post('/', function (req, res) {
    var domain = siteModels.SiteInfo.normalizeDomain(req.body.domain);
    if (domain) {
        res.redirect('/map/' + encodeURIComponent(domain));
    }
});

// About page
router.get('/about', function (req, res) {
    res.render('root/about', {});
});

// Crawler page
router.get('/crawler', function (req, res) {
    res.render('root/crawler', {});
});

module.exports = router;
