// 陪玩端自助接口封装：与服务端 `internal/apps/esports` 的 /user/player/* 接口一一对应。
// 复用与客户自助端相同的请求层，登录态一致（同一 User 账号 + Bearer token）。

import { getToken, request } from './request';
import { messageQueryString } from './esports';
import type { EsportsMessage, MessageListParams, MyRescheduleProposal } from './esports';

// ── 类型（仅取陪玩端展示所需字段） ──

export interface PlayerDashboard {
  presence: string;
  online: boolean;
  pending_invites: number;
  active_orders: number;
  today_catfood_cents: number;
  catfood_balance_cents: number;
}

export interface PlayerInvite {
  id: number;
  seat_index: number;
  order_id: number;
  order_no: string;
  customer_id: number;
  product_id: number;
  payable_cents: number;
  fulfillment_status: string;
  required_seats: number;
  expires_at: string;
}

export interface PlayerOrder {
  id: number;
  order_no: string;
  customer_id: number;
  product_id: number;
  quantity: number;
  unit_price_cents: number;
  payable_cents: number;
  promised_service_units: number;
  required_seats: number;
  addon_cents: number;
  addon_units: number;
  fulfillment_status: string;
  payment_status: string;
  priority_notice_status: string;
  priority_notice_until: string | null;
  created_at: string;
  // ── 抢单大厅筛选所需的订单快照字段（服务端返回完整订单实体） ──
  /** 所需技能等级快照：novice / skilled / senior / mentor。 */
  required_level: string;
  /** 名单匹配用的游戏分区快照（未开过优先通知窗口的订单为空串）。 */
  priority_game: string;
  /** 每席承诺服务量；0 表示未配置。 */
  per_seat_service_units: number;
  /** 标准服务时长（分钟），0 表示未配置。 */
  service_duration_minutes: number;
}

export interface PlayerServiceTiming {
  order_id: number;
  status: 'in_service' | 'paused';
  started_at: string;
  paused_at: string | null;
  effective_seconds: number;
  paused_seconds: number;
}

/**
 * 分成明细：在明细原始字段（分成方式 / 规则版本 / 基数 / 金额）之上，
 * 服务端读模型补出规则数值、该明细被冲回的扣减项与到手净额，以及逐最小服务单位留痕。
 */
export interface CommissionEntry {
  id: number;
  kind: string;
  order_id: number | null;
  base_cents: number;
  amount_cents: number;
  status: string;
  rule_no: string;
  note: string;
  created_at: string;
  /** 分成方式：percent 按比例 / fixed_per_order 按单固定 / fixed_per_unit 按单位固定。 */
  calc_mode: string;
  /** 命中规则版本号，0 表示无规则快照。 */
  rule_version: number;
  /** 规则数值：percent 看基点，固定额看分。 */
  rule_value_bp: number;
  rule_value_cents: number;
  /** 同一订单同一口径累计的冲回金额（负数）。 */
  deducted_cents: number;
  /** 到手净额 = 本明细金额 + 扣减项。 */
  net_cents: number;
  /** 按承诺服务量拆分的逐最小服务单位留痕（仅订单分成且承诺量 > 1 时下发）。 */
  service_unit_amounts?: number[];
}

export interface CommissionSummary {
  pending_settlement_cents: number;
  // 被争议冻结的待结算金额：仍属待结算但不参与当期结算。
  frozen_cents: number;
  settled_cents: number;
  next_settlement_at: string;
  // 生效结算周期与命中层级（player/level/game/global/system_config）。
  settlement_period: string;
  settlement_scope: string;
}

export interface Withdrawal {
  id: number;
  withdrawal_no: string;
  amount_cents: number;
  fee_cents: number;
  tax_cents: number;
  net_cents: number;
  channel: string;
  account_ref: string;
  status: string;
  reject_reason: string;
  created_at: string;
}

/** 提现方式开通状态：未开通的渠道前端不展示、也不提交。 */
export interface WithdrawalChannelOption {
  channel: string;
  enabled: boolean;
}

