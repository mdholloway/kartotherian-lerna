var dgram = require('dgram');
var ipaddr = require('ipaddr.js');
var BBPromise = require('bluebird');
var pack = require('hipack');

BBPromise.promisifyAll(dgram.Socket.prototype);

/**
 * HtcpPurge constructor
 *
 * @param {string} host Destination IP address
 * @param {int} port Destination port
 * @param {object} options:
 */
function HtcpPurge(host, port, options) {
    this.host = host;
    this.port = port;
    options = options || {};
    this.httpVersion = options.httpVersion || '1.0';
    this.squidBug = !!options.squidBug;
    this.multicastTTL = options.multicastTTL || 1;
    this.urlPrefix = options.urlPrefix || false;
    this.sequence = 0;
}

/**
 * Creates an underlying socket and prepares it for multicasts
 * @return {Promise}
 */
HtcpPurge.prototype.open = function() {
    var addr = ipaddr.parse(this.host),
        self = this;

    this.socket = dgram.createSocket(addr.kind() === 'ipv6'? 'udp6' : 'udp4');
    return this.socket.bindAsync({}).then(function() {
        self.socket.setMulticastLoopback(0);
        if (self.multicastTTL !== 1) {
            self.socket.setMulticastTTL(multicastTTL);
        }
    });
};


/**
 * Performs a purge
 *
 * @param {string} url URL to be purged
 * @return {Promise}
 */
HtcpPurge.prototype.purge = function(url) {
    var buf = this._buildPacket(url);

    return this.socket.sendAsync(buf, 0, buf.length, this.port, this.host);
};

/**
 * Builds a HTCP packet
 *
 * @param {string} url URL to purge
 * @return {Buffer}
 */
HtcpPurge.prototype._buildPacket = function (url) {
    var res,
        specifier = this._buildSpecifier(url),
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

/**
 * Builds a HTCP packet specifier, see RFC 2756, chapter 3.2
 *
 * @param {string} url URL to purge
 * @return {Buffer}
 */
HtcpPurge.prototype._buildSpecifier = function (url) {
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
