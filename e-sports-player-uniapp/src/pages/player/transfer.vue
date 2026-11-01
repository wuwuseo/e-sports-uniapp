<template>
  <view>
    <view class="card tip muted">转单须客服确认后才生效：确认前席位与订单不变，可随时撤回。</view>

    <view class="card">
      <view v-if="requests.length === 0" class="empty">暂无转单申请</view>
      <view v-for="item in requests" :key="item.id" class="req">
        <view class="row">
          <text class="order-id">订单 {{ item.order_id }} · 席位 {{ item.seat_index }}</text>
          <text class="status">{{ statusText(item.status) }}</text>
        </view>
        <view class="muted">原因：{{ item.reason }}</view>
        <view class="muted">{{ datetime(item.created_at) }}</view>
        <view v-if="item.decision_note" class="muted">处理备注：{{ item.decision_note }}</view>
        <button
          v-if="item.status === 'pending'"
          class="mini danger"
          :loading="actingId === item.id"
          @click="cancel(item)"
        >
          撤回
        </button>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
  import { onShow } from '@dcloudio/uni-app';
  import { ref } from 'vue';
  import { cancelTransfer, fetchTransferRequests } from '../../api/player';
  import type { TransferRequest } from '../../api/player';
  import { datetime } from '../../utils/format';

  const requests = ref<TransferRequest[]>([]);
  const actingId = ref<number>(0);

  async function load() {
    try {
      requests.value = (await fetchTransferRequests()) || [];
    } catch {
      requests.value = [];
    }
  }

  async function cancel(item: TransferRequest) {
    actingId.value = item.id;
    try {
      await cancelTransfer(item.id);
      uni.showToast({ title: '已撤回', icon: 'none' });
      load();
    } catch {
      // request 层已提示。
    } finally {
      actingId.value = 0;
    }
  }

  const statusText = (status: string) =>
    (
      ({
        pending: '待客服确认',
        approved: '已通过',
        rejected: '已驳回',
        cancelled: '已撤回',
      }) as Record<string, string>
    )[status] || status;

  onShow(load);
</script>

<style scoped lang="scss">
  .tip {
    padding: 16rpx 24rpx;
  }

  .req {
    padding: 20rpx 0;
    border-bottom: 1rpx solid $border;
  }

  .req:last-child {
    border-bottom: none;
  }

  .order-id {
    font-weight: 600;
  }

  .status {
    color: $brand;
  }

  .mini {
    margin-top: 12rpx;
    font-size: 24rpx;
    padding: 0 24rpx;
    line-height: 56rpx;
    border-radius: 28rpx;
  }

  .danger {
    background: #fff;
    color: $danger;
    border: 1rpx solid $danger;
  }
</style>
