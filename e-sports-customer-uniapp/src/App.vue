<script setup lang="ts">
  import { onLaunch } from '@dcloudio/uni-app';
  import { getToken } from './api/request';
  import { loadSkillLevels } from './utils/levels';

  /** 冷启动读取预览码：H5 hash 路由为 #/?preview=...，其它端走 launch query。 */
  function launchPreviewCode(options?: {
    query?: Record<string, string>;
  }): string {
    const fromQuery = options?.query?.preview;
    if (typeof fromQuery === 'string' && fromQuery.trim()) {
      return fromQuery.trim();
    }
    const hash =
      (globalThis as { location?: { hash?: string } }).location?.hash || '';
    const match = /[?&]preview=([^&]+)/.exec(hash);
    if (!match) return '';
    try {
      return decodeURIComponent(match[1]);
    } catch {
      return match[1];
    }
  }

  /**
   * 冷启动放行公开扫码页：扫码付款人可能没有账号，不能落到登录页。
   * 兼容三种入口：路径直达 pages/pay/scan、hash 中的 token=、根路径 ?pay=<token>。
   */
  function launchPublicPay(options?: {
    path?: string;
    query?: Record<string, string>;
  }): boolean {
    const path = options?.path || '';
    if (path.includes('pages/pay/scan')) return true;
    const query = options?.query || {};
    if (typeof query.token === 'string' && query.token.trim()) return true;
    if (typeof query.pay === 'string' && query.pay.trim()) return true;
    const hash =
      (globalThis as { location?: { hash?: string } }).location?.hash || '';
    return hash.includes('pages/pay/scan') || /[?&](?:token|pay)=/.test(hash);
  }

  onLaunch((options?: { path?: string; query?: Record<string, string> }) => {
    // 技能等级文案/序数走后端配置，失败时页面按编码原样回显。
    void loadSkillLevels();
    // 客户接口需 user token：没有 token 且不是预览码 / 公开扫码支付时落到登录页。
    if (!getToken() && !launchPreviewCode(options) && !launchPublicPay(options)) {
      uni.reLaunch({ url: '/pages/login/index' });
    }
  });
</script>

<style lang="scss">
  // 全局通用卡片 / 文本样式，供各页面复用。
  .card {
    margin: 24rpx;
    padding: 24rpx;
    background: #fff;
    border-radius: $radius;
  }

  .row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 16rpx 0;
  }

  .muted {
    color: $text-3;
    font-size: 24rpx;
  }

  .empty {
    padding: 80rpx 0;
    text-align: center;
    color: $text-3;
  }
</style>
