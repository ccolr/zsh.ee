"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const scriptPath = path.join(__dirname, "..", "SurgeModules", "vps-knock.js");
const scriptSource = fs.readFileSync(scriptPath, "utf8");

function createClock() {
    let now = 0;
    let nextId = 1;
    const queue = [];

    function setTimeout(callback, delay) {
        const item = {
            id: nextId++,
            at: now + Number(delay || 0),
            callback: callback
        };
        queue.push(item);
        return item.id;
    }

    function runUntil(predicate, limit) {
        while (!predicate() && queue.length > 0) {
            queue.sort(function (left, right) {
                return left.at - right.at || left.id - right.id;
            });
            const item = queue.shift();
            if (item.at > limit) {
                throw new Error("fake clock exceeded " + limit + "ms");
            }
            now = item.at;
            item.callback();
        }
    }

    return {
        now: function () { return now; },
        setTimeout: setTimeout,
        runUntil: runUntil
    };
}

function createKnockd(openPorts, closePorts) {
    const doors = [
        {name: "open", ports: openPorts, completed: 0},
        {name: "close", ports: closePorts, completed: 0}
    ];
    let attempts = [];
    const packets = [];

    function receive(port, at) {
        packets.push({port: port, at: at});
        attempts = attempts.filter(function (attempt) {
            return attempt.stage >= 0 && attempt.stage < attempt.door.ports.length;
        });

        if (attempts.length > 0) {
            attempts.forEach(function (attempt) {
                if (attempt.door.ports[attempt.stage] === port) {
                    attempt.stage += 1;
                    if (attempt.stage === attempt.door.ports.length) {
                        attempt.door.completed += 1;
                    }
                } else {
                    attempt.stage = -1;
                }
            });
            return;
        }

        doors.forEach(function (door) {
            if (door.ports[0] === port) {
                attempts.push({door: door, stage: 1});
                if (door.ports.length === 1) {
                    door.completed += 1;
                }
            }
        });
    }

    return {
        receive: receive,
        packets: packets,
        completed: function (name) {
            return doors.find(function (door) { return door.name === name; }).completed;
        }
    };
}

function runScript() {
    const openPorts = [7123, 8234, 9345];
    const closePorts = openPorts.slice().reverse();
    const clock = createClock();
    const knockd = createKnockd(openPorts, closePorts);
    let doneResult = null;
    let doneAt = null;
    let firstKnockAt = null;

    function request(options, callback) {
        const port = Number(new URL(options.url).port || 80);
        if (port === 80) {
            clock.setTimeout(function () {
                callback("The request timed out", null);
            }, 3000);
            return;
        }

        if (firstKnockAt === null) firstKnockAt = clock.now();
        knockd.receive(port, clock.now());

        // A silently dropped TCP connection retransmits SYN packets even when
        // the HTTP API has already reported its sub-second timeout.
        [1000, 3000, 7000].forEach(function (delay) {
            clock.setTimeout(function () {
                if (doneResult === null) knockd.receive(port, clock.now());
            }, delay);
        });

        // Model Surge's observed behaviour: a fractional timeout does not make
        // the underlying connection disappear before the first SYN retry.
        clock.setTimeout(function () {
            callback("The request timed out", null);
        }, Math.max(1000, Number(options.timeout || 5) * 1000));
    }

    const context = {
        $argument: "action=open&names=test&hosts=203.0.113.10&open=7123|8234|9345&close=9345|8234|7123&check_port=80",
        $trigger: "button",
        $network: {v4: {primaryInterface: "en0"}},
        $httpClient: {head: request},
        $done: function (result) {
            doneResult = result;
            doneAt = clock.now();
        },
        console: {log: function () {}},
        Date: {now: function () { return clock.now(); }},
        URL: URL,
        setTimeout: clock.setTimeout
    };

    vm.runInNewContext(scriptSource, context, {filename: scriptPath});
    clock.runUntil(function () { return doneResult !== null; }, 30000);

    return {
        doneAt: doneAt,
        firstKnockAt: firstKnockAt,
        knockd: knockd,
        result: doneResult
    };
}

const run = runScript();
assert.equal(run.knockd.completed("open"), 1, "one clean open sequence should complete");
assert.ok(
    run.doneAt - run.firstKnockAt < 1000,
    "the script must end before the first TCP SYN retransmission"
);
assert.match(run.result.content, /再次刷新.*验证/);

console.log("vps-knock regression test passed");
