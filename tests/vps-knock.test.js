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

function createKnockd(openPorts, closePorts, initiallyOpen) {
    const doors = [
        {name: "open", ports: openPorts, completed: 0},
        {name: "close", ports: closePorts, completed: 0}
    ];
    let attempts = [];
    let open = initiallyOpen;

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
                        open = attempt.door.name === "open";
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
        isOpen: function () { return open; },
        completed: function (name) {
            return doors.find(function (door) { return door.name === name; }).completed;
        }
    };
}

function runScript(options) {
    const openPorts = [7123, 8234, 9345];
    const closePorts = openPorts.slice().reverse();
    const clock = createClock();
    const knockd = createKnockd(openPorts, closePorts, options.initiallyOpen);
    const probes = [];
    const knocks = [];
    const apiCalls = [];
    let childStartedAt = null;
    let childDoneAt = null;
    let doneResult = null;

    function parentRequest(requestOptions, callback) {
        const url = new URL(requestOptions.url);
        probes.push({hostname: url.hostname, port: Number(url.port || 80), at: clock.now()});
        if (knockd.isOpen()) {
            clock.setTimeout(function () {
                callback(null, {status: 204});
            }, 50);
        } else {
            clock.setTimeout(function () {
                callback("The request timed out", null);
            }, 3000);
        }
    }

    function httpAPI(method, apiPath, body, callback) {
        apiCalls.push({method: method, path: apiPath, body: body});
        childStartedAt = clock.now();
        let childDone = false;

        function childRequest(requestOptions, requestCallback) {
            const url = new URL(requestOptions.url);
            const port = Number(url.port);
            knocks.push({hostname: url.hostname, port: port, at: clock.now()});
            knockd.receive(port);

            [1000, 3000, 7000].forEach(function (delay) {
                clock.setTimeout(function () {
                    if (!childDone) knockd.receive(port);
                }, delay);
            });
            clock.setTimeout(function () {
                requestCallback("The request timed out", null);
            }, 1000);
        }

        vm.runInNewContext(body.script_text, {
            $httpClient: {head: childRequest},
            $done: function () {
                childDone = true;
                childDoneAt = clock.now();
                callback({result: "success"});
            },
            setTimeout: clock.setTimeout
        }, {filename: "vps-knock-child.js"});
    }

    const argument = [
        "action=" + options.action,
        "name=" + options.name,
        "host=" + options.host,
        "open=" + openPorts.join("|"),
        "close=" + closePorts.join("|"),
        "check_port=80"
    ].join("&");
    const context = {
        $argument: argument,
        $trigger: "button",
        $network: {v4: {primaryInterface: "en0"}},
        $httpClient: {head: parentRequest},
        $httpAPI: httpAPI,
        $done: function (result) {
            doneResult = result;
        },
        console: {log: function () {}},
        Date: {now: function () { return clock.now(); }},
        setTimeout: clock.setTimeout
    };

    vm.runInNewContext(scriptSource, context, {filename: scriptPath});
    clock.runUntil(function () { return doneResult !== null; }, 30000);

    return {
        apiCalls: apiCalls,
        childDuration: childDoneAt === null ? null : childDoneAt - childStartedAt,
        knockd: knockd,
        knocks: knocks,
        probes: probes,
        result: doneResult
    };
}

const opened = runScript({
    action: "open",
    name: "VPS-1",
    host: "203.0.113.10",
    initiallyOpen: false
});
assert.equal(opened.knockd.completed("open"), 1);
assert.deepEqual(opened.knocks.map(function (knock) { return knock.port; }), [7123, 8234, 9345]);
assert.deepEqual(Array.from(new Set(opened.knocks.map(function (knock) { return knock.hostname; }))), ["203.0.113.10"]);
assert.equal(opened.apiCalls.length, 1);
assert.equal(opened.apiCalls[0].path, "/v1/scripting/evaluate");
assert.ok(opened.childDuration < 1000, "sender child must end before the first SYN retransmission");
assert.equal(opened.probes.length, 2, "open must probe before and after knocking");
assert.match(opened.result.title, /开门成功/);

const duplicateOpen = runScript({
    action: "open",
    name: "VPS-1",
    host: "203.0.113.10",
    initiallyOpen: true
});
assert.equal(duplicateOpen.knocks.length, 0);
assert.equal(duplicateOpen.apiCalls.length, 0);
assert.equal(duplicateOpen.probes.length, 1);
assert.match(duplicateOpen.result.content, /未重复发送敲门序列/);

const closed = runScript({
    action: "close",
    name: "VPS-2",
    host: "198.51.100.20",
    initiallyOpen: true
});
assert.equal(closed.knockd.completed("close"), 1);
assert.deepEqual(closed.knocks.map(function (knock) { return knock.port; }), [9345, 8234, 7123]);
assert.deepEqual(Array.from(new Set(closed.knocks.map(function (knock) { return knock.hostname; }))), ["198.51.100.20"]);
assert.equal(closed.probes.length, 2, "close must probe before and after knocking");
assert.match(closed.result.title, /关门成功/);

const duplicateClose = runScript({
    action: "close",
    name: "VPS-2",
    host: "198.51.100.20",
    initiallyOpen: false
});
assert.equal(duplicateClose.knocks.length, 0);
assert.equal(duplicateClose.apiCalls.length, 0);
assert.equal(duplicateClose.probes.length, 1);
assert.match(duplicateClose.result.content, /未重复发送关门序列/);

const scriptSection = moduleSource.split("[Script]")[1].split("[Panel]")[0];
const panelSection = moduleSource.split("[Panel]")[1];
assert.equal((scriptSection.match(/^VPS-Knock-/gm) || []).length, 2);
assert.equal((panelSection.match(/^VPS-Knock-/gm) || []).length, 2);
assert.match(moduleSource, /VPS-Knock-Open/);
assert.match(moduleSource, /VPS-Knock-Close/);
assert.match(moduleSource, /check_port:\s*80|check_port:80/);
assert.doesNotMatch(moduleSource, /vps_names|vps_hosts|vps1_|vps2_|VPS-1-Knock|VPS-2-Knock/);

console.log("vps-knock isolated operation tests passed");
