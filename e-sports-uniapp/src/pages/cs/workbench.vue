<template>
  <view>
    <view class="card profile">
      <view class="profile-head">
        <view>
          <view class="nickname">移动客服工作台</view>
          <view class="muted">我的客户 {{ board?.my_customers ?? 0 }} · 在线陪玩 {{ board?.order_pool?.online_players ?? 0 }}</view>
        </view>
        <text class="logout" @click="logout">退出</text>
      </view>
    </view>

    <view class="card stats">
      <view class="stat" @click="goOrders('pending_dispatch')">
        <view class="stat-num">{{ poolCount('pending_dispatch') }}</view>
        <view class="muted">待派单</view>
      </view>
      <view class="stat" @click="goOrders('grabbing')">
        <view class="stat-num">{{ poolCount('grabbing') }}</view>
        <view class="muted">抢单中</view>
      </view>
      <view class="stat" @click="goOrders('pending_acceptance')">
        <view class="stat-num">{{ poolCount('pending_acceptance') }}</view>
        <view class="muted">待接单</view>
      </view>
      <view class="stat" @click="goOrders('in_service')">
        <view class="stat-num">{{ poolCount('in_service') }}</view>
        <view class="muted">服务中</view>
      </view>
      <view class="stat" @click="goOrders('pending_close')">
        <view class="stat-num">{{ poolCount('pending_close') }}</view>
        <view class="muted">待结单</view>
      </view>
    </view>

    <view class="card">
      <view class="section-head">
        <text class="section-title">我的业绩</text>
        <text class="muted">{{ rangeText }}</text>
      </view>
      <view v-if="performanceRows.length === 0" class="muted">本期暂无业绩数据</view>
      <view v-for="row in performanceRows" :key="row.admin_id" class="perf">
        <view class="row">
          <text class="perf-name">{{ row.admin_name || `客服#${row.admin_id}` }}</text>
          <text class="perf-commission">提成 {{ money(row.commission_cents) }}</text>
        </view>
        <view class="muted">
          订单 {{ row.order_count }} 单 · 营收 {{ money(row.revenue_cents) }} · 退款
          {{ money(row.refund_cents) }} · 净额 {{ money(row.net_cents) }}
        </view>
      </view>
    </view>

    <view class="card">
      <view class="section-title">快捷入口</view>
      <view class="grid">
        <view class="entry" @click="go('/pages/cs/order-create')">
          <text class="entry-icon">报</text>
          <text class="entry-text">报单</text>
        </view>
        <view class="entry" @click="go('/pages/cs/customers')">
          <text class="entry-icon">客</text>
          <text class="entry-text">客户</text>
        </view>
        <view class="entry" @click="go('/pages/cs/orders')">
          <text class="entry-icon">单</text>
          <text class="entry-text">订单</text>
        </view>
        <view class="entry" @click="go('/pages/cs/scripts')">
          <text class="entry-icon">术</text>
          <text class="entry-text">话术</text>
        </view>
        <view class="entry" @click="go('/pages/cs/after-sales')">
          <text class="entry-icon">售</text>
          <text class="entry-text">售后</text>
        </view>
        <view class="entry" @click="go('/pages/cs/gift')">
          <text class="entry-icon">礼</text>
          <text class="entry-text">送礼</text>
        </view>
        <view class="entry" @click="go('/pages/cs/member-levels')">
          <text class="entry-icon">会</text>
          <text class="entry-text">会员等级</text>
        </view>
      </view>
    </view>

    <view class="card">
      <view class="section-title">待办提醒</view>
      <view v-if="todos.length === 0" class="muted">暂无待办</view>
      <view v-for="item in todos" :key="item.key" class="todo" @click="onTodo(item)">
        <text>{{ item.label }}</text>
        <text class="badge" :class="{ zero: item.count === 0 }">{{ item.count }}</text>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
  import { onShow } from '@dcloudio/uni-app';
  import { computed, ref } from 'vue';
  import { clearAdminToken, fetchCsWorkbench } from '../../api/cs';
  import type { CsPerformanceRow, CsTodoItem, CsWorkbench } from '../../api/cs';
  import { datetime, money } from '../../utils/format';

  const board = ref<CsWorkbench | null>(null);

  const todos = computed<CsTodoItem[]>(() => board.value?.todos || []);
  /** 业绩明细：非超管时服务端强制收敛到本人，故这里展示的就是本人业绩。 */
  const performanceRows = computed<CsPerformanceRow[]>(() => board.value?.performance?.rows || []);
  const rangeText = computed(() => {
    const range = board.value?.range;
    if (!range) return '';
    return `${datetime(range.start)} ~ ${datetime(range.end)}（${range.period}）`;
  });

  function poolCount(key: string): number {
    const pool = board.value?.order_pool;
    if (!pool) return 0;
    const list = (pool as unknown as Record<string, unknown>)[key];
    return Array.isArray(list) ? list.length : 0;
  }

  async function load() {
    try {
      board.value = await fetchCsWorkbench();
    } catch {
      board.value = null;
    }
  }

  function go(url: string) {
    uni.navigateTo({ url });
  }

  function goOrders(status: string) {
    uni.navigateTo({ url: `/pages/cs/orders?status=${status}` });
  }

  function onTodo(item: CsTodoItem) {
    switch (item.key) {
      case 'overdue_payment':
        uni.navigateTo({ url: '/pages/cs/orders?status=pending_payment' });
        break;
      case 'pending_close':
      // 结单超时待处理：订单仍停在待结单，按履约状态过滤到同一列表。
      case 'close_deadline_overdue':
        uni.navigateTo({ url: '/pages/cs/orders?status=pending_close' });
        break;
      // 档期待确认待处置：该态订单仍未派单，落到待派单列表。
      case 'appointment_pending_confirm':
        uni.navigateTo({ url: '/pages/cs/orders?status=pending_dispatch' });
        break;
      case 'due_follow_up':
      case 'customer_birthday':
        uni.navigateTo({ url: '/pages/cs/customers' });
        break;
      case 'pending_aftersale':
        uni.navigateTo({ url: '/pages/cs/after-sales' });
        break;
      default:
        uni.navigateTo({ url: '/pages/cs/orders' });
    }
  }

  function logout() {
    clearAdminToken();
    uni.reLaunch({ url: '/pages/cs/login' });
  }

  onShow(load);
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

  .logout {
    color: #fff;
    font-size: 26rpx;
  }

  .stats {
    display: flex;
    flex-wrap: wrap;
  }

  .stat {
    width: 20%;
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

  .section-head {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    margin-bottom: 16rpx;
  }

  .section-head .section-title {
    margin-bottom: 0;
  }

  .perf {
    padding: 16rpx 0;
    border-bottom: 1rpx solid $border;
  }

  .perf:last-child {
    border-bottom: none;
  }

  .perf-name {
    font-weight: 600;
  }

  .perf-commission {
    color: $danger;
    font-weight: 600;
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

  .todo {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 24rpx 0;
    border-bottom: 1rpx solid $border;
  }

  .todo:last-child {
    border-bottom: none;
  }

  .badge {
    min-width: 40rpx;
    padding: 4rpx 16rpx;
    text-align: center;
    border-radius: 999rpx;
    background: #fff1f0;
    color: $danger;
    font-size: 24rpx;
  }

  .badge.zero {
    background: $bg;
    color: $text-3;
  }
</style>
