#!/usr/bin/env python
# Description: Send environment variables with CODE prefix over http/json
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

import collections
import json
import os
import sys
import urllib2

def usage():
    script_name = os.path.basename(sys.argv[0])
    print("Usage: {} http://server/(path)".format(script_name))
    sys.exit(1)

url = ""
if len(sys.argv) > 1:
    url = sys.argv[1]
if not url.startswith('http'):
    usage()

# Build a dict with environment variables beginning with CODE_
def get_code_env():
    PREFIX = 'CODE_'
    code_env = [var for var in os.environ.keys() if var.startswith(PREFIX)]
    values = { var: os.environ[var] for var in code_env }
    return values

# Send all CODE_ environment variables over HTTP; expect JSON back
def send_http_get_json(uri):
    data = json.dumps(get_code_env())
    req = urllib2.Request(uri, data,  {'Content-Type': 'application/json'})
    response = urllib2.urlopen(req)
    result = response.read()
    return collections.defaultdict(lambda: None, json.loads(result))

# Parse response as JSON and return exit code based on verdict
try:
    rv = 0 # return value
    data = send_http_get_json(url)
    # data = {
    #    logs: {'file1.log': ['Log line', 'Another line']},
    #    signals: ['SIGSEGV'],
    #    verdict: 'fail'
    # }
    if data['logs']:
        assert data['logs'].__class__ == dict
        for name, lines in data['logs'].items():
            for line in lines:
                print("{}: {}".format(name, line.encode('UTF-8')))
    if data['signals']:
        print "Crashed on signal: {}".format(" ".join(data['signals']))
    if data['verdict'] == 'fail':
        # Retun failure exit code for Defensics; used with "as instrumentation"
        rv = 1
except Exception, e:
    print "Response not in expected format (JSON dictionary)"
    print e
finally:
    sys.exit(rv)
