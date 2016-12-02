"use strict";

var express = require('express');
var router = express.Router();
var bindingModels = require('../binding-models/binding-models');

function noCache(req, res, next) {
    res.header('Cache-Control', 'private, no-cache, no-store, must-revalidate');
    res.header('Expires', '-1');
    res.header('Pragma', 'no-cache');
    next();
}

// show map
router.get('/map/:domain', function (req, res, next) {
    if (!req.params.domain) {
        // Not found, going to 404 handler
        next();
    }

    res.render('map/index', {
        domain: req.params.domain
    });
});

router.get('/mapdata/:domain', noCache, function (req, res, next) {
    if (!req.params.domain) {
        // Not found, going to 404 handler
        next();
    }

    // JSON data
    req.app.get('mappingClient').getSite(req.params.domain, true, req.params.contentsTimeStamp)
        .then(site => {
            if (site == null) {
                // error 404
                next();
            }

            var data;

            try {
                data = new bindingModels.SiteMapDataModel(site, {
                    maxNodesToShow: req.app.get('appConfig').get('mapper:maxNodesToShow')
                });
            }
            catch (ex) {
                data = null;
            }

            if (data != null) {
                return res.json(data);
            }
            else {
                return res.status(500).send('Internal error');
            }
        })
        .catch(() => res.status(500).send('Internal error'));
});

module.exports = router;
