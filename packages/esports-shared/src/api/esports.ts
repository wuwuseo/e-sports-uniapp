// 客户自助端接口封装：与服务端 `internal/apps/esports` 的 /user/* 与公开接口一一对应。

import { request } from './request';

// ── 类型（仅取客户端展示所需字段） ──

export type FulfillmentStatus =
  | 'pending_payment'
  | 'pending_dispatch'
  | 'pending_acceptance'
  | 'grabbing'
  | 'accepted'
  | 'in_service'
  | 'pending_close'
  | 'pending_close_review'
  | 'completed'
  | 'cancelled';

export interface Sku {
  id: number;
  code: string;
  title: string;
  description: string;
  // 商品内容图片（多张）：站内 /uploads/ 路径或绝对地址；未设置为 null/缺省。
  content?: string[] | null;
  unit_price_cents: number;
  service_units: number;
  service_unit_name: string;
  status: string;
}

export interface Order {
  id: number;
  order_no: string;
  customer_id: number;
  product_id: number;
  quantity: number;
  unit_price_cents: number;
  discount_cents: number;
  manual_adjust_cents: number;
  payable_cents: number;
  promised_service_units: number;
  required_seats: number;
  payment_status: string;
  payment_channel: string;
  fulfillment_status: FulfillmentStatus;
  refund_status: string;
  refunded_cents: number;
  addon_cents: number;
  payment_deadline: string;
  quote_version: number;
  closed_at: string | null;
  created_at: string;
}

export interface AfterSale {
  id: number;
  after_sale_no: string;
  source_id: number;
  kind: string;
  channel: string;
  demand: string;
  expected_plan: string;
  status: string;
  fault_party: string;
  plan_action: string;
  refund_cents: number;
  resolution: string;
  customer_decline_reason: string;
  created_at: string;
}

export interface CustomerProfile {
  id: number;
  display_name: string;
  age_status: string;
  member_level_code: string;
  member_level_name: string;
  growth_points: number;
  next_level_code: string;
  next_level_growth: number;
  tags: string[];
  self_order_enabled: boolean;
  /** 会员优先预约入口：当前等级启用 priority_booking 且未停用时为 true。 */
  priority_booking_enabled?: boolean;
  risk_restricted: boolean;
  risk_reason: string;
}

/** 钱包展示口径（服务端 `app.esports.wallet_display`，）：工作室可配的名称 / 图标 / 说明 / 单位与固定倍率。 */
export interface WalletDisplay {
  display_name?: string;
  icon?: string;
  description?: string;
  unit_name?: string;
  /** 每展示单位对应多少分（固定倍率）；缺省按 100 处理。 */
  unit_cents?: number;
  /** 服务端按 unit_cents 换算好的最终展示值（两位小数）；仅账户视图下发，纯配置接口不含。 */
  display_amount?: string;
}

/** 按账户类型索引的展示口径。 */
export type WalletDisplayMap = Partial<Record<'customer_balance' | 'player_catfood', WalletDisplay>>;

export interface CustomerWallet {
  principal_cents: number;
  bonus_cents: number;
  total_cents: number;
  /** 服务端内嵌的展示口径：接口未返回时按固定文案回落。 */
  display?: WalletDisplay;
}

/**
 * 分 → 展示单位数量（两位小数）：按 unit_cents 换算一次，缺省 100（元）。
 * 用于没有服务端 display_amount 的分项金额（本金 / 赠送 / 待结算等）。
 */
export const walletUnitAmount = (
  cents: number | null | undefined,
  display?: WalletDisplay | null,
) => {
  const value = Number(cents ?? 0);
  const unit = display?.unit_cents && display.unit_cents > 0 ? display.unit_cents : 100;
  return (value / unit).toFixed(2);
};

/**
 * 主金额文案：优先用服务端按 unit_cents 换算好的 display_amount（对应账户总余额，直接展示、不再换算），
 * 缺失时才用 walletUnitAmount 换算一次。两者都拿不到配置时回落到 ¥ 分转元。
 */
export const walletPrimaryAmount = (
  cents: number | null | undefined,
  display?: WalletDisplay | null,
) => (display?.display_amount ? display.display_amount : walletUnitAmount(cents, display));

export interface OrderMember {
  player_id: number;
  seat_index: number;
  display_name: string;
  reviewed: boolean;
}

export interface OrderQuote {
  order_id: number;
  order_no: string;
  quote_version: number;
  unit_price_cents: number;
  quantity: number;
  discount_cents: number;
  manual_adjust_cents: number;
  payable_cents: number;
  promised_service_units: number;
  required_seats: number;
  expires_at: string;
  confirmed: boolean;
}

