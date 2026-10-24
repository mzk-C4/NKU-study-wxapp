# 校园地图来源与维护

地图内容由 **cure 学长的 wiki 项目组 / NKUwiki** 提供，感谢贡献！

本说明对应八里台、津南原生地图。2026-10-17 新增的津南三维网页来自用户提供的独立接入包，模型、地点 ID、搜索与记录分别维护；来源、许可、模型保护和构建方法见 [三维接入说明](../../../web/campus-map/INTEGRATION.md)，不把原生 GCJ02 坐标与三维平面坐标混用。

- 站点：https://freshnkuer.wiki
- 数据：[NKUwiki map-data.js](https://github.com/NKUwiki/NKUwiki/blob/20ad5fcb42de480192df8aa480936f4409d2dc45/docs/.vitepress/data/map-data.js)
- 参考交互：[独立 wiki-map 包](https://github.com/NKUwiki/NKUwiki/tree/20ad5fcb42de480192df8aa480936f4409d2dc45/packages/wiki-map)
- 本次基准：`20ad5fcb42de480192df8aa480936f4409d2dc45`（2026-10-11 核对）。76 处地点、分类、介绍、坐标和图片与上一基准一致。运行时来源由 `source.js` 提供；不要直接 require JSON，小程序运行时只加载 JS 模块。
- 数据和图标按上游 [CC BY-NC-SA 4.0 内容许可](../../../docs/licenses/NKUwiki-LICENSE-CONTENT.md) 保留署名、非商业和相同方式共享条件；上游主题代码许可见 [MIT](../../../docs/licenses/NKUwiki-LICENSE.txt)。本仓库的 MIT 声明不替代这些第三方内容许可。
- 上游记录点位来自 CQUMAPS-1.0，地图交互参考 QUT-WiKi，分类图标路径参考 CQU-openlib（Lucide 风格）。这里将分类 SVG 几何转为本地 PNG，将网页数据适配为小程序原生地图结构。地点介绍、GCJ02 坐标及既有主楼图片说明保留；不复制网页地图 Key。

## 地图本地搜索

- `search.js` 适配自上述提交的 [`packages/wiki-map/search.js`](https://github.com/NKUwiki/NKUwiki/blob/20ad5fcb42de480192df8aa480936f4409d2dc45/packages/wiki-map/search.js)，沿用 MiniSearch、中文单字/相邻二元组、前缀、`fuzzy: 0.2` 和名称/别名/介绍 `3/2/1` 权重；按上游 [MIT 许可](../../../docs/licenses/NKUwiki-LICENSE.txt) 保留来源。没有引入 Vue 或高德网页 SDK。
- 小程序适配：复用已有 NFKC/标点归一化及 80 字上限，保留分类名称搜索；每个空格分隔词组须在同一字段中精确或近似出现，避免上游 OR 召回仅凭常见单字返回大量无关点位。1–2 字词组须连续命中，3 字及以上允许最多 1–2 次编辑（插入/删除/替换）；仍须先通过 MiniSearch 召回。完整名称优先、名称包含词组其次、完整别名再次，其余按引擎相关性排序，同分按稳定字符串 ID 排序。
- 引擎首次搜索时建立一次内存索引，不改变页面进入或地图重载流程，不产生搜索网络请求。搜索后叠加校区/分类/常用/最近筛选；空搜索保留原数据顺序，常用/最近保留本机时间顺序；数字 marker ID 及存储键不变。
- 上游当前 76 处均未提供 `aliases`。同步器现支持该可选字符串数组，保留别称、拼音和首字母（最多 32 项、每项 80 字），拒绝非法值；不自动生成未经核对的别名，也不承诺当前所有地点可以拼音搜索。
- `miniprogram/lib/minisearch.js` 使用上游锁定的 **MiniSearch 7.2.0**，来源为 npm 官方包的 `dist/cjs/index.cjs`，仅添加来源和完整 MIT 许可头。无运行时 npm 构建步骤，无其他运行依赖；许可另存 [MiniSearch-LICENSE.txt](../../../docs/licenses/MiniSearch-LICENSE.txt)。更新时从 `https://registry.npmjs.org/minisearch/7.2.0` 核对版本和 tarball 校验值，不直接替换为最新版。
- 已核对该 npm tarball 的 SHA-512：`dqT2XBYUOZOiC5t2HRnwADjhNS2cecp9u+TJRiJ1Qp/f5qjkeT5APcGPjHw+bz89Ms8Jp+cG4AlE+QZ/QnDglg==`。数据同步不会自动更新搜索实现或第三方引擎，升级代码时须单独复核上述来源与回归。

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
- 可选 `aliases` 随地点数据同步，trim/去重后保存；缺省时不添加虚构别名，数字 ID 与坐标不会因此变化。
- `article` 只接受站内 `/pages/…` 路径，转换为固定 NKUwiki 来源。当前小程序提供复制链接到浏览器阅读，不假定已获该站点的业务域名配置。

同步后运行 `node --test test/campus-map.test.js test/campus-map-search.test.js test/local-experience.test.js`、`node scripts/check-miniprogram.js`，并在微信开发者工具从指南实际进入地图，试搜“图书官”“图书 自习”和无结果词组。Node 能 require JSON 并不等于小程序可以；专项包含 JS 模块加载器启动与搜索回归。
