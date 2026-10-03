// Surge generic script: 通过当前网络直连 VPS，串行发送 knockd 端口序列。

(function () {
    "use strict";

    const REQUEST_TIMEOUT_SECONDS = 1;
    const KNOCK_GAP_MILLISECONDS = 150;
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

    let names;
    let hosts;
    let targetPorts;

    try {
        names = splitList(args.names || "");
        hosts = splitList(args.hosts || "").map(normalizeHost);
        if (hosts.length === 0) {
            throw new Error("至少需要配置一个 VPS 地址");
        }
        targetPorts = parsePorts(
            action === "open" ? args.open : args.close,
            action === "open" ? "开门端口" : "关门端口"
        );
    } catch (error) {
        finish("VPS Knockd：配置错误", error.message, "error");
        return;
    }

    const actionLabel = action === "open" ? "开门" : "关门";
    const targetLabels = hosts.map(function (host, index) {
        return names[index] || host;
    });
    const totalAttempts = hosts.length * targetPorts.length;
    let attemptCount = 0;

    function finishSequence() {
        finish(
            "VPS " + actionLabel + "序列已发送",
            [
                currentNetworkLabel(),
                "目标: " + targetLabels.join("、"),
                "已完成 " + attemptCount + "/" + totalAttempts + " 次 DIRECT 连接尝试。",
                "目标端口拒绝或超时通常属于预期；是否匹配成功请以 VPS 的 knockd 日志为准。"
            ].join("\n"),
            "info"
        );
    }

    function knock(serverIndex, portIndex) {
        if (serverIndex >= hosts.length) {
            finishSequence();
            return;
        }

        if (portIndex >= targetPorts.length) {
            knock(serverIndex + 1, 0);
            return;
        }

        const host = hosts[serverIndex];
        const name = targetLabels[serverIndex];
        const port = targetPorts[portIndex];
        const url = "http://" + host + ":" + port + "/";

        console.log(
            "[vps-knock] " + actionLabel + " " + name + " " + host + ":" + port +
            " (" + (attemptCount + 1) + "/" + totalAttempts + ")"
        );

        function continueSequence(error) {
            attemptCount += 1;
            if (error) {
                console.log("[vps-knock] 请求结束: " + error);
            }
            setTimeout(function () {
                knock(serverIndex, portIndex + 1);
            }, KNOCK_GAP_MILLISECONDS);
        }

        try {
            $httpClient.get({
                url: url,
                timeout: REQUEST_TIMEOUT_SECONDS,
                policy: "DIRECT"
            }, function (error) {
                continueSequence(error);
            });
        } catch (error) {
            console.log("[vps-knock] 无法发起请求: " + error.message);
            continueSequence(error.message);
        }
    }

    knock(0, 0);
})();
