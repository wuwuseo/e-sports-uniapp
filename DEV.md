# 本地开发启动方式

工作区 `D:\www\EsportsPartner` 是 pnpm workspace，下面并列五个服务，每个都要单独起进程：

| 服务 | 目录 | 启动命令 | 端口 |
|---|---|---|---|
| 后端 API（Go + Fiber + Ent） | `go-admin` | `$env:ESPORTS_EXPERIMENTAL='1'; go run main.go` | 9501 |
| 管理端（Vue 3 + Arco + Vite） | `go-admin-web` | `pnpm run dev` | 5173 |
| 用户端 H5（uni-app） | `e-sports-customer-uniapp` | `pnpm dev:h5` | 5174 |
| 陪玩端 H5（uni-app） | `e-sports-player-uniapp` | `pnpm dev:h5` | 5175 |
| 客服端 H5（uni-app） | `e-sports-uniapp` | `pnpm dev:h5` | 5176 |

> 三个 uni-app 端共用 `packages/esports-shared`（请求层 / API / 工具函数），改动共享包会同时生效到三端。

## 0. 开工前先确认

首次拉代码或共享包有改动后，先在根目录安装一次（`@esports/shared` 是 workspace 依赖）：

```powershell
cd D:\www\EsportsPartner
pnpm install --no-frozen-lockfile
```

已在运行就别重复起——三端都开了 `strictPort`，端口被占会直接启动失败，不会自动顺延：

```powershell
Get-NetTCPConnection -State Listen -LocalPort 9501,5173,5174,5175,5176 -ErrorAction SilentlyContinue |
  Select-Object LocalPort, OwningProcess
```

依赖服务（MySQL 3306、Redis 6379）也要在监听：

```powershell
Get-NetTCPConnection -State Listen -LocalPort 3306,6379 -ErrorAction SilentlyContinue
```

- MySQL：本机 `D:\EServer-data\childApp\server\mysql-5.7\bin\mysqld.exe`，库 `go_admin`，账号 root / root（见 `go-admin/config/config.yml`）。
- Redis：Docker 容器 `dev-redis-1`（`redis:7-alpine`，带 `--requirepass redis-pass`）。`config.yml` 里密码为空，启动后端必须注入环境变量，否则 asynq 队列初始化报 `NOAUTH Authentication required`：
  `$env:CMF_REDIS_CONNECTIONS_QUEUE_REDIS_PASSWORD = 'redis-pass'`

工具链：Go 1.25.x、Node 24 / pnpm 10。

## 1. 启动顺序：后端 → 管理端 → 三个 uni-app 端

### 1.1 后端（必须先起，所有前端都把它当代理目标）

```powershell
cd D:\www\EsportsPartner\go-admin
$env:ESPORTS_EXPERIMENTAL = '1'
$env:CMF_REDIS_CONNECTIONS_QUEUE_REDIS_PASSWORD = 'redis-pass'
go run main.go
```

- `ESPORTS_EXPERIMENTAL=1` 决定是否注册 `/api/v1/esports/*` 路由、权限与定时任务。漏掉它，前端业务接口会全部 404，而 `/api/v1/public/public-key` 仍然 200，很容易误判成前端问题。
- 首次初始化管理员账号时再加 `$env:ADMIN_INITIAL_PASSWORD = '<强密码>'`（只在首次生效，否则随机生成并只输出一次）。本机现值：`admin / admin123456`。
- 端口取自 `config/config.yml` 的 `app.port: 9501`。生产环境相关的 `CMF_APP_SECRET`、`CMF_APP_ADMIN_SECRET` 本地可留空自动生成——但每次重启都会重新生成，旧 token 全部失效、各端要重新登录；长期本地开发建议把这两个密钥固定成环境变量（或启动前从旧进程环境里带过来）。

### 1.2 管理端（先起它，5173 才会归它）

```powershell
cd D:\www\EsportsPartner\go-admin-web
pnpm run dev
```

→ http://localhost:5173/

- `config/vite.config.dev.ts` 里 `open: true`，启动会自动弹浏览器。
- 代理：`/api`、`/uploads` → `http://127.0.0.1:9501`；`/api/v1/admin/sse` 单独放宽了超时并禁用缓冲（SSE 长连接）。
- 路由是 hash 模式，直接用 `/index.html` 或 `#/login` 访问。
- `go-admin-web` 不在 workspace 成员内，独立 `pnpm install` 与启动。

### 1.3 用户端 H5（5174）

```powershell
cd D:\www\EsportsPartner\e-sports-customer-uniapp
pnpm dev:h5
```

→ http://localhost:5174/

- 页面：报单 / 订单 / 我的，登录页 `/pages/login/index`，实名页 `/pages/identity/index`（固定客户身份）。
- 示例账号：`customer01 / 13900000002 / admin123456`。

