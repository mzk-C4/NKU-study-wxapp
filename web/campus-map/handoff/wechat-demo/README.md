# 微信接入最小示例

导入本目录，填写自己的组织 AppID，修改 config/map-config.js，并完成网页 HTTPS 部署和业务域名配置。示例使用普通 JS，无 npm 依赖；无法只靠本地 HTTP 地址发布 web-view。

合并到原小程序时只复制 pages/campus-map、utils/campus-map-links.js、config/map-config.js，追加 app.json 的 pages 项并添加 navigator。不要覆盖原 app.json、首页、tabBar 或其他 web-view；已有同名 TS 页先比较，不能 JS/TS 两份并存。

返回首页兜底路径在地图页 goBack 中，其他项目请按实际首页路径修改。分享只接受固定来源下的白名单格式地点 ID，字段缺失时回退初始入口。根目录 verify-delivery.mjs 验证这些本地逻辑；不等于开发者工具／微信账号真机验收。

详见交付根目录 01-完整接入说明.md。
