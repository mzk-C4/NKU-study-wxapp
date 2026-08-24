# 小程序微信登录接入说明（给丁宇鑫 / 前端组）

服务端已提供微信身份登录（个人主体可用，无需手机号授权）。本分支 `feat/syh-auth-api`
提供客户端封装 `miniprogram/services/auth.js`，可直接使用。

## 服务端接口（已上线）

| 接口 | 说明 |
|---|---|
| `POST /api/v1/auth/wechat` | body `{ "code": "<wx.login 的 code>" }`，返回 `{ token, expires_in, user }`，token 30 天 |
| `GET /api/v1/me` | 请求头 `Authorization: Bearer <token>`，返回当前用户 |
| `POST /api/v1/me/profile` | body `{ "nickname", "avatar_url" }`（头像仅 https） |
| `POST /api/v1/auth/logout` | 注销 token |

错误码：`AUTH_INVALID_CODE`（重新 wx.login 即可）、`AUTH_REQUIRED`（401，token 失效需重登）、
`AUTH_RATE_LIMITED`（429）、`MP_AUTH_NOT_CONFIGURED`（503，服务端未配密钥）。

## 客户端用法

```js
const auth = require('../../services/auth.js')

// 登录（收藏/投稿/写评价前触发；也可在「我的」页主动触发）
const user = await auth.login()

// 已登录拿缓存，未登录静默登录
const user = await auth.ensureLogin()

// 之后所有登录态请求：
await auth.authedPost('/favorites', { course_id: '...' })
await auth.authedGet('/me/favorites')

// 更新昵称头像（配合 chooseAvatar 按钮 + type="nickname" 输入框）
await auth.updateProfile({ nickname, avatarUrl })
```

## 页面建议

- 「我的」页放登录入口：调用 `auth.ensureLogin()`；显示 `user.nickname || '微信用户'`。
- 昵称采集用 `<input type="nickname" />`，头像用 `<button open-type="chooseAvatar">`
  （个人主体可用，无感知授权），拿到的临时头像路径先上传或直接用返回的 https 地址。
- 游客浏览不受影响：登录只在需要写入（收藏/投稿/评价）时触发（对应 DYX-05/06）。
- 401 `AUTH_REQUIRED` 时清空本地缓存并重新 `auth.login()`。

## 安全约定

- AppSecret 只在服务器环境变量（`WECHAT_APPID`/`WECHAT_APPSECRET`），客户端与仓库不存。
- 服务端响应不含 openid；管理后台「小程序用户」页只显示掩码标识与登录统计。
