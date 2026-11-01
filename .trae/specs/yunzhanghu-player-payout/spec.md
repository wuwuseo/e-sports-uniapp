# 云账户代发（陪玩每周一键打款）Spec

## Why

陪玩提现目前全靠财务线下转账后手工登记外部流水号，再让另一名财务确认到账，一周一次批量结算时逐单操作效率极低且容易漏单/错录。要对接云账户灵活用工代发，让财务在结算页点一次按钮，就把所有已审核通过的提现单批量打到陪玩签约账户，结果由回调/查单自动落账。

## What Changes

- 新增陪玩收款账户表 `EsportsPlayerPayoutAccount`：云账户签约托管页完成实名绑卡，本地只存签约号与脱敏账号
- 新增代发批次表 `EsportsPayoutBatch`：一次「代发本周」= 一个批次，`idem_key` 唯一防连点
- 扩 `EsportsWithdrawalPayout`：增加 `batch_id` / `provider` / `provider_order_no` / `provider_status` / `fail_code`
- 扩 `EsportsWithdrawal`：增加 `payout_account_id`，代发渠道必填
- 新增云账户适配器 `payout_yunzhanghu.go`：RSA2 签名、批量代发、查单、回调验签、应答
- 新增管理端接口：批次预览 / 提交 / 列表 / 明细 / 手动同步 / 失败重试；新增陪玩端签约接口；新增公开回调 `POST /payment-notify/yunzhanghu`
- 新增定时任务 `esports_sync_payout_batches`：查单补偿，与 `cron_seeds.go` 成对注册
- 新增系统配置：`payout_provider`、`payout_provider_yunzhanghu`、公私钥单独成键
- 管理端结算页新增「批量代发」Tab；陪玩端钱包页新增「收款账户」签约入口
- 人工打款链路完整保留，`payout_provider=manual`（默认）时代发入口禁用

## Impact

- 受影响能力：陪玩提现、提现打款执行、结算页、陪玩钱包页、系统配置、定时任务
- 受影响代码：
  - `go-admin/internal/apps/esports/schema/`（新增 2 表、扩 2 表）
  - `go-admin/internal/apps/esports/payout_yunzhanghu.go`（新增）
  - `go-admin/internal/apps/esports/withdrawal_payout.go`、`withdrawal.go`、`app.go`、`cron_seeds.go`
  - `go-admin-web/src/apps/esports/views/settlements/index.vue`
  - `e-sports-uniapp/src/pages/player/wallet.vue`、`src/api/esports.ts`
- 不改动：猫粮出账口径（申请提现时已扣）、聚合收款链路、人工打款双人复核规则

## ADDED Requirements

### Requirement: 陪玩收款账户签约

系统 SHALL 提供陪玩收款账户签约能力：陪玩通过云账户托管页完成实名与绑卡，本站只保存签约号、户名、脱敏账号与状态，不保存身份证号与完整卡号。

#### Scenario: 获取签约链接

- **WHEN** 已登录陪玩调用 `POST /user/player/payout-account/sign-url`
- **THEN** 返回云账户签约托管页 URL，前端跳转完成签约

#### Scenario: 签约完成回写

- **WHEN** 云账户回传签约结果
- **THEN** 写回 `provider_sign_no`、`account_name`、`account_no_masked`，状态置 `active`

#### Scenario: 未签约陪玩被跳过

- **WHEN** 批量代发预览时某陪玩无 `active` 签约账户
- **THEN** 该提现单列入跳过清单，原因显示「未签约收款账户」，不参与本批提交

### Requirement: 云账户代发适配器

系统 SHALL 提供云账户代发适配器，实现请求签名、批量提交、单笔查单、回调验签与服务商应答；密钥只从系统配置读取，接口与日志不得回显。

#### Scenario: 服务商明确拒绝

- **WHEN** 云账户返回明确的受理失败码
- **THEN** 对应明细置 `pay_failed` 并记录 `fail_code`，提现单保持 `approved`，可下批重试

