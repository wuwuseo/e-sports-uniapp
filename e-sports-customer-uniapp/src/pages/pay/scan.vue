<template>
  <view>
    <view v-if="loading" class="card muted">正在读取支付信息…</view>

    <view v-else-if="errorText" class="card empty">{{ errorText }}</view>

    <template v-else-if="checkout">
      <view class="card summary">
        <view class="row">
          <text class="biz">{{ bizText }}支付</text>
          <text class="status" :class="statusClass">{{ statusText }}</text>
        </view>
        <view class="amount">{{ money(checkout.amount_cents) }}</view>
        <view class="muted">
          支付时限 {{ datetime(checkout.business_expires_at) }} · {{ remaining }}
        </view>
      </view>

      <view v-if="paid" class="card pay-ok">
        <view class="pay-ok-title">支付成功</view>
        <view class="muted">商家会收到到账通知，本页可安全关闭。</view>
      </view>

      <view v-else-if="checkout.status === 'open' && !expired" class="card">
        <view class="section-title">选择支付方式</view>

        <view v-if="dynamicPending" class="notice warn">
          当前有一笔支付待完成（{{ attemptRemaining }}），请先完成支付或等待超时后再试。
        </view>
        <view v-if="!availableChannels.length" class="notice warn">
          在线收款服务暂未开通，请联系商家提供收款方式。
        </view>

        <view v-if="visibleChannels.length" class="actions">
          <button
            v-for="channel in visibleChannels"
            :key="channel"
            class="primary"
            :disabled="dynamicPending"
            :loading="submitting && payingChannel === channel"
            @click="pay(channel)"
          >
            {{ payChannelText(channel) }}<text v-if="channel === envChannel" class="tag">推荐</text>
          </button>
        </view>

        <view v-if="envNote" class="muted">{{ envNote }}</view>

        <view v-if="attemptQr || attemptPayload" class="attempt-box">
          <view class="section-title sub">请使用{{ attemptChannelText }}扫码支付</view>
          <image
            v-if="attemptQr"
            class="qr"
            :src="attemptQr"
            mode="widthFix"
          />
          <view v-else class="link-box">
            <text class="link-text">{{ attemptPayload }}</text>
          </view>
          <view class="actions">
            <button
              v-if="attemptPayload"
              class="ghost"
              @click="copyText(attemptPayload, '支付内容已复制')"
            >
              复制支付内容
            </button>
            <button class="ghost" @click="checkStatus">刷新支付状态</button>
          </view>
          <view class="muted">
            支付有效期至 {{ datetime(activeAttempt?.expires_at) }}，支付成功后本页自动更新。
          </view>
        </view>

        <view class="muted">
          请使用本人账户付款并保留付款凭证；如支付后长时间未更新，请将成功页面截图发给商家。
        </view>
      </view>

      <view v-else-if="checkout.status === 'expired' || expired" class="card notice warn">
        支付链接已超时，请让商家重新生成付款入口。
      </view>
      <view v-else-if="checkout.status === 'cancelled'" class="card notice warn">
        该笔支付已取消，请联系商家确认。
      </view>
    </template>
  </view>
</template>

