# 陪玩报单 · uni-app 客户端（Vue3 / TS）

同一 uni-app 项目内包含三个角色端，共用请求层（客服端有独立登录页 `pages/cs/login`）：

- **客户自助端**：覆盖功能列表 §13.2「售后发起入口」、§4.6「报价确认」、§10「会员等级与成长值」与
  §16「页面装修」的客户端侧（原 §4.4 / §11.3「储值卡」已于 2026-10-20 由产品决定移除，客户端对应页面与接口已删除）。
- **陪玩端**（`src/pages/player/*`）：覆盖 §6「陪玩端」核心——上下线、首页数据、抢单大厅、我的订单
  与服务作业、猫粮钱包与提现、加钟确认、优先派单权通知、考核与申诉、固排、追偿与信用记载。
- **移动客服端**（`src/pages/cs/*`）：客服登录、工作台、客户档案、报单、订单详情与结单（含服务凭证
  逐张确认）、售后、话术库、会员调级与礼物（§8 客服端的移动入口）。

登录后按账号角色自动路由：有陪玩档案进陪玩端，否则进客户自助端（见 `pages/login/index.vue`）；
客服端从 `pages/cs/login` 进入，与客户/陪玩登录互不复用。

服务端为同级的 `go-admin`（`internal/apps/esports`），接口前缀 `/api/v1/esports`。

## 运行

```bash
pnpm install
pnpm dev:h5           # H5 调试
pnpm dev:mp-weixin    # 微信小程序（用微信开发者工具打开 dist/dev/mp-weixin）
pnpm type-check       # 类型检查（vue-tsc --noEmit）
```

## 环境变量

新建 `.env.local`：

```
VITE_API_BASE=https://your-api-host/api/v1/esports
VITE_USER_LOGIN_PATH=/api/v1/user/login
```

- `VITE_API_BASE`：业务接口基址，需包含 `/api/v1/esports`（例如
  `https://your-api-host/api/v1/esports`）。`/api/...` 绝对路径（登录、附件）只拼 origin，
  不会重复前缀。H5 开发期可用 `/api/v1/esports` 走 Vite 的 `/api` 代理。
- `VITE_USER_LOGIN_PATH`：**由宿主 CMF 提供**的用户登录接口。登录成功后 `request.ts`
  从响应中取 `access_token` / `token` / `accessToken` 之一存入本地存储，
  之后所有客户自助请求带 `Authorization: Bearer <token>`。

## 目录

```
src/
├── api/
│   ├── request.ts        统一请求层（基础地址、Bearer 鉴权、错误提示、401 跳登录）
│   ├── esports.ts        客户自助接口封装与类型（含评价、改期提案、优先预约）
│   ├── player.ts         陪玩端接口封装与类型（考核嵌套视图、期望报价、收礼记录、信用记载等）
│   └── cs.ts             移动客服端接口封装与类型（结单表单与凭证访问地址、售后、话术）
├── utils/format.ts       金额 / 时间 / 枚举文案格式化
├── pages/
│   ├── login/index       登录（宿主 CMF 的用户登录接口）
│   ├── index/index       首页：装修配置 + 在售服务列表
│   ├── order/create      客户自助下单（幂等键、份数、预估应付）
│   ├── order/list        我的订单（按状态分组）
│   ├── order/detail      订单详情：确认 / 拒绝报价、发起售后
│   ├── aftersale/list    我的售后：确认 / 拒绝客服方案、查看进度
│   ├── wallet/index      余额（本金 / 赠送）
│   ├── mine/index        我的：会员等级、成长值、入口、退出
│   ├── reviews/index     我的评价：评价列表 + 申诉（`GET /user/reviews`）
│   ├── member/priority-booking  会员优先预约（选陪玩 + 档期 + 提交意向）
│   ├── player/           陪玩端（§6）
│       ├── home          工作台：上线开关、今日收入、待接邀请、快捷入口
│       ├── hall          抢单大厅：抢单（含优先通知单置顶）
│       ├── orders        我的订单：按状态分组 + 开始 / 结束服务（上报服务量）+ 发起转单
│       ├── wallet        猫粮钱包：可提现余额、收入明细、提现申请与记录
│       ├── addons        加钟通知：确认 / 拒绝
│       ├── notices       优先通知：接单 / 拒绝
│       ├── profile       我的：等级 / 资格 / 接单信息，入口 + 退出
│       ├── transfer      我的转单：查看 / 撤回
│       ├── assessments   我的考核：考核记录（嵌套 `{assessment, scores, weight_total_bp}`）+ 升级申请 + 申诉
│       ├── recoveries    我的追偿：追偿明细 + 信用记载
│       └── teammates     我的固排：列表 / 添加（搜索选人）/ 待处理邀请 / 解除
│   └── cs/               移动客服端（§8）
│       ├── login / workbench / customers / customer-detail   客服登录、工作台、客户列表与档案
│       ├── order-create / orders / order-detail             报单、订单池、订单详情与结单（含「查看服务凭证」）
│       ├── after-sales / scripts                             售后处理、话术库
│       └── member-levels / gift                              会员权益（只读）、礼物
├── pages.json / manifest.json / uni.scss / App.vue / main.ts
```

