# 状态图片 / Status images

[Vespera](https://github.com/CIXMEDTECH/Vespera) 探针面板的插件，插件 id 为 `status-image`。

把节点的实时状态做成图片：小徽章、单节点卡片和全部节点的状态看板，有 SVG、PNG、JPEG 和会自己刷新的 MJPEG 实时流，可以贴到 README、论坛签名或网站里。

中文字体随插件附带：Noto Sans SC 常用字子集，SIL Open Font License 1.1，许可证见 [`fonts/OFL.txt`](fonts/OFL.txt)。PNG、JPEG 和实时流需要面板 `0.1.0-beta.8.3` 或更新版本。

## 安装

- **插件市场**：在面板后台 **插件 → 插件市场** 里找到“状态图片”，点击安装，审核权限后启用。
- **手动上传**：从 [Releases](https://github.com/CIXMEDTECH/Plugin-Status-Image/releases) 下载 `status-image-<版本>.zip`，在 **插件 → 已安装 → 上传插件** 里上传。

申请的权限：`nodes`、`routes`、`routes:public`（图片地址对所有人开放，隐藏节点不会出图；私有站点也可以使用）。

## 自定义图片地址

图片默认在 `<站点地址>/api/plugin/status-image/` 下，例如 `https://example.com/api/plugin/status-image/board.svg`。想换成更短或独立的地址时，在插件设置里填写 **图片地址前缀**（如 `https://img.example.com` 或 `https://example.com/status-img`），插件页面生成的嵌入代码就会改用它；然后在反向代理里把这个地址转发到面板的 `/api/plugin/status-image/`。以 nginx 为例：

```nginx
location /status-img/ {
    proxy_pass http://127.0.0.1:8080/api/plugin/status-image/;
    proxy_buffering off;   # MJPEG 实时流需要
}
```

## 开发

不需要安装依赖，只需要 Node.js 22 或更新版本。

```bash
node --test 'test/*.test.mjs'          # 测试：在 Node 里加载 main.js，用替身代替面板的 vespera 接口
node scripts/pack.mjs      # 打包到 dist/status-image-<版本>.zip，并输出 SHA-256
```

打包结果是可复现的：同样的源码总是得到同样的 zip 和 SHA-256，插件市场用它校验安装包。

接口说明见面板仓库的 [插件开发文档](https://github.com/CIXMEDTECH/Vespera/blob/main/docs/PLUGIN.md)。

## 发布

1. 修改 `vespera-plugin.json` 里的 `version`。
2. 推送同名标签：`git tag v<版本> && git push origin v<版本>`。
3. GitHub Actions 运行测试、打包，并把 zip 和 `.sha256` 附到 Release 上。带后缀（如 `-beta.1`）的版本发布为预发布。
4. [插件市场](https://github.com/CIXMEDTECH/Vespera-Plugin-Market) 每 6 小时检查一次 Release，校验通过后自动发起更新目录的 PR。
