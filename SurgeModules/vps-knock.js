// Surge generic script: 独立控制一台 VPS，操作前后探测，敲门由短生命周期子会话发送。

(function () {
    "use strict";

    const KNOCK_REQUEST_TIMEOUT_SECONDS = 1;
    const KNOCK_GAP_MILLISECONDS = 100;
    const KNOCK_FINISH_GRACE_MILLISECONDS = 250;
    const MAX_KNOCK_PORTS = 5;
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
        if (values.length > MAX_KNOCK_PORTS) {
            throw new Error(label + "最多支持 " + MAX_KNOCK_PORTS + " 个端口");
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

    function parseCheckPort(value) {
        const ports = parsePorts(value || "80", "检测端口");
        if (ports.length !== 1 || (ports[0] !== 80 && ports[0] !== 443)) {
            throw new Error("检测端口只能填写 80 或 443");
        }
        return ports[0];
    }

    function normalizeHost(value) {
        const host = String(value || "").trim();
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
            "敲门操作只能手动触发。",
            "alert"
        );
        return;
    }

    if (action !== "open" && action !== "close") {
        finish(
            "VPS Knockd：配置错误",
            "action 必须明确设置为 open 或 close。",
            "error"
        );
        return;
    }

    let target;
    let targetPorts;
    let checkPort;

    try {
        const openPorts = parsePorts(args.open, "开门端口");
        const closePorts = parsePorts(args.close, "关门端口");
        checkPort = parseCheckPort(args.check_port);
        if (openPorts.indexOf(checkPort) >= 0 || closePorts.indexOf(checkPort) >= 0) {
            throw new Error("检测端口不能同时出现在敲门序列中: " + checkPort);
        }

        target = {
            name: String(args.name || "").trim() || String(args.host || "").trim(),
            host: normalizeHost(args.host)
        };
        targetPorts = action === "open" ? openPorts : closePorts;
    } catch (error) {
        finish("VPS Knockd：配置错误", error.message, "error");
        return;
    }

    const actionLabel = action === "open" ? "开门" : "关门";

    function checkUrl() {
        const scheme = checkPort === 443 ? "https" : "http";
        return scheme + "://" + target.host + ":" + checkPort + "/?_surge_knock=" + Date.now();
    }

    function probe(callback) {
        const startedAt = Date.now();
        const url = checkUrl();
        console.log("[vps-knock] DIRECT 检测 " + target.name + " " + url);

        try {
            $httpClient.head({
                url: url,
                timeout: PROBE_TIMEOUT_SECONDS,
                policy: "DIRECT",
                "auto-redirect": false,
                "auto-cookie": false
            }, function (error, response) {
                const status = response && Number(response.status);
                const reachable = !error && Number.isFinite(status) && status >= 100 && status <= 599;
                callback({
                    reachable: reachable,
                    status: status,
                    error: error,
                    elapsed: Date.now() - startedAt
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

    function senderScript() {
        const hostLiteral = JSON.stringify(target.host);
        const portsLiteral = JSON.stringify(targetPorts);
        const timeoutLiteral = JSON.stringify(KNOCK_REQUEST_TIMEOUT_SECONDS);
        const gapLiteral = JSON.stringify(KNOCK_GAP_MILLISECONDS);
        const graceLiteral = JSON.stringify(KNOCK_FINISH_GRACE_MILLISECONDS);

        return [
            "(function(){\"use strict\";",
            "const host=" + hostLiteral + ";",
            "const ports=" + portsLiteral + ";",
            "const gap=" + gapLiteral + ";",
            "ports.forEach(function(port,index){",
            "setTimeout(function(){",
            "$httpClient.head({url:\"http://\"+host+\":\"+port+\"/\",timeout:" + timeoutLiteral + ",policy:\"DIRECT\",\"auto-redirect\":false,\"auto-cookie\":false},function(){});",
            "},index*gap);",
            "});",
            "setTimeout(function(){$done();},(ports.length-1)*gap+" + graceLiteral + ");",
            "})();"
        ].join("");
    }

    function sendSequence(callback) {
        const childTimeoutSeconds = 2;
        console.log(
            "[vps-knock] 独立发送 " + actionLabel + " " + target.name + " " +
            targetPorts.join(" → ")
        );

        try {
            $httpAPI(
                "POST",
                "/v1/scripting/evaluate",
                {
                    script_text: senderScript(),
                    mock_type: "cron",
                    timeout: childTimeoutSeconds
                },
                function (result) {
                    callback(result);
                }
            );
        } catch (error) {
            console.log("[vps-knock] 无法启动独立发送会话: " + error.message);
            callback({error: error.message});
        }
    }

    function verifyAfterKnock(expectedReachable, attempt, callback) {
        probe(function (result) {
            if (result.reachable === expectedReachable) {
                callback(true, result, attempt + 1);
                return;
            }

            if (attempt + 1 >= POST_KNOCK_PROBE_ATTEMPTS) {
                callback(false, result, attempt + 1);
                return;
            }

            setTimeout(function () {
                verifyAfterKnock(expectedReachable, attempt + 1, callback);
            }, PROBE_RETRY_DELAY_MILLISECONDS);
        });
    }

    function finishAlready(result) {
        const stateText = action === "open"
            ? "已经是开门状态，未重复发送敲门序列。"
            : "已经是关门状态，未重复发送关门序列。";
        finish(
            target.name + " 无需重复" + actionLabel,
            [
                currentNetworkLabel(),
                "目标: " + target.name + "（" + target.host + "）",
                stateText,
                action === "open"
                    ? "检测结果: HTTP " + result.status
                    : "检测结果: " + errorText(result.error)
            ].join("\n"),
            "good"
        );
    }

    function finishVerified(verified, result, attempts) {
        const successText = action === "open"
            ? "开门成功，检测端口已经可以直连。"
            : "关门成功，检测端口已经无法直连。";
        const failureText = action === "open"
            ? "开门序列已发送，但检测端口仍无法直连。"
            : "关门序列已发送，但检测端口仍可直连。";
        const probeText = result.reachable
            ? "HTTP " + result.status
            : errorText(result.error);

        finish(
            target.name + " " + (verified ? actionLabel + "成功" : actionLabel + "未确认"),
            [
                currentNetworkLabel(),
                "目标: " + target.name + "（" + target.host + "）",
                verified ? successText : failureText,
                "操作后检测: " + probeText + "（" + attempts + " 次）"
            ].join("\n"),
            verified ? "good" : "alert"
        );
    }

    probe(function (before) {
        const alreadyDesired = action === "open" ? before.reachable : !before.reachable;
        if (alreadyDesired) {
            finishAlready(before);
            return;
        }

        sendSequence(function () {
            setTimeout(function () {
                verifyAfterKnock(action === "open", 0, finishVerified);
            }, POST_KNOCK_SETTLE_MILLISECONDS);
        });
    });
})();