`src/pages.json` 当前注册 **41** 个页面（2026-10-20 移除储值卡两页后由 43 降为 41，`missing=[]`、tabBar 无悬空条目）。

## 与服务端的接口对应

| 页面 | 接口 | 说明 |
|---|---|---|
| 首页 | `GET /products`、`GET /page?channel=uni_customer_home`、`GET /page/preview/{code}` | 公开接口，无需登录；带 `?preview=<code>` 时兑换草稿配置并显示「预览模式」提示条 |
| 登录 | `POST $VITE_USER_LOGIN_PATH` | 宿主 CMF 用户登录 |
| 下单 | `POST /user/orders` | 须已绑定登录身份 + 成年资格；未被「限制自助下单」（§13.7） |
| 我的订单 | `GET /user/orders?bucket=` | bucket：`all` / `pending_payment` / `pending_dispatch` / `in_progress` / `pending_close` / `completed` / `cancelled` |
| 订单详情 | `GET /user/orders/{id}`、`GET /user/orders/{id}/quote` | 非本人订单返回 403 |
| 确认报价 | `POST /user/orders/{id}/confirm` | 须带客户端看到的报价版本 |
| 我的售后 | `GET /user/aftersales` | 进度可查（§13.2） |
| 发起售后 | `POST /user/aftersales` | 仅可对本人订单发起，渠道固定为 `customer` |
| 确认方案 | `POST /user/after-sales/{id}/confirm` | 「待客户确认」→「待审批」（§13.3） |
| 拒绝方案 | `POST /user/after-sales/{id}/decline` | 须填原因，退回处理中 |
| 钱包 | `GET /user/wallets` | 余额本金 / 赠送分列 |
| 我的 | `GET /user/profile` | 会员等级、成长值、下一档门槛、风险只读；`priority_booking_enabled` 控制预约入口 |
| 我的评价 | `GET /user/reviews`、`POST /user/reviews/{id}/appeal` | 列表含 `review_id` / `appeal_status` / `can_appeal`；仅在 `can_appeal=true` 时出申诉按钮 |
| 改期提案（客户） | `GET /user/reschedule-proposals`、`POST /user/reschedule-proposals/{id}/confirm` | 订单详情「改期提案」卡片；pending 优先下发，含确认进度与截止时间 |
| 售后凭证 | `GET /user/after-sales/{id}/evidence` | 展开售后单懒加载附件（原名 / MIME / 大小） |
| 会员优先预约 | `POST /user/priority-bookings`、`GET /user/player/players/{id}/availability` | 入口由会员权益控制；只展示 `bookable=true` 的时段 |

### 陪玩端（§6）接口对应

