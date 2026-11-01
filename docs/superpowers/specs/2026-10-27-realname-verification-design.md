# 实名认证（微信 / 支付宝 / 第三方 / 人工）设计

日期：2026-10-27
状态：待评审

## 1. 背景与目标

项目已有陪玩侧实名认证（姓名 + 身份证脱敏存储 + 管理员人工审核），但客户侧没有实名，且所有认证都只能人工审核，无法对接微信、支付宝的官方核验能力。

目标：建立一套**客户与陪玩共用**的实名认证能力，支持微信、支付宝、通用第三方服务商、人工审核四种渠道，并在客户下单、客户充值、提现三个业务入口按配置强制校验。

## 2. 范围

### 2.1 包含

- 统一实名数据模型（客户 / 陪玩两种主体）
- 四种认证渠道：`wechat`、`alipay`、`third_party`、`manual`
- 两种核验方式：二要素（姓名 + 身份证号）、人脸核身；人工渠道为独立方式
- 客户下单前、客户充值前、客户/陪玩提现前的实名守卫（配置开关，默认关闭）
- 陪玩接单门槛数据源切换到统一实名表（行为不变）
- 用户端实名提交/状态查询/人脸结果查询/渠道回调接口
- 管理端实名列表、详情、人工审核接口与页面
- 配置声明、双语言包、单元测试、README 与功能列表更新

### 2.2 不包含

- 不根据身份证号推导年龄、不改造现有 `age_check` 未成年审核流程
- 不做身份证号与原号相关的风控画像（如一号多账号检测）——原号不落库，无法支撑
- 不做实名信息的对外导出
- 不实现微信/支付宝以外的服务商专用 SDK，第三方统一走通用 HTTP 协议

## 3. 总体架构

新增后端模块 `realname.go`（业务编排 + 守卫）、`realname_provider.go`（渠道接口与实现）、`realname_handlers.go`（HTTP 处理）、`realname_migrate.go`（旧陪玩实名数据迁移），全部位于 `go-admin/internal/apps/esports/`，遵循该功能集自包含的既有约定。

数据流：

1. 用户提交姓名 + 身份证号 + 渠道 + 方式
2. 业务层校验格式、频率上限，生成核验流水，调用对应 provider
3. provider 返回三种结果之一：同步通过 / 同步失败 / 待用户完成（人脸 / 跳转）
4. 同步结果直接写实名档案；待完成结果保持 `pending`，由渠道回调或用户轮询落定
5. 业务入口调用守卫函数读取实名档案，未通过则拒绝并返回可识别错误码

## 4. 数据模型

### 4.1 EsportsRealNameVerification（实名档案，一主体一条）

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `subject_type` | enum `customer` / `player` | 主体类型 |
| `subject_id` | int | 客户 ID 或陪玩 ID |
| `real_name` | string(120) | 真实姓名（明文，与现有陪玩实名一致） |
| `id_number_masked` | string(32) | 身份证号脱敏值（保留前 6 后 4） |
| `channel` | enum `wechat` / `alipay` / `third_party` / `manual` | 认证渠道 |
| `method` | enum `two_factor` / `face` / `manual` | 认证方式 |
| `status` | enum `pending` / `verified` / `rejected` / `expired` | 当前状态 |
| `provider_ref` | string(255)，可空 | 渠道流水号 |
| `fail_reason` | string(255) | 失败 / 驳回原因 |
| `verified_at` | time，可空 | 通过时间 |
| `reviewed_by_admin_id` | int，可空 | 人工审核管理员 |
| `requested_by` | int，默认 0 | 提交人：本人 0，管理端代提为 adminID |
| `created_at` / `updated_at` | time | 审计时间 |

索引：`(subject_type, subject_id)` 唯一；`(status, updated_at)` 普通索引。

### 4.2 EsportsRealNameAttempt（核验流水，审计留痕）

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `subject_type` | enum | 同档案 |
| `subject_id` | int | 同档案 |
| `channel` | enum | 本次渠道 |
| `method` | enum | 本次方式 |
| `status` | enum `pending` / `passed` / `failed` / `abandoned` | 本次结果 |
| `provider_ref` | string(255)，可空 | 渠道流水号 |
| `fail_reason` | string(255) | 失败原因 |
| `requested_by` | int | 提交人 |
| `created_at` / `updated_at` | time | 审计时间 |