export interface WithdrawalSummary {
  withdrawable_cents: number;
  pending_review_cents: number;
  total_withdrawn_cents: number;
  /** 提现方式开关；服务端未下发时按「全部开通」回落（服务端默认开通）。 */
  channels?: WithdrawalChannelOption[];
}

export interface Addon {
  id: number;
  addon_no: string;
  order_id: number;
  added_cents: number;
  added_units: number;
  status: string;
  note: string;
  created_at: string;
}

export interface PriorityNotice {
  id: number;
  order_id: number;
  game: string;
  status: string;
  notified_at: string;
}

export interface WithdrawalInput {
  amount_cents: number;
  channel: string;
  account_ref: string;
  idempotency_key: string;
}

// ── 首页与上线状态 ──

export const fetchPlayerDashboard = (toast = true) =>
  request<PlayerDashboard>({ url: '/user/player/dashboard', toast });

export const setPlayerPresence = (online: boolean) =>
  request<{ id: number; presence: string; version: number }>({
    url: '/user/player/presence',
    method: 'POST',
    data: { online },
  });

// ── 心跳保活 ──

// 保活只刷新 last_heartbeat_at，不改变上下线状态。主动下线但 app 仍打开时也持续发送，
// 使服务端判定「连接正常」而保持可抢单资格；断开后心跳停止，自然失去抢单资格。
export const sendPlayerHeartbeat = () =>
  request<{ id: number; presence: string; version: number }>({
    url: '/user/player/heartbeat',
    method: 'POST',
    toast: false,
  });

// 陪玩端前台保活：模块级单例定时器，由「前台」与「页面」两类持有者共同引用，
// 任一持有者存活即保持心跳，全部释放后才真正停表，避免页面 onHide 把应用前台心跳误停。
const HEARTBEAT_INTERVAL_MS = 60 * 1000;

/** 心跳持有者：foreground=App 前台生命周期；page=陪玩页面（历史调用点）。 */
export type HeartbeatHolder = 'foreground' | 'page';

const heartbeatHolders = new Set<HeartbeatHolder>();
let heartbeatTimer: ReturnType<typeof setInterval> | null = null;

// 陪玩身份本地标记：登录接口只返回 token（login/index.vue 靠探测 /user/player/dashboard
// 判断身份），请求层也没有角色字段，无法从登录结果直接读身份，因此以
// 「当前 token 进入过陪玩端」作为可靠且无额外请求的判断依据。
// 标记值绑定 token：账号切换后 token 变化，标记自动失效，避免客户账号沿用陪玩心跳。
const PLAYER_MODE_KEY = 'esports_player_mode';

/** 进入陪玩端时置位；未登录不写，避免登出后残留。 */
export function markPlayerMode() {
  const token = getToken();
  if (!token) return;
  uni.setStorageSync(PLAYER_MODE_KEY, token);
}

export function isPlayerMode(): boolean {
  const token = getToken();
  if (!token) return false;
  return uni.getStorageSync(PLAYER_MODE_KEY) === token;
}

export function clearPlayerMode() {
  uni.removeStorageSync(PLAYER_MODE_KEY);
}

/** 心跳单次执行：token 已被清（登出 / 401）时自动停表，避免 401 循环触发登录跳转。 */
function heartbeatTick() {
  if (!getToken()) {
    stopAllPlayerHeartbeat();
    return;
  }
  // toast:false，失败静默；连续失败不打扰用户。
  sendPlayerHeartbeat().catch(() => {});
}

function clearHeartbeatTimer() {
  if (heartbeatTimer) {
    clearInterval(heartbeatTimer);
    heartbeatTimer = null;
  }
}

