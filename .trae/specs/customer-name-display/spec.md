# 列表页「客户 ID」改为直接显示客户名

## 目标

用户选中「客户 ID」表头并明确要求：4 个页面不再裸露客户 ID，列内直接显示客户显示名（`display_name`）。涉及页面：

- 订单管理 `/esports/orders`
- 报单 `/esports/reports`
- 礼物单 `/esports/gifts`
- 风险客户 `/esports/risk-customers`

## 现状勘察结论

| 页面 | 文件 | 列位置 | 数据来源 | 是否已有名称 |
| --- | --- | --- | --- | --- |
| 订单管理 | `go-admin-web/src/apps/esports/views/orders/index.vue` | 第 18 行 `customer_id` | `adminOrders` → `getAdminList` | 否 |
| 报单 | `go-admin-web/src/apps/esports/views/reports/index.vue` | 第 39 行 `customer_id` | 同一个订单列表接口 | 否 |
| 礼物单 · 确认单列表 | `go-admin-web/src/apps/esports/views/gifts/index.vue` | 第 94 行 `customer_id` | `adminGiftIntents` → `listAdminGiftIntents` | 否 |
| 礼物单 · 收款核验 | 同上 | 第 164 行 `customer_id` | 同一确认单接口 | 否 |
| 礼物单 · 送礼单据 | 同上 | 第 249-255 行、第 451 行内联 | `adminGiftOrders` → `giftOrderViewsOf` | 否（`player_name` 来自实体快照） |
| 风险客户 | `go-admin-web/src/apps/esports/views/risk-customers/index.vue` | 第 18 行 `id` | `listRiskCustomersHandler` 直接返回实体 | 是（第 19 行已有 `display_name`「客户」列） |

已知可复用助手（`go-admin/internal/apps/esports/order_no.go`）：

- `customerNamesOf(ctx, db, ids) (map[int]string, error)`：批量返回 `customerID → display_name`，查不到的 ID 不出现在结果里。
- 视图包装模式：`giftOrderView`、`fulfillmentMakeupView` 等内嵌 ent 实体 + 附加展示字段。

## 方案（最小改动）

### 后端

1. `go-admin/internal/apps/esports/order_no.go`
   - `giftOrderView` 增加 `CustomerName string \`json:"customer_name"\``；`giftOrderViewsOf` 收集 `item.CustomerID` 后调用 `customerNamesOf` 一次性批量补名。
   - 新增 `giftIntentView`（内嵌 `*ent.EsportsGiftIntent` + `CustomerName`）与 `giftIntentViewsOf`，同样用 `customerNamesOf` 批量补名。
   - 新增 `adminOrderView`（内嵌 `*ent.EsportsOrder` + `CustomerName`）与 `adminOrderViewsOf`，同样批量补名。
2. `go-admin/internal/apps/esports/gift_handlers.go`
   - `adminGiftIntents` 在 `reply` 前把实体列表转成 `giftIntentViewsOf`。
3. `go-admin/internal/apps/esports/handlers.go`
   - `adminOrders` 把 `items` 转成 `adminOrderViewsOf` 后再交给 `writeAdminList`（分页形态与 `X-Total-Count` 不变）。
4. 风险客户：后端不动（已返回 `display_name`）。

### 前端

1. `go-admin-web/src/apps/esports/api.ts`
   - `EsportsOrder`、`GiftOrder`、`GiftIntent` 各增加可选字段 `customer_name?: string`（兼容旧响应）。
2. `views/orders/index.vue` 第 18 行：列标题「客户」，单元格 `record.customer_name || '#' + record.customer_id`。
3. `views/reports/index.vue` 第 39 行：同上。
4. `views/gifts/index.vue`
   - 第 94、164 行：同上。
   - 第 249-255 行「客户 / 陪玩」：客户段改为 `customer_name || '#' + customer_id`，保留陪玩段。
   - 第 451 行内联文案：`客户 {{ order.customer_name || '#' + order.customer_id }}`。
5. `views/risk-customers/index.vue` 第 18 行：删除「客户 ID」列（第 19 行「客户」列已是名称，保留一列即可）。

## 明确的边界

- 只做展示层补名，不新增字段、不改表结构、不迁移数据。
- 补名失败（客户被物理删除等）时前端回落 `#ID`，不报错、不阻塞列表。
- 不动售后、客服工作台等其他已完成的页面。
- 不改分页 / 筛选接口契约（`customer_name` 只是新增展示字段）。

## 验证步骤

1. 后端：`CGO_ENABLED=0 go build -o data/dev-admin-nocgo.exe .`（在 `d:\www\EsportsPartner\go-admin`），`go vet ./internal/apps/esports/`。
2. 前端：对 5 个改动文件执行 `npx stylelint --fix`（仅 .vue）→ `npx prettier --write` → `npx eslint --fix`。
3. 接口实测（admin token + `curl.exe --noproxy '*'`）：
   - `GET /api/v1/esports/admin/orders?page=1&page_size=5` 返回项含 `customer_name`；
   - `GET /api/v1/esports/admin/gift-orders?limit=5` 返回项含 `customer_name`；
   - `GET /api/v1/esports/admin/gift-intents` 返回项含 `customer_name`。
4. 页面自查 4 个路由不再出现「客户 ID」表头（风险客户页为「客户」）。
