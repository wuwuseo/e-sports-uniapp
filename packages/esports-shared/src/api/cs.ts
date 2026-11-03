// 客服端接口封装：客服以 admin 身份登录，走 /admin/* 接口。
// 与客户/陪玩端的 user token（'esports_token'）相互独立，这里使用独立的 admin token 存储与请求封装，
// 但复用与 request.ts 相同的解包逻辑（成功 code === 1）与 API_BASE 拼接规则。
// 业务接口为相对路径（如 /admin/cs/workbench），完整前缀 /api/v1/esports 由 API_BASE 提供，
// 与 esports.ts 的 /products、/user/* 同源；admin 登录接口由宿主 CMF 提供，用完整路径（同 user 登录）。

import { API_BASE, requestURL } from "./request";
import type { ApiResponse } from "./request";
import { createWalletDisplayCache } from "../utils/wallet-display";
import type { WalletDisplay, WalletDisplayMap } from "../utils/wallet-display";

const walletDisplayCache = createWalletDisplayCache({
  getItem: (key) => uni.getStorageSync(key) || null,
  setItem: (key, value) => uni.setStorageSync(key, value),
  removeItem: (key) => uni.removeStorageSync(key),
});
const walletScope = () => `${API_BASE}:admin`;
export const getCsWalletDisplayState = () =>
  walletDisplayCache.state(walletScope());
export const fetchCsWalletDisplay = (force = false) =>
  walletDisplayCache.load(
    walletScope(),
    () => csRequest<WalletDisplayMap>({ url: '/wallets/display', auth: false, toast: false })
      .catch(() => csRequest<WalletDisplayMap>({ url: '/admin/wallets/display', toast: false })),
    force,
  );

// ── admin token 存储（与 user token 隔离） ──

const ADMIN_TOKEN_KEY = 'esports_admin_token';

export const ADMIN_LOGIN_PATH =
  import.meta.env.VITE_ADMIN_LOGIN_PATH || '/api/v1/admin/public/login';

export function getAdminToken(): string {
  return (uni.getStorageSync(ADMIN_TOKEN_KEY) as string) || '';
}

export function setAdminToken(token: string) {
  uni.setStorageSync(ADMIN_TOKEN_KEY, token);
}

export function clearAdminToken() {
  uni.removeStorageSync(ADMIN_TOKEN_KEY);
}

// ── 请求层（复用 request.ts 逻辑，改 token key 与 401 跳转目标） ──

export interface CsRequestOptions {
  url: string;
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  data?: Record<string, unknown>;
  /** 是否携带 admin 登录态，默认 true；admin 登录接口传 false。 */
  auth?: boolean;
  /** 是否由本层统一 toast 错误，默认 true。 */
  toast?: boolean;
  /** 额外请求头（如报单的 Idempotency-Key）。 */
  headers?: Record<string, string>;
}

export function csRequest<T>(options: CsRequestOptions): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const header: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    };
    const token = getAdminToken();
    if (options.auth !== false && token) {
      header.Authorization = `Bearer ${token}`;
    }
    uni.request({
      url: requestURL(options.url),
      method: options.method || 'GET',
      data: options.data,
      header,
      success: (res) => {
        const body = res.data as ApiResponse<T> | undefined;
        const status = res.statusCode;
        if (status === 401) {
          clearAdminToken();
          uni.reLaunch({ url: '/pages/cs/login' });
          reject(new Error('客服登录已过期，请重新登录'));
          return;
        }
        if (status < 200 || status >= 300 || !body || body.code !== 1) {
          const message = body?.message || `请求失败（${status}）`;
          if (options.toast !== false) {
            uni.showToast({ title: message, icon: 'none' });
          }
          reject(new Error(message));
          return;
        }
        resolve(body.data);
      },
      fail: (err) => {
        const message = err.errMsg || '网络异常，请稍后重试';
        if (options.toast !== false) {
          uni.showToast({ title: message, icon: 'none' });
        }
        reject(new Error(message));
      },
    });
  });
}

// ── 附件上传（客服 admin 通道） ──
// 售后凭证等「客服本人上传」的附件必须走管理端上传端点：服务端按 uploaded_by=admin.UID 校验归属，
// 前台端点记的是 user:<uid>，用前台端点上传的附件会被售后附件归属校验判为他人附件而拒绝。

/** 管理端统一上传端点（对应 router.go 的 adminAuth /attachments/upload）。 */
export const ADMIN_ATTACHMENT_UPLOAD_URL = '/api/v1/admin/auth/attachments/upload';

interface AdminAttachmentEnvelope {
  code: number;
  message?: string;
  data?: { id?: number };
}

/**
 * 上传附件（admin 登录态），成功返回附件 ID。
 * @param filePath 本地文件路径（uni.chooseImage 返回的 tempFilePaths 元素）
 * @param directory 附件目录，售后凭证固定 private/esports/aftersale
 */
