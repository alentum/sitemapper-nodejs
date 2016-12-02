var Promise = require('bluebird');

function test1() {
    "use strict";
    return Promise.reject(1);
}

function test() {
    "use strict";
     return test1().then(value => console.log('then: ' + value))
    .finally(function() {
             console.log('finally: ' + arguments)
         });
}

test().then(value => console.log('then: ' + value))
    .catch(value => console.log('catch: ' + value));