export interface GiftIntent {
  id: number;
  gift_name: string;
  player_name: string;
  quantity: number;
  unit_price_cents: number;
  amount_cents: number;
  payment_source: string;
  order_id: number | null;
  status: 'pending' | 'confirmed' | 'consumed' | 'cancelled';
  version: number;
  expires_at: string;
  confirmed_at: string | null;
}

/** 礼物目录（客户自助端公开只读，对应 GET /gifts）。 */
export interface GiftCatalogItem {
  id: number;
  code: string;
  name: string;
  icon: string;
  price_cents: number;
  category: string;
  high_value: boolean;
  require_age: boolean;
  status: string;
}

/** 陪玩推荐（客户自助端公开只读，对应 GET /players）。 */
export interface RecommendedPlayer {
  id: number;
  display_name: string;
  level: string;
  games: string[];
  qualification: string;
  presence: string;
  online: boolean;
  /**
   * 此刻是否真正可接单（在线连接健康 ∩ 服务时段 ∩ 固排时段 ∩ 并发/每日接单容量）。
   * 客户端据此决定是否展示「立即下单」；不要再用 online 代替。
   * 老版本后端不返回该字段时按不可接单处理（缺省 false），避免误放行下单按钮。
   */
  bookable?: boolean;
}

/** 充值活动赠送阶梯：充 threshold_cents 送 bonus_cents。 */
export interface CampaignTier {
  threshold_cents: number;
  bonus_cents: number;
}

/** 已生效充值赠送活动（客户自助端公开只读，对应 GET /campaigns）。 */
export interface CampaignView {
  id: number;
  code: string;
  name: string;
  activity_type: string;
  tiers: CampaignTier[];
  audience: string;
  bonus_valid_days: number;
  starts_at: string;
  ends_at: string;
  status: string;
}

/** 礼物付款来源：客户余额本金。 */
export type GiftPaymentSource = 'customer_balance_principal';

/** 客户自助创建礼物确认单（POST /user/gift-intents）。 */
export interface GiftIntentCreateInput {
  gift_id: number;
  player_id: number;
  quantity: number;
  payment_source: GiftPaymentSource;
  /** 幂等键（8–128 位），与服务端 createGiftIntent 对齐。 */
  client_key: string;
}

/** 我的礼物单据：含已退金额与退款状态，用于发起争议。 */
export interface GiftOrder {
  id: number;
  gift_no: string;
  player_name: string;
  quantity: number;
  amount_cents: number;
  income_cents: number;
  refund_cents: number;
  refund_status: 'none' | 'partial' | 'full';
  status: 'paid' | 'refunded';
  created_at: string;
}

/** 礼物争议单：客户申请 → 客服审核 → 执行退款。 */
export interface GiftDispute {
  id: number;
  dispute_no: string;
  gift_order_id: number;
  gift_no: string;
  kind: 'not_received' | 'wrong_gift' | 'quality' | 'unauthorized' | 'other';
  demand: string;
  evidence_ref: string;
  requested_refund_cents: number;
  approved_refund_cents: number;
  status: 'pending_review' | 'approved' | 'rejected' | 'completed' | 'withdrawn';
  resolution: string;
  created_at: string;
}

export interface GiftDisputeInput {
  gift_order_id: number;
  kind: GiftDispute['kind'];
  demand: string;
  evidence_ref?: string;
  requested_refund_cents: number;
}

export interface PageDocument {
  channel: string;
  version: number;
  config: Record<string, unknown> | null;
}

/** 首页装修组件：type + 显隐 + 自由 props；layout 按列承载子组件。 */
export interface PageComponent {
  type: string;
  visible?: boolean | null;
  props?: Record<string, unknown> | null;
  children?: (PageComponent | null)[] | null;
}

export interface PageConfig {
  components: PageComponent[];
}
/** 售后来源类型：订单 / 礼物 / 充值。 */
export type AfterSaleSourceType = 'order' | 'gift' | 'recharge';

/** 充值独立支付意图（POST /user/recharge-intents）。 */
export interface RechargeIntent {
  /**
   * 充值意图记录 ID：聚合收款 `business_id` 需要数字主键，但当前服务端视图未下发。
   * 后端补齐前此字段可缺省，充值页据此提示无法扫码支付；补齐后无需改接口。
   */
  id?: number;
  intent_no: string;
  intent_status: string;
  customer_id: number;
  principal_cents: number;
  bonus_cents: number;
  rule_snapshot: Record<string, unknown> | null;
  snapshot_at: string;
  payment_channel: string;
  payment_ref: string;
  payable_cents: number;
  pay_window_expires_at: string;
}

