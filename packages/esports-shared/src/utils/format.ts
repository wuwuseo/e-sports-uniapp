// 展示层格式化与枚举文案：与服务端枚举值一一对应，新增枚举时在此补文案。
import Big from 'big.js';

/** 元转分：big.js 十进制高精度，规避 8.475 * 100 = 847.4999… 这类浮点误差。 */
export const yuanToCents = (value: number | string): number =>
  Number(new Big(value).times(100).round(0, Big.roundHalfUp).toString());

/** 金额按份数均摊（分）：高精度除法后四舍五入到分。 */
export const divideCents = (cents: number, divisor: number): number =>
  Number(new Big(cents).div(divisor).round(0, Big.roundHalfUp).toString());

export const money = (cents: number | null | undefined) =>
  `¥${(((cents ?? 0) as number) / 100).toFixed(2)}`;

export const datetime = (value?: string | null) =>
  value ? String(value).replace('T', ' ').slice(0, 16) : '—';

export const fulfillmentText = (status: string) =>
  (
    ({
      pending_payment: '待付款',
      pending_dispatch: '待派单',
      pending_acceptance: '待接单',
      grabbing: '抢单中',
      pending_customer_confirm: '待你确认陪玩',
      accepted: '已接单',
      in_service: '服务中',
      pending_close: '待结单',
      pending_close_review: '待复核',
      completed: '已完成',
      cancelled: '已取消',
    }) as Record<string, string>
  )[status] || status;

export const afterSaleStatusText = (status: string) =>
  (
    ({
      pending_accept: '待受理',
      processing: '处理中',
      pending_customer_confirm: '待你确认方案',
      pending_approval: '待审批',
      pending_execution: '待执行',
      execution_failed: '执行失败',
      completed: '已完成',
      rejected: '已驳回',
      withdrawn: '已撤回',
    }) as Record<string, string>
  )[status] || status;

export const afterSaleKindText = (kind: string) =>
  (
    ({
      service_mismatch: '服务不符',
      duration_short: '时长 / 局数不足',
      no_show: '放鸽子 / 未服务',
      wrong_item: '货不对板',
      overcharge: '多收 / 错收',
      player_appeal: '陪玩申诉',
      refund_request: '退款申请',
      other: '其他',
    }) as Record<string, string>
  )[kind] || kind;

/** 售后类型下拉选项（与 afterSaleKindText 的枚举一一对应）。 */
export const afterSaleKinds: Array<{ label: string; value: string }> = [
  { label: '服务不符', value: 'service_mismatch' },
  { label: '时长 / 局数不足', value: 'duration_short' },
  { label: '放鸽子 / 未服务', value: 'no_show' },
  { label: '货不对板', value: 'wrong_item' },
  { label: '多收 / 错收', value: 'overcharge' },
  { label: '陪玩申诉', value: 'player_appeal' },
  { label: '退款申请', value: 'refund_request' },
  { label: '其他', value: 'other' },
];

/** 售后来源类型选项。 */
export const afterSaleSourceTypes: Array<{
  label: string;
  value: 'order' | 'gift' | 'recharge';
}> = [
  { label: '订单', value: 'order' },
  { label: '礼物', value: 'gift' },
  { label: '充值', value: 'recharge' },
];

export const planActionText = (action: string) =>
  (
    ({
      none: '无需执行',
      refund_original: '退原核销款',
      compensate: '发放补偿权益',
      makeup_service: '补钟 / 换人履约',
    }) as Record<string, string>
  )[action] || action;

/** 生成 8–128 位的幂等键（服务端要求）。 */
export const idempotencyKey = (prefix: string) =>
  `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`.slice(0, 96);
