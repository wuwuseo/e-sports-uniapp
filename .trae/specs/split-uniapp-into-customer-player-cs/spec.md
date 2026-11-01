# 三端拆分（用户端 / 陪玩端 / 客服端）Spec

## Why

现有 `e-sports-uniapp` 用一份代码同时承载客户、陪玩、移动客服三种身份：`pages.json` 混排 43 个页面、`App.vue` 同时启动陪玩心跳与客服登录守卫、登录靠运行时探测陪玩档案决定去哪个首页。三种身份的路由、权限、包体积与小程序主体互相牵制，任一端的页面改动都会影响其余两端。拆成三个独立 uniapp，公共请求层与 API 定义抽到 workspace 共享包，消除重复代码的同时让三端可以独立开发、构建、发布。

## What Changes

- 在仓库根新增 pnpm workspace（根 `pnpm-workspace.yaml` + 私有根 `package.json`），成员仅 `packages/*` 与 `e-sports-*`；`go-admin-web` 保持独立，不受 workspace 影响。
- 新增 `packages/esports-shared` 共享包：`request.ts`、`api/esports.ts`、`api/player.ts`、`api/cs.ts`、`api/upload.ts`、`utils/*`、`types/qrcode.d.ts` 全量迁入。
- `request.ts` 增加按端可配置的运行时钩子：401 跳转路径、实名拦截跳转路径，替代当前硬编码的 `/pages/login/index` 与 `/pages/player/identity`。
- 新增 `e-sports-customer-uniapp`（用户端，端口 5174）：只保留客户自助页面，tabBar 报单 / 订单 / 我的。
- 新增 `e-sports-player-uniapp`（陪玩端，端口 5175）：只保留陪玩页面，tabBar 工作台 / 抢单 / 我的，登录即校验陪玩身份。
- 原 `e-sports-uniapp` 改造为移动客服端（端口 5176）：只保留 `pages/cs/*` 与 `pages/wecom`，仅校验 admin token，tabBar 工作台 / 客户 / 订单。
- **BREAKING**：原混合端「一个入口跑三种身份」的登录分流被移除；客服端启动端口由 5174 改为 5176，其他端占用 5174 / 5175。
- 各端 `src/api/*`、`src/utils/*` 保留同名薄转发文件（`export * from '@esports/shared/...'`），页面现有 import 路径无需改写。
- 更新 `DEV.md` 与根脚本，写明三端启动命令、端口与代理关系。

## Impact

- 受影响能力：客户端 H5 / 微信小程序构建、登录与路由守卫、实名认证引导、陪玩在线心跳、客服登录与工作台。
- 受影响代码：`e-sports-uniapp` 的 `pages/`、`pages.json`、`App.vue`、`main.ts`、`vite.config.ts`、`manifest.json`、`src/api/*`、`src/utils/*`；新增两个项目目录与共享包；根目录新增 workspace 配置；`DEV.md`。
- 不受影响：`go-admin` 后端、`go-admin-web` 管理端、后端接口契约。

## ADDED Requirements

### Requirement: 共享代码包

系统 SHALL 在 `packages/esports-shared` 中提供唯一的请求层与 API 定义，三端不得各自复制实现。

#### Scenario: 共享包被三端引用

- **WHEN** 任一端 `src/api/esports.ts`、`src/api/player.ts`、`src/api/cs.ts`、`src/api/upload.ts`、`src/api/request.ts` 被页面导入
- **THEN** 这些文件只做 `export * from '@esports/shared/...'` 转发，实际实现只存在于 `packages/esports-shared/src`

#### Scenario: 共享包依赖 uni 全局

- **WHEN** 任一端执行 `pnpm run type-check` 与构建
- **THEN** 共享包内 `uni.*` 调用能通过类型检查，不出现 `Cannot find name 'uni'`

### Requirement: 按端可配置的请求跳转

`request.ts` SHALL 暴露 `configureRequest({ loginPath, realnamePath })`，由各端在启动时注入自己的登录页与实名页路径。

#### Scenario: 401 未登录

- **WHEN** 业务接口返回 401
- **THEN** 清空本地 token 并跳转到本端配置的 `loginPath`（用户端/陪玩端 `/pages/login/index`，客服端 `/pages/cs/login`）

