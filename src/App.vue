<script setup lang="ts">
  import { onLaunch } from '@dcloudio/uni-app';
  import { loadSkillLevels } from './utils/levels';
  import { getAdminToken } from './api/cs';

  onLaunch(() => {
    // 技能等级文案/序数走后端配置，失败时页面按编码原样回显。
    void loadSkillLevels();
    // 客服端只认 admin 登录态：缺失时冷启动直接落到客服登录页。
    if (!getAdminToken()) {
      uni.reLaunch({ url: '/pages/cs/login' });
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
