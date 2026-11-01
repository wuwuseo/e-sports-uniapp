<template>
  <view>
    <view v-if="loading" class="card muted">正在加载收银台…</view>

    <view v-else-if="!businessTypeValid" class="card empty">
      付款参数无效，请返回业务页面重新发起。
    </view>

    <template v-else>
      <!-- 业务摘要：金额与时限以后端收银台为准，加载失败时回落到业务详情。 -->
      <view class="card">
        <view class="row">
          <text class="biz-type">{{ bizText }}付款</text>
          <text class="status" :class="statusClass">{{ statusText }}</text>
        </view>
        <view class="row">
          <text class="muted">{{ businessLabel }}</text>
          <text class="mono">{{ businessNo }}</text>
        </view>
        <view class="row">
          <text class="muted">应付金额</text>
          <text class="amount">{{ money(amountCents) }}</text>
        </view>
        <view class="row">
          <text class="muted">支付时限</text>
          <text>{{ datetime(expiresAt) }}</text>
        </view>
        <view class="row">
          <text class="muted">剩余时间</text>
          <text :class="{ danger: expired }">{{ remaining }}</text>
        </view>
      </view>

      <view v-if="terminalNotice" class="card notice warn">{{ terminalNotice }}</view>

      <!-- 通用入口码：手机扫码打开公开收银台，可用于跨端付款 / 转发。 -->
      <view v-if="entryToken || entryLink" class="card">
        <view class="section-title">通用付款入口码</view>
        <view class="muted">
          用微信 / 支付宝或手机相机扫码，在本站收银台完成付款；也可复制链接发给付款人。
        </view>
        <view v-if="entryQr" class="qr-wrap">
          <image class="qr" :src="entryQr" mode="widthFix" />
        </view>
        <view v-else class="link-box">
          <text class="link-text">{{ entryLink }}</text>
        </view>
        <view class="actions">
          <button class="ghost" @click="copyText(entryLink, '入口链接已复制')">复制链接</button>
        </view>
        <view class="muted">入口码只用于打开本站收银台，不包含收款账户等敏感信息。</view>
      </view>

      <template v-if="!terminalNotice">
        <!-- 在线聚合支付：可用渠道由服务端下发，未开通时引导使用商家码。 -->
        <view v-if="!paid" class="card">
          <view class="section-title">在线支付</view>

          <view v-if="proofVerified" class="notice warn">
            付款凭证已核销，该笔付款已完成，请勿重复付款。
          </view>
          <view v-else-if="proofPending" class="notice warn">
            已提交付款凭证，财务正在核验；核验完成前请勿重复付款。
          </view>
          <view v-else-if="aggregateUnavailable" class="notice warn">
            在线收款服务暂未开通，请使用下方商家码付款。
          </view>
          <view v-else-if="dynamicPending" class="notice warn">
            当前有一笔在线支付待完成（{{ attemptRemaining }}），请先完成支付或等待超时后再试。
          </view>
          <view v-else-if="manualFormVisible" class="notice warn">
            正在填写商家码付款凭证，请先提交或取消后再发起在线支付。
          </view>
          <view v-if="onlineError" class="notice warn">{{ onlineError }}</view>

          <view class="actions">
            <button
              class="primary"
              :disabled="onlineDisabled"
              :loading="submitting && payingChannel === 'wechat'"
              @click="payOnline('wechat')"
            >
              微信支付
            </button>
            <button
              class="primary alipay"
              :disabled="onlineDisabled"
              :loading="submitting && payingChannel === 'alipay'"
              @click="payOnline('alipay')"
            >
              支付宝
            </button>
          </view>
          <view v-if="channelHint" class="muted">{{ channelHint }}</view>

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
              支付有效期至 {{ datetime(activeAttempt?.expires_at) }}，完成后本页会自动刷新。
            </view>
          </view>

          <view class="muted">支付成功后页面自动刷新并返回上一页，请勿重复付款。</view>
        </view>

        <!-- 固定码兜底：展示财务审核通过的收款账户，支持复制账号与查看二维码。 -->
        <view v-if="!paid" class="card">
          <view class="section-title">商家码付款（人工核验）</view>
          <view class="muted">
            请按下方账户完成转账或扫码，保留付款截图，并提交流水号等待财务核验。
          </view>

          <view v-if="accountOptions.length">
            <view
              v-for="option in accountOptions"
              :key="option.account.id"
              class="account"
            >
              <view class="row">
                <text class="pay-name">{{ option.method.name }} · {{ option.account.subject_name }}</text>
                <text class="muted">{{ option.account.channel }}</text>
              </view>
              <view v-if="option.account.account_no" class="row">
                <text class="muted">收款账号</text>
                <text class="mono account-no">{{ option.account.account_no }}</text>
              </view>
              <view v-if="option.account.bank_name" class="row">
                <text class="muted">开户行</text>
                <text>{{ option.account.bank_name }}</text>
              </view>
              <view class="actions">
                <button
                  v-if="option.account.account_no"
                  class="ghost mini"
                  @click="copyText(option.account.account_no, '账号已复制')"
                >
                  复制账号
                </button>
                <button
                  v-if="option.account.qr_url"
                  class="ghost mini"
                  @click="previewAccountQr(option.account)"
                >
                  查看收款码
                </button>
              </view>
              <image
                v-if="option.account.qr_url"
                class="account-qr"
                :src="pageImageUrl(option.account.qr_url)"
                mode="widthFix"
                @click="previewAccountQr(option.account)"
              />
            </view>

            <view v-if="latestProof" class="pay-wait">
              <view class="pay-wait-title">{{ proofStatusText }}</view>
              <view class="muted">
                {{ payChannelText(latestProof.channel) }} · 流水号 {{ latestProof.transaction_no }} ·
                {{ money(latestProof.amount_cents) }}
              </view>
              <view v-if="latestProof.resolution" class="muted">说明：{{ latestProof.resolution }}</view>
            </view>

            <button
              v-if="!proofPending && !proofVerified"
              class="primary"
              :disabled="!manualSupported"
              @click="openProofForm"
            >
              {{ latestProof?.status === 'rejected' ? '重新提交凭证' : '我已付款' }}
            </button>
            <view v-else-if="proofVerified" class="muted">付款已核销完成，无需再次提交。</view>
            <view v-else class="muted">核验中，暂无需再次提交。</view>

            <view v-if="!manualSupported" class="notice warn">{{ manualTodoText }}</view>

            <view v-if="manualFormVisible" class="proof-form">
              <view class="field">
                <text class="muted">收款账户</text>
                <picker
                  mode="selector"
                  :range="accountLabels"
                  :value="accountIndex"
                  @change="onAccountChange"
                >
                  <view class="picker">{{ accountLabels[accountIndex] || '请选择收款账户' }}</view>
                </picker>
              </view>
              <view class="field">
                <text class="muted">转账流水号</text>
                <input
                  v-model="proofForm.transaction_no"
                  class="input"
                  maxlength="128"
                  placeholder="如：微信转账单号 / 银行流水号"
                />
              </view>
              <view class="field">
                <text class="muted">实付金额（元）</text>
                <input
                  v-model="proofForm.amount_yuan"
                  class="input"
                  type="digit"
                  :placeholder="(amountCents / 100).toFixed(2)"
                />
              </view>
              <view class="field">
                <text class="muted">付款凭证截图</text>
                <view class="upload" @click="chooseProofImage">
                  {{ uploading ? '上传中…' : proofForm.attachment_id ? '已上传，点击重新上传' : '点击上传转账 / 扫码截图' }}
                </view>
              </view>
              <view v-if="resubmitMode" class="muted">
                补交同一笔转账请保持流水号不变；如为新的转账，请填写新的流水号并上传对应截图。
              </view>
              <view class="actions">
                <button class="primary" :loading="submitting" @click="submitManualProof">
                  提交付款凭证
                </button>
                <button class="ghost" @click="closeProofForm">取消</button>
              </view>
            </view>
          </view>
          <view v-else class="muted">当前业务暂未配置商家收款账户，请联系客服确认收款方式。</view>
        </view>
      </template>

      <view v-if="paid" class="card pay-ok">
        <view class="pay-ok-title">支付成功</view>
        <view class="muted">业务状态已更新，可返回业务页面查看。</view>
      </view>
    </template>
  </view>