#### Scenario: 实名拦截

- **WHEN** 接口返回 `error_code = realname_required`
- **THEN** 跳转到本端配置的实名页（用户端 `/pages/identity/index`，陪玩端 `/pages/player/identity`），不再跨端跳转

### Requirement: 用户端项目

系统 SHALL 提供独立的 `e-sports-customer-uniapp`，仅包含客户自助页面。

#### Scenario: 页面集合

- **WHEN** 查看其 `pages.json`
- **THEN** 只包含：`index/index`、`index/PageBlock`、`order/list`、`order/create`、`order/detail`、`mine/index`、`messages/index`、`login/index`、`aftersale/list`、`help/index`、`wallet/index`、`wallet/recharge`、`gift/intents`、`gift/disputes`、`member/priority-booking`、`reviews/index`、`pay/cashier`、`pay/scan`、`webview/index`、`identity/index`（由原 `player/identity` 迁移的纯客户实名页）

#### Scenario: 用户端守卫

- **WHEN** 应用冷启动且本地无 user token
- **THEN** 跳转 `/pages/login/index`，登录成功直接进入客户自助首页，不再探测陪玩档案

### Requirement: 陪玩端项目

系统 SHALL 提供独立的 `e-sports-player-uniapp`，仅包含陪玩页面。

#### Scenario: 页面集合

- **WHEN** 查看其 `pages.json`
- **THEN** 只包含：`login/index`（陪玩专用登录）、`player/home`、`player/hall`、`player/orders`、`player/wallet`、`player/addons`、`player/notices`、`player/profile`、`player/identity`、`player/transfer`、`player/assessments`、`player/recoveries`、`player/appeals`、`player/teammates`、`webview/index`

#### Scenario: 陪玩身份校验

- **WHEN** 账号登录成功但 `/user/player/dashboard` 返回非成功
- **THEN** 提示该账号未开通陪玩身份并停留登录页，不进入工作台

#### Scenario: 心跳只在陪玩端

- **WHEN** 应用在前台且处于陪玩身份
- **THEN** 由 `App.vue` 维持在线心跳，切后台停止；用户端与客服端不包含心跳代码

### Requirement: 客服端项目

原 `e-sports-uniapp` SHALL 改造为移动客服端，仅保留客服相关页面。

#### Scenario: 页面集合

- **WHEN** 查看其 `pages.json`
- **THEN** 只包含：`cs/login`、`cs/workbench`、`cs/customers`、`cs/customer-detail`、`cs/order-create`、`cs/orders`、`cs/order-detail`、`cs/scripts`、`cs/after-sales`、`cs/member-levels`、`cs/gift`、`wecom/index`

#### Scenario: 客服登录守卫

- **WHEN** 应用冷启动且本地无 admin token
- **THEN** 跳转 `/pages/cs/login`，不要求先登录客户账号

### Requirement: 固定开发端口

三端 SHALL 在各自的 `vite.config.ts` 固定端口并开启 `strictPort`。

#### Scenario: 并行启动

- **WHEN** 用户端、陪玩端、客服端按顺序启动
- **THEN** 分别监听 5174、5175、5176，不因端口占用顺延而串端

## MODIFIED Requirements

### Requirement: 端内跳转一致性

原混合项目内 `pages/mine/index.vue` 跳 `/pages/player/identity`、`/pages/cs/login`，`pages/player/profile.vue` 跳 `/pages/messages/index`。拆分后每个端 SHALL 只保留指向本端页面的跳转：用户端实名入口改指 `/pages/identity/index`，并删除客服登录入口；陪玩端保留消息中心或改指本端通知页；客服端不得指向 `pages/player/*`。

#### Scenario: 跨端路径清理

- **WHEN** 对三端源码检索 `pages/player/`、`pages/cs/`、`pages/identity/` 等已迁出路径
- **THEN** 每个端只出现本端 `pages.json` 中注册过的路径，无失效跳转

## REMOVED Requirements

### Requirement: 运行时身份探测分流

**Reason**：拆分后各端入口即身份，不再需要「登录后探测陪玩档案决定首页」的逻辑。

**Migration**：用户端登录后固定进 `/pages/index/index`；陪玩端登录时校验陪玩档案；客服端走独立的 `cs/login` admin 登录。
