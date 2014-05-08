#!/usr/bin/env python
# Description: Log tailing server
#
# Copyright (c) 2014
#      Codenomicon Ltd. All rights reserved.
#
# Redistribution and use in source and binary forms, with or without
# modification, are permitted provided that the following conditions are met:
#
# 1. Redistributions of source code must retain the above copyright notice, this
#    list of conditions and the following disclaimer.
# 2. Redistributions in binary form must reproduce the above copyright notice,
#    this list of conditions and the following disclaimer in the documentation
#    and/or other materials provided with the distribution.
#
# THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS"
# AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE
# IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
# DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT OWNER OR CONTRIBUTORS BE LIABLE
# FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL
# DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR
# SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER
# CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY,
# OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE
# OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
#
# --
#
# Tail N log files and return latest lines over a JSON/HTTP interface
# Requires Python 2.7

import BaseHTTPServer
import os.path
import sys
import time

try:
    import json
except ImportError:
    try:
        import simplejson as json
    except ImportError:
        print "Python 2.7 or simplejson is required to run this."
        sys.exit(1)

SCRIPT_NAME = os.path.basename(sys.argv[0])
NAME = 'Instrumentation HTTP Server'
PORT = 8000

def usage():
    print "Usage: agent-logtailer.py <log1> <log2> ... <logN>"
    print "  (1..N log files)"

def follow(thefile):
    thefile.seek(0,2)
    lines = []
    while True:
        line = thefile.readline().rstrip()
        # Ignore invalid UTF-8
        line = line.decode("UTF-8", 'replace')
        if line:
            lines.append(line)
        else:
            yield lines
            lines = []

def any_log_lines(logdict):
    '''Return true if any of the log files has non-empty lines'''
    return any(map(lambda x: x[1], logdict.items()))

class InstrumentHandler(BaseHTTPServer.BaseHTTPRequestHandler):

    files = []

    def loglines(self):
        '''Get all new lines from each log and return dict with result'''
        d = {}
        for name, follower in InstrumentHandler.files:
            d[name] = follower.next()
        return d


    def do_GET(self):
        '''Handle HTTP request'''
        if self.path == '/':
            self.send_response(200)

            self.send_header('Content-type', 'application/json')
            self.end_headers()
            logdict = self.loglines()
            # If new log lines seen, mark verdict fail
            if any_log_lines(logdict):
                verdict = 'fail'
            else:
                verdict = 'pass'
            response = {
                'logs': logdict,
                'verdict': verdict,
            }
            self.wfile.write(json.dumps(response))
        else:
            self.send_response(404)
            self.end_headers()
            self.wfile.write("Not found\n")

    # Same logic for POST as GET. Ignore POST content.
    do_POST = do_GET

def main():
    # List of files to watch from command line
    watch_files = sys.argv[1:]
    if not watch_files:
        usage()
        sys.exit(1)

    print "Watching %d log files" % len(watch_files)

    # Open files
    InstrumentHandler.files = [(name, follow(open(name)))
                                    for name in watch_files]

    # Start server
    server = BaseHTTPServer.HTTPServer(('', PORT), InstrumentHandler)
    print "Started %s on port %s" % (NAME, PORT)
    server.serve_forever()

if __name__ == '__main__':
    main()
