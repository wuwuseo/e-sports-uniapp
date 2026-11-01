<template>
  <view>
    <view class="card profile">
      <view class="profile-head">
        <view>
          <view class="nickname">陪玩工作台</view>
          <view class="muted">{{ online ? '已上线，可接新单' : '已下线，暂不接新单' }}</view>
        </view>
        <view class="switch-box">
          <text class="muted">{{ online ? '在线' : '离线' }}</text>
          <switch :checked="online" color="#165dff" @change="togglePresence" />
        </view>
      </view>
    </view>

    <view class="card stats">
      <view class="stat">
        <view class="stat-num">{{ amountText(dash?.today_catfood_cents || 0) }}</view>
        <view class="muted">今日收入</view>
      </view>
      <view class="stat">
        <view class="stat-num">{{ amountText(dash?.catfood_balance_cents || 0) }}</view>
        <view class="muted">可提现{{ catfoodName }}</view>
      </view>
      <view class="stat">
        <view class="stat-num">{{ dash?.pending_invites ?? 0 }}</view>
        <view class="muted">待接邀请</view>
      </view>
      <view class="stat">
        <view class="stat-num">{{ dash?.active_orders ?? 0 }}</view>
        <view class="muted">进行中订单</view>
      </view>
    </view>

    <view class="card">
      <view class="section-title">快捷入口</view>
      <view class="grid">
        <view class="entry" @click="go('/pages/player/hall')">
          <text class="entry-icon">抢</text>
          <text class="entry-text">抢单大厅</text>
        </view>
        <view class="entry" @click="go('/pages/player/orders')">
          <text class="entry-icon">单</text>
          <text class="entry-text">我的订单</text>
        </view>
        <view class="entry" @click="go('/pages/player/wallet')">
          <text class="entry-icon">钱</text>
          <text class="entry-text">{{ catfoodName }}钱包</text>
        </view>
        <view class="entry" @click="go('/pages/player/addons')">
          <text class="entry-icon">钟</text>
          <text class="entry-text">加钟通知</text>
        </view>
        <view class="entry" @click="go('/pages/player/notices')">
          <text class="entry-icon">先</text>
          <text class="entry-text">优先通知</text>
        </view>
        <view class="entry" @click="go('/pages/player/profile')">
          <text class="entry-icon">我</text>
          <text class="entry-text">我的</text>
        </view>
      </view>
    </view>

    <view class="card">
      <view class="section-title">待处理邀请</view>
      <view v-if="invites.length === 0" class="muted">暂无待接邀请</view>
      <view v-for="item in invites" :key="item.id" class="invite">
        <view class="row">
          <text class="order-no">{{ item.order_no }}</text>
          <text class="amount">{{ money(item.payable_cents) }}</text>
        </view>
        <view class="muted">
          席位 {{ item.seat_index }} / 共 {{ item.required_seats }} 席 · 需在
          {{ datetime(item.expires_at) }} 前回应
        </view>
        <view class="actions">
          <button class="mini success" @click="accept(item)">接受</button>
          <button class="mini danger" @click="reject(item)">拒绝</button>
        </view>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
  import { onHide, onShow, onUnload } from '@dcloudio/uni-app';
  import { computed, ref } from 'vue';
  import {
    acceptInvite,
    fetchPlayerDashboard,
    fetchPlayerInvites,
    rejectInvite,
    setPlayerPresence,
    startPlayerHeartbeat,
    stopPlayerHeartbeat,
  } from '../../api/player';
  import type { PlayerDashboard, PlayerInvite } from '../../api/player';
  import { fetchWalletDisplay, walletUnitAmount } from '../../api/esports';
  import type { WalletDisplay } from '../../api/esports';
  import { datetime, money } from '../../utils/format';

  // 陪玩猫粮的展示口径：接口未返回时回落「猫粮 / ¥」旧文案。
  type PlayerDashboardView = PlayerDashboard & { display?: WalletDisplay };

  const dash = ref<PlayerDashboardView | null>(null);
  const invites = ref<PlayerInvite[]>([]);
  const online = ref(false);
  const catfoodDisplay = ref<WalletDisplay | null>(null);

  const catfoodName = computed(() => catfoodDisplay.value?.display_name || '猫粮');

  /** 金额文案：有展示口径时按 unit_cents 换算一次，否则沿用 ¥ 分转元。 */
  function amountText(cents: number) {
    const display = catfoodDisplay.value;
    if (!display) return money(cents);
    const value = walletUnitAmount(cents, display);
    return display.unit_name ? `${value} ${display.unit_name}` : value;
  }

  async function load() {
    try {
      dash.value = await fetchPlayerDashboard();
      online.value = dash.value?.online ?? false;
    } catch {
      dash.value = null;
    }
    try {
      invites.value = (await fetchPlayerInvites()) || [];
    } catch {
      invites.value = [];
    }
    // 优先用概览接口内嵌的 display，其次读展示口径接口；都取不到则回落旧文案。
    let fallback: WalletDisplay | null = null;
    try {
      fallback = (await fetchWalletDisplay())?.player_catfood || null;
    } catch {
      fallback = null;
    }
    catfoodDisplay.value = dash.value?.display || fallback;
  }

  async function togglePresence(e: Event) {
    const target = !!(e as unknown as { detail?: { value?: boolean } }).detail?.value;
    try {
      await setPlayerPresence(target);
      online.value = target;
      uni.showToast({ title: target ? '已上线' : '已下线', icon: 'none' });
      load();
    } catch {
      // request 层已提示。
    }
  }

  async function accept(item: PlayerInvite) {
    try {
      await acceptInvite(item.id);
      uni.showToast({ title: '已接受邀请', icon: 'success' });
      load();
    } catch {
      // request 层已提示。
    }
  }

  async function reject(item: PlayerInvite) {
    try {
      await rejectInvite(item.id);
      uni.showToast({ title: '已拒绝邀请', icon: 'none' });
      load();
    } catch {
      // request 层已提示。
    }
  }

  // 本端 tabBar 页面只能走 switchTab，其余页面用 navigateTo
  const TAB_PAGES = ['/pages/player/home', '/pages/player/hall', '/pages/player/profile'];
  function go(url: string) {
    if (TAB_PAGES.includes(url)) {
      uni.switchTab({ url });
      return;
    }
    uni.navigateTo({ url });
  }

  // 陪玩端保活：前台期间定期心跳，后台/离开页面时停止，登出时由 profile.vue 统一清除。
  onShow(() => {
    startPlayerHeartbeat();
    load();
  });
  onHide(stopPlayerHeartbeat);
  onUnload(stopPlayerHeartbeat);