export function uploadCsAttachment(
  filePath: string,
  directory = 'private/esports/aftersale'
): Promise<number> {
  return new Promise<number>((resolve, reject) => {
    uni.uploadFile({
      url: requestURL(ADMIN_ATTACHMENT_UPLOAD_URL),
      filePath,
      name: 'file',
      header: { Authorization: `Bearer ${getAdminToken()}` },
      formData: { directory },
      success: (res) => {
        let body: AdminAttachmentEnvelope | undefined;
        try {
          body = JSON.parse(res.data) as AdminAttachmentEnvelope;
        } catch {
          uni.showToast({ title: '上传响应解析失败', icon: 'none' });
          reject(new Error('上传响应解析失败'));
          return;
        }
        if (
          res.statusCode < 200 ||
          res.statusCode >= 300 ||
          !body ||
          body.code !== 1 ||
          !body.data?.id
        ) {
          const message = body?.message || `上传失败（${res.statusCode}）`;
          uni.showToast({ title: message, icon: 'none' });
          reject(new Error(message));
          return;
        }
        resolve(body.data.id);
      },
      fail: (err) => {
        const message = err.errMsg || '上传失败，请稍后重试';
        uni.showToast({ title: message, icon: 'none' });
        reject(new Error(message));
      },
    });
  });
}

// ── 附件访问地址（管理端 ≥ 服务端根路径） ──
// 附件访问地址与内容端点挂在服务端**根路径**（`/api/v1/admin/auth/attachments/...`、
// `/api/v1/attachments/...`），不在 esports 业务前缀下。API_BASE 在不同部署下可能带
// `/api/v1/esports`（csRequest 的业务前缀）也可能只有源站，这里统一去掉该后缀得到服务端根地址，
// 两种配置都能拼出正确地址。返回值形状见 handler/attachment_access.go。

/** 服务端根地址：去掉 API_BASE 末尾的 /api/v1/esports 前缀。 */
export function apiHostRoot(): string {
  return API_BASE.replace(/\/+$/, '').replace(/\/api\/v1\/esports$/, '');
}