export interface AfterSaleInput {
  /** 售后来源类型，缺省按订单处理。 */
  source_type?: AfterSaleSourceType;
  source_id: number;
  kind: string;
  demand: string;
  expected_plan?: string;
  evidence_ref?: string;
  /** 已上传的凭证附件 ID 列表。 */
  evidence_attachment_ids?: number[];
  contact?: string;
}

/** 财务审核通过的收款账户（客户侧只读视图）。 */
export interface PaymentAccount {
  id: number;
  channel: string;
  subject_name: string;
  account_no: string;
  qr_url: string;
  bank_name: string;
}

/** 收款方式：internal 为站内余额，external 为需上传凭证的外部渠道。 */
export interface PaymentMethod {
  channel: string;
  name: string;
  kind: 'internal' | 'external';
  enabled: boolean;
  accounts: PaymentAccount[];
}

/** 付款凭证核验进度：待核验 / 已核销 / 被驳回。 */
export interface PaymentProof {
  id: number;
  proof_no: string;
  order_id: number;
  channel: string;
  transaction_no: string;
  amount_cents: number;
  status: 'pending_verification' | 'verified' | 'rejected';
  resolution: string;
  created_at: string;
  verified_at: string | null;
}

// ── 聚合收款：本站收银台（订单 / 充值 / 礼物） ──

/** 收银台业务类型：与 `checkouts.business_type` 一一对应。 */
export type CheckoutBusinessType = 'order' | 'recharge' | 'gift';

/** 收银台状态：待支付 / 已支付 / 已超时 / 已取消。 */
export type CheckoutStatus = 'open' | 'paid' | 'expired' | 'cancelled';

/** 收款模式：aggregate 聚合在线收款，manual 固定码 / 人工核验。 */
export type CheckoutChannelMode = 'aggregate' | 'manual';

/** 在线支付渠道：微信 / 支付宝。 */
export type PayChannel = 'wechat' | 'alipay';

/** 本站收银台视图（POST /user/checkouts、GET /user/checkouts/:id）。 */
export interface CheckoutView {
  id: number;
  business_type: CheckoutBusinessType;
  business_id: number;
  amount_cents: number;
  status: CheckoutStatus;
  channel_mode: CheckoutChannelMode;
  /** 通用入口码令牌：拼出公开扫码页链接 `#/pages/pay/scan?token=...`。 */
  entry_token: string;
  business_expires_at: string;
}

/** 公开扫码页视图（GET /public/checkouts/:token，无需登录）。 */
export interface PublicCheckoutView {
  business_type: CheckoutBusinessType;
  amount_cents: number;
  status: CheckoutStatus;
  business_expires_at: string;
  /** 服务端可用收款渠道：全 false 时前端提示改用商家码。 */
  channels: { wechat: boolean; alipay: boolean };
}

/** 发起支付记录（POST /public/checkouts/:token/attempts）。 */
export interface CheckoutAttempt {
  attempt_id: number;
  provider: string;
  pay_channel: PayChannel;
  status: string;
  /** 服务商收银台地址（http(s)，统一走 webview 容器）。 */
  pay_url?: string;
  /** 扫码支付内容（如 weixin:// 链接），由前端渲染为二维码。 */
  qr_payload?: string;
  expires_at: string;
}

/** 支付状态（GET /public/checkouts/:token/status）。 */
export interface CheckoutStatusView {
  status: CheckoutStatus;
  paid: boolean;
}

// ── 公开接口（无需登录） ──

/** 把组件 props 过滤项拼成查询串：跳过空值；数组按逗号分隔（后端 componentIDList 支持逗号形式）。 */
export const componentQueryString = (
  params: Record<string, string | number | boolean | number[] | undefined>
) => {
  const parts: string[] = [];
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') continue;
    if (Array.isArray(value)) {
      if (!value.length) continue;
      parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(value.join(','))}`);
      continue;
    }
    parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`);
  }
  return parts.length ? `?${parts.join('&')}` : '';
};

/** 公开商品列表：把 product_list 组件 props 透传为同名查询参数，服务端据此收窄取数。 */
export const fetchSkus = (
  params: Record<string, string | number | boolean | number[] | undefined> = {}
) => request<Sku[]>({ url: `/products${componentQueryString(params)}`, auth: false });

export const fetchPageConfig = (channel: string) =>
  request<PageDocument>({
    url: `/page?channel=${encodeURIComponent(channel)}`,
    auth: false,
  });

/** 礼物目录（公开，）：仅返回 on_sale 礼物。 */
export const fetchGiftCatalog = () =>
  request<GiftCatalogItem[]>({ url: '/gifts', auth: false });

