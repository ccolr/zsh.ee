"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const scriptPath = path.join(__dirname, "..", "SurgeModules", "vps-knock.js");
const modulePath = path.join(__dirname, "..", "SurgeModules", "vps-knock.sgmodule");
const scriptSource = fs.readFileSync(scriptPath, "utf8");
const moduleSource = fs.readFileSync(modulePath, "utf8");

function createClock() {
    let now = 0;
    let nextId = 1;
    const queue = [];

    function setTimeout(callback, delay) {
        queue.push({
            id: nextId++,
            at: now + Number(delay || 0),
            callback: callback
        });
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

    function receive(port) {
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
            }
        });
    }

    return {
        receive: receive,
        completed: function (name) {
            return doors.find(function (door) { return door.name === name; }).completed;
        }
    };
}

function runScript(options) {
    const openPorts = [7123, 8234, 9345];
    const closePorts = openPorts.slice().reverse();
    const clock = createClock();
    const knockd = createKnockd(openPorts, closePorts);
    const requests = [];
    let doneResult = null;
    let doneAt = null;
    let firstKnockAt = null;

    function request(requestOptions, callback) {
        const url = new URL(requestOptions.url);
        const port = Number(url.port);
        if (firstKnockAt === null) firstKnockAt = clock.now();
        requests.push({hostname: url.hostname, port: port, at: clock.now()});
        knockd.receive(port);

        [1000, 3000, 7000].forEach(function (delay) {
            clock.setTimeout(function () {
                if (doneResult === null) knockd.receive(port);
            }, delay);
        });
        clock.setTimeout(function () {
            callback("The request timed out", null);
        }, 1000);
    }

    const argument = [
        "action=" + options.action,
        "name=" + options.name,
        "host=" + options.host,
        "open=" + openPorts.join("|"),
        "close=" + closePorts.join("|")
    ].join("&");
    const context = {
        $argument: argument,
        $trigger: "button",
        $network: {v4: {primaryInterface: "en0"}},
        $httpClient: {head: request},
        $done: function (result) {
            doneResult = result;
            doneAt = clock.now();
        },
        console: {log: function () {}},
        setTimeout: clock.setTimeout
    };

    vm.runInNewContext(scriptSource, context, {filename: scriptPath});
    clock.runUntil(function () { return doneResult !== null; }, 5000);

    return {
        doneAt: doneAt,
        firstKnockAt: firstKnockAt,
        knockd: knockd,
        requests: requests,
        result: doneResult
    };
}

const firstVps = runScript({
    action: "open",
    name: "VPS-1",
    host: "203.0.113.10"
});
assert.equal(firstVps.knockd.completed("open"), 1);
assert.deepEqual(firstVps.requests.map(function (request) { return request.port; }), [7123, 8234, 9345]);
assert.deepEqual(
    Array.from(new Set(firstVps.requests.map(function (request) { return request.hostname; }))),
    ["203.0.113.10"]
);
assert.ok(firstVps.doneAt - firstVps.firstKnockAt < 1000);
assert.match(firstVps.result.content, /结果由你人工判断/);

const secondVps = runScript({
    action: "close",
    name: "VPS-2",
    host: "198.51.100.20"
});
assert.equal(secondVps.knockd.completed("close"), 1);
assert.deepEqual(secondVps.requests.map(function (request) { return request.port; }), [9345, 8234, 7123]);
assert.deepEqual(
    Array.from(new Set(secondVps.requests.map(function (request) { return request.hostname; }))),
    ["198.51.100.20"]
);

assert.match(moduleSource, /VPS-1-Knock-Open/);
assert.match(moduleSource, /VPS-1-Knock-Close/);
assert.match(moduleSource, /VPS-2-Knock-Open/);
assert.match(moduleSource, /VPS-2-Knock-Close/);
assert.doesNotMatch(moduleSource, /vps_names|vps_hosts|check_port/);

console.log("vps-knock independent-panel regression tests passed");
