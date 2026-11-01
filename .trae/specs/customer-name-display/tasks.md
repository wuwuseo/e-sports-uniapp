# 任务清单：列表页客户名展示

## 后端

- [x] T1 `go-admin/internal/apps/esports/order_no.go`
  - `giftOrderView` 加 `CustomerName`，`giftOrderViewsOf` 用 `customerNamesOf` 批量补名。
  - 新增 `adminGiftIntentView` / `adminGiftIntentViewsOf`（避免与 gift_intent.go 既有 `giftIntentView` 重名）。
  - 新增 `adminOrderView` / `adminOrderViewsOf`。
- [x] T2 `go-admin/internal/apps/esports/gift_handlers.go`：`adminGiftIntents` 改用 `adminGiftIntentViewsOf`。
- [x] T3 `go-admin/internal/apps/esports/handlers.go`：`adminOrders` 改用 `adminOrderViewsOf`。
- [x] T4 构建与静态检查：`go build ./internal/apps/esports/`、`go vet ./internal/apps/esports/`、`go build -o data/dev-admin-nocgo.exe .` 均通过；新增 `order_no_view_names_test.go`（`TestListViewsCustomerName`）通过。

## 前端

- [x] T5 `go-admin-web/src/apps/esports/api.ts`：`EsportsOrder` / `GiftOrder` / `GiftIntent` 增加 `customer_name?: string`。
- [x] T6 `views/orders/index.vue`：客户列显示名称，回落 `#ID`。
- [x] T7 `views/reports/index.vue`：客户列显示名称，回落 `#ID`。
- [x] T8 `views/gifts/index.vue`：两处确认单列 + 送礼单据客户段 + 赠送明细文案。
- [x] T9 `views/risk-customers/index.vue`：删除重复的「客户 ID」列。
- [x] T10 格式化与 lint：stylelint / prettier / eslint / vue-tsc 全部通过。

## 验证

- [x] T11 接口实测：后端重启（含 Redis 密码环境变量）后登录成功，`/orders`、`/gift-orders`、`/gift-intents` 均返回 200（当前库内这三类业务数据为 0 条，字段补全由单测 `TestListViewsCustomerName` 覆盖）。
- [x] T12 4 个页面自查：业务代码中已无「客户 ID」表格列（仅剩风险客户页与活动页的筛选表单标签）。

## 审批

- [x] 用户确认 spec.md 与 tasks.md 后开始执行。
