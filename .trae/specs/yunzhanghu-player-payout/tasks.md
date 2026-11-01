# Tasks

- [x] Task 1: 数据模型与配置
  - [x] SubTask 1.1: 新增 schema `EsportsPlayerPayoutAccount`（player_id+provider+account_type 唯一，签约号、户名、脱敏账号、状态）
  - [x] SubTask 1.2: 新增 schema `EsportsPayoutBatch`（batch_no 唯一、idem_key 唯一、状态机、总额/笔数、服务商批次号、审计字段）
  - [x] SubTask 1.3: 扩 `EsportsWithdrawalPayout`（batch_id / provider / provider_order_no 唯一 / provider_status / fail_code）与 `EsportsWithdrawal`（payout_account_id）
  - [x] SubTask 1.4: `go generate ./internal/ent` 生成代码并确认迁移可执行
  - [x] SubTask 1.5: `app.go` 声明配置项 `payout_provider`、`payout_provider_yunzhanghu`、云账户公私钥 PEM（单独键）
  - [x] 验证：`go build ./...`、`go test ./internal/apps/esports -run Config`、迁移测试通过

- [x] Task 2: 陪玩签约账户后端与客户端入口
  - [x] SubTask 2.1: 实现 `GET /user/player/payout-account`、`POST .../sign-url`、`POST .../unbind`
  - [x] SubTask 2.2: 实现签约结果回写（托管页回跳/回调），状态 pending→active
  - [x] SubTask 2.3: 提现申请在代发渠道下校验 active 签约账户并写 `payout_account_id`
  - [x] SubTask 2.4: `pages/player/wallet.vue` 增加收款账户卡片（状态、脱敏账号、去签约、解约）
  - [x] 验证：接口单测（未签约拒绝/签约回写/解绑）、`vue-tsc` 通过

- [x] Task 3: 云账户代发适配器
  - [x] SubTask 3.1: 新增 `payout_yunzhanghu.go`：配置加载、RSA2 签名/验签、PEM 解析复用
  - [x] SubTask 3.2: 实现 `SubmitBatch` / `QueryOrder` / `VerifyNotification` / `NotifyAck`，错误分「明确拒绝」与「结果未知」
  - [x] SubTask 3.3: 注册公开回调 `POST /payment-notify/yunzhanghu`（排在通用 `/payment-notify/:channel` 之前）
  - [x] SubTask 3.4: httptest 模拟服务商：成功、签名失败、明确拒绝、超时未知、重复回调
  - [x] 验证：`go test ./internal/apps/esports -run Yunzhanghu` 全绿

- [x] Task 4: 批量代发编排接口
  - [x] SubTask 4.1: `GET /admin/payout-batches/preview`：按周筛 `approved`，输出可发/跳过清单（未签约、账户禁用、金额异常）与合计
  - [x] SubTask 4.2: `POST /admin/payout-batches`：事务内校验 Σnet_cents == total，`idem_key` 防连点，逐笔建 payout 并提交
  - [x] SubTask 4.3: `GET /admin/payout-batches`、`GET /admin/payout-batches/:id`、`POST .../sync`、`POST .../retry`
  - [x] SubTask 4.4: 代发成功落账抽公共函数（复用 `markWithdrawalPayoutPaid` 的落账逻辑），回调/查单/手工同步共用
  - [x] SubTask 4.5: 权限点注册（预览/提交/列表/同步/重试）
  - [x] 验证：单测覆盖连点幂等、金额不一致整批拒绝、部分失败、跳过原因、职责分离（审核人不可提交）

- [x] Task 5: 定时任务查单补偿
  - [x] SubTask 5.1: 新增 `esports_sync_payout_batches`（扫 submitting 超时/未完结批次，逐笔查单收敛）
  - [x] SubTask 5.2: `app.go` 注册与 `cron_seeds.go` 种子成对
  - [x] 验证：`go test ./internal/apps/esports -run Cron` 与一致性测试通过

- [x] Task 6: 管理端结算页批量代发 Tab
  - [x] SubTask 6.1: 周选择 + 预览表（陪玩、净额、账户、跳过原因）
  - [x] SubTask 6.2: 「代发本周（N 笔 / ¥X）」按钮 + 二次确认弹窗
  - [x] SubTask 6.3: 批次列表与明细抽屉、手动同步、失败重试
  - [x] SubTask 6.4: 未配置云账户时禁用并提示配置位置；人工打款按钮保持原样
  - [x] 验证：`vue-tsc`、eslint、prettier 通过

- [x] Task 7: 文档与整体验收
  - [x] SubTask 7.1: 更新 `go-admin/internal/apps/esports/README.md`（配置项、接口、状态机、上线顺序）
  - [x] SubTask 7.2: 全量 `go test ./internal/apps/esports` 与前端构建
  - [x] SubTask 7.3: 手工验收：manual 模式原链路不变；模拟服务商下一键代发跑通
- [x] 验证：3 个既有失败测试已定位根因为 `syncedRoutes` 全量包装，改为只包装写路由后全绿

- [x] Task 8: 补签约结果回调（验证发现的 spec 缺口）
  - [x] 新增公开回调 `POST /payment-notify/yunzhanghu/sign`：验签通过后调用 `activatePlayerPayoutAccount` 回写签约号/户名/脱敏号并置 active
  - [x] 幂等：重复回调不重复写、错误签名不改任何状态、未知账户返回成功应答
  - [x] README 接口清单补充该路由
  - [x] 验证：`go test ./internal/apps/esports -run "PayoutAccount|Yunzhanghu"` 全绿

# Task Dependencies

- Task 2 依赖 Task 1
- Task 3 依赖 Task 1
- Task 4 依赖 Task 1、Task 3
- Task 5 依赖 Task 4
- Task 6 依赖 Task 4
- Task 7 依赖 Task 2~Task 6

# 并行建议

- Task 2 与 Task 3 可在 Task 1 完成后并行
- Task 6 前端可在 Task 4 接口定稿后与 Task 5 并行
