"use strict";

var nconf = require('nconf');
var path = require('path');

nconf.argv()
    .env();

if (nconf.get('NODE_ENV') == 'production') {
    nconf.file('production', { file: path.join(__dirname, 'config-prod.json') });
}
else {
    nconf.file('development', { file: path.join(__dirname, 'config-dev.json') });
}

nconf.file({ file: path.join(__dirname, 'config.json') });

module.exports = nconf;