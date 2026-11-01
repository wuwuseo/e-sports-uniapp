# Tasks

> 实施偏离（与 spec / 本任务的原始措辞不同，均已落地）：
> 1. 旧陪玩实名接口**保留为兼容别名**（`GET/POST /user/player/identity`、`GET /admin/players/:id/identity`、`POST /admin/players/:id/identity/review`），权限码不变，内部转发统一实现并投影成旧字段；因此 Task 4.5 的「移除旧路由与权限码」不执行。
> 2. 未实名拦截响应保留 `code=<HTTP 状态码>`（403），**追加** `error_code:"realname_required"` 与 `scope`，而非把 `code` 改成 `realname_required`。
> 3. 管理端代提交用静态路径 `POST /admin/realnames/submit`（`subject_type` / `subject_id` 放请求体），不用 `/:subjectType/:subjectId`。
> 4. uniapp 实名页复用既有 `pages/player/identity.vue`（`?role=customer|player` 区分主体），未新建 `pages/common/realname.vue`。
> 5. 陪玩详情页实名区块沿用兼容别名接口（内部即统一实现），未改调新路径。

- [x] Task 1: 数据模型与迁移
  - [x] SubTask 1.1: 新增 `EsportsRealNameVerification` schema（subject_type / subject_id / real_name / id_number_masked / channel / method / status / provider_ref / fail_reason / verified_at / reviewed_by_admin_id / requested_by / 时间戳），唯一索引 `(subject_type, subject_id)`
  - [x] SubTask 1.2: 新增 `EsportsRealNameAttempt` schema，索引 `(subject_type, subject_id, created_at)`，唯一索引 `(channel, provider_ref)`
  - [x] SubTask 1.3: 旧 `esports_identity.go` 中陪玩实名实体标注废弃，执行 `go generate ./internal/ent`
  - [x] SubTask 1.4: 实现 `realname_migrate.go` 幂等迁移旧 `verified` 记录
  - [x] 验证: `go build ./...`

- [x] Task 2: Provider 抽象与 manual / third_party 实现
  - [x] SubTask 2.1: 定义 `realNameProvider` 接口与统一结果结构
  - [x] SubTask 2.2: 实现 `manual` provider（提交待审、审核落定）
  - [x] SubTask 2.3: 实现 `third_party` 通用 HTTP provider（HMAC-SHA256 签名、5 秒超时、不重试）
  - [x] SubTask 2.4: 渠道注册表按配置装配，未启用渠道不可选
  - [x] 验证: 新增 `realname_provider_test.go` 用 httptest 覆盖通过 / 失败 / 待完成 / 异常

- [x] Task 3: 状态机、守卫与业务拦截
  - [x] SubTask 3.1: 实现提交、审核、过期状态机与每日提交次数上限
  - [x] SubTask 3.2: 实现 `ensureRealNameVerified(subject, scope)` 守卫
  - [x] SubTask 3.3: 接入客户下单 / 报价确认入口（管理端豁免）
  - [x] SubTask 3.4: 接入 `userCreateRechargeIntentHandler`（管理端代充豁免）
  - [x] SubTask 3.5: 接入 `applyWithdrawal`，客户提现分支预留
  - [x] SubTask 3.6: 陪玩接单资格改读统一实名档案
  - [x] SubTask 3.7: 新增 `pending` 超时扫描定时任务
  - [x] 验证: `realname_test.go` 覆盖状态机、守卫、频率限制

- [x] Task 4: 路由、权限码、配置声明（依赖 Task 1/3）
  - [x] SubTask 4.1: 用户端实名路由（客户 / 陪玩分组，主体由路由决定）
  - [x] SubTask 4.2: 回调路由（公开 + 验签 + 幂等）
  - [x] SubTask 4.3: 管理端列表 / 详情 / 审核 / 代提路由与权限码 `esports:realnames:*`
  - [x] SubTask 4.4: 配置键声明：`realname_providers`、`realname_required_order`（默认 false）、`realname_required_recharge`（默认 false）、`realname_required_withdrawal`（默认 false）、`realname_daily_attempt_limit`（默认 5）、`realname_pending_timeout_minutes`（默认 30）
  - [ ] SubTask 4.5: ~~移除旧陪玩实名路由与权限码~~ → 按偏离 1 保留为兼容别名，不执行
  - [x] 验证: `config_declaration_test.go` 覆盖新配置键

- [x] Task 5: wechat / alipay provider（依赖 Task 2）
  - [x] SubTask 5.1: 微信实名渠道骨架（二要素 / 人脸跳转入口就位，`ready()` 恒 false，未接入前不注册）
  - [x] SubTask 5.2: 支付宝实名渠道骨架（同上）
  - [x] SubTask 5.3: 回调验签与结果落定（渠道无关，已覆盖 third_party 与预留渠道）
  - [x] 验证: 单测仍全部通过；真实联调待商户资质到位，本次不做

- [x] Task 6: 前端（依赖 Task 4）
  - [x] SubTask 6.1: uniapp 通用实名页（复用 `pages/player/identity.vue`，`?role=customer|player`，见偏离 4）
  - [x] SubTask 6.2: 客户个人中心、陪玩资料页入口；已实名 / 审核中 / 驳回重提状态
  - [x] SubTask 6.3: 业务错误 `realname_required` 统一引导跳转（按 `scope` 判定客户 / 陪玩主体）
  - [x] SubTask 6.4: go-admin-web 新增「实名认证」菜单页（列表、详情、人工审核、代提交）
  - [x] SubTask 6.5: 陪玩详情页实名区块沿用兼容别名接口（见偏离 5）
  - [x] SubTask 6.6: 中英文语言包补齐
  - [x] 验证: `vue-tsc` 通过、eslint / prettier 通过

- [x] Task 7: 测试与文档
  - [x] SubTask 7.1: `realname_test.go` / `realname_handler_test.go` 覆盖脱敏、出参不含原号、回调验签失败、重复回调幂等、迁移等价性
  - [x] SubTask 7.2: 更新 README（实名模块、配置说明、第三方签名规则）；功能列表为历史需求基线、按其文首约定不删改
  - [x] 验证: `go test ./internal/apps/esports/...` 全部通过

# Task Dependencies

- Task 2 依赖 Task 1
- Task 3 依赖 Task 1、Task 2
- Task 4 依赖 Task 1、Task 3
- Task 5 依赖 Task 2，可与 Task 3 / Task 4 并行
- Task 6 依赖 Task 4
- Task 7 依赖 Task 3、Task 4（Task 5 完成后补齐渠道相关用例）
