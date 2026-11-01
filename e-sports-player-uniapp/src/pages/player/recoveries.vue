<template>
  <view>
    <view class="card tip muted">追偿是售后赔付由陪玩承担时从猫粮余额扣回的款项，与「退款冲回分成」相互独立。</view>

    <view class="card">
      <view class="section-title">追偿明细</view>
      <view v-if="items.length === 0" class="empty">暂无追偿明细</view>
      <view v-for="item in items" :key="item.id" class="rec">
        <view class="row">
          <text class="no">{{ item.recovery_no }}</text>
          <text class="amount">-{{ money(item.amount_cents) }}</text>
        </view>
        <view class="muted">原因：{{ item.reason }}</view>
        <view class="muted">
          {{ statusText(item.status) }} · {{ datetime(item.created_at) }}
        </view>
        <view v-if="item.reject_reason" class="muted">驳回原因：{{ item.reject_reason }}</view>
      </view>
    </view>

    <view class="card">
      <view class="section-title">信用记载</view>
      <view class="tip muted">
        售后责任方判定为陪玩后由系统自动记载；复核确认责任才会暂停接单资格，判定不构成责任则只留痕。
      </view>
      <view v-if="credits.length === 0" class="empty">暂无信用记载</view>
      <view v-for="item in credits" :key="item.event_no" class="rec">
        <view class="row">
          <text class="no">{{ creditKindText(item.kind) }}</text>
          <text class="credit-status" :class="creditClass(item.status)">
            {{ creditStatusText(item.status) }}
          </text>
        </view>
        <view class="muted">
          <text v-if="item.amount_cents">相关金额 {{ money(item.amount_cents) }} · </text>
          <text v-if="item.order_id">订单 #{{ item.order_id }} · </text>
          <text v-if="item.after_sale_id">售后单 #{{ item.after_sale_id }}</text>
        </view>
        <view v-if="item.note" class="muted">说明：{{ item.note }}</view>
        <view class="muted">记载时间 {{ datetime(item.created_at) }}</view>
        <view v-if="item.reviewed_at" class="muted">
          复核时间 {{ datetime(item.reviewed_at) }}
          <text v-if="item.review_note"> · 复核说明：{{ item.review_note }}</text>
        </view>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
  import { onShow } from '@dcloudio/uni-app';
  import { ref } from 'vue';
  import { fetchPlayerCreditEvents, fetchPlayerRecoveries } from '../../api/player';
  import type { PlayerCreditEvent, PlayerRecovery } from '../../api/player';
  import { datetime, money } from '../../utils/format';

  const items = ref<PlayerRecovery[]>([]);
  const credits = ref<PlayerCreditEvent[]>([]);

  async function load() {
    try {
      items.value = (await fetchPlayerRecoveries()) || [];
    } catch {
      items.value = [];
    }
    try {
      credits.value = (await fetchPlayerCreditEvents()) || [];
    } catch {
      credits.value = [];
    }
  }

  const statusText = (status: string) =>
    (
      ({
        pending: '待审批',
        approved: '待扣回',
        recovered: '已扣回',
        rejected: '已驳回',
      }) as Record<string, string>
    )[status] || status;

  const creditKindText = (kind: string) =>
    (
      ({
        fault_admitted: '责任记载',
        recovery_executed: '追偿执行',
        manual: '人工记载',
      }) as Record<string, string>
    )[kind] || kind;

  const creditStatusText = (status: string) =>
    (
      ({
        recorded: '已记载',
        penalty_applied: '已暂停接单',
        cleared: '不构成责任',
      }) as Record<string, string>
    )[status] || status;

  const creditClass = (status: string) =>
    status === 'penalty_applied' ? 'warn' : status === 'cleared' ? 'ok' : '';

  onShow(load);
</script>

<style scoped lang="scss">
  .tip {
    padding: 16rpx 24rpx;
  }

  .rec {
    padding: 20rpx 0;
    border-bottom: 1rpx solid $border;
  }

  .rec:last-child {
    border-bottom: none;
  }

  .no {
    font-weight: 600;
  }

  .amount {
    color: $danger;
    font-weight: 600;
  }

  .section-title {
    font-size: 30rpx;
    font-weight: 600;
    margin-bottom: 12rpx;
  }

  .credit-status {
    font-size: 24rpx;
    color: $text-2;
  }

  .credit-status.warn {
    color: $danger;
  }

  .credit-status.ok {
    color: $success;
  }
</style>