/**
 * 陪玩推荐（公开）：默认返回 qualified + online 的陪玩，可按 game / level / online / bookable / limit
 * 收窄。返回项的 `bookable` 表示此刻是否真正可接单
 * （在线连接健康 ∩ 服务时段 ∩ 固排时段 ∩ 并发/每日接单容量）。
 */
export const fetchRecommendedPlayers = (
  params: Record<string, string | number | boolean | number[] | undefined> = {}
) =>
  request<RecommendedPlayer[]>({
    url: `/players${componentQueryString(params)}`,
    auth: false,
  });

/** 已生效充值赠送活动（公开，）：仅返回 active 且当前在活动期内。 */
export const fetchActiveCampaigns = () =>
  request<CampaignView[]>({ url: '/campaigns', auth: false });

// ── 登录（路径由宿主 CMF 提供，可用 VITE_USER_LOGIN_PATH 覆盖） ──
// 账号模式提交 username（后端兼容 email/username），手机号模式提交 phone。

export const login = (account: string, password: string, byPhone = false) =>
  request<Record<string, unknown>>({
    url: import.meta.env.VITE_USER_LOGIN_PATH || '/api/v1/public/login',
    method: 'POST',
    auth: false,
    data: byPhone ? { phone: account, password } : { username: account, password },
  });

// ── 客户自助（须登录） ──

export const fetchProfile = () => request<CustomerProfile>({ url: '/user/profile' });

// ── 站内消息（通知闭环）：客户侧读取与标记已读 ──

/** 站内消息：`read_at` 为空表示未读。 */
export interface EsportsMessage {
  id: number;
  type: string;
  title: string;
  summary: string;
  created_at: string;
  read_at: string | null;
}

/** 消息列表查询参数：`limit` 默认 30 / 上限 100，`before_id` 传当前列表最小 id 作翻页游标。 */
export interface MessageListParams {
  limit?: number;
  before_id?: number;
  unread_only?: boolean;
}

/** 拼接消息列表查询串（客户侧与陪玩侧共用）。 */
export const messageQueryString = (params: MessageListParams = {}) => {
  const query: string[] = [];
  if (params.limit) query.push(`limit=${params.limit}`);
  if (params.before_id) query.push(`before_id=${params.before_id}`);
  if (params.unread_only) query.push('unread_only=1');
  return query.length ? `?${query.join('&')}` : '';
};

export const fetchMyMessages = (params: MessageListParams = {}) =>
  request<EsportsMessage[]>({ url: `/user/messages${messageQueryString(params)}` });

export const markMyMessagesRead = (ids: number[]) =>
  request<{ updated: number }>({
    url: '/user/messages/read',
    method: 'POST',
    data: { ids },
  });

export const fetchMyGiftIntents = () =>
  request<GiftIntent[]>({ url: '/user/gift-intents' });

export const confirmMyGiftIntent = (id: number, version: number) =>
  request<GiftIntent>({
    url: `/user/gift-intents/${id}/confirm`,
    method: 'POST',
    data: { expected_version: version, accepted: true },
  });

/** 客户自助创建礼物确认单（选礼物 + 收礼陪玩 + 付款来源）。 */
export const createMyGiftIntent = (input: GiftIntentCreateInput) =>
  request<GiftIntent>({
    url: '/user/gift-intents',
    method: 'POST',
    data: {
      gift_id: input.gift_id,
      player_id: input.player_id,
      quantity: input.quantity,
      payment_source: input.payment_source,
      client_key: input.client_key,
    },
  });

export const fetchWallet = () => request<CustomerWallet>({ url: '/user/wallets' });

/**
 * 钱包展示口径（名称 / 图标 / 说明 / 单位 / 倍率），客户与陪玩端共用。
 * 取不到时由页面回落到旧文案，故不弹错误提示。
 */
export const fetchWalletDisplay = () =>
  request<WalletDisplayMap>({ url: '/user/wallets/display', toast: false });

// ── 自助充值 ──

export const createRechargeIntent = (input: {
  principal_cents: number;
  payment_channel: string;
  idempotency_key: string;
}) =>
  request<RechargeIntent>({
    url: '/user/recharge-intents',
    method: 'POST',
    data: { ...input },
  });

// ── 礼物争议：客户对本人礼物订单发起争议、查询进度与撤回 ──

export const fetchMyGiftOrders = () =>
  request<GiftOrder[]>({ url: '/user/gift-orders' });

export const fetchMyGiftDisputes = () =>
  request<GiftDispute[]>({ url: '/user/gift-disputes' });

