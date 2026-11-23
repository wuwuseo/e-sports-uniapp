<template>
  <view>
    <view class="card">
      <view v-if="addons.length === 0" class="empty">暂无待确认的加钟</view>
      <view v-for="item in addons" :key="item.id" class="addon">
        <view class="row">
          <text class="order-no">{{ item.addon_no }}</text>
          <text class="amount">{{ money(item.added_cents) }}</text>
        </view>
        <view class="muted">
          订单 {{ item.order_id }} · 追加服务量 {{ item.added_units }}
          <text v-if="item.note"> · {{ item.note }}</text>
        </view>
        <view class="actions">
          <button class="mini success" :loading="actingId === item.id" @click="confirm(item)">
            确认加钟
          </button>
          <button class="mini danger" @click="reject(item)">拒绝</button>
        </view>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
  import { onShow } from '@dcloudio/uni-app';
  import { ref } from 'vue';
  import { confirmAddon, fetchPendingAddons, rejectAddon } from '../../api/player';
  import type { Addon } from '../../api/player';
  import { money } from '../../utils/format';
  import { promptModal } from '../../utils/dialog';

  const addons = ref<Addon[]>([]);
  const actingId = ref<number>(0);

  async function load() {
    try {
      addons.value = (await fetchPendingAddons()) || [];
    } catch {
      addons.value = [];
    }
  }

  async function confirm(item: Addon) {
    actingId.value = item.id;
    try {
      await confirmAddon(item.id);
      uni.showToast({ title: '已确认加钟', icon: 'success' });
      load();
    } catch {
      // request 层已提示。
    } finally {
      actingId.value = 0;
    }
  }

  async function reject(item: Addon) {
    const { confirm, text } = await promptModal(
      '拒绝加钟',
      '拒绝原因',
      '请填写拒绝原因'
    );
    if (!confirm) return;
    if (!text) {
      uni.showToast({ title: '拒绝原因不能为空', icon: 'none' });
      return;
    }
    try {
      await rejectAddon(item.id, text);
      uni.showToast({ title: '已拒绝', icon: 'none' });
      load();
    } catch {
      // request 层已提示。
    }
  }

  onShow(load);
</script>

<style scoped lang="scss">
  .addon {
    padding: 20rpx 0;
    border-bottom: 1rpx solid $border;
  }

  .addon:last-child {
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
