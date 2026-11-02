// 实时通知通道（三端共用）：先取一次性 ticket，再用 uni.connectSocket 建立单条连接。
// WS 只送信封（ready / message.created / hall.order_created），正文仍走各端消息列表补拉。
// 三端各自在登录成功与 App.onShow 时调用 ensureRealtime()，登出时调用 closeRealtime()。

import { ref } from 'vue';
import { API_BASE, getToken, requestURL } from './request';

export interface RealtimeFrame {
  type: string;
  data?: Record<string, unknown>;
}

interface RealtimeConfig {
  ticketPath: string;
  getToken: () => string;
  /** ticket 返回 401 时的清理动作（客服端清 admin token 并回登录页）。 */
  onUnauthorized?: () => void;
}

// 默认走通用用户端（客户 / 陪玩）的 ticket 端点；客服端在 main.ts 里改配置。
const runtime: RealtimeConfig = {
  ticketPath: '/api/v1/auth/realtime/ticket',
  getToken,
};

export function configureRealtime(config: Partial<RealtimeConfig>): void {
  if (config.ticketPath) runtime.ticketPath = config.ticketPath;
  if (config.getToken) runtime.getToken = config.getToken;
  if (config.onUnauthorized) runtime.onUnauthorized = config.onUnauthorized;
}

// 未读数由服务端随 ready / message.created 下发；标记已读后由页面调用 updateRealtimeUnread 校正。
export const realtimeUnread = ref(0);

export function updateRealtimeUnread(value: number): void {
  const next = Number.isFinite(value) ? Math.round(value) : 0;
  realtimeUnread.value = Math.max(0, next);
}

// 弹条白名单：命中才弹条，其余只更新红点；新增业务通知类型时在此加一行文案即可。
export const REALTIME_TOAST_TITLES: Record<string, string> = {
  'order.priority_notice': '收到新的优先通知',
  'order.seat_invited': '收到派单邀请',
  'order.grab_attempt_lost': '订单已被他人抢先',
};

type RealtimeHandler = (data: Record<string, unknown>) => void;

const handlers = new Map<string, Set<RealtimeHandler>>();
const reconnectHandlers = new Set<() => void>();

/** 订阅某类事件（如 message.created / hall.order_created），返回取消函数。 */
export function onRealtime(type: string, fn: RealtimeHandler): () => void {
  const set = handlers.get(type) || new Set<RealtimeHandler>();
  set.add(fn);
  handlers.set(type, set);
  return () => {
    const current = handlers.get(type);
    if (!current) return;
    current.delete(fn);
    if (current.size === 0) handlers.delete(type);
  };
}

/** 断线恢复（重连成功）后触发，用于活跃页补拉。首次连接不触发。 */
export function onRealtimeReconnect(fn: () => void): () => void {
  reconnectHandlers.add(fn);
  return () => {
    reconnectHandlers.delete(fn);
  };
}

// ── 连接与重试 ──

const RETRY_MAX_FAILURES = 10;
const RETRY_COOLDOWN_MS = 60 * 1000;
const PING_INTERVAL_MS = 25 * 1000;

let socket: UniApp.SocketTask | null = null;
let socketState: 'idle' | 'connecting' | 'open' = 'idle';
let retryTimer: ReturnType<typeof setTimeout> | null = null;
let pingTimer: ReturnType<typeof setInterval> | null = null;
let failures = 0;
let manualClose = false;
let connectedOnce = false;

/** ticket 鉴权失败（401）：清登录态后停止重试，避免死循环。 */
class RealtimeAuthError extends Error {}

function clearRetry(): void {
  if (retryTimer) {
    clearTimeout(retryTimer);
    retryTimer = null;
  }
}

function clearPing(): void {
  if (pingTimer) {
    clearInterval(pingTimer);
    pingTimer = null;
  }
}

/** 拼接 WS 地址：H5 用当前 host（dev 走 vite 代理），App / 小程序可用 VITE_WS_BASE 指定绝对地址。 */
function websocketURL(ticket: string): string {
  const path = `/api/v1/realtime?ticket=${encodeURIComponent(ticket)}`;
  const override = (import.meta.env.VITE_WS_BASE || '').trim();
  const origin =
    override || API_BASE.replace(/\/+$/, '').replace(/\/api\/v1\/esports$/, '');
  if (origin.startsWith('http')) {
    return origin.replace(/^http/, 'ws') + path;
  }
  const location = (globalThis as { location?: { protocol?: string; host?: string } })
    .location;
  if (location?.host) {
    return `${location.protocol === 'https:' ? 'wss:' : 'ws:'}//${location.host}${path}`;
  }
  // 无 location 且基址为相对路径（App / 小程序未配置 VITE_WS_BASE）。
  return path;
}

