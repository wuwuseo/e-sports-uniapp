<template>
  <view>
    <view v-if="!intent" class="card">
      <view class="section-title">自助充值</view>

      <view class="section-title sub">选择充值金额</view>
      <view class="amount-grid">
        <view
          v-for="item in presetAmounts"
          :key="item"
          class="amount-item"
          :class="{ active: selectedAmount === item }"
          @click="selectedAmount = item"
        >
          {{ item }} 元
        </view>
      </view>
      <view class="row">
        <text>自定义金额（元）</text>
        <input
          v-model="customAmountText"
          class="input"
          type="digit"
          placeholder="例如 100"
          @input="onCustomAmount"
        />
      </view>

      <view class="section-title sub">选择付款方式</view>
      <view v-for="m in channels" :key="m.value" class="pay-method" @click="channel = m.value">
        <view>
          <text class="pay-name">{{ m.name }}</text>
          <text class="pay-hint">{{ m.desc }}</text>
        </view>
        <text class="pay-check">{{ channel === m.value ? '✓' : '' }}</text>
      </view>

      <button class="primary" :loading="submitting" @click="submit">生成支付意图</button>
      <view class="muted center">
        充值赠送按当前生效活动自动锁定快照，到账后由财务/渠道核验并入账，请勿私下转账。
      </view>
    </view>

    <view v-else class="card">
      <view class="section-title">充值已提交</view>
      <view class="row"><text>意图单号</text><text class="mono">{{ intent.intent_no }}</text></view>
      <view class="row"><text>实充本金</text><text>{{ money(intent.principal_cents) }}</text></view>
      <view v-if="intent.bonus_cents > 0" class="row">
        <text>活动赠送</text><text>{{ money(intent.bonus_cents) }}</text>
      </view>
      <view class="row"><text>应付金额</text><text class="price">{{ money(intent.payable_cents) }}</text></view>
      <view class="row"><text>付款方式</text><text>{{ channelText(intent.payment_channel) }}</text></view>
      <view class="row"><text>支付时限</text><text>{{ datetime(intent.pay_window_expires_at) }}</text></view>

      <view class="pay-wait">
        <view class="pay-wait-title">已提交，待财务确认到账</view>
        <view class="muted">
          请按归属客服提供的收款账户完成转账，付款备注注明「{{ intent.payment_ref }}」。到账由客服/财务核验，核验后{{ balanceName }}与赠送将自动入账。
        </view>
      </view>

      <button class="primary" @click="goCashier">扫码支付</button>
      <view class="muted center">
        扫码支付会打开本站收银台，可在线支付或使用商家码；人工转账仍按下述指引操作。
      </view>
      <button class="ghost" @click="goWallet">去钱包查看{{ balanceName }}</button>
      <button class="ghost" @click="reset">再充一笔</button>
    </view>
  </view>
</template>

