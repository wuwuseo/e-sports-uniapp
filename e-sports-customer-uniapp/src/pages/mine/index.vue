<template>
  <view>
    <view class="card">
      <view class="row">
        <text class="name">{{ profile?.display_name || '未登录' }}</text>
        <text class="level">{{ profile?.member_level_name || '—' }}</text>
      </view>
      <view class="muted">
        成长值 {{ profile?.growth_points ?? 0 }}
        <text v-if="profile?.next_level_code">
          · 距 {{ profile.next_level_code }} 还需 {{ remainingGrowth }} 点
        </text>
      </view>
      <view v-if="profile?.tags?.length" class="tags">
        <text v-for="tag in profile.tags" :key="tag" class="tag">{{ tag }}</text>
      </view>
      <view v-if="profile?.risk_restricted" class="warn">
        你已被限制自助下单：{{ profile.risk_reason }}。请联系客服或先预付。
      </view>
    </view>

    <view class="card">
      <view class="cell" @click="go('/pages/identity/index')">
        <text>实名认证</text>
        <text class="arrow">›</text>
      </view>
      <view class="cell" @click="go('/pages/order/list')">
        <text>我的订单</text>
        <text class="arrow">›</text>
      </view>
      <view class="cell" @click="go('/pages/aftersale/list')">
        <text>我的售后</text>
        <text class="arrow">›</text>
      </view>
      <view class="cell" @click="go('/pages/reviews/index')">
        <text>我的评价</text>
        <text class="arrow">›</text>
      </view>
      <view class="cell" @click="go('/pages/help/index')">
        <text>帮助中心</text>
        <text class="arrow">›</text>
      </view>
      <view class="cell" @click="go('/pages/messages/index')">
        <text>消息中心</text>
        <view class="cell-right">
          <text v-if="unread > 0" class="msg-badge">{{ unread > 99 ? '99+' : unread }}</text>
          <text class="arrow">›</text>
        </view>
      </view>
      <view v-if="profile?.priority_booking_enabled" class="cell" @click="go('/pages/member/priority-booking')">
        <text>会员优先预约</text>
        <text class="arrow">›</text>
      </view>
      <view class="cell" @click="go('/pages/wallet/index')">
        <text>{{ balanceName }}与权益</text>
        <text class="arrow">›</text>
      </view>
      <view class="cell" @click="go('/pages/wallet/recharge')">
        <text>自助充值</text>
        <text class="arrow">›</text>
      </view>
      <view class="cell" @click="go('/pages/gift/intents')">
        <text>待确认礼物</text>
        <text class="arrow">›</text>
      </view>
      <view class="cell" @click="go('/pages/gift/disputes')">
        <text>礼物与争议</text>
        <text class="arrow">›</text>
      </view>
    </view>

    <view class="card">
      <button class="ghost" @click="logout">退出登录</button>
      <view class="muted center">
        赔付一律走系统流程，禁止私下转账；如有争议请在订单内发起售后。
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
  import { onShow } from '@dcloudio/uni-app';
  import { computed, ref } from 'vue';
  import { fetchProfile, fetchWalletDisplay, getWalletDisplayState } from '../../api/esports';
  import type { CustomerProfile } from '../../api/esports';
  import { closeRealtime, realtimeUnread } from '../../api/realtime';
  import { clearToken } from '../../api/request';

  const profile = ref<CustomerProfile | null>(null);
  const walletDisplays = getWalletDisplayState();
  const balanceName = computed(() => walletDisplays.value.customer_balance.display_name);
  // 未读消息红点：由实时通道下发的服务端未读数驱动。
  const unread = realtimeUnread;

  const remainingGrowth = computed(() => {
    if (!profile.value) return 0;
    return Math.max(0, profile.value.next_level_growth - profile.value.growth_points);
  });

  async function load() {
    await fetchWalletDisplay();
    try {
      profile.value = await fetchProfile();
    } catch {
      profile.value = null;
    }
  }

  function go(url: string) {
    uni.navigateTo({ url });
  }

  function logout() {
    closeRealtime();
    clearToken();
    uni.reLaunch({ url: '/pages/login/index' });
  }

  /** tabBar「我的」索引：回到本页时按实时未读数校正徽标。 */
  const MINE_TAB_INDEX = 2;

  // 非 tab 页（如消息页）里调用 tabBar 徽标 API 在 H5 下会被忽略，
  // 标记已读后徽标会滞留旧值，因此每次回到 tab 页都按 ref 校正一次。
  function syncUnreadBadge() {
    const value = realtimeUnread.value;
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

  onShow(() => {
    syncUnreadBadge();
    load();
  });
</script>

<style scoped lang="scss">
  .name {
    font-size: 34rpx;
    font-weight: 600;
  }

  .level {
    color: $brand;
    font-weight: 600;
  }

  .tags {
    margin-top: 16rpx;
    display: flex;
    flex-wrap: wrap;
    gap: 12rpx;
  }

  .tag {
    padding: 4rpx 16rpx;
    background: $bg;
    border-radius: 999rpx;
    color: $text-2;
    font-size: 24rpx;
  }

  .warn {
    margin-top: 16rpx;
    padding: 16rpx;
    background: #fff1f0;
    color: $danger;
    border-radius: $radius;
    font-size: 26rpx;
  }

  .cell {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 28rpx 0;
    border-bottom: 1rpx solid $border;
  }

  .cell:last-child {
    border-bottom: none;
  }

  .arrow {
    color: $text-3;
  }

  .cell-right {
    display: flex;
    align-items: center;
    gap: 12rpx;
  }

  .msg-badge {
    min-width: 32rpx;
    padding: 0 10rpx;
    height: 32rpx;
    line-height: 32rpx;
    text-align: center;
    border-radius: 999rpx;
    background: $danger;
    color: #fff;
    font-size: 22rpx;
  }

  .ghost {
    background: $bg;
    border-radius: $radius;
  }

  .center {
    text-align: center;
    margin-top: 16rpx;
  }
</style>