function issueTicket(): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const token = runtime.getToken();
    if (!token) {
      reject(new RealtimeAuthError('未登录'));
      return;
    }
    uni.request({
      url: requestURL(runtime.ticketPath),
      method: 'POST',
      header: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      success: (res) => {
        if (res.statusCode === 401) {
          runtime.onUnauthorized?.();
          reject(new RealtimeAuthError('登录已过期'));
          return;
        }
        const body = res.data as
          | { code?: number; message?: string; data?: { ticket?: string } }
          | undefined;
        const ticket = body?.data?.ticket;
        if (res.statusCode < 200 || res.statusCode >= 300 || body?.code !== 1 || !ticket) {
          reject(
            new Error(body?.message || `实时通知凭证获取失败（${res.statusCode}）`)
          );
          return;
        }
        resolve(ticket);
      },
      fail: (err) => reject(new Error(err.errMsg || '实时通知凭证获取失败')),
    });
  });
}

function handleFrame(raw: unknown): void {
  if (typeof raw !== 'string' || !raw) return;
  let frame: RealtimeFrame;
  try {
    frame = JSON.parse(raw) as RealtimeFrame;
  } catch {
    return;
  }
  if (!frame || typeof frame.type !== 'string') return;
  const data = (frame.data || {}) as Record<string, unknown>;

  if (frame.type === 'ready') {
    updateRealtimeUnread(Number(data.unread ?? 0));
  }
  if (frame.type === 'message.created') {
    if (typeof data.unread === 'number') updateRealtimeUnread(data.unread);
    const category = typeof data.category === 'string' ? data.category : '';
    const title = REALTIME_TOAST_TITLES[category];
    if (title) uni.showToast({ title, icon: 'none', duration: 3000 });
  }
  handlers.get(frame.type)?.forEach((fn) => fn(data));
}

function teardownSocket(): void {
  clearPing();
  socket = null;
  socketState = 'idle';
}

function scheduleRetry(): void {
  if (manualClose || retryTimer || !runtime.getToken()) return;
  if (failures >= RETRY_MAX_FAILURES) {
    // 连续失败 10 次：进入 60s 冷却，之后重新按指数退避。
    failures = 0;
    retryTimer = setTimeout(() => {
      retryTimer = null;
      void connectFlow();
    }, RETRY_COOLDOWN_MS);
    return;
  }
  const base = Math.min(30, 2 ** failures); // 1、2、4、8、16、30 秒封顶
  failures += 1;
  const delay = base * 1000 * (0.8 + Math.random() * 0.4); // ±20% 抖动，避免同时重连
  retryTimer = setTimeout(() => {
    retryTimer = null;
    void connectFlow();
  }, delay);
}

function openSocket(ticket: string): void {
  const task = uni.connectSocket({ url: websocketURL(ticket), complete: () => {} });
  socket = task;
  task.onOpen(() => {
    socketState = 'open';
    failures = 0;
    clearPing();
    pingTimer = setInterval(() => {
      task.send({ data: JSON.stringify({ type: 'ping' }), fail: () => {} });
    }, PING_INTERVAL_MS);
    // 断线恢复：首次连接不通知，避免页面重复拉取。
    if (connectedOnce) reconnectHandlers.forEach((fn) => fn());
    connectedOnce = true;
  });
  task.onMessage((res) => handleFrame(res.data));
  task.onClose(() => {
    teardownSocket();
    scheduleRetry();
  });
  task.onError(() => {
    teardownSocket();
    scheduleRetry();
  });
}

async function connectFlow(): Promise<void> {
  if (manualClose || !runtime.getToken() || socketState !== 'idle') return;
  socketState = 'connecting';
  let ticket = '';
  try {
    ticket = await issueTicket();
  } catch (err) {
    socketState = 'idle';
    if (err instanceof RealtimeAuthError) {
      manualClose = true;
      return;
    }
    scheduleRetry();
    return;
  }
  if (manualClose) {
    socketState = 'idle';
    return;
  }
  openSocket(ticket);
}

/** 登录后 / 回前台调用，幂等；连接已建立或建立中时不重复建连。 */
export function ensureRealtime(): void {
  manualClose = false;
  if (!runtime.getToken()) return;
  if (socketState !== 'idle') return;
  // 回前台 / 重新登录立即重连，不等退避。
  clearRetry();
  failures = 0;
  void connectFlow();
}

/** 登出时调用：断开连接并重置未读数。 */
export function closeRealtime(): void {
  manualClose = true;
  clearRetry();
  clearPing();
  const task = socket;
  socket = null;
  socketState = 'idle';
  failures = 0;
  connectedOnce = false;
  updateRealtimeUnread(0);
  task?.close({ fail: () => {} });
}
