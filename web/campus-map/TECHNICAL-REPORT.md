# 津南校区 3D 白模 · 技术检测报告

检测日期：2026-09-19  
范围：`campus-map-lab/` 独立试验目录；不涉及主网站、其路由、Supabase、管理后台或线上 `dist`。

## 本次产物

- 开源数据管线：Overpass → 原始 OSM JSON → 审核 GeoJSON → 运行用 TypeScript 模型。
- 校区边界：OSM way `476603067`（`南开大学(津南校区)`）。它用于排除边界外的道路和建筑，不能替代校方边界确认。
- 当前模型：82 栋建筑体块、234 条道路、100 个绿地/水面、9 个公共节点；详情见 `data/jinnan-model-manifest.json`。
- 交互：拖拽/缩放、点击建筑、搜索、按分区聚焦、图层开关、视图复位、WebGL 不可用时的 2D 降级。
- 坐标：将经纬度转换为 `X 向东、Z 向南`，默认相机固定为北上、东右；右上角指南针会随用户旋转实时指向真实北向。

## 采用的开源方法

- [cartesiancs/map3d](https://github.com/cartesiancs/map3d) 是 MIT 开源的 React Three Fiber + OSM 3D 地图生成器；它证明了“OSM 轮廓挤出为白模”的路线可行。
- [Mapforge](https://github.com/stonyp/mapforge) 在同一路线中展示了建筑、道路、步行路径分层和 GLB 导出的做法。
- 本实验没有复制上述项目的代码或素材，而是使用 Three.js 自建渲染器与可追溯的 OSM 数据转换脚本。

## 已发现并处理的问题

| 问题 | 处理 |
| --- | --- |
| 初次 OSM 查询覆盖了校区外道路/建筑 | 下载时加入校区边界，转换时以边界过滤，得到 82 个校内建筑体块。 |
| 234 条道路和 100 个景观面如果逐个渲染，手机 draw call 偏高 | 道路按 3 类合批，绿地/水面按材质合批；建筑仍逐栋保留，支持点击。树木使用 `InstancedMesh` 并限制到 520 个实例。 |
| 设备无 WebGL 或初始化失败会导致空白页面 | 增加检测与静态 2D 白模回退。 |
| OSM 原始数据不应随公开页面输出 | 审核 GeoJSON 与原始响应都位于 `data/`，Vite 产物只包含运行模型。 |
| 当前开发环境无法获得 GPU 截图 | 已完成 TypeScript、Vite 生产构建与数据完整性检查；真实 GPU 帧率需在目标手机/桌面设备上复测。 |

## 构建检测结果

`npm run check` 已通过：TypeScript、Vite 生产构建、OSM GeoJSON 与模型清单校验均通过。

- 生产目录总大小：约 672 KB。
- JavaScript：约 174 KB gzip。该文件大于 Vite 默认“未压缩 500 KB”提示线，主要来自 Three.js；这不是构建失败。正式接入时将把整个地图页作为懒加载路由，避免资料库首页下载这部分代码。
- 当前渲染结构预计为约 82 个可选建筑 draw call，加上少数合批图层和两组树实例；实际帧率以真实设备性能面板为准。

## 发布前不可跳过的事

1. 校方/熟悉校区的人员核对建筑名称、用途、入口、道路与在建区域。
2. 对 OSM 数据履行署名和 ODbL 义务，参见 <https://www.openstreetmap.org/copyright>。
3. 评估公开校园三维地图的地图审核和相关合规要求；在完成确认前不接入公开网站。
4. 用至少一台 iPhone、一台安卓微信内置浏览器和一台桌面浏览器测试手势、内存、首屏与 2D 降级。

## 可重复操作

```powershell
npm install
npm run refresh:data   # 重新下载与生成；需要网络
npm run check
npm run dev
```

`refresh:data` 只更新本实验目录。它不会触发网站构建或部署。
