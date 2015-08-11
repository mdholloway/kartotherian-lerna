var purge = require('./index');

var p = new purge('127.0.0.1', 12345, {squidBug: true});

console.log(p);
p.purge('http://127.0.0.1:8080/wiki/Main_Page')
    .then(function() {console.log('WIN')})
    .catch(function() {console.log('FAIL')});