<script setup lang="ts">
  import { onHide, onLoad, onShow, onUnload } from '@dcloudio/uni-app';
  import { computed, ref } from 'vue';
  import { useCheckoutPolling } from '@esports/shared/composables/useCheckoutPolling';
  import {
    createCheckoutAttempt,
    fetchPublicCheckout,
  } from '../../api/esports';
  import type {
    CheckoutAttempt,
    PayChannel,
    PublicCheckoutView,
  } from '../../api/esports';
  import { datetime, money } from '../../utils/format';
  import {
    checkoutBusinessText,
    checkoutStatusText,
    copyText,
    isExpired,
    openPayUrl,
    payChannelText,
    remainingText,
    renderQrDataUrl,
  } from '../../utils/pay';

  const token = ref('');
  const loading = ref(true);
  const errorText = ref('');
  const checkout = ref<PublicCheckoutView | null>(null);
  const paid = ref(false);

  // 倒计时与 3 秒轮询统一走共享 composable，本页只负责 token 与视图同步。
  const {
    now,
    remaining,
    expired,
    start: startPolling,
    stop: stopPolling,
    check: checkStatus,
    startTick,
    resume: resumePolling,
    pause: pausePolling,
  } = useCheckoutPolling({
    getToken: () => token.value,
    getExpiresAt: () => checkout.value?.business_expires_at,
    isPaid: () => paid.value,
    // 状态未知时允许开轮询，拿到非 open 状态后由 composable 停止。
    canPoll: () => !checkout.value?.status || checkout.value.status === 'open',
    onPaid: () => handlePaid(),
    onStatus: (status) => {
      if (!checkout.value || checkout.value.status === status) return;
      checkout.value = { ...checkout.value, status };
    },
  });

  const submitting = ref(false);
  const payingChannel = ref<PayChannel | ''>('');
  const activeAttempt = ref<CheckoutAttempt | null>(null);
  const attemptQr = ref('');
  const attemptPayload = ref('');
  const attemptChannel = ref<PayChannel | ''>('');

  const inWechat = ref(false);
  const inAlipay = ref(false);

  const bizText = computed(() =>
    checkoutBusinessText(checkout.value?.business_type || '')
  );
  const statusText = computed(() => {
    if (paid.value) return checkoutStatusText('paid');
    if (expired.value && checkout.value?.status === 'open') {
      return checkoutStatusText('expired');
    }
    return checkoutStatusText(checkout.value?.status || '');
  });
  const statusClass = computed(() => ({
    paid: paid.value,
    danger:
      !paid.value &&
      (checkout.value?.status === 'expired' ||
        checkout.value?.status === 'cancelled' ||
        expired.value),
  }));
  const envChannel = computed<PayChannel | ''>(() =>
    inWechat.value ? 'wechat' : inAlipay.value ? 'alipay' : ''
  );
  const availableChannels = computed<PayChannel[]>(() => {
    const channels = checkout.value?.channels;
    const list: PayChannel[] = [];
    if (channels?.wechat) list.push('wechat');
    if (channels?.alipay) list.push('alipay');
    return list;
  });
  // 微信 / 支付宝内置浏览器只展示对应渠道；普通浏览器展示全部，避免跨端唤起失败。
  const visibleChannels = computed<PayChannel[]>(() => {
    const env = envChannel.value;
    if (env && availableChannels.value.includes(env)) return [env];
    return availableChannels.value;
  });
  const envNote = computed(() => {
    if (inWechat.value) {
      return '当前在微信内打开，请使用微信支付；如需支付宝，请复制链接到手机浏览器打开。';
    }
    if (inAlipay.value) {
      return '当前在支付宝内打开，请使用支付宝支付。';
    }
    return '微信内打开请选择微信支付，支付宝内打开请选择支付宝；扫码后请核对金额再付款。';
  });

  const dynamicPending = computed(() => {
    const attempt = activeAttempt.value;
    if (!attempt || paid.value) return false;
    if (['paid', 'expired', 'cancelled', 'failed'].includes(attempt.status)) {
      return false;
    }
    return !isExpired(attempt.expires_at, now.value);
  });
  const attemptRemaining = computed(() =>
    remainingText(activeAttempt.value?.expires_at, now.value)
  );
  const attemptChannelText = computed(() =>
    attemptChannel.value ? payChannelText(attemptChannel.value) : '微信 / 支付宝'
  );

  function detectEnvironment() {
    const ua = (
      (globalThis as { navigator?: { userAgent?: string } }).navigator
        ?.userAgent || ''
    ).toLowerCase();
    inWechat.value = ua.includes('micromessenger');
    inAlipay.value = ua.includes('alipayclient');
  }

  /** 冷启动 / 直接打开时 query 可能取不到 token，再从 hash 兜底解析一次。 */
  function tokenFromHash(): string {
    const hash = (globalThis as { location?: { hash?: string } }).location?.hash || '';
    const match = /[?&](?:token|pay)=([^&]+)/.exec(hash);
    if (!match) return '';
    try {
      return decodeURIComponent(match[1]);
    } catch {
      return match[1];
    }
  }

  function handlePaid() {
    if (paid.value) return;
    paid.value = true;
    stopPolling();
    clearAttempt();
    if (checkout.value) {
      checkout.value = { ...checkout.value, status: 'paid' };
    }
    uni.showToast({ title: '支付成功', icon: 'success' });
  }

  async function load() {
    if (!token.value) {
      errorText.value = '支付链接无效，请重新扫码或联系商家。';
      loading.value = false;
      return;
    }
    loading.value = true;
    errorText.value = '';
    try {
      const view = await fetchPublicCheckout(token.value);
      checkout.value = view;
      if (view.status === 'paid') {
        handlePaid();
        return;
      }
      startPolling();
    } catch (error) {
      errorText.value =
        (error as Error)?.message || '支付信息加载失败，请稍后重试。';
      stopPolling();
    } finally {
      loading.value = false;
    }
  }

  function clearAttempt() {
    activeAttempt.value = null;
    attemptQr.value = '';
    attemptPayload.value = '';
    attemptChannel.value = '';
  }

  async function pay(channel: PayChannel) {
    if (paid.value || !token.value) return;
    if (dynamicPending.value) {
      uni.showToast({
        title: '当前支付尚未完成，请先完成或等待超时',
        icon: 'none',
      });
      return;
    }
    // 上一笔支付已超时：先清掉旧二维码，再发起新支付。
    if (activeAttempt.value) clearAttempt();
    submitting.value = true;
    payingChannel.value = channel;
    try {
      const attempt = await createCheckoutAttempt(token.value, channel);
      activeAttempt.value = attempt;
      attemptChannel.value = attempt.pay_channel || channel;
      const payUrl = (attempt.pay_url || '').trim();
      if (payUrl && openPayUrl(payUrl)) {
        return;
      }
      const payload = (attempt.qr_payload || '').trim();
      if (payload) {
        attemptPayload.value = payload;
        attemptQr.value = await renderQrDataUrl(payload);
        if (!attemptQr.value) {
          copyText(payload, '支付内容已复制');
        }
        return;
      }
      if (payUrl) {
        attemptPayload.value = payUrl;
        copyText(payUrl, '支付链接已复制');
        return;
      }
      uni.showToast({ title: '暂未获取到支付信息，请稍后重试', icon: 'none' });
    } catch {
      // request 层已 toast 后端中文提示（渠道未开通 / 生成支付单失败）。
    } finally {
      submitting.value = false;
      payingChannel.value = '';
    }
  }

  onLoad((query) => {
    const raw = String(query?.token || query?.pay || '').trim();
    token.value = raw || tokenFromHash();
    detectEnvironment();
    startTick();
    void load();
  });

  onShow(() => {
    // 从服务商收银台 webview 返回时立即补查一次，再恢复轮询。
    resumePolling();
  });

  onHide(pausePolling);

  onUnload(pausePolling);