<script setup lang="ts">
  import { computed, ref } from 'vue';
  import { onShow } from '@dcloudio/uni-app';
  import { createRechargeIntent, fetchWalletDisplay, getWalletDisplayState } from '../../api/esports';
  const walletDisplays = getWalletDisplayState();
  const balanceName = computed(() => walletDisplays.value.customer_balance.display_name);
  onShow(() => { fetchWalletDisplay(); });
  import type { RechargeIntent } from '../../api/esports';
  import { datetime, idempotencyKey, money, yuanToCents } from '../../utils/format';

  const presetAmounts = [500, 1000, 2000, 5000];
  const channels = [
    { value: 'wechat_work', name: '企微收款', desc: '添加归属客服企业微信转账' },
    { value: 'merchant_qr', name: '商户码', desc: '扫描归属客服提供的收款二维码' },
    { value: 'corporate_transfer', name: '对公转账', desc: '转账至公司对公账户' },
  ];

  const selectedAmount = ref(0);
  const customAmountText = ref('');
  const channel = ref('wechat_work');
  const submitting = ref(false);
  const intent = ref<RechargeIntent | null>(null);
  // 幂等键进入页面生成一次：重复点击只生成一个意图。
  const requestKey = idempotencyKey('recharge');

  const channelText = (value: string) =>
    channels.find((item) => item.value === value)?.name || value;

  function onCustomAmount() {
    selectedAmount.value = 0;
  }

  function amountCents(): number {
    if (customAmountText.value) {
      return yuanToCents(customAmountText.value);
    }
    return selectedAmount.value * 100;
  }

  async function submit() {
    const cents = amountCents();
    if (!Number.isFinite(cents) || cents < 100 || cents > 100_000_000) {
      uni.showToast({ title: '充值金额须在 1–1000000 元之间', icon: 'none' });
      return;
    }
    if (!channel.value) {
      uni.showToast({ title: '请选择付款方式', icon: 'none' });
      return;
    }
    submitting.value = true;
    try {
      intent.value = await createRechargeIntent({
        principal_cents: cents,
        payment_channel: channel.value,
        idempotency_key: requestKey,
      });
    } catch {
      // request 层已提示（如自助受限 / 金额非法）。
    } finally {
      submitting.value = false;
    }
  }

  function goWallet() {
    uni.redirectTo({ url: '/pages/wallet/index' });
  }

  /**
   * 聚合收款收银台：business_id 需数字主键。
   * 当前 /user/recharge-intents 视图未下发 id，后端补齐前给出明确提示，避免传错单号。
   */
  function goCashier() {
    const current = intent.value;
    if (!current) return;
    const businessId = current.id;
    if (!businessId || !Number.isFinite(businessId)) {
      uni.showToast({
        title: '充值单暂未返回编号，无法发起扫码支付',
        icon: 'none',
      });
      return;
    }
    uni.navigateTo({
      url: `/pages/pay/cashier?businessType=recharge&businessId=${businessId}&businessNo=${encodeURIComponent(
        current.intent_no
      )}&amountCents=${current.payable_cents}`,
    });
  }

  function reset() {
    intent.value = null;
    customAmountText.value = '';
    selectedAmount.value = 0;
  }
</script>

<style scoped lang="scss">
  .section-title {
    font-size: 30rpx;
    font-weight: 600;
    margin-bottom: 16rpx;
  }

  .sub {
    margin-top: 28rpx;
  }

  .amount-grid {
    display: flex;
    flex-wrap: wrap;
    gap: 16rpx;
  }

  .amount-item {
    padding: 16rpx 32rpx;
    background: $bg;
    border-radius: $radius;
    border: 2rpx solid transparent;
  }

  .amount-item.active {
    border-color: $brand;
    color: $brand;
    font-weight: 600;
  }

  .input {
    width: 240rpx;
    padding: 12rpx 20rpx;
    background: $bg;
    border-radius: $radius;
    text-align: right;
  }

  .pay-method {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 24rpx 0;
    border-bottom: 1rpx solid $border;
  }

  .pay-name {
    font-weight: 600;
  }

  .pay-hint {
    display: block;
    margin-top: 6rpx;
    color: $text-2;
    font-size: 24rpx;
  }

  .pay-check {
    color: $brand;
    font-weight: 600;
  }

  .primary {
    margin-top: 28rpx;
    background: $brand;
    color: #fff;
    border-radius: $radius;
  }

  .ghost {
    margin-top: 20rpx;
    background: $bg;
    border-radius: $radius;
  }

  .price {
    color: $danger;
    font-weight: 600;
  }

  .mono {
    font-family: monospace;
  }

  .pay-wait {
    margin-top: 20rpx;
    padding: 20rpx;
    background: #fff7e6;
    border-radius: $radius;
  }

  .pay-wait-title {
    color: #d46b08;
    font-weight: 600;
    margin-bottom: 8rpx;
  }

  .center {
    text-align: center;
    margin-top: 16rpx;
  }
</style>