</template>

<script setup lang="ts">
  import { onHide, onLoad, onShow, onUnload } from '@dcloudio/uni-app';
  import { computed, reactive, ref } from 'vue';
  import {
    createCheckout,
    createCheckoutAttempt,
    fetchCheckoutStatus,
    fetchMyGiftIntents,
    fetchMyOrder,
    fetchPaymentMethodsContext,
    fetchPaymentProofs,
    fetchPublicCheckout,
    submitPaymentProof,
  } from '../../api/esports';
  import type {
    CheckoutAttempt,
    CheckoutBusinessType,
    CheckoutStatus,
    CheckoutView,
    PayChannel,
    PaymentAccount,
    PaymentMethod,
    PaymentProof,
    PublicCheckoutView,
  } from '../../api/esports';
  import { pageImageUrl } from '../../api/request';
  import { uploadAttachment } from '../../api/upload';
  import { datetime, money, yuanToCents } from '../../utils/format';
  import {
    checkoutBusinessText,
    checkoutScanUrl,
    checkoutStatusText,
    copyText,
    isExpired,
    openPayUrl,
    payChannelText,
    remainingText,
    renderQrDataUrl,
  } from '../../utils/pay';

  const businessType = ref<CheckoutBusinessType>('order');
  const businessId = ref(0);
  const typeValid = ref(true);
  const loading = ref(true);
  const submitting = ref(false);
  const payingChannel = ref<PayChannel | ''>('');
  const now = ref(Date.now());

  const checkout = ref<CheckoutView | null>(null);
  const publicCheckout = ref<PublicCheckoutView | null>(null);
  const checkoutStatus = ref<CheckoutStatus>('open');
  const paid = ref(false);
  const aggregateUnavailable = ref(false);
  const onlineError = ref('');

  const entryLink = ref('');
  const entryQr = ref('');

  const businessNo = ref('');
  const businessAmountCents = ref(0);
  const businessExpiresAt = ref('');

  const paymentMethods = ref<PaymentMethod[]>([]);
  const proofs = ref<PaymentProof[]>([]);

  const activeAttempt = ref<CheckoutAttempt | null>(null);
  const attemptQr = ref('');
  const attemptPayload = ref('');
  const attemptChannel = ref<PayChannel | ''>('');

  const manualFormVisible = ref(false);
  const accountIndex = ref(0);
  const resubmitMode = ref(false);
  const uploading = ref(false);
  const proofForm = reactive({
    transaction_no: '',
    amount_yuan: '',
    attachment_id: 0,
  });

  let pollTimer: ReturnType<typeof setInterval> | null = null;
  let tickTimer: ReturnType<typeof setInterval> | null = null;
  let backTimer: ReturnType<typeof setTimeout> | null = null;

  const businessTypeValid = computed(
    () => typeValid.value && businessId.value > 0
  );
  const bizText = computed(() => checkoutBusinessText(businessType.value));
  const statusText = computed(() => checkoutStatusText(checkoutStatus.value));
  const statusClass = computed(() => ({
    paid: paid.value,
    danger:
      !paid.value &&
      (checkoutStatus.value === 'expired' ||
        checkoutStatus.value === 'cancelled' ||
        expired.value),
  }));
  const businessLabel = computed(() =>
    businessType.value === 'order'
      ? '订单号'
      : businessType.value === 'gift'
        ? '礼物明细'
        : '充值单号'
  );

  const amountCents = computed(
    () =>
      checkout.value?.amount_cents ||
      publicCheckout.value?.amount_cents ||
      businessAmountCents.value ||
      0
  );
  const expiresAt = computed(
    () =>
      checkout.value?.business_expires_at ||
      publicCheckout.value?.business_expires_at ||
      businessExpiresAt.value ||
      ''
  );
  const remaining = computed(() => remainingText(expiresAt.value, now.value));
  const expired = computed(() => isExpired(expiresAt.value, now.value));
  const entryToken = computed(() => checkout.value?.entry_token || '');

  const terminalNotice = computed(() => {
    if (paid.value || checkoutStatus.value === 'paid') return '';
    if (checkoutStatus.value === 'expired' || expired.value) {
      return '该笔付款已超过业务时限，请返回业务页面重新发起。';
    }
    if (checkoutStatus.value === 'cancelled') {
      return '该笔付款已取消，请返回业务页面重新发起。';
    }
    return '';
  });

  const externalMethods = computed(() =>
    paymentMethods.value.filter(
      (method) => method.kind === 'external' && method.enabled
    )
  );
  const accountOptions = computed(() =>
    externalMethods.value.flatMap((method) =>
      (method.accounts || []).map((account) => ({
        method,
        account,
        label: `${method.name} · ${account.subject_name}${
          account.account_no ? ` · ${account.account_no}` : ''
        }`,
      }))
    )
  );
  const accountLabels = computed(() => accountOptions.value.map((item) => item.label));

  const latestProof = computed(() => proofs.value[0] || null);
  const proofPending = computed(
    () => latestProof.value?.status === 'pending_verification'
  );
  const proofVerified = computed(() => latestProof.value?.status === 'verified');
  const proofStatusText = computed(() => {
    if (!latestProof.value) return '';
    switch (latestProof.value.status) {
      case 'verified':
        return '已核销，付款已完成';
      case 'rejected':
        return '凭证被驳回，请重新提交';
      default:
        return '已提交，待财务核验到账';
    }
  });

  // 礼物 / 充值的固定码凭证接口尚未在后端提供，仅订单支持直接提交。
  const manualSupported = computed(() => businessType.value === 'order');
  const manualTodoText = computed(() =>
    businessType.value === 'gift'
      ? '礼物固定码凭证提交接口待后端提供（TODO）；请先使用在线支付或联系客服核验。'
      : '充值固定码凭证提交接口待后端提供（TODO：/user/recharge-intents/:intentNo/payment-proof）；请先使用在线支付或沿用充值页转账指引。'
  );

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

  const onlineDisabled = computed(
    () =>
      paid.value ||
      proofPending.value ||
      proofVerified.value ||
      aggregateUnavailable.value ||
      !entryToken.value
  );
  const channelHint = computed(() => {
    if (!publicCheckout.value) return '';
    const channels = publicCheckout.value.channels;
    if (!channels.wechat && !channels.alipay) {
      return '当前无可用在线收款渠道，请使用下方商家码付款。';
    }
    if (!channels.wechat) return '微信支付暂未开通，请使用支付宝或商家码。';
    if (!channels.alipay) return '支付宝暂未开通，请使用微信或商家码。';
    return '';
  });

  function startTick() {
    stopTick();
    tickTimer = setInterval(() => {
      now.value = Date.now();
    }, 1000);
  }

  function stopTick() {
    if (tickTimer) {
      clearInterval(tickTimer);
      tickTimer = null;
    }
  }

  function startPolling() {
    stopPolling();
    if (!entryToken.value || paid.value || checkoutStatus.value !== 'open') return;
    pollTimer = setInterval(checkStatus, 3000);
  }

  function stopPolling() {
    if (pollTimer) {
      clearInterval(pollTimer);
      pollTimer = null;
    }
  }

  async function checkStatus() {
    if (!entryToken.value || paid.value) return;
    try {
      const view = await fetchCheckoutStatus(entryToken.value);
      if (view.paid) {
        handlePaid(true);
        return;
      }
      if (view.status && view.status !== checkoutStatus.value) {
        checkoutStatus.value = view.status;
        if (checkout.value) checkout.value = { ...checkout.value, status: view.status };
        if (view.status !== 'open') stopPolling();
      }
      // 人工凭证核验中：随轮询刷新进度，财务核销/驳回后页面即时反映。
      if (proofPending.value) void loadProofs();
    } catch {
      // 网络抖动静默重试，等待中的用户不需要 toast。
    }
  }

  function handlePaid(notify: boolean) {
    if (paid.value) return;
    paid.value = true;
    checkoutStatus.value = 'paid';
    stopPolling();
    if (checkout.value) checkout.value = { ...checkout.value, status: 'paid' };
    if (!notify) return;
    uni.showToast({ title: '支付成功', icon: 'success' });
    if (backTimer) clearTimeout(backTimer);
    backTimer = setTimeout(() => {
      const pages = getCurrentPages();
      if (pages.length > 1) {
        uni.navigateBack();
      } else {
        uni.reLaunch({ url: '/pages/order/list' });
      }
    }, 1200);
  }

  /** 业务摘要：订单取订单号与应付，礼物取礼物明细；充值只有业务 ID。 */
  async function loadBusinessSummary() {
    businessNo.value = `#${businessId.value}`;
    if (businessType.value === 'order') {
      try {
        const order = await fetchMyOrder(businessId.value);
        businessNo.value = order.order_no;
        businessAmountCents.value = order.payable_cents;
        businessExpiresAt.value = order.payment_deadline || '';
      } catch {
        // 收银台金额仍以 checkouts 返回为准。
      }
      return;
    }
    if (businessType.value === 'gift') {
      try {
        const intents = (await fetchMyGiftIntents()) || [];
        const intent = intents.find((item) => item.id === businessId.value);
        if (intent) {
          businessNo.value = `${intent.gift_name} × ${intent.quantity}`;
          businessAmountCents.value = intent.amount_cents;
          businessExpiresAt.value = intent.expires_at || '';
        }
      } catch {
        // 摘要失败不影响收款。
      }
    }
  }

  async function loadPaymentMethods() {
    try {
      const ctx = await fetchPaymentMethodsContext({
        business_type: businessType.value,
        business_id: businessId.value,
      });
      paymentMethods.value = ctx?.manual_methods || [];
      // 动态聚合可用性以后端判断为准（服务商未配置时提示走商家码）。
      aggregateUnavailable.value = !ctx?.aggregate?.available;
      if (accountOptions.value.length) setDefaultProofAmount();
    } catch {
      paymentMethods.value = [];
    }
  }

  async function loadProofs() {
    if (businessType.value !== 'order') {
      proofs.value = [];
      return;
    }
    try {
      proofs.value = (await fetchPaymentProofs(businessId.value)) || [];
    } catch {
      proofs.value = [];
    }
  }

  async function loadPublicCheckout() {
    if (!entryToken.value) return;
    try {
      const view = await fetchPublicCheckout(entryToken.value);
      publicCheckout.value = view;
      if (view.status === 'paid') {
        handlePaid(false);
        return;
      }
      if (view.status && view.status !== checkoutStatus.value) {
        checkoutStatus.value = view.status;
      }
      if (!view.channels?.wechat && !view.channels?.alipay) {
        aggregateUnavailable.value = true;
      }
    } catch {
      // 渠道信息缺失时仍允许尝试发起支付，失败后再提示商家码。
    }
  }

  async function createCheckoutForBusiness() {
    try {
      const view = await createCheckout({
        business_type: businessType.value,
        business_id: businessId.value,
        mode: 'aggregate',
      });
      checkout.value = view;
      checkoutStatus.value = view.status;
      entryLink.value = checkoutScanUrl(view.entry_token);
      entryQr.value = await renderQrDataUrl(entryLink.value);
      if (view.status === 'paid') {
        handlePaid(false);
        await loadPublicCheckout();
        return;
      }
      await loadPublicCheckout();
      startPolling();
    } catch (error) {
      // 聚合单创建失败（如在线收款未开通）：保留固定码兜底路径。
      aggregateUnavailable.value = true;
      onlineError.value =
        (error as Error)?.message || '在线收款暂不可用，请使用下方商家码付款。';
    }
  }

  async function bootstrap() {
    loading.value = true;
    try {
      await Promise.all([loadBusinessSummary(), loadPaymentMethods(), loadProofs()]);
      await createCheckoutForBusiness();
    } finally {
      loading.value = false;
    }
  }

  function setDefaultProofAmount() {
    if (!proofForm.amount_yuan && amountCents.value > 0) {
      proofForm.amount_yuan = (amountCents.value / 100).toFixed(2);
    }
  }

  function onAccountChange(event: { detail: { value: number | string } }) {
    accountIndex.value = Number(event.detail.value);
  }

  function previewAccountQr(account: PaymentAccount) {
    if (!account.qr_url) return;
    const url = pageImageUrl(account.qr_url);
    if (!url) return;
    uni.previewImage({ urls: [url], current: url });
  }

  function openProofForm() {
    if (proofPending.value || proofVerified.value) {
      uni.showToast({ title: '付款已提交或核销，无需重复提交', icon: 'none' });
      return;
    }
    if (dynamicPending.value) {
      uni.showToast({
        title: '当前在线支付尚未完成，请先完成或等待超时',
        icon: 'none',
      });
      return;
    }
    if (!manualSupported.value) {
      uni.showToast({ title: manualTodoText.value, icon: 'none' });
      return;
    }
    if (!accountOptions.value.length) {
      uni.showToast({ title: '暂未配置可用的收款账户', icon: 'none' });
      return;
    }
    manualFormVisible.value = true;
    resubmitMode.value = false;
    const latest = latestProof.value;
    if (latest?.status === 'rejected') {
      resubmitMode.value = true;
      proofForm.transaction_no = latest.transaction_no;
      proofForm.amount_yuan = (latest.amount_cents / 100).toFixed(2);
      proofForm.attachment_id = 0;
      const index = accountOptions.value.findIndex(
        (option) => option.method.channel === latest.channel
      );
      if (index >= 0) accountIndex.value = index;
      return;
    }
    setDefaultProofAmount();
  }

  function closeProofForm() {
    manualFormVisible.value = false;
    resubmitMode.value = false;
  }

  function chooseProofImage() {
    if (uploading.value) return;
    uni.chooseImage({
      count: 1,
      sizeType: ['compressed'],
      success: async (res) => {
        const filePath = res.tempFilePaths?.[0];
        if (!filePath) return;
        uploading.value = true;
        try {
          proofForm.attachment_id = await uploadAttachment(
            filePath,
            'private/esports/payment-proof'
          );
        } catch {
          // uploadAttachment 已 toast 错误。
        } finally {
          uploading.value = false;
        }
      },
      fail: () => {
        // 用户取消选择。
      },
    });
  }

  function proofAmountCents(): number {
    const text = proofForm.amount_yuan.trim();
    if (!/^\d+(\.\d{1,2})?$/.test(text)) return 0;
    try {
      return yuanToCents(text);
    } catch {
      return 0;
    }
  }

  async function submitManualProof() {
    if (!manualSupported.value) {
      uni.showToast({ title: manualTodoText.value, icon: 'none' });
      return;
    }
    if (dynamicPending.value) {
      uni.showToast({
        title: '当前在线支付尚未完成，请先完成或等待超时',
        icon: 'none',
      });
      return;
    }
    const option = accountOptions.value[accountIndex.value];
    if (!option) {
      uni.showToast({ title: '请选择收款账户', icon: 'none' });
      return;
    }
    const transactionNo = proofForm.transaction_no.trim();
    if (!transactionNo) {
      uni.showToast({ title: '请填写转账流水号', icon: 'none' });
      return;
    }
    const amount = proofAmountCents();
    if (amount <= 0) {
      uni.showToast({ title: '请填写正确的实付金额', icon: 'none' });
      return;
    }
    if (!proofForm.attachment_id) {
      uni.showToast({ title: '请上传付款凭证截图', icon: 'none' });
      return;
    }
    submitting.value = true;
    try {
      await submitPaymentProof(businessId.value, {
        account_id: option.account.id,
        transaction_no: transactionNo,
        amount_cents: amount,
        note: resubmitMode.value ? '收银台补交付款凭证' : '收银台提交付款凭证',
        evidence_attachment_ids: [proofForm.attachment_id],
      });
      uni.showToast({ title: '凭证已提交，待财务核验', icon: 'none' });
      manualFormVisible.value = false;
      resubmitMode.value = false;
      proofForm.transaction_no = '';
      proofForm.amount_yuan = '';
      proofForm.attachment_id = 0;
      await loadProofs();
    } catch {
      // request 层已提示（账户不可用 / 流水号重复等）。
    } finally {
      submitting.value = false;
    }
  }

  function clearAttempt() {
    activeAttempt.value = null;
    attemptQr.value = '';
    attemptPayload.value = '';
    attemptChannel.value = '';
  }

  async function payOnline(channel: PayChannel) {
    if (onlineDisabled.value) {
      if (proofPending.value || proofVerified.value) {
        uni.showToast({ title: '凭证已提交或核销，暂不可再次发起支付', icon: 'none' });
      } else if (aggregateUnavailable.value) {
        uni.showToast({ title: '在线收款暂未开通，请使用商家码付款', icon: 'none' });
      }
      return;
    }
    if (dynamicPending.value) {
      uni.showToast({
        title: '当前支付尚未完成，请先完成或等待超时',
        icon: 'none',
      });
      return;
    }
    // 上一笔支付已超时：先清掉旧二维码，再发起新支付。
    if (activeAttempt.value) clearAttempt();
    if (manualFormVisible.value) {
      uni.showToast({
        title: '正在填写商家码付款凭证，请先提交或取消',
        icon: 'none',
      });
      return;
    }
    const token = entryToken.value;
    if (!token) {
      uni.showToast({ title: '在线收款暂不可用，请使用下方商家码付款', icon: 'none' });
      return;
    }
    const channels = publicCheckout.value?.channels;
    if (channels && !channels[channel]) {
      uni.showToast({ title: `${payChannelText(channel)}暂未开通`, icon: 'none' });
      return;
    }
    submitting.value = true;
    payingChannel.value = channel;
    onlineError.value = '';
    try {
      const attempt = await createCheckoutAttempt(token, channel);
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
    } catch (error) {
      const message = (error as Error)?.message || '';
      onlineError.value = message
        ? `${message}。可改用下方商家码付款。`
        : '在线收款暂不可用，请使用下方商家码付款。';
      if (/503|未开通|不可用|未配置|未启用/.test(message)) {
        aggregateUnavailable.value = true;
      }
    } finally {
      submitting.value = false;
      payingChannel.value = '';
    }
  }

  onLoad((query) => {
    const rawType = String(query?.businessType || '');
    if (rawType === 'order' || rawType === 'recharge' || rawType === 'gift') {
      businessType.value = rawType;
    } else {
      typeValid.value = false;
    }
    businessId.value = Number(query?.businessId || 0);
    const rawNo = String(query?.businessNo || '').trim();
    if (rawNo) {
      businessNo.value = rawNo;
      businessExpiresAt.value = '';
    }
    // 充值等暂时取不到明细的业务，允许入口页透传应付金额仅用于展示兜底。
    const rawAmount = Number(query?.amountCents || 0);
    if (Number.isFinite(rawAmount) && rawAmount > 0) {
      businessAmountCents.value = rawAmount;
    }
    if (!businessTypeValid.value) {
      loading.value = false;
      return;
    }
    startTick();
    void bootstrap();
  });

  onShow(() => {
    startTick();
    if (!businessTypeValid.value) return;
    // 从服务商收银台 webview 返回时立即补查一次，再恢复 3 秒轮询。
    if (entryToken.value && !paid.value) void checkStatus();
    startPolling();
  });

  onHide(() => {
    stopTick();
    stopPolling();
  });

  onUnload(() => {
    stopTick();
    stopPolling();
    if (backTimer) {
      clearTimeout(backTimer);
      backTimer = null;
    }
  });
