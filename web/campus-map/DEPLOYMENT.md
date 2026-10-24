# 津南三维校园地图 · 静态部署交接

目标：**https://nkustudy.top/campus-map/**。初次交付时目标为 HTTP 404；此后用户已自行通过 Caddy 部署，并确认业务域名配置完成。最新只读核验为 HTTP 200，JS/CSS 与来源、许可、图片均匹配；首页仍用原包标题且 HTML 缺少显式缓存头，因此严格部署检查未完全通过。具体证据与微信验收状态见 [协作状态](../../docs/COLLABORATION_PLAN.md)。直接部署静态文件可供小程序接入，无需先提交网站 Git；源码与服务器发布的版本对应关系宜另行维护。

## 包的内容

`campus-map-static-20261017.zip` 中：

- `campus-map/`：构建产物 index.html、assets 下带哈希 JS/CSS、credits.html、LICENSE-three.txt、校徽图片。
- `SHA256SUMS.json`：每个静态文件的大小和 SHA-256。
- `DEPLOYMENT.md`：本说明。

小程序源码、模型编辑工程、开发依赖、测试报告、appId 与秘密配置不进入静态部署包。模型与地点数据已经编入 JS；不存在额外 GLB 下载服务或新 API。

## 网站维护方操作

1. 先核对 ZIP 内文件和 SHA-256，再把 `campus-map/` 的内容接入现有站点的 `/campus-map/` 路径。只操作这个子目录，不覆盖主站根目录或现有 API 配置；不要直接复制原包面向 `nkulawer.cn` 的 Nginx 片段。
2. 先上传新的带哈希 assets、图片、许可和来源页，最后原子替换 index.html。保留旧哈希资源，避免缓存 HTML 引用的文件突然消失。回滚时切回旧 HTML 与对应资源，不需要数据库回滚。
3. index.html、credits.html 使用 `Cache-Control: no-cache` 或短缓存并重新验证；带哈希 assets 可用长缓存与 immutable。不要给固定文件名 HTML、图片和来源页配置永久不可变缓存。启用站点已有 gzip/Brotli，有利于首次慢网加载。
4. `/campus-map/` 以及带 query 的深链接必须返回地图 HTML；JS/CSS 必须返回正确 MIME 和文件内容，丢失的资源应返回 404，不能被主站 SPA fallback 替换成 HTML。资源 URL 不应重定向到其他来源。
5. 保持 HTTPS、有效证书及小程序业务域名配置。网页不需要接口请求域名、地图 Key 或登录。来源说明与 Three.js 许可必须一起可访问。

## 部署后的核验

从 `web/campus-map/` 执行 `node scripts/verify-deployment.mjs`，该脚本仅 GET 固定目标，并对照当前本地构建检查页面、资源、来源页、MIME 与 SHA-256；不修改生产。HTML 缓存头也会检查。脚本通过仍不代表微信验收通过。

浏览器检查下列链接与交互：

- `https://nkustudy.top/campus-map/?embed=wechat`
- `https://nkustudy.top/campus-map/?embed=wechat&buildingId=osm-building-616829077`
- `https://nkustudy.top/campus-map/?embed=wechat&mode=2d`
- `https://nkustudy.top/campus-map/credits.html`

核验搜索“公教A / 二食 / 图书管 / tsg”、分类、常用/最近、详情、图层、全校视图与手机横竖屏。未知 ID 应清空选择。每个合法地点的平面坐标均不用于微信精确导航。

网页验证通过后，再在开发者工具与 iOS/Android 真机进行完整 web-view 联调，使用两个账号实测地点分享和复位后分享。当前 `miniprogram/features/campus-map-3d/config.js` 的统一入口开关为 true，开发版、体验版与正式版均可打开。该修改只有重新打包交付后才生效；开启源码入口不代表已发布，也不代表微信渲染与分享已验收。

## 当前限制

本地已构建并检查模型；原包 src、data、reference、锁文件没有改动。WebGL2 不可用时使用二维；强制上下文丢失的本地浏览器检查已确认保留选中地点。双指事件、启动前 WebGL 故障模拟及真机性能仍需在支持相应能力的设备完成。OSM/补绘名称、高度、学校标志及现状的待核验说明继续保留。
