/*
Description: Client testing agent (HTTP/json)

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

---

Usage: agent-client-tester.js <client-application-cmdline>

Target URIs:

http://localhost:8000/api/:command   where :command is one of:

                        before-run
                        before-case
                        instrumentation
                        after-run
*/

var argv = require('minimist')(process.argv.slice(2));

var net = require('net'),
    url = require('url'),
    util = require('util'),
    spawn = require('child_process').spawn;

// My name
var NAME = 'agent-client-tester.js';

// Log debug output?
var debug = false;

// If true; wait for "before-case" trigger before starting client.
// If false; run client in a loop without waiting for trigger
var SINGLESTEP = true;

// Kill application if not completed within MAX_EXECUTION_TIME
var MAX_EXECUTION_TIME = 8000; //ms

// Command line arguments. Default defined here.
var CMD = null;  // client command
var ARGS = [];   // client arguments
var PORT = 8000; // HTTP port to listen on
var VERBOSE = false;

// Log debug output if debug enabled
var DEBUG = function(msg) {
    if (debug) {
        console.log(msg);
    }
};

// Client application handler (kill on timeout)
var Process = function(cmd, args, timeout) {
    var _timeout_timer, _process, _autorestart;
    var _output = "";
    // These are arrays because in principle we might run client
    // more than once if not singlestepping
    var _exit_codes = [];
    var _signals = [];
    
    // Start looping
    var start = function() {
        _autorestart = true;
        _startProcess();
    };

    // Just trigger process start once
    var step = function() {
        _startProcess();
    };

    // Process start logic
    var _startProcess = function () {
        if (_process) {
            // Already running - kill previous process - ignore
            _process.kill();
        }

        // Start process
        _process = spawn(cmd, args);

        // Capture process stdout and stderr in one log string
        // Must be cleared time to time to not run out of memory
        var _output_logline = function(msg) {
            _output = _output + msg;
        };
        _process.stderr.on('data', _output_logline);
        _process.stdout.on('data', _output_logline);
        _process.stderr.setEncoding('utf8');
        _process.stdout.setEncoding('utf8');

        DEBUG("Spawned pid: " + _process.pid);

        // Not sure what triggers errors; log them and find out.
        _process.on('error', function(error) {
            console.log('ERROR: ' + error);
        });

        // When process exits, check why
        _process.on('exit', function(code, signal) {
            // Don't timeout if it already exited
            clearTimeout(_timeout_timer);

            DEBUG('EXITED: code ' + code + " signal " + signal);

            // If exited normally, store the exit code
            if (code) {
                _exit_codes.push(code);
            }
            // If crashed, store the signal it died with
            if (signal) {
                _signals.push(signal);
            }

            // Restart process
            _process = null;
            var crash_delay = 0;
            if (signal) {
                // Slow down if we crashed...
                crash_delay = 1000; //ms
                DEBUG('Child crashed ' + signal);
            }
            // If looping, start again. Otherwise wait for step.
            if (_autorestart) {
                setTimeout(_startProcess, crash_delay);
            }
        });

        // Finally set a timeout handler if we have a timeout.
        if (timeout) {
            _timeout_timer = setTimeout(_timeoutHandler, timeout);
        }
    };

    var _timeoutHandler = function () {
        if (_process) {
            console.log("MAX_EXECUTION_TIME; pid: " + _process.pid);
        } else {
            console.log("MAX_EXECUTION_TIME");
        }
        _signals.push('TIMEOUT');
        _process.kill('SIGKILL');
    }

    var stop = function () {
        _autorestart = false;
        if (_process) {
            _process.kill('SIGKILL');
        }
    }

    var clearLog = function () {
        _output = "";
        _exit_codes = [];
        _signals = [];
    }

    var log = function () { return _output; };
    var signals = function () { return _signals; };

    // Return Client public methods
    return {
        'start': start,
        'stop': stop,
        'clearLog': clearLog,
        'log': log,
        'signals': signals,
        'step': step,
    };
};

var usage = function() {
    console.log('Usage: node agent-client-tester.js [-p port] [-v] -- client-command-line');
    console.log('  -p port : listening port, default is 8000');
    console.log('  -v : verbose output');
};


// Main routine: initialize

// Parse command line

if (argv.p) {
    PORT = parseInt(argv.p);
    if (!(PORT > 0 && PORT < 65536)) {
        usage();
        process.exit(1);
    }
}
if (argv.v) {
    VERBOSE = true;
}

// Target command from command line
if (argv._.length > 0) {
    CMD = argv._[0];
    ARGS = argv._.slice(1);
}
if (!CMD) {
    usage();
    process.exit(1);
}

// Initialize process but don't start yet 
var client = Process(CMD, ARGS, MAX_EXECUTION_TIME);
console.log(util.format('Client cmdline: "%s %s"', CMD, ARGS.join(" ")));

/// HTTP interface
var express = require('express');
var http = express();
http.use(express.json()); // Parse HTTP POST

// Define API
http.post('/api/:command', function(req, res){
    // Response data
    rdata = {};
    if (req.is('json')) {
        DEBUG(req.params.command);
        switch (req.params.command) {
        case 'before-run':
            // If not stepping, start looping the client here
            if (!SINGLESTEP) {
                client.start();
                client.clearLog();
            }
            break;
        case 'before-case':
            // If stepping, trigger start here. Otherwise nothing.
            if (SINGLESTEP) {
		if (VERBOSE)
	            console.log('Test case ' + req.body.CODE_TEST_CASE);
                // Short wait before starting the client to make sure
                // fuzzer is ready to accept connection.
                setTimeout(function () {
                    client.step();
                    client.clearLog();
                }, 100); // ms
            }
            break;
        case 'instrumentation':
            // Return log and signals in JSON response
            rdata['logs'] = {'SUT': [client.log()]};
            rdata['signals'] = client.signals();

            // If we have fatal signals, mark verdict fail
            if (client.signals().length > 0) {
                rdata['verdict'] = 'fail'
                console.log('TEST CASE #' + req.body.CODE_TEST_CASE + ' fail ' + client.signals());
            } else {
                rdata['verdict'] = 'pass'
            }

            // Clear log now that we already returned it.
            client.clearLog();
            break;
        case 'after-case':
        case 'after-run':
            // Kill client just in case, especially if it was looping
            client.stop();
            break;
        }
    } else {
        console.log('Request must be json for this API');
    }
    res.json(rdata);
});

http.listen(PORT);
console.log("Listening on port " + PORT);