索引：`(subject_type, subject_id, created_at)` 普通索引；`(channel, provider_ref)` 唯一（`provider_ref` 为空时不参与唯一冲突，靠 SQL NULL 语义）。

流水表**不存储身份证号**，也不存储证件号哈希。

### 4.3 存量数据迁移

- `realname_migrate.go` 在功能集初始化时执行一次幂等迁移：读取旧 `esports_player_identity` 中 `status=verified` 的记录，按 `(subject_type='player', subject_id=player_id)` upsert 到新档案表（`channel=manual`、`method=manual`）。
- 旧 ent schema 文件保留但不再读写，避免 ent 自动迁移移除生产表；在 schema 注释中标注「已废弃，新代码禁止引用」。
- 旧的陪玩实名路由 `/admin/players/:id/identity`、`/user/player/identity` 替换为通用实名接口，前端同步改造，不保留旧接口。

## 5. 状态机

```
无记录 ──提交──> pending ──渠道通过/人工通过──> verified
                    │
                    ├──渠道失败/人工驳回──> rejected ──重新提交──> pending
                    └──超过核验有效期（人脸 / 待完成，默认 30 分钟）──> expired ──重新提交──> pending
```

规则：

- 一主体一条档案；`verified` 状态下不允许重复提交（返回冲突），不支持自助更换渠道或证件。
- `rejected`、`expired` 可重新提交同一渠道或其他渠道。
- 人脸 / 待完成流程超过有效期由现有定时任务体系新增一个扫描任务置为 `expired`，并同步把对应流水置 `abandoned`。

## 6. Provider 抽象

### 6.1 接口

```go
// realNameProvider 实名核验渠道。Start 发起核验，Query 用于人脸 / 异步流程取结果。
type realNameProvider interface {
    Code() string
    Supports(method string) bool
    Start(ctx context.Context, in realNameProviderInput) (*realNameProviderResult, error)
    Query(ctx context.Context, ref string) (*realNameProviderResult, error)
}

// realNameProviderResult 统一结果。
// outcome 取值：passed / failed / pending，pending 时返回 redirect_url 或 qr_content。
type realNameProviderResult struct {
    Outcome     string
    ProviderRef string
    RedirectURL string
    QRContent   string
    Message     string
}
```

- 渠道实现以注册表方式装配：`map[string]realNameProvider`，启动时按配置构建；未启用的渠道不进注册表。
- `Start` 同步返回 `passed / failed / pending`；`Query` 只对 `pending` 有意义。
- provider 内部错误一律返回中文可读错误，由业务层包装为业务错误，不允许 panic。

### 6.2 wechat（微信支付）

- 二要素：调用微信支付实名信息核验接口，需要商户号、API 证书与对应产品权限。
- 人脸：使用微信支付实名认证产品，`Start` 返回跳转地址 / 二维码，用户在微信内完成后由渠道回调，业务层验签后调 `Query` 或直接读取回调结果落库。
- 资质未到位时该渠道可在配置中关闭，关闭后前端不展示。

### 6.3 alipay（支付宝）

- 使用支付宝开放平台实名认证产品（`alipay.user.certify.open.*` 系列），支持一次性二要素核验与人脸核身。
- 人脸流程与微信一致：`Start` 返回跳转地址 / 二维码，回调验签后落定。
- 需要支付宝应用签约对应产品，资质未到位时按配置关闭。

### 6.4 third_party（通用 HTTP）

- 请求：`POST {base_url}/verify`，JSON `{ "name": "...", "id_number": "...", "method": "two_factor|face", "biz_id": "..." }`。
- 鉴权：`app_id` + HMAC-SHA256 签名头（`X-App-Id`、`X-Timestamp`、`X-Nonce`、`X-Signature`），签名串为 `app_id + "\n" + timestamp + "\n" + nonce + "\n" + body`，便于对接任何厂商；规则同时写入 README。
- 响应：`{ "passed": true, "provider_ref": "...", "message": "..." }`；人脸场景返回 `{ "pending": true, "redirect_url": "...", "provider_ref": "..." }`。
- 超时统一 5 秒，失败按「核验失败」处理，不自动重试（避免重复计费）。

