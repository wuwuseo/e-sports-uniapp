// 聚合收款前端辅助：扫码入口链接、二维码渲染、支付地址跳转与倒计时文案。
// 收银台页与公开扫码页共用，避免两处逻辑漂移。

import { renderSVG } from 'uqr';
import type { CheckoutStatus } from '../api/esports';
import { API_BASE } from '../api/request';

/** H5 站点 origin：优先当前页面；非 H5 / SSR 回落接口基址的 origin。 */
export function h5Origin(): string {
  const location = (globalThis as { location?: { origin?: string } }).location;
  if (location?.origin) return location.origin;
  return API_BASE.replace(/\/+$/, '').replace(/\/api\/v1\/esports$/, '');
}

/** 本站公开扫码页地址（H5 哈希路由），作为通用入口码内容。 */
export function checkoutScanUrl(token: string): string {
  const origin = h5Origin();
  const hash = `#/pages/pay/scan?token=${encodeURIComponent(token)}`;
  return origin ? `${origin}${hash}` : hash;
}

/**
 * 渲染二维码为可直接给 `<image>` 的 data URL。
 * 用纯 ESM、零依赖的 uqr 输出 SVG：之前的 qrcode 是 CJS，在 pnpm 软链结构下
 * dev 需要额外预构建、build 还会把 dijkstrajs 打成裸导入（产物运行时 404）。
 * 内容过长或环境异常时返回空串，由页面回落到文本 + 复制按钮。
 */
export async function renderQrDataUrl(text: string): Promise<string> {
  if (!text) return '';
  try {
    const svg = renderSVG(text, {
      ecc: 'M',
      border: 2,
      // 每模块 8px：常见 URL 尺寸下约 300px，页面再按 CSS 宽度缩放。
      pixelSize: 8,
      whiteColor: '#ffffff',
      blackColor: '#000000',
    });
    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  } catch {
    return '';
  }
}

/** 打开后端下发的支付地址：只接受 http(s)，统一走 webview 容器。 */
export function openPayUrl(payUrl: string): boolean {
  const url = (payUrl || '').trim();
  if (!/^https?:\/\//i.test(url)) return false;
  uni.navigateTo({ url: `/pages/webview/index?url=${encodeURIComponent(url)}` });
  return true;
}

/** 复制文本（H5 / App / 小程序统一走 uni.setClipboardData）。 */
export function copyText(text: string, tip = '已复制') {
  const value = (text || '').trim();
  if (!value) return;
  uni.setClipboardData({
    data: value,
    success: () => uni.showToast({ title: tip, icon: 'none' }),
  });
}

/** 支付时限倒计时文案；now 为毫秒时间戳，由页面每秒刷新。 */
export function remainingText(
  expiresAt: string | null | undefined,
  now: number
): string {
  if (!expiresAt) return '—';
  const deadline = new Date(expiresAt).getTime();
  if (!Number.isFinite(deadline)) return '—';
  const diff = deadline - now;
  if (diff <= 0) return '已到期';
  const total = Math.floor(diff / 1000);
  const days = Math.floor(total / 86400);
  const hours = Math.floor((total % 86400) / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  if (days > 0) return `${days} 天 ${hours} 小时`;
  if (hours > 0) return `${hours} 时 ${String(minutes).padStart(2, '0')} 分`;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

/** 支付时限是否已过（无时限视为未过期）。 */
export function isExpired(
  expiresAt: string | null | undefined,
  now: number
): boolean {
  if (!expiresAt) return false;
  const deadline = new Date(expiresAt).getTime();
  return Number.isFinite(deadline) && deadline <= now;
}

/** 业务类型文案。 */
export const checkoutBusinessText = (type: string) =>
  (
    {
      order: '订单',
      recharge: '充值',
      gift: '礼物',
    } as Record<string, string>
  )[type] || type;

/** 收银台状态文案。 */
export const checkoutStatusText = (status: CheckoutStatus | string) =>
  (
    {
      open: '待支付',
      paid: '已支付',
      expired: '已超时',
      cancelled: '已取消',
    } as Record<string, string>
  )[status] || status;

/** 在线渠道文案。 */
export const payChannelText = (channel: string) =>
  (
    {
      wechat: '微信支付',
      alipay: '支付宝',
    } as Record<string, string>
  )[channel] || channel;