export function startPlayerHeartbeat(holder: HeartbeatHolder = 'page') {
  if (!getToken()) return;
  // 能启动心跳即已处于陪玩端（home.vue 直接以 page 持有者启动），顺带补记身份，
  // 保证冷启动进入任意陪玩页后，应用回前台仍能恢复心跳。
  markPlayerMode();
  heartbeatHolders.add(holder);
  // 页面可见即应用处于前台：同时登记 foreground 持有者。陪玩首页只以 page 持有者启动，
  // 若此时不登记 foreground，离开首页（hall / notices / addons 等页不再自行启动）会因
  // stopPlayerHeartbeat('page') 把表停掉；登记后页面切换只释放 page 引用，心跳不中断。
  // 真正的停表由 App.onHide 的 stopAllPlayerHeartbeat 统一负责。
  heartbeatHolders.add('foreground');
  // 单例：已有定时器时只登记持有者，不重复建表。
  if (heartbeatTimer) return;
  // 先建表再立即保活一次：若首次 tick 发现 token 已失效会自行停表，
  // 反过来先 tick 再建表会在这种情况下留下一个无人引用的定时器。
  heartbeatTimer = setInterval(heartbeatTick, HEARTBEAT_INTERVAL_MS);
  heartbeatTick();
}

// 释放页面引用：页面 onHide 时调用。应用前台由 foreground 持有者维持，
// 因此这里通常只做引用计数递减，不会真正停表（停表由 App.onHide / 登出负责）。
export function stopPlayerHeartbeat(holder: HeartbeatHolder = 'page') {
  heartbeatHolders.delete(holder);
  if (heartbeatHolders.size > 0) return;
  clearHeartbeatTimer();
}

/** 强制停表（登出 / 身份切换）：清空所有持有者。 */
export function stopAllPlayerHeartbeat() {
  heartbeatHolders.clear();
  clearHeartbeatTimer();
}

/** 进入陪玩端：置位身份标记，已登录时立即启动前台心跳。 */
export function enterPlayerMode() {
  markPlayerMode();
  if (getToken()) startPlayerHeartbeat('foreground');
}

// ── 我的邀请 ──

export const fetchPlayerInvites = () =>
  request<PlayerInvite[]>({ url: '/user/player/invites' });

export const acceptInvite = (seatId: number) =>
  request<{ seat_id: number; accepted: boolean }>({
    url: `/user/player/invites/${seatId}/accept`,
    method: 'POST',
  });

export const rejectInvite = (seatId: number) =>
  request<{ seat_id: number; accepted: boolean }>({
    url: `/user/player/invites/${seatId}/reject`,
    method: 'POST',
  });

// ── 抢单大厅 ──

export const fetchGrabHall = () =>
  request<PlayerOrder[]>({ url: '/user/player/grab-hall' });

export const grabOrder = (orderId: number) =>
  request<PlayerOrder>({
    url: `/user/player/orders/${orderId}/grab`,
    method: 'POST',
  });

// ── 我的订单与服务作业 ──

export const fetchPlayerOrders = (bucket = '') =>
  request<PlayerOrder[]>({
    url: `/user/player/orders${bucket ? `?bucket=${encodeURIComponent(bucket)}` : ''}`,
  });

export const fetchPlayerServiceTimings = () =>
  request<PlayerServiceTiming[]>({ url: '/user/player/service-segments' });

export const pauseService = (orderId: number, reason: string) =>
  request<PlayerServiceTiming>({
    url: `/user/player/orders/${orderId}/service/pause`,
    method: 'POST',
    data: { reason },
  });

export const resumeService = (orderId: number) =>
  request<PlayerServiceTiming>({
    url: `/user/player/orders/${orderId}/service/resume`,
    method: 'POST',
    data: { reason: '' },
  });

export const startService = (orderId: number) =>
  request<PlayerOrder>({
    url: `/user/player/orders/${orderId}/service/start`,
    method: 'POST',
  });

export const finishService = (
  orderId: number,
  reportedUnits: number,
  reportedSeconds: number,
  evidenceAttachmentIds: number[] = []
) =>
  request<PlayerOrder>({
    url: `/user/player/orders/${orderId}/service/finish`,
    method: 'POST',
    data: {
      reported_units: reportedUnits,
      reported_seconds: reportedSeconds,
      evidence_attachment_ids: evidenceAttachmentIds,
    },
  });

// ── 加钟通知 ──

export const fetchPendingAddons = () =>
  request<Addon[]>({ url: '/user/player/addons' });

