# Checklist

- [x] 根 `pnpm-workspace.yaml` 只包含 `packages/*` 与 `e-sports-*`，`go-admin-web` 保持独立
- [x] `packages/esports-shared` 是唯一的请求层与 API 实现，三端 `src/api`、`src/utils` 均为转发文件，无复制实现
- [x] 共享包 `request.ts` 提供 `configureRequest`，401 与实名拦截跳转按端生效
- [x] 用户端 `e-sports-customer-uniapp` 只含客户页面，实名页为 `pages/identity/index`，无 `pages/player/*`、`pages/cs/*`
- [x] 用户端 tabBar 为报单 / 订单 / 我的，登录后直接进客户首页，不再探测陪玩身份
- [x] 陪玩端 `e-sports-player-uniapp` 只含陪玩页面，tabBar 为工作台 / 抢单 / 我的
- [x] 陪玩端登录页校验陪玩身份，非陪玩账号提示后停留登录页
- [x] 陪玩心跳只存在于陪玩端 `App.vue`，用户端与客服端无心跳代码
- [x] 原 `e-sports-uniapp` 只含 `cs/*` 与 `wecom/index`，tabBar 为工作台 / 客户 / 订单，无失效路径
- [x] 客服端冷启动只校验 admin token，无 token 时跳 `/pages/cs/login`
- [x] 三端范围内不存在指向已迁出页面的跳转（`pages/player/*`、`pages/cs/*`、`pages/identity/*` 交叉引用已清理）
- [x] 三端 `vite.config.ts` 固定 5174 / 5175 / 5176 且 `strictPort: true`
- [x] 三端 `pnpm run type-check` 通过
- [x] 三端 `pnpm run dev:h5` 启动后 `curl` 均返回 200，且 H5 代理 `/api/v1/esports/gifts` 返回 200
- [x] player01、customer01、admin 分别可登录对应端，身份分流正确
- [x] `go-admin-web` 仍可独立 `pnpm run dev`
- [x] `DEV.md` 已更新三端启动命令、端口与验证步骤