| 页面 | 接口 | 说明 |
|---|---|---|
| 工作台 | `GET /user/player/dashboard`、`POST /user/player/presence`、`GET /user/player/invites` | 在线状态 / 收入 / 待接邀请，上下线开关 |
| 接受 / 拒绝邀请 | `POST /user/player/invites/{id}/accept`、`.../reject` | `{id}` 为席位 ID |
| 抢单大厅 | `GET /user/player/grab-hall`、`POST /user/player/orders/{id}/grab` | 抢单成功即已接单 |
| 我的订单 | `GET /user/player/orders?bucket=` | bucket：`pending_acceptance` / `accepted` / `in_service` / `pending_close` / `completed` |
| 服务作业 | `POST /user/player/orders/{id}/service/start`、`.../finish` | 结束服务须带上报服务量 |
| 加钟通知 | `GET /user/player/addons`、`POST .../{id}/confirm`、`.../{id}/reject` | 确认后生成加钟分成 |
| 优先通知 | `GET /user/player/dispatch-notices`、`POST .../{id}/decline` | 接受复用 `orders/{id}/grab` |
| 猫粮钱包 | `GET /user/player/commission`、`.../summary`、`GET /user/player/withdrawals`、`.../summary`、`POST /user/player/withdrawals` | 收入明细 / 可提现余额 / 提现申请与记录 |
| 我的 | `GET /user/player/profile` | 昵称 / 等级 / 资格 / 接单游戏与上限 |
| 转单 | `POST /user/player/orders/{id}/transfer`、`GET /user/player/transfer-requests`、`POST .../{id}/cancel` | 接单后未开始服务可发起，客服确认前可撤回 |
| 考核 | `GET /user/player/assessments`、`POST .../{id}/appeal`、`POST /user/player/assessments/upgrade-apply` | 响应为嵌套结构 `{assessment, scores, weight_total_bp, dimension_count}`（主表字段在 `assessment` 下）；申诉每任务一次；升级申请目标档位由服务端推导 |
| 追偿与信用 | `GET /user/player/recoveries`、`GET /user/player/credit-events` | 追偿扣回明细 + 信用记载（责任 / 追偿 / 人工、复核结论） |
| 期望报价 | `POST /user/player/expected-price` | 页面按「元」输入换算成分；`pending` 时禁止重复提交 |
| 优先派单权 | `GET /user/player/priority-status` | 持有与否、周期、名次、来源、有效期与名额使用 |
| 收礼记录 | `GET /user/player/gift-records?period=daily|weekly|monthly` | 猫粮钱包「收礼记录」：礼物 × 数量、分成到手、送礼客户 |
| 固排 | `GET/POST /user/player/teammates`、`POST .../{id}/dissolve`、`GET /user/player/teammate-requests`、`POST .../{id}/accept`、`.../{id}/decline`、`GET /user/player/players` | 固排列表 / 发起 / 解除、待处理邀请、选人搜索 |
| 固排邀请（订单） | `GET /user/player/orders/{id}/teammate-candidates`、`POST /user/player/orders/{id}/team-invites` | 主陪玩对本人已接单的订单邀请固排补空席位；业务校验全部交服务端 |
| 改期提案（陪玩） | `GET /user/player/reschedule-proposals`、`POST /user/player/reschedule-proposals/{id}/confirm` | 订单页顶部「待确认改期」卡片；该接口不接受 `?order_id=` |
| 陪玩档期 | `GET /user/player/players/{id}/availability` | 预约页取未来 3 天 60 分钟粒度可约时段 |

### 移动客服端（§8）接口对应

| 页面 | 接口 | 说明 |
|---|---|---|
| 登录 / 工作台 | `POST $VITE_ADMIN_LOGIN_PATH`（缺省 `/api/v1/admin/public/login`）、`GET /admin/cs/workbench` | 客服账号独立登录；工作台聚合客户数、订单池、待办与业绩 |
| 客户与档案 | `GET /admin/customers`、`GET/PUT /admin/customers/{id}/profile`、`GET/POST /admin/customers/{id}/follow-ups` | 归属校验：非超管只能看本人客户，越权 403 |
| 报单 | `POST /admin/orders`、`GET /products`（公开）、`GET /admin/products?quote_customer_id=&quote_quantity=` | 复用管理端报单链路与报价口径 |
| 订单与结单 | `GET /admin/orders`、`GET /admin/orders/{id}`、`GET /admin/orders/{id}/close-form`、`POST /admin/orders/{id}/close` | **结单必须回传 `viewed_evidence_attachment_ids`，覆盖 close-form 的 `evidence_attachment_ids`**（见下节 P0-1） |
| 服务凭证地址 | `GET /api/v1/admin/auth/attachments/{id}/access-url` | 取临时签名地址渲缩略图（注意此路径在服务端根下，不在 `/api/v1/esports` 前缀内） |
| 售后 | `GET/POST /admin/after-sales`、`POST /admin/after-sales/{id}/accept`、`.../plan`、`.../approve`、`.../reject`、`.../execute`、`.../evidence-request`、`GET .../{id}/actions` | 移动端只做受理、方案、驳回与执行登记；审批与执行仍按角色权限配置。**遗留**：`pending_approval` 单据上的「代客确认」按钮实际调用 `approve`（即审批），后端 2026-10-19 新增的 `POST /admin/after-sales/{id}/confirm`（仅 `pending_customer_confirm` 可用、不等于审批）移动端尚未接线 |
| 话术库 / 会员 / 礼物 | `GET/POST /admin/scripts`、`GET /admin/member-levels`、`GET /admin/customers/{id}/member`、`GET/POST /admin/gift-orders` | 与 PC 工作台共用同一套接口与口径；移动端会员页只读（调级仍走 PC） |

