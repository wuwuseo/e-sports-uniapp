<script setup lang="ts">
  import { onLaunch, onShow, onHide } from '@dcloudio/uni-app';
  import { watch } from 'vue';
  import { getToken } from './api/request';
  import { ensureRealtime, realtimeUnread } from './api/realtime';
  import { loadSkillLevels } from './utils/levels';
  import {
    enterPlayerMode,
    isPlayerMode,
    startPlayerHeartbeat,
    stopAllPlayerHeartbeat,
  } from './api/player';

  /** tabBar「我的」索引：未读消息红点跟随实时通道下发的未读数。 */
  const MINE_TAB_INDEX = 2;

  function syncUnreadBadge(value: number) {
    if (value > 0) {
      uni.setTabBarBadge({
        index: MINE_TAB_INDEX,
        text: value > 99 ? '99+' : `${value}`,
        fail: () => {},
      });
      return;
    }
    uni.removeTabBarBadge({ index: MINE_TAB_INDEX, fail: () => {} });
  }

  watch(realtimeUnread, syncUnreadBadge, { immediate: true });

  /** 应用前台心跳持有者标识（页面级 page 持有者另算）。 */
  const FOREGROUND: 'foreground' = 'foreground';

  /** 取当前页面路由（冷启动时可能为空，此时只依赖本地陪玩标记）。 */
  function currentRoute(): string {
    const pages = getCurrentPages();
    const page = pages[pages.length - 1] as unknown as { route?: string } | undefined;
    return page?.route || '';
  }

  onLaunch(() => {
    // 技能等级文案/序数走后端配置，失败时页面按编码原样回显。
    void loadSkillLevels();
    // 陪玩端只认 user token，没有则回本端登录页。
    if (!getToken()) {
      uni.reLaunch({ url: '/pages/login/index' });
    }
  });

  /** 应用是否处于前台：防止冷启动延时判定在快速切后台后又把心跳拉起。 */
  let inForeground = false;

  // 前台生命周期：回到前台时恢复陪玩心跳（页面间切换不会触发 onShow/onHide）。
  onShow(() => {
    inForeground = true;
    // 回前台立即恢复实时通道（陪玩端的优先通知 / 大厅新单都靠它；不等退避）。
    ensureRealtime();
    // 停在陪玩页则补记身份；否则仅在已确认陪玩身份时恢复心跳。
    function syncForegroundHeartbeat() {
      if (!inForeground) return;
      if (currentRoute().startsWith('pages/player/')) {
        enterPlayerMode();
        return;
      }
      if (isPlayerMode()) startPlayerHeartbeat(FOREGROUND);
    }
    syncForegroundHeartbeat();
    // 冷启动时页面栈可能尚未就绪（getCurrentPages 为空），补一次判定；
    // startPlayerHeartbeat 幂等，重复调用不会创建第二个定时器。
    setTimeout(syncForegroundHeartbeat, 300);
  });

  // 后台/退出：必须清空所有持有者。陪玩首页会以 page 持有者长期登记，
  // 只释放 foreground 会让定时器在后台继续跑。
  onHide(() => {
    inForeground = false;
    stopAllPlayerHeartbeat();
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
