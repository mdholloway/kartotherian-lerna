var dgram = require('dgram');
var ipaddr = require('ipaddr.js');
var Promise = require('bluebird');
var pack = require('hipack');

function HtcpPurge(host, port, options) {
    this.host = host;
    this.port = port;
    options = options || {};
    this.httpVersion = options.httpVersion || '1.0';
    this.squidBug = !!options.squidBug;
    this.multicastTTL = options.multicastTTL || 1;
    this.urlPrefix = options.urlPrefix || false;
    this.sequence = 0;
    this.socket = null;

    this.open();
}

HtcpPurge.prototype.open = function (first_argument) {
    var addr = ipaddr.parse(this.host);

    this.socket = dgram.createSocket(addr.kind() === 'ipv6'? 'udp6' : 'udp4');
    this.socket.setMulticastLoopback(0);
    if (this.multicastTTL !== 1) {
        this.socket.setMulticastTTL(this.multicastTTL);
    }
};

HtcpPurge.prototype.purge = function(url) {
    var buf = this.buildPacket(url),
        self = this; // Fuck you, JS

    return new Promise(function(resolve, reject) {
        self.socket.send(buf, 0, buf.length, self.port, self.host, function(err) {
            if (err) {
                reject(err);
            } else {
                resolve();
            }
        });
    });
};

HtcpPurge.prototype.buildPacket = function (url) {
    var res,
        specifier = this.buildSpecifier(url),
        htcpDataLen = 8 + 2 + specifier.length,
        htcpLen = 4 + htcpDataLen + 2;

    /* Example MediaWiki output:
    string(72) "HBHEAD$http://127.0.0.1:8080/wiki/Main_PageHTTP/1.0"
    00480000004204000000000000000004484541440024687474703a2f2f3132372e302e302e313a383038302f77696b692f4d61696e5f506167650008485454502f312e3000000002
    */

    // Squid implementation is non-conformant WRT bit order in the first word
    if (this.squidBug) {
        res = pack.pack('nxxnCxNxxa*n', [
            htcpLen,
            htcpDataLen,
            4, // HTCP operation CLR
            this.sequence++,
            specifier.toString('binary'),
            2
        ]);
    } else {
        throw new Error('Not implemented');
    }

    return res;
};

HtcpPurge.prototype.buildSpecifier = function (url) {
    var http = 'HTTP/' + this.httpVersion;

    if (this.urlPrefix) {
        url = this.urlPrefix + url;
    }
    return pack.pack('na4na*na*n', [
        4,
        'HEAD',
        url.length,
        url,
        http.length,
        http,
        0
    ]);
};

module.exports = HtcpPurge;