## 移动客服端结单：服务凭证闭环（P0-1 收口，2026-10-19）

后端契约（`go-admin`）：`GET /admin/orders/{id}/close-form` 返回 `evidence_attachment_ids`（订单全部服务段图片附件 ID，升序去重，无图为空数组，与 `close-conditions` 同名同口径）；`POST /admin/orders/{id}/close` 的 `viewed_evidence_attachment_ids` **必须覆盖该清单全部 ID**，缺一返回 400 并列出「尚未确认查看的附件 ID」；无图片凭证的订单不必传；比较与顺序无关、按 ID 去重，多给或伪造 ID 不算确认。

移动端实现：

- `src/api/cs.ts`：`CsOrderCloseFormView` 新增 `evidence_attachment_ids`；`closeOrder(id, note, values, substitutes, viewedEvidenceAttachmentIds?)` 增加**第 5 个可选参数**，仅传入时才把 `viewed_evidence_attachment_ids` 写进请求体（其它调用方请求体形状不变）。附：`fetchCsAttachmentAccessUrl` / `resolveCsAttachmentUrl` 拼服务端根地址（去掉末尾 `/api/v1/esports`）取签名地址，失败返回空串交给页面降级。
- `src/pages/cs/order-detail.vue`：结单弹窗新增「查看服务凭证」区块——标题行「共 N 张 · 已查看 M 张」，逐张显示缩略图 + 「附件 #id / 已查看|未查看」+ 下载 / 打开 / 标记 / 取消标记，点缩略图走 `uni.previewImage`（可左右滑动）并计为已查看，「全部我已查看」一键标记；地址取不到时该格显示「地址获取失败 / 点击重试」。`submitClose()` 在仍有未查看凭证时直接中止并提示，通过后把**全部** `evidence_attachment_ids` 作为 `viewed_evidence_attachment_ids` 回传；后端 400 中文 message 由请求层原样 toast。
- 回归检查两处：编译期契约文件 `src/api/cs.close-evidence.contract.ts`（参数与字段类型不符即 TS 报错）与机械脚本 `npm run check:close-evidence`（6 条断言：可选入参 / 请求体字段 / close-form 字段 / 地址解析 / 页面读取 / 调用点传值）。

已知取舍：缩略图依赖签名地址（本地存储默认 TTL 600 秒），弹窗停留超时后需重新打开弹窗重取；前端拦截不作为安全边界，后端仍独立校验。

## 未接入（ponytail）

- **支付**：客户端不做支付，订单付给客服确认的渠道；余额核销由客服在管理端操作（储值卡核销已于 2026-10-20 随功能移除）。
- **实时通知**：催单 / 加钟 / 改期等通知靠页面主动刷新，未接推送通道（无 WebSocket / SSE）。
- **固排成队**：陪玩端只做关系管理与订单内邀请，「组队派单一次成队」由管理端排单「席位 → 固排成队」执行。
- **装修范围**：仅客户自助端首页（渠道 `uni_customer_home`）可装修，陪玩端 / 客服端首页不在范围；
  已发布配置按 `search / carousel / notice / quick_nav / category / product_list / player_recommend /
  activity / member_entry / support_entry` 十类组件渲染，带 `?preview=<code>` 时兑换草稿预览。

> 本轮已闭环、不再列为未接入项：服务评价提交（订单详情「服务评价」，成员取 `GET /user/orders/{id}/members`，逐人
> `POST /user/orders/{id}/reviews`）与评价查看 / 申诉（`pages/reviews/index`）、售后凭证上传（[utils/evidence.ts](src/utils/evidence.ts)
> 从相册 / 聊天记录选图并逐张上传至 `private/esports/aftersale`，客服代建走 admin 通道）、陪玩服务凭证截图上传
> （`uploadAttachment` 至 `private/esports/service-evidence`，结束服务时随上报服务量提交）、礼物收入（猫粮钱包
> 「收礼记录」）、客户 / 陪玩两侧待确认改期列表、会员优先预约页与陪玩档期。