### 6.5 manual（人工审核）

- 提交后档案置 `pending`、流水置 `pending`，等待管理端审核。
- 管理端通过置 `verified`，驳回置 `rejected` 并记录原因。
- 该渠道始终可用，不受 provider 配置开关影响，保证任何情况下都有兜底路径。

### 6.6 降级与容错

- 配置了渠道但调用异常时，返回业务错误「实名核验服务暂不可用，请稍后重试或选择人工审核」，不静默通过。
- 前端可选择的渠道由 `GET /user/realname` 返回的可用渠道列表决定。

## 7. 配置项

在 `app.go` 配置声明中新增（`config_declaration_test.go` 同步覆盖）：

| 键 | 类型 | 默认值 | 说明 |
| --- | --- | --- | --- |
| `realname_providers` | string(JSON) | `""` | `{"wechat":{"enabled":true,...},"alipay":{...},"third_party":{"base_url":"","app_id":"","app_secret":""}}`；密钥字段管理端不回显 |
| `realname_required_order` | string | `false` | 客户下单前是否强制实名 |
| `realname_required_recharge` | string | `false` | 客户充值前是否强制实名 |
| `realname_required_withdrawal` | string | `false` | 提现前是否强制实名 |
| `realname_daily_attempt_limit` | number | `5` | 同一主体每日提交上限，0 表示不限 |
| `realname_pending_timeout_minutes` | number | `30` | 人脸 / 待完成核验有效期，超时置 `expired` |

## 8. 业务拦截

守卫函数：

```go
// ensureRealNameVerified 校验主体在指定业务场景下是否已完成实名。
// scope: order / recharge / withdrawal；未开启强制时直接放行。
func ensureRealNameVerified(ctx context.Context, db *ent.Client, subjectType string, subjectID int, scope string) error
```

接入点：

| 场景 | 接入位置 | 说明 |
| --- | --- | --- |
| 客户下单 | 客户侧自助下单 / 报价确认入口（`userConfirmQuote` 等 `AuthUser` 下单链路） | 管理端 `/admin/orders` 代下单不拦截 |
| 客户充值 | `userCreateRechargeIntentHandler` | 管理端 `/admin/wallets/:id/recharge` 代充不拦截 |
| 陪玩提现 | `playerApplyWithdrawal` → `applyWithdrawal` | 客户提现入口当前不存在，守卫预留 `customer` 分支 |
| 陪玩接单 | `ensurePlayerQualificationAllowed` 内改为查统一实名表 | 行为与现状一致 |

未通过时返回统一业务错误：「请先完成实名认证」。错误响应附 `code=realname_required` 与 `scope`，前端据此弹引导。

## 9. API

### 9.1 用户端（`AuthUser`）

主体由路由确定，不由请求参数决定，避免越权：

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/user/realname` | 当前客户实名状态 + 可用渠道 + 各渠道可用方式 |
| POST | `/user/realname/submit` | 客户提交核验：`real_name`、`id_number`、`channel`、`method` |
| GET | `/user/realname/attempts` | 客户本人核验历史（不含证件号） |
| GET | `/user/player/realname` | 当前陪玩实名状态 + 可用渠道 |
| POST | `/user/player/realname/submit` | 陪玩提交核验 |
| GET | `/user/player/realname/attempts` | 陪玩本人核验历史 |
| GET | `/user/realname/attempts/:ref` | 人脸 / 异步核验结果轮询（按流水归属校验） |
| POST | `/user/realname/callback/:provider` | 渠道回调（公开路由，强制验签 + 幂等） |

- 客户接口要求登录用户存在客户档案，无档案返回中文业务错误「请先完成客户建档」。
- 陪玩接口要求登录用户存在陪玩档案，无档案返回「请先完成陪玩入驻」。
- 同一自然人同时是客户和陪玩时，按两条主体档案分别认证，互不复用。

### 9.2 管理端（`AuthAdmin`，新增权限码）

| 方法 | 路径 | 权限码 | 说明 |
| --- | --- | --- | --- |
| GET | `/admin/realnames` | `esports:realnames:list` | 按主体类型、状态、关键词筛选 |
| GET | `/admin/realnames/:id` | `esports:realnames:view` | 详情（证件号只返回脱敏值） |
| POST | `/admin/realnames/:id/review` | `esports:realnames:review` | 人工通过 / 驳回 |
| POST | `/admin/realnames/:subjectType/:subjectId/submit` | `esports:realnames:submit` | 管理端代提实名 |

列表与详情统一补充主体名称（客户名 / 陪玩名），查不到时回落 `#ID`，无数据显示 `-`，与项目既有展示规则一致。