export const confirmAddon = (id: number) =>
  request<Addon>({
    url: `/user/player/addons/${id}/confirm`,
    method: 'POST',
  });

export const rejectAddon = (id: number, reason: string) =>
  request<Addon>({
    url: `/user/player/addons/${id}/reject`,
    method: 'POST',
    data: { reason },
  });

// ── 优先派单权通知 ──

export const fetchDispatchNotices = () =>
  request<PriorityNotice[]>({ url: '/user/player/dispatch-notices' });

export const declineDispatchNotice = (id: number, reason: string) =>
  request<PriorityNotice>({
    url: `/user/player/dispatch-notices/${id}/decline`,
    method: 'POST',
    data: { reason },
  });

// ── 猫粮钱包：分成明细与概览 ──

export const fetchCommissionEntries = (status = '') =>
  request<CommissionEntry[]>({
    url: `/user/player/commission${status ? `?status=${encodeURIComponent(status)}` : ''}`,
  });

export const fetchCommissionSummary = () =>
  request<CommissionSummary>({ url: '/user/player/commission/summary' });

// ── 提现 ──

export const applyWithdrawal = (input: WithdrawalInput) =>
  request<Withdrawal>({
    url: '/user/player/withdrawals',
    method: 'POST',
    data: {
      amount_cents: input.amount_cents,
      channel: input.channel,
      account_ref: input.account_ref,
      idempotency_key: input.idempotency_key,
    },
  });

export const fetchWithdrawals = (status = '') =>
  request<Withdrawal[]>({
    url: `/user/player/withdrawals${status ? `?status=${encodeURIComponent(status)}` : ''}`,
  });

export const fetchWithdrawalSummary = () =>
  request<WithdrawalSummary>({ url: '/user/player/withdrawals/summary' });

// ── 收款账户签约（云账户代发） ──

/** 陪玩收款账户：服务端只回传脱敏账号，不含签约号。 */
export interface PayoutAccount {
  account_type: string;
  account_name: string;
  account_no_masked: string;
  status: string;
  signed_at: string | null;
}

/** 签约托管地址与本地账户状态。 */
export interface PayoutSignURL {
  url: string;
  account_type: string;
  status: string;
}

export const fetchPayoutAccounts = () =>
  request<PayoutAccount[]>({ url: '/user/player/payout-account' });

export const fetchPayoutSignURL = (accountType: string) =>
  request<PayoutSignURL>({
    url: '/user/player/payout-account/sign-url',
    method: 'POST',
    data: { account_type: accountType },
  });

/** 解约：传 account_type 只解约该渠道，留空解约全部。 */
export const unbindPayoutAccount = (accountType = '') =>
  request<{ ok: boolean }>({
    url: '/user/player/payout-account/unbind',
    method: 'POST',
    data: { account_type: accountType },
  });

// ── 我的资料 / 等级 ──

export interface PlayerProfile {
  id: number;
  display_name: string;
  // 服务端 GET /user/player/profile 返回陪玩档案原始字段，不含手机号；
  // 自助修改接口（PUT）的返回会额外带上账号预留手机号与乐观锁版本号。
  phone?: string;
  qualification: string;
  presence: string;
  level: string;
  level_appraised_at: string | null;
  /** 分区 → 等级；接单等级以它为准，level 只是所有分区里的最高档展示值。 */
  game_levels: Record<string, string>;
  daily_limit: number;
  concurrent_limit: number;
  games: string[];
  version?: number;
  // 期望报价与审核留痕：GET /user/player/profile 返回档案实体，已含这些字段；
  // 老版本后端未下发时按「未提交」处理，故声明为可选。
  expected_price_cents?: number;
  /** none 未提交 / pending 待审核 / approved 已通过 / rejected 已驳回。 */
  expected_price_status?: string;
  expected_price_submitted_at?: string | null;
  expected_price_reviewed_at?: string | null;
  expected_price_review_note?: string;
}

export const fetchPlayerProfile = () =>
  request<PlayerProfile>({ url: '/user/player/profile' });

