# zsh.ee

## VPS 初始化

部署到 Vercel 并绑定 `zsh.ee` 后，可以直接执行：

```bash
curl -fsSL https://zsh.ee/vps-init/main-init.sh | sudo sh
```

传入编号可以跳过菜单。例如执行全部模块：

```bash
curl -fsSL https://zsh.ee/vps-init/main-init.sh | sudo sh -s -- 13
```

`main-init.sh` 是 POSIX sh 引导脚本。它会下载 `vps-init.tar.gz`、解压到临时目录，再使用 Bash 执行菜单程序。交互输入从 `/dev/tty` 读取，因此通过管道运行时仍可选择模块并输入 Nginx 域名。

## Vercel 部署

仓库根目录的 `vercel.json` 会执行 `scripts/build-vercel.sh`，并把生成的 `public/` 作为静态输出目录。在 Vercel 中导入此 GitHub 仓库即可，无需另外填写构建命令或输出目录。

部署完成后，在项目的 **Settings → Domains** 中添加 `zsh.ee`，然后按 Vercel 显示的记录配置 DNS。

绑定域名前测试 Vercel 预览域名时，需要把下载基址指向该预览部署：

```bash
curl -fsSL https://PROJECT.vercel.app/vps-init/main-init.sh \
  | sudo env VPS_INIT_BASE_URL=https://PROJECT.vercel.app/vps-init sh
```

此发布包包含配置模板中的域名、UUID、密钥和密码字段。部署到公开域名等同于公开这些内容，正式使用前应替换不再准备公开复用的凭据。
