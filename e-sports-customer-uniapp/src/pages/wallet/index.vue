<template>
  <view>
    <view class="card balance">
      <view class="muted">{{ balanceTitle }}</view>
      <view class="total">{{ amountText(wallet?.total_cents || 0, true) }}</view>
      <view v-if="yuanHint(wallet?.total_cents || 0)" class="muted">
        {{ yuanHint(wallet?.total_cents || 0) }}
      </view>
      <view class="split">
        <text>本金 {{ amountText(wallet?.principal_cents || 0) }}</text>
        <text>赠送 {{ amountText(wallet?.bonus_cents || 0) }}</text>
      </view>
      <view v-if="showYuanHint" class="muted">
        本金 {{ yuanHint(wallet?.principal_cents || 0) }} · 赠送
        {{ yuanHint(wallet?.bonus_cents || 0) }}
      </view>
      <view v-if="balanceDescription" class="muted">{{ balanceDescription }}</view>
      <view class="muted">赠送权益有有效期，过期作废；退款按原支付来源退回。</view>
    </view>

    <view class="card">
      <view class="section-title">自助充值</view>
      <view class="actions">
        <button class="primary" @click="go('/pages/wallet/recharge')">自助充值</button>
      </view>
      <view class="muted">充值需外部转账，由客服/财务核验到账后入账。</view>
    </view>

    <view class="muted center">充值、调整与退款均由客服在系统内操作，请勿私下转账</view>
  </view>
</template>

<script setup lang="ts">
  import { onShow } from '@dcloudio/uni-app';
  import { computed, ref } from 'vue';
  import {
    fetchWallet,
    fetchWalletDisplay,
    walletPrimaryAmount,
    walletUnitAmount,
  } from '../../api/esports';
  import type { CustomerWallet, WalletDisplay } from '../../api/esports';
  import { money } from '../../utils/format';

  const wallet = ref<CustomerWallet | null>(null);
  // 服务端展示口径：取不到时全部回落到旧文案「余额 / 元」。
  const walletDisplay = ref<WalletDisplay | null>(null);

  const balanceTitle = computed(() => walletDisplay.value?.display_name || '可用余额（本金 + 赠送）');
  const balanceDescription = computed(() => walletDisplay.value?.description || '');

  /** 每展示单位对应的分数：缺省 100（即元）。 */
  const unitCents = computed(() => {
    const unit = walletDisplay.value?.unit_cents;
    return unit && unit > 0 ? unit : 100;
  });

  /** 展示单位不是人民币时才补一行 ¥ 对照，避免同一数字重复展示。 */
  const showYuanHint = computed(() => !!walletDisplay.value && unitCents.value !== 100);

  /**
   * 金额文案：有展示口径时按 unit_cents 换算一次（主金额优先用服务端 display_amount），
   * 否则沿用 ¥ 分转元。display_amount 已是最终值，不再二次换算。
   */
  function amountText(cents: number, primary = false) {
    const display = walletDisplay.value;
    if (!display) return money(cents);
    const value = primary
      ? walletPrimaryAmount(cents, display)
      : walletUnitAmount(cents, display);
    return display.unit_name ? `${value} ${display.unit_name}` : value;
  }

  /** 人民币对照文案：未配置展示口径或口径即人民币时返回空串。 */
  function yuanHint(cents: number | null | undefined): string {
    return showYuanHint.value ? `≈ ${money(cents)}` : '';
  }

  function go(url: string) {
    uni.navigateTo({ url });
  }

  async function load() {
    try {
      wallet.value = await fetchWallet();
    } catch {
      wallet.value = null;
    }
    // 优先用钱包接口内嵌的 display；接口未带时读展示口径接口；都取不到则回落旧文案。
    let fallback: WalletDisplay | null = null;
    try {
      fallback = (await fetchWalletDisplay())?.customer_balance || null;
    } catch {
      fallback = null;
    }
    walletDisplay.value = wallet.value?.display || fallback;
  }

  onShow(load);
</script>

<style scoped lang="scss">
  .balance {
    background: linear-gradient(135deg, #165dff, #4080ff);
    color: #fff;
  }

  .balance .muted {
    color: rgba(255, 255, 255, 0.8);
  }

  .total {
    font-size: 56rpx;
    font-weight: 600;
    margin: 12rpx 0;
  }

  .split {
    display: flex;
    gap: 32rpx;
    margin-bottom: 12rpx;
  }

  .actions {
    display: flex;
    gap: 16rpx;
    margin-top: 20rpx;
  }

  .actions .primary,
  .actions .ghost {
    flex: 1;
    margin-top: 0;
  }

  .section-title {
    font-size: 30rpx;
    font-weight: 600;
    margin-bottom: 12rpx;
  }

  .card-item {
    padding: 20rpx 0;
    border-bottom: 1rpx solid $border;
  }

  .card-item:last-child {
    border-bottom: none;
  }

  .card-no {
    font-weight: 600;
  }

  .card-status {
    color: $brand;
  }

.center {
  text-align: center;
  margin-bottom: 40rpx;
}

.ghost {
  margin-top: 20rpx;
  background: $bg;
  border-radius: $radius;
}

.primary {
  background: $brand;
  color: #fff;
  border-radius: $radius;
}

.picker-value {
  color: $brand;
}

.input {
  flex: 1;
  text-align: right;
  padding: 8rpx 0;
  font-size: 28rpx;
}

.textarea {
  height: 160rpx;
  width: 100%;
  padding: 16rpx 20rpx;
  background: $bg;
  border-radius: $radius;
  box-sizing: border-box;
  margin-top: 16rpx;
}

.evidence {
  align-items: center;
  margin-top: 16rpx;
}

.evidence .ghost {
  margin-top: 0;
}

.actions {
  display: flex;
  gap: 16rpx;
  margin-top: 20rpx;
}

.actions .primary,
.actions .ghost {
  flex: 1;
  margin-top: 0;
}

.card-detail {
  margin-top: 16rpx;
  padding: 16rpx;
  background: $bg;
  border-radius: $radius;
}

.tx {
  padding: 10rpx 0;
  border-bottom: 1rpx solid $border;
}

.tx:last-child {
  border-bottom: none;
}

.pos {
  color: $success;
  font-weight: 600;
}

.neg {
  color: $danger;
  font-weight: 600;
}
</style>
