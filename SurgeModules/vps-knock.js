// Surge generic script: 向一台 VPS 连续发送一组 knockd 端口序列。

(function () {
    "use strict";

    const KNOCK_REQUEST_TIMEOUT_SECONDS = 1;
    const KNOCK_GAP_MILLISECONDS = 100;
    const FINISH_GRACE_MILLISECONDS = 250;
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

    function parsePorts(value) {
        const values = String(value || "")
            .split(/[|,]/)
            .map(function (item) { return item.trim(); })
            .filter(function (item) { return item.length > 0; });

        if (values.length === 0) {
            throw new Error("敲门序列不能为空");
        }
        if (values.length > MAX_KNOCK_PORTS) {
            throw new Error("敲门序列最多支持 " + MAX_KNOCK_PORTS + " 个端口");
        }

        return values.map(function (value) {
            if (!/^\d+$/.test(value)) {
                throw new Error("敲门序列包含非整数端口: " + value);
            }

            const port = Number(value);
            if (!Number.isInteger(port) || port < 1 || port > 65535) {
                throw new Error("敲门端口超出 1-65535: " + value);
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

    const args = parseArguments(typeof $argument === "string" ? $argument : "");
    const action = args.action;

    if (typeof $trigger === "string" && $trigger === "auto-interval") {
        finish("VPS Knockd：已阻止自动执行", "敲门操作只能手动触发。", "alert");
        return;
    }

    if (action !== "open" && action !== "close") {
        finish("VPS Knockd：配置错误", "action 必须明确设置为 open 或 close。", "error");
        return;
    }

    let host;
    let ports;
    let name;

    try {
        host = normalizeHost(args.host);
        ports = parsePorts(args.ports);
        name = String(args.name || "").trim() || host;
    } catch (error) {
        finish("VPS Knockd：配置错误", error.message, "error");
        return;
    }

    const actionLabel = action === "open" ? "开门" : "关门";

    ports.forEach(function (port, index) {
        setTimeout(function () {
            console.log(
                "[vps-knock] " + name + " " + actionLabel +
                " " + (index + 1) + "/" + ports.length + ": " + port
            );

            try {
                $httpClient.head({
                    url: "http://" + host + ":" + port + "/",
                    timeout: KNOCK_REQUEST_TIMEOUT_SECONDS,
                    policy: "DIRECT",
                    "auto-redirect": false,
                    "auto-cookie": false
                }, function () {});
            } catch (error) {
                console.log("[vps-knock] 端口 " + port + " 请求启动失败: " + error.message);
            }
        }, index * KNOCK_GAP_MILLISECONDS);
    });

    setTimeout(function () {
        finish(
            name + " " + actionLabel + "序列已发送",
            [
                "目标: " + host,
                "序列: " + ports.join(" → "),
                "脚本不再自动探测，请手动验证实际通断状态。"
            ].join("\n"),
            "info"
        );
    }, (ports.length - 1) * KNOCK_GAP_MILLISECONDS + FINISH_GRACE_MILLISECONDS);
})();