// ── 自助修改资料（陪玩端入驻流程） ──
// 仅昵称 / 预留手机号 / 擅长游戏可自助维护；资格、等级、在线状态、接单上限由考核与管理端控制。
// 手机号留空（不传字段）表示不修改；games 不传表示不修改，传空数组表示清空为「不限」。

export interface PlayerProfileInput {
  display_name: string;
  phone?: string;
  games?: string[];
  /** 乐观锁版本号，取自 GET profile 的 version；不传则按最后写入生效。 */
  version?: number;
}

export const updatePlayerProfile = (input: PlayerProfileInput) =>
  request<PlayerProfile>({
    url: '/user/player/profile',
    method: 'PUT',
    data: {
      display_name: input.display_name,
      ...(input.phone === undefined ? {} : { phone: input.phone }),
      ...(input.games === undefined ? {} : { games: input.games }),
      ...(input.version === undefined ? {} : { version: input.version }),
    },
  });

// ── 统一实名认证（客户 / 陪玩共用）──
// 服务端：GET/POST /user/realname（客户）与 /user/player/realname（陪玩）。
// 旧陪玩实名接口 /user/player/identity 仍保留为兼容别名（仅人工渠道），客户端已不再调用。
// 状态机：未提交（status 为空串）→ pending → verified / rejected / expired；
// 待审核与已通过不允许重复提交（409），驳回或失效后可重新提交；
// 证件号仅保存脱敏结果（前 6 后 4），接口不接收证件照片。

export type RealNameRole = 'customer' | 'player';

export interface RealNameChannelOption {
  code: string;
  name: string;
  /** 该渠道支持的核验方式：two_factor 双要素 / face 人脸 / manual 人工 */
  methods: string[];
}

export interface RealNameStatus {
  subject_type: string;
  subject_id: number;
  /** '' 未提交 / pending 待审 / verified 已通过 / rejected 已驳回 / expired 已失效 */
  status: string;
  real_name: string;
  id_number_masked: string;
  channel: string;
  method: string;
  fail_reason: string;
  verified_at: string | null;
  attempt_ref?: string;
  channels: RealNameChannelOption[];
}

export interface RealNameSubmitInput {
  real_name: string;
  id_number: string;
  channel: string;
  method: string;
}

export interface RealNameSubmitResult {
  id: number;
  status: string;
  channel: string;
  method: string;
  /** 异步核验轮询流水号 / 跳转地址 / 二维码内容（同步人工审核时为空） */
  attempt_ref?: string;
  redirect_url?: string;
  qr_content?: string;
  message?: string;
}

function realNameURL(role: RealNameRole): string {
  return role === 'player' ? '/user/player/realname' : '/user/realname';
}

export const fetchRealName = (role: RealNameRole) =>
  request<RealNameStatus>({ url: realNameURL(role) });

export const submitRealName = (role: RealNameRole, input: RealNameSubmitInput) =>
  request<RealNameSubmitResult>({
    url: realNameURL(role),
    method: 'POST',
    data: { ...input },
  });

// ── 转单 ──

export interface TransferRequest {
  id: number;
  order_id: number;
  seat_id: number;
  seat_index: number;
  reason: string;
  status: string;
  decision_note: string;
  created_at: string;
}

export const requestTransfer = (orderId: number, reason: string, idempotencyKey: string) =>
  request<TransferRequest>({
    url: `/user/player/orders/${orderId}/transfer`,
    method: 'POST',
    data: { reason, idempotency_key: idempotencyKey },
  });

export const fetchTransferRequests = (status = '') =>
  request<TransferRequest[]>({
    url: `/user/player/transfer-requests${status ? `?status=${encodeURIComponent(status)}` : ''}`,
  });

export const cancelTransfer = (id: number) =>
  request<TransferRequest>({
    url: `/user/player/transfer-requests/${id}/cancel`,
    method: 'POST',
  });

// ── 我的考核与申诉 ──
// 服务端 GET /user/player/assessments 返回的是**嵌套视图**（assessment.go → playerAssessmentView）：
// `{ assessment, scores, weight_total_bp, dimension_count }`。主表字段挂在 `assessment` 下，
// 逐维度得分（含打分时快照的权重）与权重合计是评级依据，必须一起读，不能按平铺字段读。