</script>

<style scoped lang="scss">
  .profile {
    background: linear-gradient(135deg, #165dff, #4080ff);
    color: #fff;
  }

  .profile .muted {
    color: rgba(255, 255, 255, 0.8);
  }

  .profile-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .nickname {
    font-size: 34rpx;
    font-weight: 600;
    margin-bottom: 8rpx;
  }

  .switch-box {
    display: flex;
    align-items: center;
    gap: 8rpx;
  }

  .stats {
    display: flex;
  }

  .stat {
    flex: 1;
    text-align: center;
  }

  .stat-num {
    font-size: 32rpx;
    font-weight: 600;
    margin-bottom: 8rpx;
  }

  .section-title {
    font-size: 30rpx;
    font-weight: 600;
    margin-bottom: 16rpx;
  }

  .grid {
    display: flex;
    flex-wrap: wrap;
    gap: 24rpx;
  }

  .entry {
    width: 20%;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8rpx;
  }

  .entry-icon {
    width: 80rpx;
    height: 80rpx;
    line-height: 80rpx;
    text-align: center;
    border-radius: 50%;
    background: #eef3ff;
    color: $brand;
    font-weight: 600;
  }

  .entry-text {
    font-size: 24rpx;
    color: $text-2;
  }

  .invite {
    padding: 16rpx 0;
    border-bottom: 1rpx solid $border;
  }

  .invite:last-child {
    border-bottom: none;
  }

  .order-no {
    font-weight: 600;
  }

  .amount {
    color: $danger;
    font-weight: 600;
  }

  .actions {
    display: flex;
    gap: 16rpx;
    margin-top: 12rpx;
  }

  .mini {
    font-size: 24rpx;
    padding: 0 24rpx;
    line-height: 56rpx;
    border-radius: 28rpx;
  }

  .success {
    background: $success;
    color: #fff;
  }

  .danger {
    background: #fff;
    color: $danger;
    border: 1rpx solid $danger;
  }
</style>