/** 把后端下发的相对地址（如 /api/v1/attachments/1/content?token=...）补成绝对地址。 */
export function absoluteApiUrl(url: string): string {
  if (!url) return '';
  if (/^https?:\/\//i.test(url)) return url;
  return `${apiHostRoot()}/${url.replace(/^\/+/, '')}`;
}

/** `GET /api/v1/admin/auth/attachments/{id}/access-url` 的返回视图。 */
export interface CsAttachmentAccessView {
  /** 绝对地址（S3 / CDN）或相对的内容端点地址（本地存储 + 签名 token）。 */
  url: string;
  expires_in: number;
  mode: string;
  public: boolean;
  disk: string;
  driver: string;
}

/**
 * 取附件临时访问地址（admin 登录态）。路径在服务端根下，因此不能用 csRequest
 * （它会再拼一次 esports 业务前缀）；这里按 uploadCsAttachment 的既有写法直接发裸请求。
 * toast:false：单张失败由调用方按「地址获取失败，可重试」降级，不连弹多个错误。
 */
export function fetchCsAttachmentAccessUrl(
  attachmentId: number
): Promise<CsAttachmentAccessView> {
  return new Promise<CsAttachmentAccessView>((resolve, reject) => {
    uni.request({
      url: `${apiHostRoot()}/api/v1/admin/auth/attachments/${attachmentId}/access-url`,
      method: 'GET',
      header: { Authorization: `Bearer ${getAdminToken()}` },
      success: (res) => {
        const body = res.data as ApiResponse<CsAttachmentAccessView> | undefined;
        if (res.statusCode < 200 || res.statusCode >= 300 || !body || body.code !== 1) {
          reject(new Error(body?.message || `获取附件地址失败（${res.statusCode}）`));
          return;
        }
        resolve(body.data);
      },
      fail: (err) => reject(new Error(err.errMsg || '获取附件地址失败')),
    });
  });
}

/** 解析附件可访问地址；失败返回空串，由调用方展示「地址获取失败」。 */
export async function resolveCsAttachmentUrl(attachmentId: number): Promise<string> {
  try {
    const view = await fetchCsAttachmentAccessUrl(attachmentId);
    return absoluteApiUrl(view?.url || '');
  } catch {
    return '';
  }
}

// ── 类型（仅取客服端展示所需字段） ──

export interface AdminLoginToken {
  access_token: string;
  token_type: string;
  expires_in: number;
  refresh_token?: string;
}

export interface CsTodoItem {
  key: string;
  label: string;
  count: number;
}

export interface CsOrder {
  id: number;
  order_no: string;
  customer_id: number;
  product_id: number;
  created_by_admin_id: number | null;
  responsible_admin_id: number | null;
  quantity: number;
  unit_price_cents: number;
  discount_cents: number;
  manual_adjust_cents: number;
  payable_cents: number;
  promised_service_units: number;
  addon_cents: number;
  addon_units: number;
  required_seats: number;
  required_level: string;
  fulfillment_status: string;
  payment_status: string;
  payment_channel: string;
  appointment_status: string;
  requested_start_at: string | null;
  preferred_player_id: number | null;
  priority_notice_status: string;
  refunded_cents: number;
  created_at: string;
}

export interface DispatchBoard {
  pending_dispatch: CsOrder[];
  public_pool: CsOrder[];
  grabbing: CsOrder[];
  pending_acceptance: CsOrder[];
  accepted: CsOrder[];
  in_service: CsOrder[];
  pending_close: CsOrder[];
  abnormal: CsOrder[];
  online_players: number;
  member_priority_order_ids: number[];
  masked_public_pool_ids: number[];
}

export interface CsPerformanceRow {
  admin_id: number;
  admin_name: string;
  order_count: number;
  revenue_cents: number;
  refund_cents: number;
  net_cents: number;
  commission_cents: number;
}

export interface CsWorkbench {
  my_customers: number;
  order_pool: DispatchBoard;
  todos: CsTodoItem[];
  performance: { type: string; rows: CsPerformanceRow[] };
  range: { start: string; end: string; period: string };
}

export interface CsCustomer {
  id: number;
  user_id: number | null;
  owner_admin_id: number | null;
  display_name: string;
  age_status: string;
  self_order_enabled: boolean;
  phone: string;
  birthday: string;
  consumption_preference: string;
  tags: string[] | null;
  source: string;
  follow_status: string;
  risk_status: string;
  risk_reason: string;
  member_level_code: string;
  last_contact_at: string | null;
  version: number;
  created_at: string;
}

export interface CustomerProfileOverview {
  balance_display?: WalletDisplay;
  customer: CsCustomer;
  principal_cents: number;
  bonus_cents: number;
  balance_cents: number;
  recharged_cents: number;
  consumed_cents: number;
  refunded_cents: number;
  gifted_cents: number;
  growth_total: number;
  order_count: number;
  member_level_code: string;
  source: string;
  follow_status: string;
}

/** 会员等级配置（GET /admin/member-levels，见 member_handlers.go 的 memberLevelView）。 */
export interface CsMemberLevel {
  id: number;
  code: string;
  name: string;
  growth_threshold: number;
  /** 折扣基点：10000 = 原价，9500 = 9.5 折。 */
  discount_bps: number;
  priority_dispatch: boolean;
  prepay_bonus_bps: number;
  /** 专属客服权益开关。 */
  dedicated_cs: boolean;
  /** 优先预约权益开关。 */
  priority_booking: boolean;
  sort_order: number;
  status: string;
  version: number;
  created_at: string;
  updated_at: string;
}

/** 客户会员详情（GET /admin/customers/:id/member，见 member.go 的 memberView）。 */
export interface CsCustomerMember {
  customer_id: number;
  level_code: string;
  level_name: string;
  /** 折扣基点：10000 = 原价，9500 = 9.5 折。 */
  discount_bps: number;
  /** 累计成长值（单位与订单金额一致，即分）。 */
  growth_total: number;
  /** 待降级等级，空串表示无。 */
  pending_level_code: string;
  downgrade_after: string | null;
  level_changed_at: string | null;
  /** 以下权益开关取自等级配置；memberView 未下发时由 fetchMemberLevels 兜底。 */
  dedicated_cs?: boolean;
  priority_booking?: boolean;
}

/** 充值活动档位（schematier.CampaignTier）。 */
export interface CsCampaignTier {
  threshold_cents: number;
  bonus_cents: number;
}

/** 已生效充值赠送活动（GET /campaigns，见 campaign_handlers.go 的 campaignView）。 */
export interface CsCampaign {
  id: number;
  code: string;
  name: string;
  /** full_gift 满赠 / ladder 阶梯 / limited 限时。 */
  activity_type: string;
  tiers: CsCampaignTier[];
  /** all 全部 / new_customer 新客 / specified 指定。 */
  audience: string;
  audience_customer_ids: number[];
  /** stack 可叠加 / exclusive 互斥。 */
  stack_rule: string;
  /** 赠送有效期天数，0 表示永久。 */
  bonus_valid_days: number;
  starts_at: string;
  ends_at: string;
  status: string;
  version: number;
  created_at: string;
  updated_at: string;
}

export interface CustomerFollowUp {
  id: number;
  customer_id: number;
  admin_id: number;
  channel: string;
  summary: string;
  next_follow_at: string | null;
  created_at: string;
}

export interface CsScript {
  id: number;
  title: string;
  category: string;
  content: string;
  sort_order: number;
  status: 'enabled' | 'disabled';
  created_by: number | null;
  version: number;
  created_at: string;
  updated_at: string;
}

export interface DispatchCandidate {
  player_id: number;
  display_name: string;
  level: string;
  qualification: string;
  presence: string;
  preferred: boolean;
  from_priority_notice: boolean;
  rating_average: number;
  rating_samples: number;
  rating_insufficient: boolean;
  active_seats: number;
  history_completed: number;
  zone_rank: number;
  score: number;
}

export interface DispatchCandidatesResult {
  game: string;
  candidates: DispatchCandidate[];
}

export interface CustomerProfileInput {
  phone: string;
  birthday: string;
  consumption_preference: string;
  tags: string[];
  follow_status: string;
}

export interface FollowUpInput {
  channel: string;
  summary: string;
  next_follow_at?: string;
}

export interface ScriptInput {
  title: string;
  category: string;
  content: string;
  sort_order?: number;
  status?: 'enabled' | 'disabled';
}

export interface OrderCreateInput {
  customer_id: number;
  product_id: number;
  quantity: number;
  /** 报单入口：移动客服端固定传 cs_mobile，供后端区分入口来源。 */
  entry_point?: string;
  /** 经授权的人工调整：非零时须同时给出 4–255 字的调整原因，且不得超过 商品 免审额度。 */
  manual_adjust_cents?: number;
  manual_adjust_reason?: string;
}

/** 报单入参的可选字段：仅带值时提交，避免改动默认报单的幂等口径。 */
function orderOptionalFields(input: OrderCreateInput): Record<string, unknown> {
  const extra: Record<string, unknown> = {};
  if (input.manual_adjust_cents) {
    extra.manual_adjust_cents = input.manual_adjust_cents;
    extra.manual_adjust_reason = (input.manual_adjust_reason || '').trim();
  }
  return extra;
}

// ── 登录（admin 身份，路径由宿主 CMF 提供，可用 VITE_ADMIN_LOGIN_PATH 覆盖） ──

export const adminLogin = (username: string, password: string) =>
  csRequest<AdminLoginToken>({
    url: ADMIN_LOGIN_PATH,
    method: 'POST',
    auth: false,
    data: { username, password },
  });

// ── 客服工作台 ──

export const fetchCsWorkbench = () =>
  csRequest<CsWorkbench>({ url: '/admin/cs/workbench' });

// ── 客户档案与跟进 ──

export const fetchCsCustomers = () =>
  csRequest<CsCustomer[]>({ url: '/admin/customers' });

export const fetchCustomerProfile = async (id: number) => {
  const profile = await csRequest<CustomerProfileOverview>({
    url: `/admin/customers/${id}/profile`,
  });
  walletDisplayCache.remember(
    walletScope(),
    "customer_balance",
    profile.balance_display
  );
  return profile;
};

/** 客户会员详情：当前等级、折扣、累计成长值与待降级信息。 */
export const fetchCustomerMember = (id: number) =>
  csRequest<CsCustomerMember>({ url: `/admin/customers/${id}/member` });

/** 会员等级配置列表：用于按等级 code 解析专属客服 / 优先预约等权益开关。 */
export const fetchMemberLevels = () =>
  csRequest<CsMemberLevel[]>({ url: '/admin/member-levels' });

// ── 企微侧边栏自动建档：企业主体 + 外部联系人标识幂等 ──

export interface WecomIntakeResult {
  customer: CsCustomer;
  created: boolean;
}

export interface WecomIntakeInput {
  corp_id: string;
  external_id: string;
  display_name?: string;
  phone?: string;
}

/** 企微侧边栏接入配置（公开接口，无需登录）。 */
export interface WecomSidebarConfig {
  auth_mode: 'js_sdk' | 'account';
  js_sdk_enabled: boolean;
}

/** 读取企微侧边栏接入模式（AuthPublic，无需登录）。 */
export const fetchWecomSidebarConfig = () =>
  csRequest<WecomSidebarConfig>({ url: '/wecom/sidebar-config', auth: false });

/** 企微 JS-SDK 签名（POST /admin/wecom/js-config）。 */
export interface WecomJsConfig {
  app_id: string;
  agent_id: string;
  timestamp: string;
  nonce_str: string;
  signature: string;
}

/** 企微侧边栏收款方式（复用客户自助端视图 ）。 */
export interface WecomPaymentMethod {
  channel: string;
  name: string;
  kind: 'internal' | 'external';
  enabled: boolean;
  accounts: Array<{
    id: number;
    channel: string;
    subject_name: string;
    account_no: string;
    qr_url: string;
    bank_name: string;
  }>;
}

/** 获取企微 JS-SDK 签名（须 admin 登录态）。配置缺失时后端返回 503，调用方降级。 */
export const fetchWecomJsConfig = (url: string) =>
  csRequest<WecomJsConfig>({
    url: '/admin/wecom/js-config',
    method: 'POST',
    data: { url },
  });

/** 侧边栏读取当前启用的收款方式与收款账户（AuthAdmin）。 */
export const fetchWecomPaymentMethods = () =>
  csRequest<WecomPaymentMethod[]>({ url: '/admin/wecom/payment-methods' });

export const wecomIntake = (input: WecomIntakeInput) =>
  csRequest<WecomIntakeResult>({
    url: '/admin/customers/wecom-intake',
    method: 'POST',
    data: {
      corp_id: input.corp_id,
      external_id: input.external_id,
      display_name: input.display_name ?? '',
      phone: input.phone ?? '',
    },
  });

export const updateCustomerProfile = (id: number, input: CustomerProfileInput) =>
  csRequest<CsCustomer>({
    url: `/admin/customers/${id}/profile`,
    method: 'PUT',
    data: { ...input } as unknown as Record<string, unknown>,
  });

export const fetchCustomerFollowUps = (id: number) =>
  csRequest<CustomerFollowUp[]>({ url: `/admin/customers/${id}/follow-ups` });

export const createCustomerFollowUp = (id: number, input: FollowUpInput) =>
  csRequest<CustomerFollowUp>({
    url: `/admin/customers/${id}/follow-ups`,
    method: 'POST',
    data: { ...input } as unknown as Record<string, unknown>,
  });

// ── 话术库 ──

export const fetchScripts = () => csRequest<CsScript[]>({ url: '/admin/scripts' });

export const createScript = (input: ScriptInput) =>
  csRequest<CsScript>({
    url: '/admin/scripts',
    method: 'POST',
    data: {
      title: input.title,
      category: input.category,
      content: input.content,
      sort_order: input.sort_order ?? 0,
      status: input.status ?? 'enabled',
    },
  });

export const setScriptStatus = (id: number, status: 'enabled' | 'disabled', expectedVersion: number) =>
  csRequest<CsScript>({
    url: `/admin/scripts/${id}/status`,
    method: 'POST',
    data: { status, expected_version: expectedVersion },
  });

// ── 订单（列表 / 详情 / 报单 / 派单 / 催单） ──

export const fetchCsOrders = () => csRequest<CsOrder[]>({ url: '/admin/orders' });

/** 按客户查询订单（服务端筛选）：customer_id + limit + offset，倒序返回最近 N 单。 */
export const fetchCsOrdersByCustomer = (customerId: number, limit = 20, offset = 0) =>
  csRequest<CsOrder[]>({
    url: `/admin/orders?customer_id=${customerId}&limit=${limit}&offset=${offset}`,
  });

export const fetchCsOrder = (id: number) =>
  csRequest<CsOrder>({ url: `/admin/orders/${id}` });

export const createCsOrder = (input: OrderCreateInput, idempotencyKey: string) =>
  csRequest<CsOrder>({
    url: '/admin/orders',
    method: 'POST',
    data: {
      customer_id: input.customer_id,
      product_id: input.product_id,
      quantity: input.quantity,
      entry_point: 'cs_mobile',
      ...orderOptionalFields(input),
    },
    headers: { 'Idempotency-Key': idempotencyKey },
  });

// 企微侧边栏报单：与移动客服报单同接口，仅 entry_point 区分入口来源。
export const createWecomOrder = (input: OrderCreateInput, idempotencyKey: string) =>
  csRequest<CsOrder>({
    url: '/admin/orders',
    method: 'POST',
    data: {
      customer_id: input.customer_id,
      product_id: input.product_id,
      quantity: input.quantity,
      entry_point: 'wecom_sidebar',
      ...orderOptionalFields(input),
    },
    headers: { 'Idempotency-Key': idempotencyKey },
  });

export const claimOrder = (id: number) =>
  csRequest<CsOrder>({ url: `/admin/orders/${id}/claim`, method: 'POST' });

export const remindOrder = (id: number, level: number, note: string) =>
  csRequest<{ order_id: number }>({
    url: `/admin/orders/${id}/remind`,
    method: 'POST',
    data: { level, note },
  });

export const fetchDispatchCandidates = (id: number) =>
  csRequest<DispatchCandidatesResult>({ url: `/admin/orders/${id}/dispatch-candidates` });

export const assignSeat = (id: number, seatIndex: number, playerId: number) =>
  csRequest<Record<string, unknown>>({
    url: `/admin/orders/${id}/seats/${seatIndex}/assign`,
    method: 'POST',
    data: { player_id: playerId },
  });

// ── 在售 商品（复用公开接口，无需登录，供报单页选择） ──

export interface CsSku {
  id: number;
  code: string;
  title: string;
  service_type: string;
  unit_price_cents: number;
  service_units: number;
  service_unit_name: string;
  /** 结单要求规则编号（公开 /admin 两个 商品 接口都下发，空串表示按默认口径结单）。 */
  close_rule_code: string;
  /** 标准服务时长（分钟），0 表示未配置。 */
  service_duration_minutes: number;
}

/** 报单页商品试算结果。 */
export interface CsSkuQuote {
  product_id: number;
  quantity: number;
  member_level_code: string;
  member_discount_bps: number;
  unit_price_cents: number;
  subtotal_cents: number;
  member_discount_cents: number;
  payable_cents: number;
  promised_service_units: number;
  service_unit_name: string;
  close_rule_code: string;
}

/** 带试算的 商品 列表响应：/admin/products 带 quote_customer_id 时由数组变为该结构。 */
export interface CsSkuWithQuotes {
  items: CsSku[];
  /** 以 product_id 字符串为键的试算结果。 */
  quotes: Record<string, CsSkuQuote>;
}

export const fetchCsSkus = () => csRequest<CsSku[]>({ url: '/products', auth: false });

/**
 * 报单页试算：按客户 + 份数逐 商品 返回会员折扣、应付、承诺服务量与结单要求。
 * 服务端只多返回 quotes，金额与 POST /admin/orders 的实际应付同一套计算，故前端不再自行估算。
 */
export const fetchCsSkuQuotes = (customerId: number, quantity: number) =>
  csRequest<CsSku[] | CsSkuWithQuotes>({
    url: `/admin/products?quote_customer_id=${customerId}&quote_quantity=${quantity}`,
  });

// ── 收款：余额核销、提交到账凭证与核验 ──

export interface PaymentAccount {
  id: number;
  channel: string;
  subject_name: string;
  account_no: string;
  qr_url: string;
  bank_name: string;
  status: string;
}

export interface OfflinePaymentProof {
  id: number;
  proof_no: string;
  order_id: number;
  account_id: number;
  transaction_no: string;
  amount_cents: number;
  status: string;
  proof_ref: string;
  resolution: string;
  created_at: string;
  verified_at: string | null;
}

export interface OfflinePaymentProofInput {
  order_id: number;
  account_id: number;
  transaction_no: string;
  amount_cents: number;
  proof_ref: string;
  note?: string;
}

export const fetchPaymentAccounts = () =>
  csRequest<PaymentAccount[]>({ url: '/admin/payment-accounts' });

export const fetchOfflinePaymentProofs = (status = '', orderId = 0) => {
  const qs: string[] = [];
  if (status) qs.push(`status=${encodeURIComponent(status)}`);
  if (orderId) qs.push(`order_id=${orderId}`);
  const suffix = qs.length ? `?${qs.join('&')}` : '';
  return csRequest<OfflinePaymentProof[]>({ url: `/admin/offline-payment-proofs${suffix}` });
};

export const submitOfflinePaymentProof = (input: OfflinePaymentProofInput) =>
  csRequest<OfflinePaymentProof>({
    url: '/admin/offline-payment-proofs',
    method: 'POST',
    data: { ...input } as unknown as Record<string, unknown>,
  });

export const verifyOfflinePaymentProof = (id: number) =>
  csRequest<OfflinePaymentProof>({
    url: `/admin/offline-payment-proofs/${id}/verify`,
    method: 'POST',
  });

export const rejectOfflinePaymentProof = (id: number, resolution: string) =>
  csRequest<OfflinePaymentProof>({
    url: `/admin/offline-payment-proofs/${id}/reject`,
    method: 'POST',
    data: { resolution },
  });

export const payOrderByBalance = (id: number) =>
  csRequest<CsOrder>({ url: `/admin/orders/${id}/pay-by-balance`, method: 'POST' });

// ── 订单跟进（结单 / 复核 / 转单 / 取消 / 加钟）：复用后端既有 /admin/orders 子接口 ──

export type CsCloseFormFieldType =
  | 'text'
  | 'number'
  | 'money'
  | 'select'
  | 'multiselect'
  | 'datetime'
  | 'image'
  | 'switch'
  | 'reference';

export interface CsCloseFormField {
  key: string;
  label: string;
  field_type: CsCloseFormFieldType;
  required: boolean;
  options: string[] | null;
  max_length: number;
}

export interface CsCloseFormBinding {
  field_key: string;
  required: boolean;
  sort: number;
}

export interface CsCloseFormTemplate {
  id: number;
  code: string;
  name: string;
  version: number;
  fields: CsCloseFormBinding[] | null;
}

export interface CsCloseSubmitRule {
  id: number;
  code: string;
  name: string;
  version: number;
  mode: string;
  min_submit_ratio_bp: number;
  allow_substitute: boolean;
  on_missing: string;
  required: number;
}

export interface CsUnsubmittedMember {
  seat_index: number;
  player_id: number;
}

export interface CsOrderCloseFormView {
  template: CsCloseFormTemplate | null;
  fields: CsCloseFormField[];
  latest_snapshot: Record<string, unknown> | null;
  submit_rule: CsCloseSubmitRule | null;
  unsubmitted: CsUnsubmittedMember[];
  /**
   * 结单前必须逐张查看的服务凭证图片附件 ID：订单全部服务段 evidence_ref 里的图片附件，
   * 升序去重，无图片时为空数组。与 `GET /admin/orders/{id}/close-conditions` 的 `evidence_attachment_ids`
   * 同名同口径；结单时必须把全部 ID 作为 `viewed_evidence_attachment_ids` 原样回传。
   */
  evidence_attachment_ids?: number[];
}

export interface CsCloseConditionItem {
  field: string;
  label: string;
  operator: string;
  expected: number;
  actual: number;
  satisfied: boolean;
  reason: string;
}

export interface CsCloseConditionStatus {
  satisfied: boolean;
  tree_configured: boolean;
  rule_code: string;
  rule_version: number;
  review_threshold_cents: number;
  items: CsCloseConditionItem[];
  reasons: string[];
}

export interface CsOrderAddon {
  id: number;
  addon_no: string;
  order_id: number;
  added_cents: number;
  added_units: number;
  status: string;
  requested_by_admin_id: number | null;
  rule_id: number | null;
  rule_no: string;
  rule_version: number;
  commission_cents: number;
  payment_status: string;
  paid_cents: number;
  paid_at: string | null;
  paid_by_admin_id: number | null;
  payment_ref: string;
  confirmed_player_id: number | null;
  confirmed_at: string | null;
  reject_reason: string;
  note: string;
  version: number;
  created_at: string;
  updated_at: string;
}

export interface OrderAddonInput {
  added_cents: number;
  added_units: number;
  note?: string;
}

export interface CloseSubstituteReport {
  seat_index: number;
  reported_units: number;
  evidence_ref: string;
}

/**
 * 结单：结单表单值 + 代提交上报。
 * `viewedEvidenceAttachmentIds` 是「已逐张查看」的服务凭证附件 ID：
 * 订单有图片凭证时必须覆盖 close-form 返回的全部 `evidence_attachment_ids`，缺一后端即 400；
 * 无图片凭证可省略。为可选参数，既有调用方不传时请求体形状不变。
 */
export const closeOrder = (
  id: number,
  note: string,
  formValues?: Record<string, unknown>,
  substituteReports?: CloseSubstituteReport[],
  viewedEvidenceAttachmentIds?: number[]
) =>
  csRequest<CsOrder>({
    url: `/admin/orders/${id}/close`,
    method: 'POST',
    data: {
      note,
      form_values: formValues || {},
      substitute_reports: substituteReports || [],
      ...(viewedEvidenceAttachmentIds === undefined
        ? {}
        : { viewed_evidence_attachment_ids: viewedEvidenceAttachmentIds }),
    },
  });

export const approveCloseReview = (id: number, note = '') =>
  csRequest<CsOrder>({
    url: `/admin/orders/${id}/close-approve`,
    method: 'POST',
    data: { note },
  });

export const rejectCloseReview = (id: number, reason: string) =>
  csRequest<CsOrder>({
    url: `/admin/orders/${id}/close-reject`,
    method: 'POST',
    data: { reason },
  });

export const fetchOrderCloseForm = (id: number) =>
  csRequest<CsOrderCloseFormView>({ url: `/admin/orders/${id}/close-form` });

export const fetchOrderCloseConditions = (id: number) =>
  csRequest<CsCloseConditionStatus>({
    url: `/admin/orders/${id}/close-conditions`,
  });

export const transferOrder = (id: number, toAdminId: number, reason: string) =>
  csRequest<CsOrder>({
    url: `/admin/orders/${id}/transfer`,
    method: 'POST',
    data: { to_admin_id: toAdminId, reason },
  });

export const cancelOrder = (id: number, reason: string) =>
  csRequest<CsOrder>({
    url: `/admin/orders/${id}/cancel`,
    method: 'POST',
    data: { reason },
  });

export const fetchOrderAddons = (id: number) =>
  csRequest<CsOrderAddon[]>({ url: `/admin/orders/${id}/addons` });

export const createOrderAddon = (id: number, input: OrderAddonInput) =>
  csRequest<CsOrderAddon>({
    url: `/admin/orders/${id}/addons`,
    method: 'POST',
    data: {
      added_cents: input.added_cents,
      added_units: input.added_units,
      note: input.note ?? '',
    },
  });

export const cancelOrderAddon = (id: number) =>
  csRequest<CsOrderAddon>({ url: `/admin/order-addons/${id}/cancel`, method: 'POST' });

export const payOrderAddonByBalance = (id: number) =>
  csRequest<CsOrderAddon>({
    url: `/admin/order-addons/${id}/pay-by-balance`,
    method: 'POST',
  });

// ── 售后：列表 / 详情 / 代建 / 受理 / 方案 / 审批 / 执行 ──

export interface CsAfterSale {
  id: number;
  after_sale_no: string;
  source_type: string;
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
  customer_id: number | null;
  player_id: number | null;
  created_at: string;
}

export interface AfterSaleCreateInput {
  /** 售后来源类型，缺省按订单处理。 */
  source_type?: string;
  source_id: number;
  kind: string;
  demand: string;
  expected_plan?: string;
  contact?: string;
  /** 客服代建时引用的凭证附件 ID：须为客服本人上传（归属 + MIME 校验）。 */
  evidence_attachment_ids?: number[];
  customer_id?: number;
}

export interface AfterSalePlanInput {
  fault_party: string;
  plan_action: string;
  refund_cents: number;
  resolution: string;
}

/** 售后单内沟通记录：visibility=internal 为仅客服可见的内部备注。 */
export interface CsAfterSaleMessage {
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

export interface CsAfterSaleMessageInput {
  content: string;
  /** 缺省 all（客户可见）；internal 为内部备注，仅客服可写。 */
  visibility?: 'all' | 'internal';
  /** 附件引用（≤20 个，单个 ≤255 字符）。 */
  attachments?: string[];
}

export const fetchAfterSales = (status = '') =>
  csRequest<CsAfterSale[]>({
    url: `/admin/after-sales${status ? `?status=${encodeURIComponent(status)}` : ''}`,
  });

export const fetchAfterSale = (id: number) =>
  csRequest<CsAfterSale>({ url: `/admin/after-sales/${id}` });

/** 售后沟通记录（含内部备注），用于客服在单内回复与提示补证留痕。 */
export const fetchAfterSaleMessages = (id: number) =>
  csRequest<CsAfterSaleMessage[]>({ url: `/admin/after-sales/${id}/messages` });

export const postAfterSaleMessage = (id: number, input: CsAfterSaleMessageInput) =>
  csRequest<CsAfterSaleMessage>({
    url: `/admin/after-sales/${id}/messages`,
    method: 'POST',
    data: {
      content: input.content,
      visibility: input.visibility || 'all',
      attachments: input.attachments || [],
    },
  });

/** 提示客户补证：写一条客户可见的补证提示 + 外盒留痕，客户带附件回复即解除。 */
export const requestAfterSaleEvidence = (id: number, note: string) =>
  csRequest<CsAfterSaleMessage>({
    url: `/admin/after-sales/${id}/evidence-request`,
    method: 'POST',
    data: { note },
  });

/** 售后动作项：一张售后单可挂多条动作项，按项推进与展示进度。 */
export interface CsAfterSaleAction {
  id: number;
  after_sale_id: number;
  order_id: number;
  seq: number;
  action_type: 'refund' | 'compensate' | 'makeup' | 'replace';
  amount_cents: number;
  status: 'pending' | 'executing' | 'succeeded' | 'failed' | 'skipped';
  result_summary: string;
  note: string;
  executed_at: string | null;
  created_at: string;
}

export interface CsAfterSaleActionsView {
  /** 各状态计数：pending / executing / succeeded / failed / skipped。 */
  progress: Record<string, number>;
  actions: CsAfterSaleAction[];
}

/** 客服侧逐项进度：待执行（pending）不显示成已到账（succeeded）。 */
export const fetchAfterSaleActions = (id: number) =>
  csRequest<CsAfterSaleActionsView>({ url: `/admin/after-sales/${id}/actions` });

export const createAfterSale = (input: AfterSaleCreateInput) =>
  csRequest<CsAfterSale>({
    url: '/admin/after-sales',
    method: 'POST',
    data: {
      ...input,
      channel: 'admin',
      source_type: input.source_type || 'order',
    } as unknown as Record<string, unknown>,
  });

export const acceptAfterSale = (id: number) =>
  csRequest<CsAfterSale>({ url: `/admin/after-sales/${id}/accept`, method: 'POST' });

export const planAfterSale = (id: number, input: AfterSalePlanInput) =>
  csRequest<CsAfterSale>({
    url: `/admin/after-sales/${id}/plan`,
    method: 'POST',
    data: { ...input } as unknown as Record<string, unknown>,
  });

/**
 * 代客户确认售后方案（「待客户确认」→「待审批」）。客户线下已同意时由客服代为确认。
 *
 * **与审批严格区分**：本接口只推进「待客户确认 → 待审批」，不写审批人、不占退款额度、不产生资金动作；
 * 审批仍须另行调用 `approveAfterSale`（且须由非该单处理人执行）。非「待客户确认」状态一律 409。
 */
export const confirmAfterSale = (id: number) =>
  csRequest<CsAfterSale>({ url: `/admin/after-sales/${id}/confirm`, method: 'POST' });

export const approveAfterSale = (id: number) =>
  csRequest<CsAfterSale>({ url: `/admin/after-sales/${id}/approve`, method: 'POST' });

export const rejectAfterSale = (id: number, reason: string) =>
  csRequest<CsAfterSale>({
    url: `/admin/after-sales/${id}/reject`,
    method: 'POST',
    data: { reason },
  });

export const executeAfterSale = (id: number) =>
  csRequest<CsAfterSale>({ url: `/admin/after-sales/${id}/execute`, method: 'POST' });

export const withdrawAfterSale = (id: number) =>
  csRequest<CsAfterSale>({ url: `/admin/after-sales/${id}/withdraw`, method: 'POST' });

// ── 送礼：礼物目录 / 送礼意图 / 执行送礼 ──

export interface CsGift {
  id: number;
  code: string;
  name: string;
  icon: string;
  price_cents: number;
  category: string;
  status: string;
}

export interface CsGiftIntent {
  id: number;
  customer_id: number;
  gift_id: number;
  gift_name: string;
  player_id: number;
  player_name: string;
  order_id: number | null;
  quantity: number;
  amount_cents: number;
  payment_source: string;
  status: string;
  expires_at: string;
  created_at: string;
}

export interface GiftIntentInput {
  customer_id: number;
  gift_id: number;
  player_id: number;
  quantity: number;
  order_id?: number;
  payment_source?: string;
  client_key: string;
}

export interface CsPlayer {
  id: number;
  display_name: string;
  level: string;
  qualification: string;
}

export const fetchGifts = (status = '') =>
  csRequest<CsGift[]>({ url: `/admin/gifts${status ? `?status=${encodeURIComponent(status)}` : ''}` });

export const fetchGiftIntents = () =>
  csRequest<CsGiftIntent[]>({ url: '/admin/gift-intents' });

export const createGiftIntent = (input: GiftIntentInput) =>
  csRequest<CsGiftIntent>({
    url: '/admin/gift-intents',
    method: 'POST',
    data: { ...input } as unknown as Record<string, unknown>,
  });

export const sendGift = (intentId: number) =>
  csRequest<Record<string, unknown>>({
    url: '/admin/gift-orders',
    method: 'POST',
    data: { intent_id: intentId },
  });

export const fetchAdminPlayers = (keyword = '') =>
  csRequest<CsPlayer[]>({
    url: `/admin/players${keyword ? `?keyword=${encodeURIComponent(keyword)}` : ''}`,
  });

// ── 充值活动：公开接口，仅返回已生效且在活动期内的活动 ──

export const fetchPublicCampaigns = () =>
  csRequest<CsCampaign[]>({ url: '/campaigns', auth: false });

// ── 站内消息中心（CMF 核心接口，绝对路径 /api/v1/admin/auth/messages） ──

/** 管理端消息列表响应：与 /api/v1/admin/auth/messages 的 ListResponse 一致。 */
export interface CsMessageList {
  total: number;
  page: number;
  data: CsMessage[];
}

/** 管理端站内消息（含广播消息），`read_at` 为空表示未读。 */
export interface CsMessage {
  id: number;
  type: string;
  level: string;
  title: string;
  content: string;
  read_at?: string;
  created_at: string;
}

export interface CsMessageListParams {
  page?: number;
  page_size?: number;
  /** 0=只看未读，1=只看已读，缺省全部。 */
  read_status?: 0 | 1;
}

/** 客服端消息列表：分页 + 按创建时间倒序。 */
export const fetchCsMessages = (params: CsMessageListParams = {}) => {
  const query: string[] = ['sort=created_at_desc'];
  if (params.page) query.push(`page=${params.page}`);
  if (params.page_size) query.push(`page_size=${params.page_size}`);
  if (params.read_status !== undefined) query.push(`read_status=${params.read_status}`);
  return csRequest<CsMessageList>({
    url: `/api/v1/admin/auth/messages?${query.join('&')}`,
  });
};

export const markCsMessagesRead = (ids: number[]) =>
  csRequest<{ affected: number }>({
    url: '/api/v1/admin/auth/messages/read',
    method: 'POST',
    data: { ids },
  });

/** 全部已读：服务端按当前登录 uid 一键清空未读，比逐条提交加载过的 id 更完整。 */
export const markAllCsMessagesRead = () =>
  csRequest<{ affected: number }>({
    url: '/api/v1/admin/auth/messages/read-all',
    method: 'POST',
    data: {},
  });