export const createMyGiftDispute = (input: GiftDisputeInput) =>
  request<GiftDispute>({
    url: '/user/gift-disputes',
    method: 'POST',
    data: { ...input } as unknown as Record<string, unknown>,
  });

export const withdrawMyGiftDispute = (id: number) =>
  request<GiftDispute>({
    url: `/user/gift-disputes/${id}/withdraw`,
    method: 'POST',
  });

export const fetchMyOrders = (bucket = 'all') =>
  request<Order[]>({ url: `/user/orders?bucket=${encodeURIComponent(bucket)}` });

export const fetchMyOrder = (id: number) =>
  request<Order>({ url: `/user/orders/${id}` });

export const cancelUnpaidOrder = (id: number) =>
  request<Order>({ url: `/user/orders/${id}/cancel`, method: 'POST', data: { reason: '客户自行取消' } });

export const fetchOrderQuote = (id: number) =>
  request<OrderQuote>({ url: `/user/orders/${id}/quote` });

/** 订单服务成员（服务评价前置）：含展示名与是否已评价。 */
export const fetchOrderMembers = (orderId: number) =>
  request<OrderMember[]>({ url: `/user/orders/${orderId}/members` });

/** 确认或拒绝报价：须带上客户端看到的报价版本，避免覆盖新报价。 */
export const confirmOrderQuote = (
  id: number,
  quoteVersion: number,
  accepted: boolean
) =>
  request<{ confirmation_id: number; quote_version: number }>({
    url: `/user/orders/${id}/confirm`,
    method: 'POST',
    data: { expected_quote_version: quoteVersion, accepted },
  });

export const placeSelfOrder = (
  skuId: number,
  quantity: number,
  idempotencyKey: string,
  preferredPlayerId = 0
) =>
  request<Order>({
    url: '/user/orders',
    method: 'POST',
    data: {
      product_id: skuId,
      quantity,
      idempotency_key: idempotencyKey,
      // 客户指定陪玩：0 表示不指定陪玩，保持既有请求体口径。
      ...(preferredPlayerId > 0 ? { preferred_player_id: preferredPlayerId } : {}),
    },
  });

export const fetchMyAfterSales = () =>
  request<AfterSale[]>({ url: '/user/aftersales' });

export const createAfterSale = (input: AfterSaleInput) =>
  request<AfterSale>({
    url: '/user/aftersales',
    method: 'POST',
    data: { ...input, source_type: input.source_type || 'order' },
  });

export const confirmAfterSalePlan = (id: number) =>
  request<AfterSale>({
    url: `/user/after-sales/${id}/confirm`,
    method: 'POST',
  });

export const declineAfterSalePlan = (id: number, reason: string) =>
  request<AfterSale>({
    url: `/user/after-sales/${id}/decline`,
    method: 'POST',
    data: { reason },
  });

// ── 售后逐项进度 / 单内沟通 / 补证状态 ──

/** 售后单个动作项的进度：待执行 / 执行中 / 已执行 / 执行失败 / 已跳过。 */
export interface AfterSaleActionProgress {
  seq: number;
  action_type: string;
  action_label: string;
  status: string;
  status_label: string;
  amount_cents: number;
  result_summary: string;
  executed_at: string | null;
}

/**
 * 客户侧售后逐项进度。
 * `refunded_cents` 只统计已成功执行的动作项；`pending_cents` 是待执行金额——
 * 两者必须分开显示，待执行不得显示成「已到账」。
 */
export interface AfterSaleProgress {
  after_sale_id: number;
  after_sale_no: string;
  status: string;
  settlement_state: string;
  settlement_label: string;
  refunded_cents: number;
  pending_cents: number;
  progress: Record<string, number>;
  actions: AfterSaleActionProgress[];
}

/** 售后单内沟通记录：客户侧只返回 visibility=all 的消息。 */
export interface AfterSaleMessage {
  id: number;
  after_sale_id: number;
  author_type: 'customer' | 'admin' | 'player' | 'system';
  author_id: number;
  author_name: string;
  content: string;
  visibility: 'all' | 'internal';
  attachments: string[] | null;
  created_at: string;
}

/** 客户侧「是否待补证」：pending_evidence 为真时须带附件回复才解除。 */
export interface AfterSaleEvidenceStatus {
  after_sale_id: number;
  after_sale_no: string;
  evidence_present: boolean;
  pending_evidence: boolean;
  request_note: string;
  requested_at: string | null;
}

export const fetchAfterSaleProgress = (id: number) =>
  request<AfterSaleProgress>({ url: `/user/after-sales/${id}/progress` });

