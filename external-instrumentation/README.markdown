# External instrumentation scripts #

Defensics has a powerful framework for hooking scripts for
either instrumenting the [SUT][sut] or controlling it. For
example, **Execute when instrument fails** can be used to
restore operation of a crashed test target that does not
recover from the failure on its own.

![Screenshot: Defensics External Instrumentation Settings][ext]

The hooks supported in Defensics 11 are:

 - Before test run (initialization)
 - Before test case (SUT cleanup or preparation)
 - As instrumentation (determine pass/fail for test case)
 - After each test case (collect SUT information or cleanup)
 - When instrument fails (restart SUT on failure)
 - After test run (collect results; file issues in tracker)

## Client testing ##

When testing a client-role application (such as a web browser
or command line client like cURL or mpg123), The fuzzer is
set up to wait for an incoming connection rather than
connecting out. As a result, unlike testing a server
application that happily accepts any incoming connection, the
fuzzer must rely on the client to connect.

Another common difference in testing client applications is
that where the server is a long-lived process that handles
multiple clients, a client process lives only for one
connection before termination. For that reason, "valid case
instrumentation" is not generally not meaningful with clients.

A commonly used, but naïve way of testing client applications
is to execute the client repeatedly in a loop, for example:

**run-client.sh**

```
 #/bin/bash
 while (true); do
         client-app --connect fuzzer:1234
         sleep 1
 done
```

There are multiple problems with this approach:

 - If the client crashes, a crash is not detected
 - Even if the crash was detected, it would be difficult to
    correlate it to the test cause that triggered it.

To be able to catch crashes in client applications, we
clearly need to monitor the application during execution.
One way to do that would be to rig it into a harness that
catches fatal signals.

### Solution: Defensics/Client harness ###

Client harness agent source code is provided in
**client-harness/agent-client-tester.js**. The application
requires [Node.JS][nodejs] to run on the system where the
client application is executed. It does not have to be on
the same system as Defensics.

Usage:

```node agent-client-tester.js client-app --connect fuzzer:1234```

Running that will start the agent to listen for connections from
Defensics on all local addresses on port 8000

Here is an example Defensics configuration using
**send-code-env/send-code-env.py**. The script requires
installing [Python][python] on the Defensics system. Most
Linux installations include Python by default and it is
a free download for Windows.

**Target port**: 4433

Instrumentation / External Instrumentation should be as below.
This configuration sends all Defensics signals to the client
harness, including all CODE environment variables.

![Screenshot: Example configuration][code]

| Setting name          | Command                                              |
| --------------------- |:---------------------------------------------------- |
| before test run       | `send-code-env.py http://ip:8000/api/before-run`     |
| before each test case | `send-code-env.py http://ip:8000/api/before-case`    |
| as instrumentation    | `send-code-env.py http://ip:8000/api/instrumentation`|
| after each test case  | `send-code-env.py http://ip:8000/api/after-case`     |
| when instrument fails | `send-code-env.py http://ip:8000/api/instrumentation-fail` |
| after test run        | `send-code-env.py http://ip:8000/api/after-run`      |

### send-code-env.py ###

The information about current test case, where Defensics
results are stored, etc. is available for the external
instrumentation scripts as environment variables. They are
named with a **CODE\_** prefix and documented in Defensics
built-in documentation.

Some examples:

|||
| ------------------ |:----------------------------------- |
| `CODE_TEST_CASE`   | Index of the current test case.     |
| `CODE_VERDICT`     | Test case diagnosis (pass/fail)     |
| `CODE_INST_ROUNDS` | Count of instrumentation attempts   |

`send-code-env/send-code-env.py` is a
ready-to-use example script that sends all environment
variables with the CODE prefix as a JSON structure over HTTP.
This makes for a simple protocol to build on. The JSON will
look something like this:

```
  {
    "CODE_LOAD_ID": "1397697721853-0",
    "CODE_RESULT_DIR": "/data/results/TLS-1.2-Client/20140422-1602-42",
    "CODE_SUITE": "d3-tls12-client-3.0.0",
    ...
  }
```

To use the script, you need to install Python on the system
where you run Defensics if you don't have it already. You may
need to use a full path to Python and the script if they are
not in your path.

Typical usage (what you enter in Defensics):

```python /data/scripts/send-code-env.py http://fuzz:8000/```

Assuming you have a receiving HTTP server on host *fuzz* on
port 8000. You can use this script in any of the external
instrumentation hooks (before, after, as instrumentation and
so on).

# Log file monitoring #

Many applications write a log file. Wouldn't it be nice if the new
lines in the application log file would be available in the Defensics
main.log? Well, luckily it's easy!

Run the **log-tailer/agent-logtailer.py** script and give it the log
files you want to watch (you can use multiple):

```
  $ python agent-logtailer.py /var/log/system.log
  Watching 1 log files
  Started Instrumentation HTTP Server on port 8000
```


Now set up external instrumentation script in Defensics:

```python send-code-env.py http://localhost:8000/```

You can of course use a remote address if your system under test
is not local. Just replace localhost with your IP address under test.
Defensics will now fetch the new lines after every test case. If
there are any new lines in the log, the test case will be marked
as failed. If you don't want this, simply switch the script from
"as instrumentation" to "after test case". Then only the log output
will be used.



# Router and firewall testing #

Some devices forward traffic without being a party of the connection.
With this scenario it may not as interesting if the management service
is interrupted as if the forwarded traffic is impacted.

An approach that works with many devices and does not require specific
support from the tested router/firewall is to open a TCP connection
through it and monitor that connection for interruptions.
This works also for cases where the tested protocol does not have any
responses that the fuzzer could directly monitor.

```
 ------------       -------------        --------
|  Defensics | --- | System Under | --  | Echo    |
|  +agent    | LAN |    Test      | WAN | Server  |
 ============       ==============       ========
```

Run the **tcp-passthrough-instrument/tcp-instrument-echo-server.js**
on a system on one side of the tested device. Defensics connects to
the agent and asks it if the connection to the echo server is still
up. If connection is disrupted, test case is marked as failed.
Both the agent and the echo server require [Node.JS][nodejs] on the
system they run on.

Assuming the echo server runs on *192.168.0.200*, the
*Execute as instrumentation* command in Defensics instrumentation settings
would be:

```python send-code-env.py http://192.168.0.200:8000/```

The agent can run on the same system as Defensics or on another
system. The only requirements are that Defensics can connect to the
agent and the agent can connect to the echo server through System Under Test.

The echo server does not need any arguments and will bind to port 7777.

```node tcp-instrument-echo-server.js```

Run the agent like this, replacing echo server IP address:

```node agent-tcp-instrument.js 192.168.0.200```


[sut]: http://en.wikipedia.org/wiki/System_under_test "System Under Test"
[ext]: _img/defensics-extinst-client.png "Defensics External Instrumetation Settings"
[code]: _img/defensics-extinst-sendcode.png "Example configuration for External Instrumentation"
[nodejs]: http://nodejs.org/ "node.js runtime"
[python]: http://www.python.org/ "Python runtime"
