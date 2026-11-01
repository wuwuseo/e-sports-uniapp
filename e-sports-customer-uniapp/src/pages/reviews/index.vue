<template>
  <view>
    <view class="card tip muted">
      这里是你对陪玩服务的评价记录。评价若被判定为异常（风控状态非「正常」）或不符实，可在时限内发起申诉，由管理员复核改判。
    </view>

    <view class="card">
      <view v-if="items.length === 0" class="empty">暂无评价记录</view>
      <view v-for="item in items" :key="item.review_id" class="review">
        <view class="row">
          <text class="stars">{{ stars(item.rating) }}</text>
          <text class="muted">{{ orderText(item) }}</text>
        </view>
        <view v-if="item.content" class="content">{{ item.content }}</view>
        <view class="muted">
          {{ datetime(item.created_at) }} ·
          {{ item.verified ? '本人评价' : '客服代录' }} ·
          状态 {{ statusText(item.status) }}
        </view>
        <view v-if="item.appeal_status !== 'none'" class="muted">
          申诉：{{ appealText(item.appeal_status) }}
        </view>
        <button
          v-if="item.can_appeal"
          class="mini primary"
          :loading="actingId === item.review_id"
          @click="appeal(item)"
        >
          申诉
        </button>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
  import { onShow } from '@dcloudio/uni-app';
  import { ref } from 'vue';
  import { appealMyReview, fetchMyReviews } from '../../api/esports';
  import type { MyReview } from '../../api/esports';
  import { datetime } from '../../utils/format';

  // 我的评价：`GET /user/reviews` 带 review_id 与 can_appeal，
  // 可申诉时直接调 `POST /user/reviews/:id/appeal`，提交后刷新申诉状态。
  const items = ref<MyReview[]>([]);
  const actingId = ref(0);

  async function load() {
    try {
      items.value = (await fetchMyReviews({ limit: 100 })) || [];
    } catch {
      items.value = [];
    }
  }

  async function appeal(item: MyReview) {
    const res = await new Promise<{ confirm: boolean; content?: string }>((resolve) => {
      uni.showModal({
        title: '评价申诉',
        content: '请填写申诉理由（如评价与事实不符、被误判为异常）',
        editable: true,
        placeholderText: '申诉理由',
        success: (r) => resolve(r),
        fail: () => resolve({ confirm: false }),
      });
    });
    if (!res.confirm) return;
    const reason = (res.content || '').trim();
    if (!reason) {
      uni.showToast({ title: '申诉理由不能为空', icon: 'none' });
      return;
    }
    actingId.value = item.review_id;
    try {
      await appealMyReview(item.review_id, reason);
      uni.showToast({ title: '申诉已提交，待复核', icon: 'success' });
      await load();
    } catch {
      // request 层已提示（如超出申诉时限、已有申诉）。
    } finally {
      actingId.value = 0;
    }
  }

  const stars = (rating: number) => '★★★★★'.slice(0, Math.max(0, Math.min(5, rating)));

  const orderText = (item: MyReview) =>
    item.order_no ? `订单 ${item.order_no}` : `订单 #${item.order_id}`;

  const statusText = (status: string) =>
    (
      {
        normal: '正常',
        disputed: '异常待复核',
        invalid: '已判定无效',
        appeal_pending: '申诉待复核',
      } as Record<string, string>
    )[status] || status;

  const appealText = (status: string) =>
    (
      {
        pending: '待复核',
        approved: '申诉成立',
        rejected: '维持原结论',
      } as Record<string, string>
    )[status] || status;

  onShow(load);
</script>

<style scoped lang="scss">
  .tip {
    padding: 16rpx 24rpx;
  }

  .review {
    padding: 20rpx 0;
    border-bottom: 1rpx solid $border;
  }

  .review:last-child {
    border-bottom: none;
  }

  .stars {
    color: #f7ba1e;
    font-size: 30rpx;
    letter-spacing: 4rpx;
  }

  .content {
    margin: 8rpx 0;
    color: $text-1;
  }

  .mini {
    margin-top: 12rpx;
    font-size: 24rpx;
    padding: 0 28rpx;
    line-height: 56rpx;
    border-radius: 28rpx;
  }

  .primary {
    background: $brand;
    color: #fff;
  }
</style>
