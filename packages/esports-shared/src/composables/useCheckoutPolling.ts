// 收银台轮询共用逻辑：每秒刷新倒计时、3 秒轮询支付状态、支付成功后回调页面。
// 收银台页（cashier）与公开扫码页（scan）共用同一份时序，差异通过 options 注入。

import { computed, ref } from 'vue';
import { fetchCheckoutStatus } from '../api/esports';
import type { CheckoutStatus } from '../api/esports';
import { isExpired, remainingText } from '../utils/pay';

/** 轮询间隔：兼顾用户等待体感与接口压力。 */
export const CHECKOUT_POLL_INTERVAL = 3000;
/** 倒计时刷新间隔：只影响剩余时间的秒级跳动。 */
const TICK_INTERVAL = 1000;

export interface CheckoutPollingOptions {
  /** 收银台入口 token / 扫码页 token，命名差异在这里抹平。 */
  getToken: () => string;
  /** 业务付款时限（收银台有多级兜底），用于 remaining / expired。 */
  getExpiresAt: () => string | undefined;
  /** 是否已支付：已支付后不再轮询，也不再补查。 */
  isPaid: () => boolean;
  /** 支付成功回调（notify=true 表示由轮询发现，需要提示用户）。 */
  onPaid?: (notify: boolean) => void;
  /** 轮询到新状态后同步页面视图；非 open 状态由本模块负责停轮询。 */
  onStatus?: (status: CheckoutStatus) => void;
  /** 每次轮询成功后的附加刷新（收银台据此刷新人工凭证进度）。 */
  onPoll?: () => void;
  /** start() 的额外前置条件，默认只要求未支付。 */
  canPoll?: () => boolean;
}

export function useCheckoutPolling(options: CheckoutPollingOptions) {
  const now = ref(Date.now());
  const remaining = computed(() => remainingText(options.getExpiresAt(), now.value));
  const expired = computed(() => isExpired(options.getExpiresAt(), now.value));

  let pollTimer: ReturnType<typeof setInterval> | null = null;
  let tickTimer: ReturnType<typeof setInterval> | null = null;

  function startTick() {
    stopTick();
    tickTimer = setInterval(() => {
      now.value = Date.now();
    }, TICK_INTERVAL);
  }

  function stopTick() {
    if (tickTimer) {
      clearInterval(tickTimer);
      tickTimer = null;
    }
  }

  function stop() {
    if (pollTimer) {
      clearInterval(pollTimer);
      pollTimer = null;
    }
  }

  function start() {
    stop();
    if (!options.getToken() || options.isPaid()) return;
    if (options.canPoll && !options.canPoll()) return;
    pollTimer = setInterval(() => {
      void check();
    }, CHECKOUT_POLL_INTERVAL);
  }

  /** 立即补查一次（从服务商收银台 webview 返回 / 用户手动刷新）。 */
  async function check() {
    const token = options.getToken();
    if (!token || options.isPaid()) return;
    try {
      const view = await fetchCheckoutStatus(token);
      if (view.paid) {
        options.onPaid?.(true);
        return;
      }
      if (view.status) {
        options.onStatus?.(view.status);
        if (view.status !== 'open') stop();
      }
      options.onPoll?.();
    } catch {
      // 网络抖动静默重试，等待中的用户不需要 toast。
    }
  }

  /** 页面 onShow：恢复秒表 + 立即补查 + 恢复轮询。 */
  function resume() {
    startTick();
    void check();
    start();
  }

  /** 页面 onHide / onUnload：清理秒表与轮询。 */
  function pause() {
    stopTick();
    stop();
  }

  return {
    now,
    remaining,
    expired,
    start,
    stop,
    check,
    startTick,
    resume,
    pause,
  };
}