export const fetchAfterSaleMessages = (id: number) =>
  request<AfterSaleMessage[]>({ url: `/user/after-sales/${id}/messages` });

/** 回复售后单（补证 / 补充说明）：attachments 传已上传附件 ID 的字符串引用，非空即视为已补证。 */
export const postAfterSaleMessage = (
  id: number,
  input: { content: string; attachments?: string[] }
) =>
  request<AfterSaleMessage>({
    url: `/user/after-sales/${id}/messages`,
    method: 'POST',
    data: { content: input.content, visibility: 'all', attachments: input.attachments || [] },
  });

export const fetchAfterSaleEvidenceStatus = (id: number) =>
  request<AfterSaleEvidenceStatus>({ url: `/user/after-sales/${id}/evidence-status` });

/**
 * 售后凭证附件清单（只读确认）：服务端解析售后单 evidence_ref 里的附件 ID 返回附件详情，
 * 仅售后单归属客户本人可读（他人售后返回 403）。
 */
export interface EsportsAttachment {
  id: number;
  name: string;
  original_name: string;
  path: string;
  mime_type: string;
  extension: string;
  size: number;
  created_at: string;
}

export const fetchAfterSaleEvidence = (id: number) =>
  request<EsportsAttachment[]>({ url: `/user/after-sales/${id}/evidence` });

export const submitOrderReview = (
  orderId: number,
  playerId: number,
  rating: number,
  comment: string
) =>
  request<unknown>({
    url: `/user/orders/${orderId}/reviews`,
    method: 'POST',
    data: { player_id: playerId, rating, comment },
  });

// ── 收款闭环：读取收款方式与账户、提交付款凭证、查询核验进度 ──

export const fetchPaymentMethods = (params?: {
  business_type?: CheckoutBusinessType;
  business_id?: number;
}) => {
  const query: string[] = [];
  if (params?.business_type) {
    query.push(`business_type=${encodeURIComponent(params.business_type)}`);
  }
  if (params?.business_id) {
    query.push(`business_id=${encodeURIComponent(String(params.business_id))}`);
  }
  return request<PaymentMethod[]>({
    url: `/user/payment-methods${query.length ? `?${query.join('&')}` : ''}`,
  });
};

// 带业务上下文的收款方式视图（GET /user/payment-methods?business_type=&business_id=）：
// methods = 可用外部渠道账户；manual_methods = 固定商家码兜底账户；aggregate = 动态聚合可用性。
export interface CheckoutAggregateAvailability {
  available: boolean;
  providers: string[];
  channels: Record<string, boolean>;
  reason?: string;
  checkout_id?: number;
  checkout_mode?: string;
}

export interface PaymentMethodsContext {
  methods: PaymentMethod[];
  manual_methods: PaymentMethod[];
  aggregate: CheckoutAggregateAvailability;
}

export const fetchPaymentMethodsContext = (params: {
  business_type: CheckoutBusinessType;
  business_id: number;
}) =>
  request<PaymentMethodsContext>({
    url: `/user/payment-methods?business_type=${encodeURIComponent(
      params.business_type
    )}&business_id=${encodeURIComponent(String(params.business_id))}`,
  });

export const submitPaymentProof = (
  orderId: number,
  input: {
    account_id: number;
    transaction_no: string;
    amount_cents: number;
    note?: string;
    evidence_attachment_ids: number[];
  }
) =>
  request<PaymentProof>({
    url: `/user/orders/${orderId}/payment-proof`,
    method: 'POST',
    data: { ...input } as unknown as Record<string, unknown>,
  });

export const fetchPaymentProofs = (orderId: number) =>
  request<PaymentProof[]>({ url: `/user/orders/${orderId}/payment-proofs` });

// ── 客户自助付款：余额核销、在线收银台 ──

/** 余额核销订单：余额停用 / 余额不足 / 非本人订单由后端返回 4xx 中文提示。 */
export const payOrderByBalance = (orderId: number) =>
  request<Order>({ url: `/user/orders/${orderId}/pay-by-balance`, method: 'POST' });

/** 在线收银台发起收款：渠道未配置网关时后端返回 503 中文提示，客户端不伪造成功。 */
export interface OrderPaymentStart {
  intent_no: string;
  channel: string;
  pay_url: string;
  amount_cents: number;
  expires_at: string;
}

export const startOrderPayment = (orderId: number, channel: string) =>
  request<OrderPaymentStart>({
    url: `/user/orders/${orderId}/payment/start`,
    method: 'POST',
    data: { channel },
  });

// ── 聚合收款：本站收银台与公开扫码页 ──

