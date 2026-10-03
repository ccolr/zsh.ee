// Surge generic script: 只向一个明确指定的 VPS 发送一次 knockd 端口序列。

(function () {
    "use strict";

    // $httpClient 不能发送原始 SYN。快速排入全部请求并结束脚本，避免底层 TCP 重传打乱序列。
    const KNOCK_REQUEST_TIMEOUT_SECONDS = 1;
    const KNOCK_GAP_MILLISECONDS = 100;
    const KNOCK_FINISH_GRACE_MILLISECONDS = 250;
    const MAX_KNOCK_PORTS = 5;
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

    try {
        target = {
            name: String(args.name || "").trim() || String(args.host || "").trim(),
            host: normalizeHost(args.host)
        };
        targetPorts = parsePorts(
            action === "open" ? args.open : args.close,
            action === "open" ? "开门端口" : "关门端口"
        );
    } catch (error) {
        finish("VPS Knockd：配置错误", error.message, "error");
        return;
    }

    const actionLabel = action === "open" ? "开门" : "关门";

    function sendKnock(portIndex) {
        const port = targetPorts[portIndex];
        const url = "http://" + target.host + ":" + port + "/";
        console.log(
            "[vps-knock] " + actionLabel + " " + target.name + " " + target.host + ":" + port +
            " (" + (portIndex + 1) + "/" + targetPorts.length + ")"
        );

        try {
            $httpClient.head({
                url: url,
                timeout: KNOCK_REQUEST_TIMEOUT_SECONDS,
                policy: "DIRECT",
                "auto-redirect": false,
                "auto-cookie": false
            }, function (error) {
                if (error) {
                    console.log("[vps-knock] 敲门请求结束: " + error);
                }
            });
        } catch (error) {
            console.log("[vps-knock] 无法发起敲门请求: " + error.message);
        }
    }

    targetPorts.forEach(function (_, portIndex) {
        setTimeout(function () {
            sendKnock(portIndex);
        }, portIndex * KNOCK_GAP_MILLISECONDS);
    });

    const lastKnockDelay = (targetPorts.length - 1) * KNOCK_GAP_MILLISECONDS;
    setTimeout(function () {
        finish(
            target.name + " " + actionLabel + "序列已发送",
            [
                currentNetworkLabel(),
                "目标: " + target.name + "（" + target.host + "）",
                "序列: " + targetPorts.join(" → "),
                "仅发送序列；结果由你人工判断。"
            ].join("\n"),
            "info"
        );
    }, lastKnockDelay + KNOCK_FINISH_GRACE_MILLISECONDS);
})();
