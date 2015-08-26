var purge = require('./index');

var p = new purge('127.0.0.1', 1234, {squidBug: true});

p.open().then(function() {
    p.purge('http://127.0.0.1:8080/wiki/Main_Page')
        .then(function() {
            console.log('WIN');
        })
        .catch(function() {
            console.log('FAIL');
        })
        .finally(function() {
            process.exit();
        });
});