/** 考核主表（服务端 ent.EsportsAssessment）。 */
export interface PlayerAssessment {
  id: number;
  task_no: string;
  player_id: number;
  /** entry 入职 / upgrade 升级 / spot_check 抽查复核 / retry 复考。 */
  assessment_type: string;
  target_level: string;
  /** pending 待分配 / scheduled 已约考核 / passed 通过 / failed 未通过。 */
  status: string;
  /** none / pending 待复核 / approved 申诉成立 / rejected 维持原结论。 */
  appeal_status: string;
  source: string;
  examiner_admin_id: number | null;
  scheduled_at: string | null;
  contacted_at: string | null;
  scored_at: string | null;
  /** 按维度加权计算的总分（打分前为 0）。 */
  total_score: number;
  note: string;
  version: number;
  created_at: string;
  updated_at: string;
}

/** 逐维度得分（打分时快照权重，权重合计用于核对评级依据）。 */
export interface PlayerAssessmentScore {
  assessment_id: number;
  /** game_skill / teaching / attitude / communication / compliance / stability。 */
  dimension: string;
  /** 权重基点（10000 = 100%）。 */
  weight_bp: number;
  /** 维度分值 0~100。 */
  score: number;
  comment: string;
  created_at: string;
}

/** 陪玩端「我的考核」单条记录：主表 + 逐维度得分 + 权重合计。 */
export interface PlayerAssessmentView {
  assessment: PlayerAssessment;
  scores: PlayerAssessmentScore[];
  /** 各维度权重之和（基点），全部维度齐备时应为 10000。 */
  weight_total_bp: number;
  dimension_count: number;
}

export const fetchPlayerAssessments = () =>
  request<PlayerAssessmentView[]>({ url: '/user/player/assessments' });

/** 对考核结果发起申诉（每个考核任务仅一条申诉记录）。 */
export const appealAssessment = (id: number, reason: string) =>
  request<unknown>({
    url: `/user/player/assessments/${id}/appeal`,
    method: 'POST',
    data: { reason },
  });

/**
 * 自助申请升级考核：目标档位由服务端按当前等级推导，客户端不能指定。
 * 门槛（服务量 / 评分 / 在岗天数）与冷却期不满足时由服务端返回中文提示，重复申请幂等返回既有单。
 */
export const applyUpgradeAssessment = () =>
  request<PlayerAssessment>({
    url: '/user/player/assessments/upgrade-apply',
    method: 'POST',
  });

// ── 我的追偿明细 ──

export interface PlayerRecovery {
  id: number;
  recovery_no: string;
  order_id: number;
  after_sale_id: number;
  amount_cents: number;
  reason: string;
  status: string;
  reject_reason: string;
  recovered_at: string | null;
  created_at: string;
}

export const fetchPlayerRecoveries = () =>
  request<PlayerRecovery[]>({ url: '/user/player/recoveries' });

// ── 陪玩售后申诉 ──
// 服务端：POST/GET /user/player/order-after-sales（player_handlers.go），
// 仅本人服务的订单可发起；金额口径由客服在售后方案中确定，陪玩不能指定退款金额。

