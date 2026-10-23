# VPS init

面向 Debian/Ubuntu x86_64 VPS 的分块初始化脚本。入口只负责展示菜单和调度；每个模块的完整配置均位于 `configs/` 下。

## 使用

远程执行：

```bash
curl -fsSL https://zsh.ee/vps-init/main-init.sh | sudo sh
```

本地执行：

```bash
cd vps-init
sudo sh main-init.sh
```

也可以直接传入菜单编号：

```bash
sudo sh main-init.sh 3
```

编号 `13` 会按菜单顺序执行全部模块。Nginx 模块执行时会询问域名，该域名只用于生成 `/etc/nginx/conf.d/<domain>.conf` 的文件名；文件正文保留 `vps.md` 中的固定域名和路径。

## 模块

| 编号 | 模块 | 行为 |
| --- | --- | --- |
| 1 | locale | 安装 locales，生成并设置 `en_US.UTF-8` |
| 2 | ufw | 只安装，不启用、不写规则 |
| 3 | nginx | 安装并启动 Nginx，复制两个配置文件，不重新加载配置 |
| 4 | certificate | 安装 cron 与 acme.sh，把两个证书脚本放入 `/root` |
| 5 | realm | 配置转发与 BBR，安装二进制、配置和 systemd 单元，不启用服务 |
| 6 | xray | 安装稳定版并复制服务端配置，不重新加载服务 |
| 7 | sing-box | 安装并复制服务端配置，建立日志文件及权限，不重新加载服务 |
| 8 | nvim | 安装 Neovim，复制 lazy.nvim 配置并同步插件 |
| 9 | starship | 安装 Starship，复制四套主题并写入当前用户 `.bashrc` |
| 10 | fzf | 安装 fzf、fd、bat、tree，并写入当前用户 shell 配置 |
| 11 | env | 配置 sudo 与 su 传递 `TERM_PROGRAM` |
| 12 | ssh | 写入 `00_custom.conf`，生成不含 1、4、7 的随机高位端口，不重新加载 SSH |

需要用户配置的域名、UUID、密钥、证书路径、Cloudflare 变量和 Realm 目标地址均原样保留在模板中。网页目录和客户端代理配置不在此目录的范围内。
