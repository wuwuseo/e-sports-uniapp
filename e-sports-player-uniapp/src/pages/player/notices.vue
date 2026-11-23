<template>
  <view>
    <view class="card tip muted">优先通知：名单内陪玩在窗口内可优先接单，也可拒绝；全部拒绝或超时后订单将释放到抢单大厅。</view>

    <view class="card">
      <view class="row">
        <text class="game">优先派单权</text>
        <text class="badge" :class="status?.holding ? 'ok' : 'idle'">
          {{ status?.holding ? '生效中' : '未持有' }}
        </text>
      </view>
      <view v-if="!(status?.holdings || []).length" class="muted">
        当前没有在期或下一期的优先派单名单记录；名单由系统按排名 / 积分 / 门槛自动重算或运营手工授予。
      </view>
      <view v-for="item in status?.holdings || []" :key="`${item.game}-${item.period_start}`" class="notice">
        <view class="row">
          <text class="game">{{ item.game || '未分区' }}</text>
          <text class="muted">{{ periodText(item.period) }} · 名次 {{ item.rank }}</text>
        </view>
        <view class="muted">
          有效期 {{ datetime(item.period_start) }} ~ {{ datetime(item.period_end) }} ·
          {{ item.active ? '已生效' : '下一期待生效' }}
        </view>
        <view class="muted">
          来源 {{ sourceText(item.source) }} · 名额剩 {{ item.remaining }} / {{ item.quota }}（已占 {{ item.used }}）
        </view>
        <view v-if="item.note" class="muted">备注：{{ item.note }}</view>
      </view>
    </view>

    <view class="card">
      <view v-if="notices.length === 0" class="empty">暂无待回应的优先通知</view>
      <view v-for="item in notices" :key="item.id" class="notice">
        <view class="row">
          <text class="game">{{ item.game || '未分区' }}</text>
          <text class="muted">订单 {{ item.order_id }}</text>
        </view>
        <view class="muted">通知时间 {{ datetime(item.notified_at) }}</view>
        <view class="actions">
          <button class="mini success" :loading="actingId === item.id" @click="grab(item)">
            接单
          </button>
          <button class="mini danger" @click="decline(item)">拒绝</button>
        </view>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
  import { onShow } from '@dcloudio/uni-app';
  import { ref } from 'vue';
  import { declineDispatchNotice, fetchDispatchNotices, fetchPlayerPriorityStatus, grabOrder } from '../../api/player';
  import type { PlayerPriorityStatus, PriorityNotice } from '../../api/player';
  import { datetime } from '../../utils/format';
  import { promptModal } from '../../utils/dialog';

  const notices = ref<PriorityNotice[]>([]);
  // 优先派单权状态：与通知列表互补——通知回答「现在哪张单只通知了我」，
  // 状态回答「这一期我是否在名单里、怎么来的、有效期到什么时候、还剩多少名额」。
  const status = ref<PlayerPriorityStatus | null>(null);
  const actingId = ref<number>(0);

  async function load() {
    try {
      notices.value = (await fetchDispatchNotices()) || [];
    } catch {
      notices.value = [];
    }
    try {
      status.value = await fetchPlayerPriorityStatus();
    } catch {
      status.value = null;
    }
  }

  const periodText = (period: string) =>
    (
      {
        daily: '日榜',
        weekly: '周榜',
        biweekly: '双周榜',
        monthly: '月榜',
      } as Record<string, string>
    )[period] || period || '—';

  const sourceText = (source: string) =>
    (
      {
        ranking: '排名',
        points: '积分',
        threshold: '门槛',
        rotation: '轮换',
        manual: '人工授予',
      } as Record<string, string>
    )[source] || source || '—';

  async function grab(item: PriorityNotice) {
    actingId.value = item.id;
    try {
      await grabOrder(item.order_id);
      uni.showToast({ title: '已接单', icon: 'success' });
      load();
    } catch {
      // request 层已提示。
    } finally {
      actingId.value = 0;
    }
  }

  async function decline(item: PriorityNotice) {
    const { confirm, text } = await promptModal(
      '拒绝优先通知',
      '拒绝原因',
      '请填写拒绝原因'
    );
    if (!confirm) return;
    try {
      await declineDispatchNotice(item.id, text);
      uni.showToast({ title: '已拒绝', icon: 'none' });
      load();
    } catch {
      // request 层已提示。
    }
  }

  onShow(load);
</script>

<style scoped lang="scss">
  .tip {
    padding: 16rpx 24rpx;
  }

  .notice {
    padding: 20rpx 0;
    border-bottom: 1rpx solid $border;
  }

  .notice:last-child {
    border-bottom: none;
  }

  .game {
    font-weight: 600;
  }

  .badge {
    font-size: 22rpx;
    padding: 4rpx 16rpx;
    border-radius: 8rpx;
  }

  .badge.ok {
    color: $success;
    background: rgba(0, 180, 42, 0.12);
  }

  .badge.idle {
    color: $text-3;
    background: $bg;
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