export interface PlayerAfterSale {
  id: number;
  after_sale_no: string;
  source_type: string;
  source_id: number;
  kind: string;
  channel: string;
  demand: string;
  expected_plan: string;
  evidence_ref: string;
  contact: string;
  status: string;
  fault_party: string;
  plan_action: string;
  refund_cents: number;
  makeup_kind: string;
  makeup_player_id: number | null;
  makeup_seat_index: number | null;
  makeup_units: number;
  makeup_company_pay_cents: number;
  customer_id: number | null;
  player_id: number | null;
  customer_confirmed_at: string | null;
  customer_confirm_channel: string;
  customer_declined_at: string | null;
  customer_decline_reason: string;
  recovery_player_id: number | null;
  recovery_cents: number;
  accepted_at: string | null;
  planned_at: string | null;
  approved_at: string | null;
  resolution: string;
  version: number;
  resolved_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface PlayerAfterSaleInput {
  order_id: number;
  kind: string;
  demand: string;
  expected_plan?: string;
  evidence_ref?: string;
  contact?: string;
}

export const fetchPlayerAfterSales = () =>
  request<PlayerAfterSale[]>({ url: '/user/player/order-after-sales' });

export const createPlayerAfterSale = (input: PlayerAfterSaleInput) =>
  request<PlayerAfterSale>({
    url: '/user/player/order-after-sales',
    method: 'POST',
    data: {
      order_id: input.order_id,
      kind: input.kind,
      demand: input.demand,
      expected_plan: input.expected_plan || '',
      evidence_ref: input.evidence_ref || '',
      contact: input.contact || '',
    },
  });

// ── 固排 ──

export interface Teammate {
  id: number;
  teammate_player_id: number;
  teammate_name: string;
  teammate_level: string;
  teammate_presence: string;
  game: string;
  status: string;
  created_at: string;
}

export interface PlayerCandidate {
  id: number;
  display_name: string;
  qualification: string;
  presence: string;
  level: string;
}

export const fetchTeammates = () =>
  request<Teammate[]>({ url: '/user/player/teammates' });

export const fetchTeammateRequests = () =>
  request<Teammate[]>({ url: '/user/player/teammate-requests' });

export const requestTeammate = (
  teammatePlayerId: number,
  game: string,
  idempotencyKey: string
) =>
  request<Teammate>({
    url: '/user/player/teammates',
    method: 'POST',
    data: { teammate_player_id: teammatePlayerId, game, idempotency_key: idempotencyKey },
  });

export const acceptTeammateRequest = (id: number) =>
  request<Teammate>({
    url: `/user/player/teammate-requests/${id}/accept`,
    method: 'POST',
  });

export const declineTeammateRequest = (id: number) =>
  request<Teammate>({
    url: `/user/player/teammate-requests/${id}/decline`,
    method: 'POST',
  });

export const dissolveTeammate = (id: number) =>
  request<Teammate>({
    url: `/user/player/teammates/${id}/dissolve`,
    method: 'POST',
  });

export const searchPlayerCandidates = (keyword: string) =>
  request<PlayerCandidate[]>({
    url: `/user/player/players?keyword=${encodeURIComponent(keyword)}`,
  });

// ── 站内消息（通知闭环）：陪玩侧读取与标记已读 ──
// 与客户侧返回结构一致（EsportsMessage），鉴权同样走 esports_token。

export const fetchPlayerMessages = (params: MessageListParams = {}) =>
  request<EsportsMessage[]>({
    url: `/user/player/messages${messageQueryString(params)}`,
  });

export const markPlayerMessagesRead = (ids: number[]) =>
  request<{ updated: number }>({
    url: '/user/player/messages/read',
    method: 'POST',
    data: { ids },
  });

// ── 期望报价 ──
// 服务端 POST /user/player/expected-price 只接收 expected_price_cents（分），返回陪玩自助资料视图
// （playerSelfProfileView，含审核状态）。同一时间只允许一条待审核报价，重复提交返回冲突。

export const submitExpectedPrice = (expectedPriceCents: number) =>
  request<PlayerProfile>({
    url: '/user/player/expected-price',
    method: 'POST',
    data: { expected_price_cents: expectedPriceCents },
  });

// ── 我的优先派单权状态 ──

export interface PlayerPriorityHolding {
  game: string;
  /** daily / weekly / biweekly / monthly。 */
  period: string;
  period_start: string;
  period_end: string;
  rank: number;
  /** ranking / points / threshold / rotation / manual。 */
  source: string;
  /** active / pending（pending 为下一期名单，尚未生效）。 */
  status: string;
  /** 是否当前生效（status=active 且已进入有效期）。 */
  active: boolean;
  note: string;
  /** 该游戏该期的名额口径：已占用含 pending 与 active 条目。 */
  quota: number;
  used: number;
  remaining: number;
}

export interface PlayerPriorityGameQuota {
  game: string;
  quota: number;
  used: number;
  remaining: number;
}

export interface PlayerPriorityStatus {
  player_id: number;
  /** 当前是否有生效中的优先派单权（下一期 pending 不算持有）。 */
  holding: boolean;
  holdings: PlayerPriorityHolding[];
  games: PlayerPriorityGameQuota[];
}

export const fetchPlayerPriorityStatus = () =>
  request<PlayerPriorityStatus>({ url: '/user/player/priority-status' });

// ── 收礼记录与本人榜单排名 ──

export interface PlayerGiftRecord {
  gift_no: string;
  gift_name: string;
  sender_name: string;
  sender_id: number;
  amount_cents: number;
  income_cents: number;
  quantity: number;
  status: string;
  created_at: string;
}

export interface PlayerGiftRecordView {
  player_id: number;
  player_name: string;
  /** daily / weekly / monthly。 */
  period: string;
  total_cents: number;
  total_count: number;
  /** 本人在收礼榜上的名次，0 表示未上榜。 */
  rank: number;
  board_size: number;
  rank_in_board: boolean;
  records: PlayerGiftRecord[];
}

export const fetchPlayerGiftRecords = (period = 'daily') =>
  request<PlayerGiftRecordView>({
    url: `/user/player/gift-records?period=${encodeURIComponent(period)}`,
  });

// ── 我的信用记载 ──
// 售后责任方判定为陪玩后由系统自动只增记载；复核结论决定是否暂停接单（penalty_applied）。

export interface PlayerCreditEvent {
  event_no: string;
  player_id: number;
  order_id: number;
  after_sale_id: number;
  recovery_id: number;
  /** fault_admitted 责任成立 / recovery_executed 已追偿 / manual 人工补录。 */
  kind: string;
  amount_cents: number;
  note: string;
  /** recorded 已记载 / penalty_applied 已暂停接单 / cleared 判定不构成责任。 */
  status: string;
  reviewed_at: string | null;
  review_note: string;
  version: number;
  created_at: string;
  updated_at: string;
}

export const fetchPlayerCreditEvents = (status = '') =>
  request<PlayerCreditEvent[]>({
    url: `/user/player/credit-events${status ? `?status=${encodeURIComponent(status)}` : ''}`,
  });

// ── 订单固排候选与邀请 ──
// 仅本人在该订单持有 accepted 席位时可读候选 / 发邀请；候选须为本人固排、资质合格、在线、分区达标。

export interface TeammateDispatchCandidate {
  player_id: number;
  display_name: string;
  level: string;
  qualification: string;
  presence: string;
}

export const fetchTeammateCandidates = (orderId: number) =>
  request<TeammateDispatchCandidate[]>({
    url: `/user/player/orders/${orderId}/teammate-candidates`,
  });

/** 邀请固排占剩余空席位；返回订单全部席位（服务端以席位数组回包）。 */
export const inviteTeammates = (orderId: number, teammatePlayerIds: number[]) =>
  request<unknown>({
    url: `/user/player/orders/${orderId}/team-invites`,
    method: 'POST',
    data: { teammate_player_ids: teammatePlayerIds },
  });

// ── 改期提案 ──
// 已付款订单改期一律走「客服提案 → 客户 + 每名已接单成员各自确认」；拒绝即终结提案，订单不变。
// 陪玩侧读取走 `GET /user/player/reschedule-proposals`：范围限定为本人持已接单 / 待回应席位的订单，
// 待确认优先、其后是历史；返回结构与客户侧同构（api/esports.ts 的 MyRescheduleProposal）。

/** 陪玩可见的改期提案（含确认进度与本人表态）。 */
export const fetchPlayerRescheduleProposals = () =>
  request<MyRescheduleProposal[]>({ url: '/user/player/reschedule-proposals' });

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

export const confirmPlayerRescheduleProposal = (
  proposalId: number,
  accept: boolean,
  note = ''
) =>
  request<RescheduleProposalDecision>({
    url: `/user/player/reschedule-proposals/${proposalId}/confirm`,
    method: 'POST',
    data: { accept, note },
  });
