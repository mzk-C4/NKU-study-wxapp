# 津南三维校园地图 · NKUStudy 接入

当前接入说明以本文件为准；仓库当前验收与发布状态见 [协作状态](../../docs/COLLABORATION_PLAN.md)。原包 README、WECHAT-INTEGRATION.md 和 handoff 中的旧项目路径、域名、数量与部署示例是历史资料，不代表本项目已部署。

## 代码与运行

- `web/campus-map/` 是独立 Vite / TypeScript / Three.js 网页，不进入小程序运行目录。使用 Node 22.12+（本轮 Node 24.18.0），保留原锁文件。
- `miniprogram/features/campus-map-3d/config.js` 持有统一入口开关 `enabled: true`、开发预览回退开关 `developEnabled: true` 和固定目标 `https://nkustudy.top/campus-map/`。`enabled:true` 时开发版、体验版和正式版均开放入口，不依赖环境信息读取；只有将统一开关关闭后才使用开发预览回退。源码开关变更必须随新小程序包交付，不会远程改变已发布版本。
- 指南针“校园地图”进入 `pages/campus-map-select/index`，分别选择“腾讯地图”（cure 学长提供，二维平面与导航）或“2D / 3D 校园地图”（绅右同学提供，津南建筑导览）。原生地图内不再显示三维入口，原页面地址及旧分享兼容逻辑保留。原地图的 GCJ02 数字 marker、MiniSearch、本机常用/最近与网页的字符串 ID、模糊搜索、localStorage 相互独立。
- `pages/campus-map-3d/index` 独立承载 web-view，地址固定添加 `embed=wechat`；失败移除组件，重试在下一次渲染创建组件。原生外壳遵循现有手动主题，网页沿用原包配色。
- 从选择页正常返回或在错误页点击返回，使用 `navigateBack` 回到选择页；从旧原生入口进入则保留原地图状态；从分享独立启动时先 `redirectTo` 津南原地图，再由其 `onReady` 打开三维页，从而为系统返回按钮建立正确的上一页。错误页也可直接返回津南。
- 地点 ID 白名单由网页目录生成，只复制 110 个 ID，不复制平面坐标。变更目录后执行 `node scripts/sync-place-ids.mjs --write`；普通检查仅比对白名单。
- 分享优先解析微信提供的当前 `webViewUrl`，仅接受固定 HTTPS 来源及 `/campus-map/` 路径。未知 ID、畸形编码、重复参数、其他网页或无地点参数均分享全校视图；没有 `webViewUrl` 时回退入口 ID。复位后的 URL 已删除地点参数，不能回退旧地点。微信是否提供当前 URL 仍须用两个账号实测。
- 不新增 API、登录、地图密钥、原生定位或导航；网页模型坐标不能传给 `wx.openLocation`。

从本目录运行：

```powershell
npm.cmd ci --ignore-scripts --no-audit --no-fund
npm.cmd run check
npm.cmd run preview -- --port 4180 --strictPort
```

预览：`http://127.0.0.1:4180/campus-map/?embed=wechat`；强制二维追加 `&mode=2d`。构建保持 `/campus-map/`，`emptyOutDir: false` 保留已有哈希资源，不自动清理输出。不执行 `refresh:data`、OSM 下载或模型生成。

## 来源与保留范围

来源包：`校园地图-模型源码与微信接入完整包-20261016.zip`，SHA-256 见 `IMPORT.json`。已校验原包清单中的 141 个文件；导入 95 个源码文件，另保留 Three.js、TypeScript、Vite 的 3 份许可。原预构建 dist 未导入，使用锁定源码重新构建。

当前模型为 93 个建筑/地标、282 条道路、101 个景观区域；地点目录 110 项，78 个默认命名标签。原始 src/data/reference 与锁文件共 40 个文件逐字节一致；不改模型保护基线、树位、几何、手势或原搜索实现。保护检查另核对 17 个文件与 27 个内联建筑节点。

三维页面保留 OSM 署名、ODbL 来源链接、Three.js MIT 许可及数据待核验说明；原生地图仍保留 cure 学长和 NKUwiki 鸣谢。`public/credits.html` 包含估位、人工补绘与学校标志说明，`licenses/` 保留构建依赖许可；原作者项目名不当作 NKUStudy 的原创署名替换。

## 本地与真实设备验证

- 根目录 `npm.cmd test` 覆盖原地图、主题及新增页面，`python -X utf8 scripts/check-wxml.py miniprogram` 检查页面结构。
- 本目录 `npm.cmd run check` 执行构建、数据、几何、深链接、相机/LOD、手势数学、模型保护、搜索及 native ID 白名单检查。
- `scripts/integration-browser-checks.mjs` 导出可接入 CDP transport 的浏览器检查。应用内浏览器需把 `Page.navigate` / `Page.reload` 转发为浏览器工具的 `goto` / `reload`，通过 viewport 能力设置尺寸。不同 transport 不一定支持触摸或启动脚本注入；不支持时记录 BLOCKED，不能记作通过。
- 原包四份 `*browser-smoke.mjs` 仍保留，使用专用本地 CDP 9229 测试浏览器；输出由 `CAMPUS_MAP_ARTIFACT_DIR` 指定，默认 `../../artifacts/campus-map/browser`，运行前创建该目录。不要连接用户个人浏览器或把原包历史结果当作本轮证据。
- 本轮证据位于根目录 `artifacts/campus-map/`（不纳入 Git）；完整状态和实际未执行项写在协作状态文件。

部署之后再验收：iOS / Android 微信打开与返回、首次慢网、触摸与后台恢复、失败重试、账号 A 分享给账号 B 的地点定位、全校复位后的再次分享，以及无当前网页 URL 的回退。浏览器和 VM 测试不能替代这些验收。

## 交付顺序

见 [静态部署交接](DEPLOYMENT.md)。先由网站维护方挂载网页，核验页面、带哈希 JS/CSS 与来源页，再通过受控开发构建完成微信真机与分享验收。当前按用户反馈已打开正式入口开关；仍需用新包验证真机打开与分享，再安排审核发布。提交、推送、生产部署、微信上传均另行执行。