/** 创建 / 复用收银台：同一业务重复调用由服务端幂等复用 open 单。 */
export const createCheckout = (input: {
  business_type: CheckoutBusinessType;
  business_id: number;
  mode?: CheckoutChannelMode;
}) =>
  request<CheckoutView>({
    url: '/user/checkouts',
    method: 'POST',
    data: { ...input },
  });

/** 读取收银台详情（登录态，用于收银台页刷新状态）。 */
export const fetchCheckout = (id: number) =>
  request<CheckoutView>({ url: `/user/checkouts/${id}` });

/** 公开扫码页业务摘要（无需登录，扫码用户可能没有账号）。 */
export const fetchPublicCheckout = (token: string) =>
  request<PublicCheckoutView>({
    url: `/public/checkouts/${encodeURIComponent(token)}`,
    auth: false,
    toast: false,
  });

/** 发起一次在线支付：可能返回服务商收银台地址或扫码内容。 */
export const createCheckoutAttempt = (token: string, payChannel: PayChannel) =>
  request<CheckoutAttempt>({
    url: `/public/checkouts/${encodeURIComponent(token)}/attempts`,
    method: 'POST',
    data: { pay_channel: payChannel },
    auth: false,
  });

/** 轮询支付状态：失败由页面静默重试，不弹 toast 干扰等待中的用户。 */
export const fetchCheckoutStatus = (token: string) =>
  request<CheckoutStatusView>({
    url: `/public/checkouts/${encodeURIComponent(token)}/status`,
    auth: false,
    toast: false,
  });

// ── 会员优先预约 ──
// 仅当前会员等级启用 priority_booking 的客户可提交；意向与正式订单解耦，由客服确认后再报单。
// 预约入口由 `GET /user/profile` 的 priority_booking_enabled 决定显隐。

export interface PriorityBookingInput {
  player_id: number;
  /** 期望开始时间（RFC3339，须为未来时间）。 */
  requested_start_at: string;
  note?: string;
}

export interface PriorityBookingIntent {
  id: number;
  customer_id: number;
  player_id: number;
  player_name: string;
  requested_start_at: string | null;
  note: string;
  /** pending 待处理 / processed 已处理 / cancelled 已取消。 */
  status: string;
  created_at: string;
}

export const createPriorityBooking = (input: PriorityBookingInput) =>
  request<PriorityBookingIntent>({
    url: '/user/priority-bookings',
    method: 'POST',
    data: {
      player_id: input.player_id,
      requested_start_at: input.requested_start_at,
      note: input.note || '',
    },
  });

// ── 陪玩档期可用性：提交预约前先看该陪玩某段日期里哪些时段可预约 ──

export interface PlayerAvailabilitySlot {
  start: string;
  end: string;
  /** available / occupied。 */
  status: string;
  bookable: boolean;
  /** 占用原因（已排单占位 / 服务进行中 / 已预定档期）。 */
  reason?: string;
  order_no?: string;
}

export interface PlayerAvailabilityView {
  player_id: number;
  player_name: string;
  from: string;
  to: string;
  slot_minutes: number;
  occupied_count: number;
  available_count: number;
  slots: PlayerAvailabilitySlot[];
}

/** 可用时段查询：`from` / `to` 为 RFC3339，缺省未来 7 天；粒度缺省 60 分钟（15–1440）。 */
export const fetchPlayerAvailability = (
  playerId: number,
  params: { from?: string; to?: string; slot_minutes?: number } = {}
) => {
  const query: string[] = [];
  if (params.from) query.push(`from=${encodeURIComponent(params.from)}`);
  if (params.to) query.push(`to=${encodeURIComponent(params.to)}`);
  if (params.slot_minutes) query.push(`slot_minutes=${params.slot_minutes}`);
  return request<PlayerAvailabilityView>({
    url: `/user/player/players/${playerId}/availability${query.length ? `?${query.join('&')}` : ''}`,
  });
};

// ── 改期提案确认（，客户侧） ──
// 已付款订单的改期由客服发起提案，客户与每名已接单成员各自确认后生效；拒绝即终结提案。
// 服务端未提供用户侧读取提案列表的接口（GET 仅管理端），确认入参需要客服告知的提案 ID。

export interface RescheduleProposalDecision {
  proposal_no: string;
  order_id: number;
  from_start_at: string | null;
  from_service_duration_minutes: number;
  to_start_at: string;
  to_service_duration_minutes: number;
  /** pending / confirmed / rejected / expired / withdrawn。 */
  status: string;
  expires_at: string;
  reason: string;
  decided_at: string | null;
}

export const confirmRescheduleProposal = (
  proposalId: number,
  accept: boolean,
  note = ''
) =>
  request<RescheduleProposalDecision>({
    url: `/user/reschedule-proposals/${proposalId}/confirm`,
    method: 'POST',
    data: { accept, note },
  });