#### Scenario: 受理结果未知

- **WHEN** 请求超时或响应读取失败
- **THEN** 明细保持 `pay_requested`，不置失败，交由查单任务收敛

#### Scenario: 回调验签失败

- **WHEN** 回调签名不合法
- **THEN** 返回验签失败应答，且不修改任何业务状态

### Requirement: 一键批量代发

系统 SHALL 支持财务在结算页对指定周的全部 `approved` 提现单一次性创建批次并提交代发。

#### Scenario: 提交前金额校验

- **WHEN** 批次内提现单 `net_cents` 合计与批次 `total_cents` 不一致
- **THEN** 整批拒绝提交并返回明确错误

#### Scenario: 连点幂等

- **WHEN** 同一周同一服务商重复提交批次
- **THEN** `idem_key` 唯一索引拦截，返回既有批次，不生成第二笔出款

#### Scenario: 部分失败

- **WHEN** 批次中部分明细 `pay_failed`、部分 `paid`
- **THEN** 批次状态置 `partial`，成功单置提现单 `paid`，失败单保持 `approved` 可重试

### Requirement: 代发结果自动落账

系统 SHALL 在代发回调成功或查单确认成功时，将打款执行单置 `paid`、提现单 `approved → paid`，并在同一事务内回填服务商单号与到账时间。

#### Scenario: 重复回调

- **WHEN** 同一 `provider_order_no` 的回调重复到达
- **THEN** 返回成功应答，不重复落账

#### Scenario: 查单补偿

- **WHEN** 定时任务发现批次内明细长时间停留在 `pay_requested`
- **THEN** 调云账户查单，已成功则落账，明确失败则置 `pay_failed`

### Requirement: 代发配置与安全

系统 SHALL 提供 `payout_provider`（默认 `manual`）、`payout_provider_yunzhanghu`、云账户公私钥 PEM 配置项；未启用云账户时批量代发入口禁用。

#### Scenario: 未配置云账户

- **WHEN** `payout_provider` 不是 `yunzhanghu` 或配置不完整
- **THEN** 预览/提交接口返回明确的 503 类错误，管理端按钮禁用并提示配置位置

#### Scenario: 密钥不回显

- **WHEN** 任意接口返回服务商配置
- **THEN** 只返回「是否已配置」布尔值，不返回密钥内容

### Requirement: 管理端批量代发界面

系统 SHALL 在结算页提供「批量代发」Tab：周选择、可发/跳过清单、合计笔数与金额、二次确认提交、批次列表与明细、手动同步、失败重试。

#### Scenario: 二次确认

- **WHEN** 财务点击「代发本周」
- **THEN** 弹窗展示总笔数与总金额，确认后才调用提交接口

### Requirement: 陪玩端收款账户入口

系统 SHALL 在陪玩钱包页提供收款账户卡片，展示签约状态与脱敏账号，支持去签约与解约。

#### Scenario: 未签约状态

- **WHEN** 陪玩进入钱包页且无有效签约
- **THEN** 卡片显示「未签约」，提供「去签约」按钮跳转托管页

## MODIFIED Requirements

### Requirement: 提现打款执行（原有）

仅在 `provider=manual` 时保留「提交打款 → 另一人确认到账」双人复核；`provider=yunzhanghu` 时由回调/查单自动置 `paid`，系统记录服务商单号、`provider_status` 与到账时间作为审计证据。审核人不得提交批次。

#### Scenario: 人工链路不受影响

- **WHEN** `payout_provider=manual`
- **THEN** 原「提交打款 / 标记成功 / 标记失败」接口与页面行为保持不变

### Requirement: 提现申请（原有）

代发渠道下提现单 SHALL 绑定 `payout_account_id` 快照；人工渠道继续使用 `account_ref`。猫粮扣减时机与手续费/税费口径不变。

#### Scenario: 申请时未签约

- **WHEN** 陪玩走代发渠道申请提现但无 `active` 签约账户
- **THEN** 申请被拒绝并提示先完成收款账户签约
