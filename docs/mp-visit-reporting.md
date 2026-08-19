# 小程序访问统计上报规格

## 端点

```
POST https://nkustudy.top/visit-api/hit
Content-Type: application/json

{ "path": "/mp/<页面名>" }
```

- 域名与业务域名一致，**无需在微信公众平台新增合法域名**。
- 上报后自动归入「小程序」类别并计入趋势图。
- **不要传 openid 等任何用户标识**，只传 path。

## 页面命名对照表

页面名只允许小写字母、数字和中括线（`/^[a-z0-9-]+$/`），与页面目录名保持一致：

| 页面 | path | 说明 |
|---|---|---|
| 首页 | `/mp/home` | TabBar |
| 课程库 | `/mp/courses` | TabBar |
| 指南 | `/mp/guides` | TabBar |
| 我的 | `/mp/profile` | TabBar |
| 搜索 | `/mp/search` | |
| 课程概览 | `/mp/course-overview` | 课程详情 |
| 课程资料 | `/mp/course-resources` | |
| 课程评价 | `/mp/course-reviews` | |
| 指南详情 | `/mp/guide-detail` | |
| 分享资料 | `/mp/submit-resource` | |
| 写评价 | `/mp/write-review` | |

设计稿中的「资料详情」页在当前架构下并入课程资料页，不单独上报。

## 小程序侧用法

统一使用 `miniprogram/utils/visit-report.js`，在每个页面的 `onLoad` 第一行调用：

```js
const { reportVisit } = require('../../utils/visit-report')

Page({
  onLoad() {
    reportVisit('/mp/home')
    // ...原有逻辑
  }
})
```

`reportVisit` 的行为：

- 只接受符合命名规则的 path，非法输入静默忽略；
- `wx.request` 失败静默丢弃，统计永不影响页面功能；
- 不读取、不附带任何登录态或用户信息。

## 新增页面检查清单

1. 页面目录名只用小写字母、数字、中括线；
2. `onLoad` 首行调用 `reportVisit('/mp/<页面名>')`；
3. 不新增域名、不新增请求头、不上报用户标识。