### 1.4 陪玩端 H5（5175）

```powershell
cd D:\www\EsportsPartner\e-sports-player-uniapp
pnpm dev:h5
```

→ http://localhost:5175/

- 页面：工作台 / 抢单 / 我的；登录成功后调用 `/user/player/dashboard` 校验陪玩身份，非陪玩账号提示后停留登录页。
- 陪玩上下线心跳只在本端 `App.vue` 里，进后台自动停止。
- 示例账号：`player01 / 13900000001 / admin123456`。

### 1.5 客服端 H5（5176）

```powershell
cd D:\www\EsportsPartner\e-sports-uniapp
pnpm dev:h5
```

→ http://localhost:5176/

- 页面：`pages/cs/*` 客服工作台 + `pages/wecom/index`，冷启动无 admin token 跳 `/pages/cs/login`。

三个端的公共约定：

- 各自 `.env.development` 里 `VITE_API_BASE=/api/v1/esports`；`vite.config.ts` 把 `/api`、`/uploads` 同源代理到 9501，避免本地 CORS。
- uni 的 H5 是"先编译再就绪"，启动后约 5 秒才打印实际端口，以输出里的 `Local:` 一行为准；端口不符说明 `strictPort` 拦下了被占用的端口。
- 其它端：`pnpm dev:mp-weixin`（微信小程序）、`pnpm build:h5`（H5 构建）、`pnpm type-check`（vue-tsc 类型检查）。

## 2. 验证是否真的起来了

用 `curl.exe`，返回码各项都应是 200：

```powershell
curl.exe -s -o NUL -w "backend=%{http_code}`n"   http://127.0.0.1:9501/api/v1/public/public-key
curl.exe -s -o NUL -w "admin=%{http_code}`n"     http://127.0.0.1:5173/
curl.exe -s -o NUL -w "customer=%{http_code}`n"  http://127.0.0.1:5174/
curl.exe -s -o NUL -w "player=%{http_code}`n"    http://127.0.0.1:5175/
curl.exe -s -o NUL -w "cs=%{http_code}`n"        http://127.0.0.1:5176/
curl.exe -s -o NUL -w "proxy=%{http_code}`n"     http://127.0.0.1:5174/api/v1/esports/gifts
```

最后一项走用户端的 dev 代理，能同时证明「代理链路通」+「后端已开 esports 功能集」，返回值应是页面配置/礼物列表 JSON，而不是 404。

> 注意：PowerShell 的 `Invoke-WebRequest` 访问 `http://127.0.0.1:5173/` 会误报 404（同一地址 `curl.exe` 返回 200），不要据此判断服务异常。

## 3. 排障对照

| 现象 | 原因 / 处理 |
|---|---|
| 代理报 `ECONNREFUSED 127.0.0.1:9501` | 后端没起，或起在别的端口 |
| 页面能开、业务接口 404，`public-key` 正常 | 后端没带 `ESPORTS_EXPERIMENTAL=1` |
| 启动直接报端口被占用（`strictPort`） | 对应端口已有旧进程，先停掉再起；三端固定 5174/5175/5176，不再顺延 |
| 报 `Cannot find module '@esports/shared/...'` | 根目录没执行 `pnpm install`，或共享包 `exports` 里缺少对应子路径 |
| vue-tsc 报共享包模块找不到声明 | 各端 `tsconfig.json` 的 `paths` 回退缺失（TS 4.9 不认 `exports` 字段） |
| `go build ./...` / `go test ./...` 报 embed 找不到文件 | 需要 `go-admin/web/dist/index.html`：先在 `go-admin-web` 构建，再把 `dist` 复制进 `go-admin/web/dist` |
| MySQL 连不上 | 确认 3306 在监听，账号密码与 `config/config.yml` 一致（root/root、库 `go_admin`） |
| Redis 连不上（队列/asynq） | 确认 Docker Desktop 已启动且 6379 容器在跑 |

## 4. 目录速览

```
D:\www\EsportsPartner
├─ go-admin\                   后端（独立 git 仓库；启动/规范见 go-admin\AGENTS.md）
├─ go-admin-web\               管理端（独立安装，不在 workspace 内）
├─ e-sports-customer-uniapp\   用户端（H5 / 小程序）
├─ e-sports-player-uniapp\     陪玩端（H5 / 小程序）
├─ e-sports-uniapp\            客服端（H5 / 小程序）
├─ packages\esports-shared\    三端共享：请求层、API、工具函数
├─ .dev-logs\                  可选：免窗口启动器 run-web-*.cmd 及其输出日志
└─ DEV.md                      本文件
```

`go-admin\AGENTS.md` 另有后端专属约定（代码生成顺序、权限声明、测试、提交规范），改后端前先读它。
