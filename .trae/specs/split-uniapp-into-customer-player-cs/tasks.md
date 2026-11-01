# Tasks

- [x] Task 1: 建立 pnpm workspace 与共享包
  - [x] SubTask 1.1: 新增根 `pnpm-workspace.yaml`（成员仅 `packages/*`、`e-sports-*`）与私有根 `package.json`（聚合 `dev:customer` / `dev:player` / `dev:cs` 脚本），确认 `go-admin-web` 不在 workspace 成员内
  - [x] SubTask 1.2: 新建 `packages/esports-shared`，迁入 `request.ts`、`api/esports.ts`、`api/player.ts`、`api/cs.ts`、`api/upload.ts`、`utils/{format,levels,pay,evidence,wecom}.ts`、`types/qrcode.d.ts`，补齐包内相对 import
  - [x] SubTask 1.3: 在共享 `request.ts` 增加 `configureRequest({ loginPath, realnamePath })`，把 401 跳转与实名拦截跳转改为读配置（默认值保持现有行为）
  - [x] SubTask 1.4: 共享包配置 `package.json`（`@esports/shared`、exports 子路径、`@dcloudio/types` 类型依赖），并在根执行 `pnpm install` 确认可安装

- [x] Task 2: 新建用户端 `e-sports-customer-uniapp`
  - [x] SubTask 2.1: 复制 uni-app 工程骨架（`package.json`、`vite.config.ts`、`tsconfig.json`、`index.html`、`src/main.ts`、`src/App.vue`、`src/manifest.json`、`src/uni.scss`、`src/env.d.ts`、`src/shime-uni.d.ts`、`src/static`），依赖改为 `@esports/shared: workspace:*`
  - [x] SubTask 2.2: 迁入客户页面（`index`、`order`、`mine`、`messages`、`login`、`aftersale`、`help`、`wallet`、`gift`、`member`、`reviews`、`pay`、`webview`），新增 `pages/identity/index`（由 `player/identity` 改造为纯客户实名）
  - [x] SubTask 2.3: 重写 `pages.json`（仅客户页面 + tabBar 报单/订单/我的），`main.ts` 注入 `configureRequest`，`App.vue` 去掉陪玩心跳与 admin token 守卫，保留预览码与公开扫码支付重写
  - [x] SubTask 2.4: 清理跨端跳转：`mine` 实名入口指向 `/pages/identity/index`、删除客服登录入口；确认无 `pages/player/*`、`pages/cs/*` 残留
  - [x] SubTask 2.5: `src/api/*`、`src/utils/*` 改为共享包薄转发文件，页面 import 保持不变

- [x] Task 3: 新建陪玩端 `e-sports-player-uniapp`
  - [x] SubTask 3.1: 复制工程骨架，依赖改为 `@esports/shared: workspace:*`，`manifest.json` 独立命名与 appid 占位
  - [x] SubTask 3.2: 迁入陪玩页面（`player/home`、`hall`、`orders`、`wallet`、`addons`、`notices`、`profile`、`identity`、`transfer`、`assessments`、`recoveries`、`appeals`、`teammates`）与 `webview/index`
  - [x] SubTask 3.3: 新建陪玩专用 `pages/login/index`：手机号/账号 + 密码登录，登录成功后调用 `/user/player/dashboard` 校验陪伴身份，失败提示并停留
  - [x] SubTask 3.4: 重写 `pages.json`（tabBar 工作台/抢单/我的）与 `App.vue`（保留陪玩心跳与前台/后台处理，去掉预览码、公开支付、admin 守卫），`main.ts` 注入 `configureRequest`（登录页 `/pages/login/index`，实名页 `/pages/player/identity`）
  - [x] SubTask 3.5: 清理跨端跳转（`player/profile` 消息入口、`player/identity` webview 回跳等）并建立 `src/api/*`、`src/utils/*` 薄转发

- [x] Task 4: 原 `e-sports-uniapp` 改造为客服端
  - [x] SubTask 4.1: 删除客户页面与陪玩页面（`index`、`order`、`mine`、`messages`、`login`、`aftersale`、`help`、`wallet`、`gift`、`member`、`reviews`、`pay`、`player`），保留 `cs/*` 与 `wecom/index`
  - [x] SubTask 4.2: 重写 `pages.json`（仅客服页面，tabBar 工作台/客户/订单）、`App.vue`（仅 admin token 守卫，去掉心跳/预览/公开支付）、`main.ts`（`configureRequest` 登录页 `/pages/cs/login`）
  - [x] SubTask 4.3: 清理客服页面内指向 `pages/player/*` 等已删除页面的跳转，保留必要的客户档案跳转改用本端页面
  - [x] SubTask 4.4: `src/api/*`、`src/utils/*` 改为共享包薄转发，删除 `api/cs.close-evidence.contract.ts` 之外的重复实现前先确认引用完整

- [x] Task 5: 工程配置与文档
  - [x] SubTask 5.1: 三端 `vite.config.ts` 固定端口（用户端 5174、陪玩端 5175、客服端 5176）并开启 `strictPort`，保留 `/api`、`/uploads` 代理
  - [x] SubTask 5.2: 更新 `DEV.md`：三端启动命令、端口表、验证 curl、常见问题（端口顺延、共享包安装）
  - [x] SubTask 5.3: 各端补齐 `dev:h5` / `build:h5` / `type-check` 脚本并确认可执行

- [x] Task 6: 全量验证
  - [x] SubTask 6.1: 三端 `pnpm run type-check` 全部通过
  - [x] SubTask 6.2: 三端 `pnpm run dev:h5` 各自监听 5174/5175/5176，`curl` 返回 200，H5 代理 `/api/v1/esports/gifts` 返回 200
  - [x] SubTask 6.3: 用 player01 / customer01 / admin 分别登录对应端，验证身份分流与实名跳转
  - [x] SubTask 6.4: 确认 `go-admin-web` 仍能独立安装与 `pnpm run dev`（不受根 workspace 影响）

# Task Dependencies

- Task 2、Task 3、Task 4 依赖 Task 1（共享包必须先可用）
- Task 2、Task 3、Task 4 之间可并行
- Task 5 的端口配置依赖 Task 2、3、4 的工程骨架
- Task 6 依赖全部完成