## 10. 前端

### 10.1 uniapp 用户端

- 新增通用页 `pages/common/realname.vue`，复用现有 `pages/player/identity.vue` 的表单与状态展示，按主体区分文案。
- 客户个人中心、陪玩资料页各加入口；已实名显示「已实名」，待审核显示「审核中」，被驳回展示原因并可重提。
- 人脸 / 跳转方式：展示二维码或跳转按钮，进入后轮询 `/user/realname/attempts/:ref`。
- 下单、充值、提现接口返回 `realname_required` 时，统一弹窗引导到实名页。

### 10.2 go-admin-web 管理端

- 新增「实名认证」菜单（独立菜单项，遵循一模块一菜单的约定）：列表 + 详情 + 人工审核。
- 陪玩详情页的实名区块改为调用通用接口，展示渠道、方式、流水与审核记录。
- 中英文语言包同步补齐。

## 11. 安全与合规

- 身份证原号仅在请求生命周期内使用，**不落库、不写日志**；所有错误日志对证件号做脱敏。
- 渠道密钥配置不回显，管理端只展示是否已配置。
- 同一主体每日提交次数受 `realname_daily_attempt_limit` 限制，超限返回中文错误。
- 回调接口强制验签，`provider_ref` 唯一索引保证重复回调幂等。
- `verified` 状态只能由 provider 结果或管理员审核写入，前端入参不含状态字段。
- 提交与审核动作写操作日志（复用现有管理端操作日志能力）。

## 12. 测试计划

`realname_test.go`（单测，不依赖真实商户，provider 用 `httptest` 模拟）：

1. 状态机：提交 → pending → 通过 / 驳回 / 超时过期 / 重提；已通过后重复提交返回冲突。
2. 守卫：三个 scope 在配置关闭时放行、开启时拦截；主体类型区分正确；管理端代下单 / 代充不拦截。
3. provider 路由：渠道未配置时不可选；`manual` 始终可用；渠道异常返回中文错误且不静默通过。
4. 安全：证件号脱敏正确；日志不含原号；每日提交上限生效；回调验签失败拒绝；重复回调幂等。
5. 迁移：旧陪玩 verified 记录迁入后 `isPlayerIdentityVerified` 等价通过。
6. `config_declaration_test.go` 覆盖新增配置键。

## 13. 实施顺序

1. Ent schema + `go generate` + 迁移函数
2. Provider 接口 + `manual` / `third_party` 实现（可测）
3. 状态机与守卫 + 三处业务拦截 + 定时过期任务
4. 路由、权限码、配置声明
5. wechat / alipay provider（按服务商文档实现，资质到位后联调）
6. uniapp 通用实名页 + go-admin-web 实名管理页
7. 单测、双语言包、README、功能列表更新

## 14. 风险与约束

- 微信支付与支付宝实名接口均需商户资质签约，未签约前只能以配置关闭 + 人工审核兜底；代码按接口隔离，联调阶段不改业务层。
- 默认关闭三个业务门槛，上线后需在配置页开启；开启前应确认存量客户补录方案，避免集中拦截。
- 统一表替换旧陪玩实名表涉及存量数据迁移，迁移函数必须幂等，且旧表不复用、不删除。
