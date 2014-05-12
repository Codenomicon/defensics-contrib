#!/usr/bin/env node
/*
Description: TCP persistent connection instrumentation

Copyright (c) 2014
     Codenomicon Ltd. All rights reserved.

Redistribution and use in source and binary forms, with or without
modification, are permitted provided that the following conditions are met:

1. Redistributions of source code must retain the above copyright notice, this
   list of conditions and the following disclaimer.
2. Redistributions in binary form must reproduce the above copyright notice,
   this list of conditions and the following disclaimer in the documentation
   and/or other materials provided with the distribution.

THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND
ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED
WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT OWNER OR CONTRIBUTORS BE LIABLE FOR
ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES
(INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES;
LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND
ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT
(INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS
SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.

--

This application uses TCP echo service to monitor that a TCP connection remains
open and traffic flows. If traffic flow is interrupted, a failure will be
reported. This can be useful for testing ALGs; if valid connection is terminated
during fuzzing, that is an indication of a critical issue.

To run this instrumentation service:

  node agent-tcp-instrument.js 10.0.0.5

The target should be running an echo service on port 1337 and should be either
on the SUT or traffic to target should pass through the SUT so that failure is
detected.

The server returns verdict pass or fail over JSON/HTTP interfaces as per
interface documentation.
*/

var net = require('net');

var PORT = 8000; // Port to listen on

var INTERVAL = 100;         // Interval to send echo, ms
var TIMEOUT = INTERVAL * 3; // Timeout period


var Client = function() {
    // Timeout timer
    var timer;

    // Timedout is true when we are in timeout, reset on new data
    var timedout = true;
    // Failure is true after timeout, reset after failure is reported
    var failure = false;

    var _host, _port;

    var socket = new net.Socket();

    var connect = function(host, port) {
        _host = host;
        _port = port;
        timer = setTimeout(timeouthandler, TIMEOUT);
        reconnect();
    };

    var reconnect = function() {
        console.log("Connecting to " + _host + ":" + _port);
        socket.connect(_port, _host);
    }

    var disconnect = function() {
        socket.destroy();
    };

    var timeouthandler = function() {
        console.log("TIMEOUT: " + new Date().toString());
        timedout = true;
        failure = true;
    };

    var is_failure = function() {
        var result = failure;
        failure = timedout;
        return result;
    }

    // Set up event handlers

    // Start echo loop by sending an initial message
    socket.on('connect', function(){
        socket.write("Hello");
    });

    // On data received, reset timeout
    socket.on('data', function(data) {
        if (timedout) {
            console.log("OK: " + new Date().toString());
            timedout = false;
        }

        // After INTERVAL, send a new message and reset timer
        setTimeout(function() {
            socket.write('A');
            clearTimeout(timer);
            timer = setTimeout(timeouthandler, TIMEOUT);
        }, INTERVAL);
    });

    // If we get disconnected, reconnect
    socket.on('close', function() {
        failure = true;
        setTimeout(function () {
            reconnect();
        }, 100); //ms
    });

    // Do nothing on errors
    socket.on('error', function() {});

    // Return Client public methods
    return {
        'connect': connect,
        'disconnect': disconnect,
        'is_failure': is_failure,
    };
};

var usage = function () {
    console.error('Usage:');
    console.error('  node agent-tcp-instrument.js 10.1.2.3');
    console.error('');
    console.error('Replace 10.1.2.3 with the address for the echo server');
};

// main
var main = function () {
    // Get target IP address from commandline or use localhost
    var host = process.argv[2];
    var port = 7777;
    
    if (!host) {
        usage();
        process.exit(1);
    }

    // Initialize a new client
    var client = Client();
    client.connect(host, port);


    /// HTTP interface
    var http = require('http');
    http.createServer(function (req, res) {
        resdata = {
            'verdict': client.is_failure() ? 'fail' : 'pass',
        };
        res.writeHead(200, {'Content-Type': 'application/json'});
        res.end(JSON.stringify(resdata));
    }).listen(PORT, '0.0.0.0');
    console.log('HTTP running at port ' + PORT);
};

main();