</script>

<style scoped lang="scss">
  .biz {
    font-weight: 600;
    font-size: 30rpx;
  }

  .status {
    color: $brand;
    font-weight: 600;
  }

  .status.paid {
    color: $success;
  }

  .status.danger {
    color: $danger;
  }

  .amount {
    margin: 24rpx 0 8rpx;
    color: $danger;
    font-size: 56rpx;
    font-weight: 700;
    text-align: center;
  }

  .summary {
    text-align: left;
  }

  .section-title {
    font-size: 30rpx;
    font-weight: 600;
    margin-bottom: 12rpx;
  }

  .section-title.sub {
    margin-top: 20rpx;
    font-size: 28rpx;
    text-align: center;
  }

  .actions {
    display: flex;
    flex-wrap: wrap;
    gap: 16rpx;
    margin: 20rpx 0 12rpx;
  }

  .primary {
    flex: 1;
    min-width: 240rpx;
    background: $brand;
    color: #fff;
    border-radius: $radius;
  }

  .ghost {
    flex: 1;
    background: $bg;
    color: $text-1;
    border-radius: $radius;
  }

  .tag {
    margin-left: 8rpx;
    font-size: 22rpx;
    opacity: 0.85;
  }

  .qr {
    width: 360rpx;
    height: 360rpx;
    margin: 0 auto;
    display: block;
    background: #fff;
    border: 1rpx solid $border;
    border-radius: $radius;
  }

  .link-box {
    margin: 16rpx 0;
    padding: 16rpx 20rpx;
    background: $bg;
    border-radius: $radius;
    word-break: break-all;
  }

  .link-text {
    color: $brand;
    font-size: 24rpx;
    font-family: monospace;
  }

  .notice {
    margin: 16rpx 0;
    padding: 20rpx;
    background: #fff7e6;
    border-radius: $radius;
    font-size: 26rpx;
    line-height: 1.6;
  }

  .notice.warn {
    color: #d46b08;
  }

  .attempt-box {
    margin: 24rpx 0;
    padding-top: 20rpx;
    border-top: 1rpx solid $border;
    text-align: center;
  }

  .pay-ok {
    text-align: center;
    padding: 40rpx 24rpx;
  }

  .pay-ok-title {
    color: $success;
    font-size: 34rpx;
    font-weight: 600;
    margin-bottom: 12rpx;
  }
</style>
