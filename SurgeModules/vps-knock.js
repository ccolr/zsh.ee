// Surge generic script: DIRECT 检测受保护的 nginx，按需发送 knockd 序列，再次验证。

(function () {
    "use strict";

    const KNOCK_REQUEST_TIMEOUT_SECONDS = 1;
    const KNOCK_GAP_MILLISECONDS = 150;
    const PROBE_TIMEOUT_SECONDS = 3;
    const POST_KNOCK_SETTLE_MILLISECONDS = 500;
    const PROBE_RETRY_DELAY_MILLISECONDS = 1000;
    const POST_KNOCK_PROBE_ATTEMPTS = 3;
    let completed = false;

    function finish(title, content, style) {
        if (completed) return;
        completed = true;
        $done({
            title: title,
            content: content,
            style: style
        });
    }

    function safeDecode(value) {
        try {
            return decodeURIComponent(String(value).replace(/\+/g, " "));
        } catch (error) {
            return String(value);
        }
    }

    function parseArguments(rawArgument) {
        const result = {};
        if (typeof rawArgument !== "string" || rawArgument.length === 0) {
            return result;
        }

        rawArgument.split("&").forEach(function (pair) {
            const separatorIndex = pair.indexOf("=");
            if (separatorIndex <= 0) return;

            const key = safeDecode(pair.slice(0, separatorIndex));
            const value = safeDecode(pair.slice(separatorIndex + 1));
            result[key] = value;
        });

        return result;
    }

    function splitList(value) {
        if (typeof value !== "string") return [];
        return value
            .split(/[|,]/)
            .map(function (item) { return item.trim(); })
            .filter(function (item) { return item.length > 0; });
    }

    function parsePorts(value, label) {
        const values = splitList(value);
        if (values.length === 0) {
            throw new Error(label + "不能为空");
        }

        return values.map(function (value) {
            if (!/^\d+$/.test(value)) {
                throw new Error(label + "包含非整数端口: " + value);
            }

            const port = Number(value);
            if (!Number.isInteger(port) || port < 1 || port > 65535) {
                throw new Error(label + "端口超出 1-65535: " + value);
            }
            return port;
        });
    }

    function normalizeHost(value) {
        const host = value.trim();
        if (host.length === 0) {
            throw new Error("VPS 地址不能为空");
        }
        if (/^https?:\/\//i.test(host) || /[\/?#@\s]/.test(host)) {
            throw new Error("VPS 地址不能包含协议、路径、凭据或空格: " + host);
        }
        if (host.indexOf("[") >= 0 || host.indexOf("]") >= 0) {
            if (/^\[[0-9a-fA-F:.]+\]$/.test(host)) {
                return host;
            }
            throw new Error("IPv6 地址格式错误: " + host);
        }

        const colonCount = (host.match(/:/g) || []).length;
        if (colonCount === 1) {
            throw new Error("VPS 地址不能包含端口: " + host);
        }
        if (colonCount > 1) {
            if (!/^[0-9a-fA-F:.]+$/.test(host)) {
                throw new Error("IPv6 地址格式错误: " + host);
            }
            return "[" + host + "]";
        }
        return host;
    }

    function parseCheckPort(value) {
        const ports = parsePorts(value, "检测端口");
        if (ports.length !== 1 || (ports[0] !== 80 && ports[0] !== 443)) {
            throw new Error("检测端口只能填写 80 或 443");
        }
        return ports[0];
    }

    function currentNetworkLabel() {
        if (typeof $network !== "object" || !$network) return "当前网络";
        if ($network.wifi && $network.wifi.ssid) {
            return "Wi-Fi: " + $network.wifi.ssid;
        }
        if ($network.v4 && $network.v4.primaryInterface) {
            return "网络接口: " + $network.v4.primaryInterface;
        }
        return "当前网络";
    }

    function errorText(error) {
        if (!error) return "未收到有效 HTTP 响应";
        const text = String(error).replace(/\s+/g, " ").trim();
        return text.length > 100 ? text.slice(0, 100) + "…" : text;
    }

    const args = parseArguments(typeof $argument === "string" ? $argument : "");
    const action = args.action;

    if (typeof $trigger === "string" && $trigger === "auto-interval") {
        finish(
            "VPS Knockd：已阻止自动执行",
            "敲门操作只能手动触发，以避免自动开门或关门。",
            "alert"
        );
        return;
    }

    if (action !== "open" && action !== "close") {
        finish(
            "VPS Knockd：配置错误",
            "action 必须明确设置为 open 或 close；为避免误操作，脚本不会使用默认动作。",
            "error"
        );
        return;
    }

    let targets;
    let targetPorts;
    let checkPort;

    try {
        const names = splitList(args.names || "");
        const hosts = splitList(args.hosts || "").map(normalizeHost);

        if (hosts.length === 0) {
            throw new Error("至少需要配置一个 VPS 地址");
        }

        targetPorts = parsePorts(
            action === "open" ? args.open : args.close,
            action === "open" ? "开门端口" : "关门端口"
        );
        checkPort = parseCheckPort(args.check_port || "80");
        targets = hosts.map(function (host, index) {
            return {
                host: host,
                name: names[index] || host
            };
        });
    } catch (error) {
        finish("VPS Knockd：配置错误", error.message, "error");
        return;
    }

    const actionLabel = action === "open" ? "开门" : "关门";
    const results = [];

    function checkUrl(target) {
        const scheme = checkPort === 443 ? "https" : "http";
        return scheme + "://" + target.host + ":" + checkPort + "/?_surge_knock=" + Date.now();
    }

    function probe(target, callback) {
        const startedAt = Date.now();
        const url = checkUrl(target);
        console.log("[vps-knock] DIRECT 检测 " + url);

        try {
            $httpClient.head({
                url: url,
                timeout: PROBE_TIMEOUT_SECONDS,
                policy: "DIRECT",
                headers: checkPort === 80
                    ? {"Cache-Control": "no-cache", "Connection": "close"}
                    : {"Cache-Control": "no-cache"},
                "auto-redirect": false,
                "auto-cookie": false
            }, function (error, response) {
                const status = response && Number(response.status);
                const reachable = !error && Number.isFinite(status) && status >= 100 && status <= 599;
                const elapsed = Date.now() - startedAt;

                console.log(
                    "[vps-knock] " + target.name + " nginx " +
                    (reachable ? "已直连，HTTP " + status : "未直连，" + errorText(error)) +
                    "，耗时 " + elapsed + "ms"
                );
                callback({
                    reachable: reachable,
                    status: status,
                    error: error,
                    elapsed: elapsed
                });
            });
        } catch (error) {
            callback({
                reachable: false,
                status: null,
                error: error.message,
                elapsed: Date.now() - startedAt
            });
        }
    }

    function knock(target, portIndex, callback) {
        if (portIndex >= targetPorts.length) {
            callback();
            return;
        }

        const port = targetPorts[portIndex];
        const url = "http://" + target.host + ":" + port + "/";
        console.log(
            "[vps-knock] " + actionLabel + " " + target.name + " " + target.host + ":" + port +
            " (" + (portIndex + 1) + "/" + targetPorts.length + ")"
        );

        function continueSequence(error) {
            if (error) {
                console.log("[vps-knock] 敲门请求结束: " + error);
            }
            setTimeout(function () {
                knock(target, portIndex + 1, callback);
            }, KNOCK_GAP_MILLISECONDS);
        }

        try {
            $httpClient.get({
                url: url,
                timeout: KNOCK_REQUEST_TIMEOUT_SECONDS,
                policy: "DIRECT"
            }, function (error) {
                continueSequence(error);
            });
        } catch (error) {
            console.log("[vps-knock] 无法发起敲门请求: " + error.message);
            continueSequence(error.message);
        }
    }

    function verifyAfterKnock(target, expectedReachable, attempt, callback) {
        probe(target, function (result) {
            if (result.reachable === expectedReachable) {
                callback(true, result, attempt + 1);
                return;
            }

            if (attempt + 1 >= POST_KNOCK_PROBE_ATTEMPTS) {
                callback(false, result, attempt + 1);
                return;
            }

            setTimeout(function () {
                verifyAfterKnock(target, expectedReachable, attempt + 1, callback);
            }, PROBE_RETRY_DELAY_MILLISECONDS);
        });
    }

    function processTarget(index) {
        if (index >= targets.length) {
            finishSummary();
            return;
        }

        const target = targets[index];
        probe(target, function (before) {
            if (action === "open" && before.reachable) {
                results.push({
                    target: target,
                    state: "already-connected",
                    probe: before
                });
                processTarget(index + 1);
                return;
            }

            if (action === "close" && !before.reachable) {
                results.push({
                    target: target,
                    state: "already-unreachable",
                    probe: before
                });
                processTarget(index + 1);
                return;
            }

            knock(target, 0, function () {
                setTimeout(function () {
                    verifyAfterKnock(target, action === "open", 0, function (verified, after, attempts) {
                        results.push({
                            target: target,
                            state: action === "open"
                                ? (verified ? "opened" : "open-unverified")
                                : (verified ? "closed" : "close-unverified"),
                            probe: after,
                            attempts: attempts
                        });
                        processTarget(index + 1);
                    });
                }, POST_KNOCK_SETTLE_MILLISECONDS);
            });
        });
    }

    function resultLine(result) {
        const name = result.target.name;

        switch (result.state) {
            case "already-connected":
                return "✅ " + name + "：已经连通，请勿重复敲门";
            case "opened":
                return "✅ " + name + "：敲门成功，nginx 已直连";
            case "open-unverified":
                return "⚠️ " + name + "：敲门后仍未连通；" + errorText(result.probe.error);
            case "already-unreachable":
                return "ℹ️ " + name + "：当前 nginx 未连通或检测失败，无需重复关门";
            case "closed":
                return "✅ " + name + "：关门成功，nginx 已无法直连";
            case "close-unverified":
                return "⚠️ " + name + "：关门序列已发送，但 nginx 仍可直连";
            default:
                return "⚠️ " + name + "：未知结果";
        }
    }

    function finishSummary() {
        const hasUnverified = results.some(function (result) {
            return result.state === "open-unverified" || result.state === "close-unverified";
        });
        const changed = results.some(function (result) {
            return result.state === "opened" || result.state === "closed";
        });
        const allAlreadyConnected = action === "open" && results.every(function (result) {
            return result.state === "already-connected";
        });

        let title;
        if (hasUnverified) {
            title = "VPS " + actionLabel + "结果未完全确认";
        } else if (allAlreadyConnected) {
            title = "VPS 已经连通";
        } else if (changed) {
            title = action === "open" ? "VPS 敲门成功" : "VPS 关门成功";
        } else {
            title = "VPS " + actionLabel + "检查完成";
        }

        finish(
            title,
            [currentNetworkLabel()]
                .concat(results.map(resultLine))
                .concat(["检测：DIRECT HEAD nginx:" + checkPort])
                .join("\n"),
            hasUnverified ? "alert" : "good"
        );
    }

    processTarget(0);
})();