</script>

<style scoped lang="scss">
  .biz-type {
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
    color: $danger;
    font-size: 40rpx;
    font-weight: 700;
  }

  .danger {
    color: $danger;
  }

  .mono {
    font-family: monospace;
  }

  .section-title {
    font-size: 30rpx;
    font-weight: 600;
    margin-bottom: 12rpx;
  }

  .section-title.sub {
    margin-top: 20rpx;
    font-size: 28rpx;
  }

  .actions {
    display: flex;
    gap: 16rpx;
    margin: 20rpx 0 12rpx;
  }

  .primary {
    flex: 1;
    background: $brand;
    color: #fff;
    border-radius: $radius;
  }

  .primary.alipay {
    background: #1677ff;
  }

  .ghost {
    flex: 1;
    background: $bg;
    color: $text-1;
    border-radius: $radius;
  }

  .ghost.mini {
    flex: 0;
    padding: 0 24rpx;
    font-size: 24rpx;
    line-height: 56rpx;
  }

  .field {
    margin-top: 20rpx;
  }

  .input,
  .picker {
    margin-top: 8rpx;
    padding: 16rpx 20rpx;
    background: $bg;
    border-radius: $radius;
  }

  .upload {
    margin-top: 8rpx;
    padding: 24rpx 20rpx;
    background: $bg;
    border: 1rpx dashed $border;
    border-radius: $radius;
    color: $brand;
    text-align: center;
  }

  .qr-wrap {
    display: flex;
    justify-content: center;
    margin: 20rpx 0;
  }

  .qr {
    width: 360rpx;
    height: 360rpx;
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
    margin-top: 24rpx;
    padding-top: 20rpx;
    border-top: 1rpx solid $border;
    text-align: center;
  }

  .account {
    padding: 20rpx 0;
    border-bottom: 1rpx solid $border;
  }

  .account-qr {
    width: 320rpx;
    height: 320rpx;
    margin: 16rpx auto 0;
    display: block;
    background: #fff;
    border: 1rpx solid $border;
    border-radius: $radius;
  }

  .account-no {
    color: $text-1;
  }

  .pay-name {
    font-weight: 600;
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

  .proof-form {
    margin-top: 8rpx;
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
