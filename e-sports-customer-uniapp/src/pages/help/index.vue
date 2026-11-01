<template>
  <view>
    <view class="card">
      <view class="section-title">发起售后</view>
      <view class="muted">
        选择要申请售后的单据，进入售后表单后来源与单据号已自动带出；赔付与退款一律走系统流程。
      </view>
      <view v-if="orders.length === 0" class="muted">暂无可申请售后的订单</view>
      <picker
        v-else
        mode="selector"
        :range="orderLabels"
        :value="orderIndex"
        @change="onOrderChange"
      >
        <view class="picker">{{ orderLabels[orderIndex] || '请选择订单' }} ›</view>
      </picker>
      <button class="primary" @click="goAfterSale">申请售后</button>
    </view>

    <view class="card">
      <view class="section-title">常见问题</view>
      <view v-for="faq in faqs" :key="faq.title" class="faq">
        <view class="faq-title">{{ faq.title }}</view>
        <view class="muted">{{ faq.answer }}</view>
      </view>
    </view>

    <view class="card">
      <view class="section-title">联系客服</view>
      <view class="muted">
        下单后由归属客服跟进；订单详情页可查看当前报价与付款进度，争议请在订单内发起售后。
      </view>
      <view class="muted">请勿私下转账；充值、调整与退款均由客服在系统内操作。</view>
    </view>
  </view>
</template>

<script setup lang="ts">
  import { onShow } from '@dcloudio/uni-app';
  import { computed, ref } from 'vue';
  import { fetchMyOrders } from '../../api/esports';
  import type { Order } from '../../api/esports';
  import { fulfillmentText, money } from '../../utils/format';

  /** 帮助中心默认展示最近 20 单，避免直接拉全量订单。 */
  const ORDER_LIMIT = 20;

  const faqs = [
    {
      title: '付款后多久开始服务？',
      answer: '付款成功后进入待派单，客服会尽快安排陪玩；预约单需先确认档期。',
    },
    {
      title: '时长不足 / 服务不符怎么办？',
      answer: '在订单或本页发起售后，说明诉求并上传凭证截图，客服受理后给出方案。',
    },
    {
      title: '退款多久到账？',
      answer: '方案执行是按项推进的：未执行完的项会显示为「待执行」，只有成功的项才计入已到账。',
    },
    {
      title: '客服提示补证怎么办？',
      answer: '在「我的售后」里打开对应售后单回复，并附带截图 / PDF 附件，带附件的回复才算已补证。',
    },
  ];

  const orders = ref<Order[]>([]);
  const orderIndex = ref(0);

  const orderLabels = computed(() =>
    orders.value.map(
      (order) =>
        `${order.order_no.slice(0, 12)} · ${fulfillmentText(order.fulfillment_status)} · ${money(
          order.payable_cents
        )}`
    )
  );

  async function load() {
    try {
      const list = (await fetchMyOrders('all')) || [];
      orders.value = list
        .slice()
        .sort((a, b) => (a.created_at < b.created_at ? 1 : -1))
        .slice(0, ORDER_LIMIT);
    } catch {
      orders.value = [];
    }
    if (orderIndex.value >= orders.value.length) orderIndex.value = 0;
  }

  function onOrderChange(e: { detail: { value: number | string } }) {
    const index = Number(e.detail.value);
    if (Number.isInteger(index) && index >= 0 && index < orders.value.length) {
      orderIndex.value = index;
    }
  }

  /** 跳转售后表单并带出订单来源。 */
  function goAfterSale() {
    const order = orders.value[orderIndex.value];
    if (!order) {
      uni.showToast({ title: '暂无可申请售后的订单', icon: 'none' });
      return;
    }
    uni.navigateTo({
      url: `/pages/aftersale/list?source_type=order&source_id=${order.id}&apply=1`,
    });
  }

  onShow(load);
</script>

<style scoped lang="scss">
  .section-title {
    font-size: 30rpx;
    font-weight: 600;
    margin-bottom: 12rpx;
  }

  .picker {
    margin-top: 16rpx;
    padding: 20rpx;
    background: $bg;
    border-radius: $radius;
    color: $brand;
  }

  .primary {
    margin-top: 24rpx;
    background: $brand;
    color: #fff;
    border-radius: $radius;
  }

  .faq {
    padding: 16rpx 0;
    border-bottom: 1rpx solid $border;
  }

  .faq:last-child {
    border-bottom: none;
  }

  .faq-title {
    font-weight: 600;
    margin-bottom: 8rpx;
  }
</style>