// ── 我的评价 ──
// `GET /user/reviews` 返回当前登录客户本人的评价列表（倒序，可选 ?order_id= 只看某单）。
// 关键：带上 review_id 与 can_appeal，客户端才能直接调 `POST /user/reviews/:id/appeal` 发起申诉。

/** 评价申诉状态：none 未申诉 / pending 待复核 / approved 申诉成立 / rejected 申诉被驳回。 */
export type ReviewAppealStatus = 'none' | 'pending' | 'approved' | 'rejected';

export interface MyReview {
  review_id: number;
  order_id: number;
  order_no: string;
  player_id: number;
  rating: number;
  content: string;
  /** 是否来自已核验身份的客户自助评价（客服代录为 false）。 */
  verified: boolean;
  /** 风控状态：normal / disputed / invalid / appeal_pending（与 appeal_status 是两个维度）。 */
  status: string;
  appeal_status: ReviewAppealStatus | string;
  /** 已有申诉单 ID；未申诉为 null。 */
  appeal_id: number | null;
  /** 服务端判定的可申诉口径：已有申诉 / 终局 / 超出申诉时限均为 false。 */
  can_appeal: boolean;
  created_at: string;
}

/** 我的评价列表；`order_id` 传本人订单时只看该单评价。 */
export const fetchMyReviews = (params: { limit?: number; order_id?: number } = {}) =>
  request<MyReview[]>({
    url: `/user/reviews${componentQueryString({
      limit: params.limit,
      order_id: params.order_id,
    })}`,
  });

/** 评价申诉单（`POST /user/reviews/:id/appeal` 的返回）。 */
export interface MyReviewAppeal {
  id: number;
  review_id: number;
  appellant_type: 'customer' | 'player';
  status: ReviewAppealStatus | string;
  reason: string;
  evidence_ref: string;
  created_at: string;
}

// ── 我的改期提案：待确认优先，其后为历史 ──
// 客户走 `GET /user/reschedule-proposals`（可选 ?order_id=）；陪玩侧同构，见 api/player.ts。

/** 提案的逐人确认进度：complete 为真表示客户与全部成员均已确认且无人拒绝。 */
export interface RescheduleProposalProgress {
  customer_required: boolean;
  customer_confirmed: boolean;
  player_required_count: number;
  player_confirmed_count: number;
  required_count: number;
  confirmed_count: number;
  rejected_count: number;
  complete: boolean;
  /** 尚未表态的确认人（客户恒为 1 条 type=customer 的占位）。 */
  pending_confirmers: Array<{ type: string; id: number; seat_index: number }>;
}

export interface MyRescheduleProposal {
  proposal_id: number;
  proposal_no: string;
  order_id: number;
  order_no: string;
  from_start_at: string | null;
  from_service_duration_minutes: number;
  to_start_at: string;
  to_service_duration_minutes: number;
  /** pending / confirmed / rejected / expired / withdrawn。 */
  status: string;
  /** 确认截止时间；过期后提案失效，订单保持原档期。 */
  expires_at: string;
  reason: string;
  decided_at: string | null;
  created_at: string;
  /** 当前登录人的表态：confirmed / rejected / pending（尚未表态）。 */
  my_decision: string;
  /** 本人在该单的席位序号（客户恒为 0）。 */
  my_seat_index: number;
  progress: RescheduleProposalProgress;
}

export const fetchMyRescheduleProposals = (orderId?: number) =>
  request<MyRescheduleProposal[]>({
    url: `/user/reschedule-proposals${componentQueryString({ order_id: orderId })}`,
  });

// ── 评价申诉：客户或陪玩对被判定异常 / 不实的评价发起申诉 ──
export const appealMyReview = (reviewId: number, reason: string, evidenceRef = '') =>
  request<MyReviewAppeal>({
    url: `/user/reviews/${reviewId}/appeal`,
    method: 'POST',
    data: { reason, evidence_ref: evidenceRef },
  });

// ── 装修预览码兑换（，公开） ──
// 预览码由管理端签发，兑换只回草稿配置（不含个人信息）；非白名单渠道不返回草稿内容。

export interface PagePreviewDocument {
  channel: string;
  draft_version: number;
  preview: boolean;
  config: Record<string, unknown> | null;
  tabbar?: { items?: Array<Record<string, unknown>> } | null;
}

export const fetchPagePreview = (code: string) =>
  request<PagePreviewDocument>({
    url: `/page/preview/${encodeURIComponent(code)}`,
    auth: false,
  });
