<template>
  <view>
    <scroll-view class="tabs" scroll-x>
      <view
        v-for="tab in tabs"
        :key="tab.value"
        class="tab"
        :class="{ active: bucket === tab.value }"
        @click="switchBucket(tab.value)"
      >
        {{ tab.label }}
      </view>
    </scroll-view>

    <view v-if="orders.length === 0" class="empty">暂无订单</view>
    <view v-for="item in orders" :key="item.id" class="card order" @click="goDetail(item.id)">
      <view class="row">
        <text class="order-no">{{ item.order_no.slice(0, 12) }}</text>
        <text class="status">{{ fulfillmentText(item.fulfillment_status) }}</text>
      </view>
      <view class="row">
        <text class="muted">应付 {{ money(item.payable_cents) }}</text>
        <text class="muted">{{ datetime(item.created_at) }}</text>
      </view>
      <view v-if="item.addon_cents > 0" class="muted">
        含加钟追加 {{ money(item.addon_cents) }}
      </view>
      <view v-if="item.fulfillment_status === 'pending_payment'" class="pay-hint">
        <text class="pay-hint-text">待付款</text>
        <button class="mini" @click.stop="goPay(item.id)">去付款</button>
      </view>
      <view class="order-ops">
        <button class="mini" @click.stop="goAfterSale(item.id)">申请售后</button>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
  import { onShow } from '@dcloudio/uni-app';
  import { ref } from 'vue';
  import { fetchMyOrders } from '../../api/esports';
  import type { Order } from '../../api/esports';
  import { datetime, fulfillmentText, money } from '../../utils/format';

  const tabs = [
    { label: '全部', value: 'all' },
    { label: '待付款', value: 'pending_payment' },
    { label: '待派单', value: 'pending_dispatch' },
    { label: '进行中', value: 'in_progress' },
    { label: '待结单', value: 'pending_close' },
    { label: '已完成', value: 'completed' },
    { label: '已取消', value: 'cancelled' },
  ];
  const bucket = ref('all');
  const orders = ref<Order[]>([]);

  async function load() {
    try {
      orders.value = (await fetchMyOrders(bucket.value)) || [];
    } catch {
      orders.value = [];
    }
  }

  function switchBucket(value: string) {
    bucket.value = value;
    load();
  }

  function goDetail(id: number) {
    uni.navigateTo({ url: `/pages/order/detail?id=${id}` });
  }

  function goPay(id: number) {
    uni.navigateTo({ url: `/pages/order/detail?id=${id}` });
  }

  /** 售后入口：带出来源单据（订单 ID）并直接展开申请表单。 */
  function goAfterSale(id: number) {
    uni.navigateTo({
      url: `/pages/aftersale/list?source_type=order&source_id=${id}&apply=1`,
    });
  }

  onShow(load);
</script>

<style scoped lang="scss">
  .tabs {
    white-space: nowrap;
    background: #fff;
    padding: 16rpx 0;
  }

  .tab {
    display: inline-block;
    padding: 12rpx 28rpx;
    margin-left: 16rpx;
    border-radius: 999rpx;
    background: $bg;
    color: $text-2;
    font-size: 26rpx;
  }

  .tab.active {
    background: $brand;
    color: #fff;
  }

  .order-no {
    font-weight: 600;
  }

  .status {
    color: $brand;
  }

  .pay-hint {
    margin-top: 16rpx;
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .pay-hint-text {
    color: $danger;
    font-size: 26rpx;
  }

  .order-ops {
    margin-top: 16rpx;
    display: flex;
    justify-content: flex-end;
  }

  .mini {
    font-size: 26rpx;
    color: $brand;
    background: rgba(22, 93, 255, 0.08);
    border-radius: 999rpx;
    padding: 0 24rpx;
    height: 56rpx;
    line-height: 56rpx;
  }
</style>
