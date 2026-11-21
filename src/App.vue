<script setup lang="ts">
  import { syncTabBadge } from '@esports/shared/utils/badge';
  import { onLaunch, onShow } from '@dcloudio/uni-app';
  import { watch } from 'vue';
  import { loadSkillLevels } from './utils/levels';
  import { getAdminToken } from './api/cs';
  import { ensureRealtime, realtimeUnread } from './api/realtime';

  /** tabBar「工作台」索引：未读消息红点跟随实时通道下发的未读数。 */
  const WORKBENCH_TAB_INDEX = 0;

  const syncUnreadBadge = (value: number) =>
    syncTabBadge(WORKBENCH_TAB_INDEX, value);

  watch(realtimeUnread, syncUnreadBadge, { immediate: true });

  onLaunch(() => {
    // 技能等级文案/序数走后端配置，失败时页面按编码原样回显。
    void loadSkillLevels();
    // 客服端只认 admin 登录态：缺失时冷启动直接落到客服登录页。
    if (!getAdminToken()) {
      uni.reLaunch({ url: '/pages/cs/login' });
    }
  });

  // 回前台立即恢复实时通道（新单 / 异常提醒靠它；ensureRealtime 幂等且不等退避）。
  onShow(() => {
    ensureRealtime();
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
