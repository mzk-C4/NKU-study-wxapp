# 校园地图来源与维护

地图内容由 **cure 学长的 wiki 项目组 / NKUwiki** 提供，感谢贡献！

- 站点：https://freshnkuer.wiki
- 数据：[NKUwiki map-data.js](https://github.com/NKUwiki/NKUwiki/blob/53db8ef5908b7f4554c8391fcfd43b64473000db/docs/.vitepress/data/map-data.js)
- 参考交互：[MapView.vue](https://github.com/NKUwiki/NKUwiki/blob/53db8ef5908b7f4554c8391fcfd43b64473000db/packages/wiki-theme/theme/components/MapView.vue)
- 本次基准：`53db8ef5908b7f4554c8391fcfd43b64473000db`。运行时来源由 `source.js` 提供；不要直接 require JSON，小程序运行时只加载 JS 模块。
- 数据和图标按上游 [CC BY-NC-SA 4.0 内容许可](../../../docs/licenses/NKUwiki-LICENSE-CONTENT.md) 保留署名、非商业和相同方式共享条件；上游主题代码许可见 [MIT](../../../docs/licenses/NKUwiki-LICENSE.txt)。本仓库的 MIT 声明不替代这些第三方内容许可。
- 上游记录点位来自 CQUMAPS-1.0，地图交互参考 QUT-WiKi，分类图标路径参考 CQU-openlib（Lucide 风格）。这里将分类 SVG 几何转为本地 PNG，将网页数据适配为小程序原生地图结构。地点介绍、GCJ02 坐标及既有主楼图片说明保留；不复制网页地图 Key。

## 手动同步

从项目根目录运行（Node 18+）：

```text
node scripts/sync-campus-map.js
node scripts/sync-campus-map.js --revision <完整的上游提交SHA>
```

默认只读取固定提交的公开数据并输出新增、删除、变化报告，不写文件。可以指定 `--source <已下载的map-data.js路径>` 离线检查；同时指定真实 `--revision` 记录其来源。脚本只接受对象、数组和原始值字面量，不执行远程 JavaScript。

核对差异后，加 `--write` 生成数据、来源 JS 和图标。生成 PNG 需要开发机提供 `sharp`，可通过 Node 模块路径或 `--sharp-module <sharp包绝对路径>` 指定；小程序运行不依赖它。

维护 `scripts/campus-map-source.json`：

- `markerIds` 保存稳定字符串 ID 与历史数字标记 ID 的映射。既有 1～76 不重排，删除点位也保留旧映射，新地点只分配新 ID，以兼容本机常用/最近记录。
- `images` 保存上游图片路径到本地资源及说明的映射。新图片须先核对来源和许可、保存至本地资源目录并添加映射；缺失图片会阻止写入，不静默丢失内容。
- 新增分类须提供安全 SVG 几何及配色；当前校区没有点位的类别不会展示。
- `article` 只接受站内 `/pages/…` 路径，转换为固定 NKUwiki 来源。当前小程序提供复制链接到浏览器阅读，不假定已获该站点的业务域名配置。

同步后运行 `node --test test/campus-map.test.js test/local-experience.test.js`、`node scripts/check-miniprogram.js`，并在微信开发者工具从指南实际进入地图。Node 能 require JSON 并不等于小程序可以；专项包含 JS 模块加载器回归。
