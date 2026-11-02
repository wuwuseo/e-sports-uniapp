<template>
  <view v-if="order">
    <view class="card">
      <view class="row">
        <text class="order-no">{{ order.order_no }}</text>
        <text class="status">{{ fulfillmentText(order.fulfillment_status) }}</text>
      </view>
      <view class="row">
        <text class="muted">报单金额</text>
        <text>{{ money(order.payable_cents) }}</text>
      </view>
      <view class="row">
        <text class="muted">会员折扣</text>
        <text>-{{ money(order.discount_cents) }}</text>
      </view>
      <view v-if="order.manual_adjust_cents" class="row">
        <text class="muted">客服改价</text>
        <text>{{ money(order.manual_adjust_cents) }}</text>
      </view>
      <view class="row">
        <text class="muted">付款状态</text>
        <text>{{ order.payment_status }}</text>
      </view>
      <view v-if="order.refunded_cents" class="row">
        <text class="muted">已退款</text>
        <text>{{ money(order.refunded_cents) }}</text>
      </view>
      <view class="row">
        <text class="muted">支付时限</text>
        <text>{{ datetime(order.payment_deadline) }}</text>
      </view>
	  <button
	    v-if="order.fulfillment_status === 'pending_payment' && order.payment_status === 'unpaid'"
	    class="ghost" :loading="submitting" @click="cancelUnpaid"
	  >取消未付款订单</button>
    </view>

    <!-- 抢单后待客户确认：确认即转已接单，更换则释放回抢单大厅。 -->
    <view v-if="order.fulfillment_status === 'pending_customer_confirm'" class="card">
      <view class="section-title">陪玩已抢单，等待你确认</view>
      <view v-if="members.length" class="muted">
        本次陪玩：{{ members.map((item) => item.display_name).join('、') }}
      </view>
      <view v-else class="muted">正在读取陪玩信息…</view>
      <view class="muted">
        请确认是否由该陪玩服务；超过 {{ datetime(order.customer_confirm_deadline) }} 未确认将自动确认。
      </view>
      <view class="actions">
        <button class="primary" :loading="submitting" @click="confirmPlayer">确认这位陪玩</button>
        <button class="ghost" :loading="submitting" @click="changePlayer">更换陪玩</button>
      </view>
      <view class="muted">更换后订单会重新放回抢单大厅，由其他陪玩接单。</view>
    </view>

    <view v-if="order.fulfillment_status === 'pending_payment'" class="card">
      <view class="section-title">去付款</view>
      <view class="muted">应付 {{ money(order.payable_cents) }} · 支付时限 {{ datetime(order.payment_deadline) }}</view>
      <!-- 报价确认门禁：未确认报价前不展示收款方式、收款账户与付款表单。 -->
      <view v-if="!quoteConfirmed" class="muted pay-locked">
        请先在上方确认报价，确认后再选择付款方式（收款账户在确认报价后展示）
      </view>

      <template v-else>
        <view v-if="latestProof && latestProof.status !== 'rejected'" class="pay-wait">
          <view class="pay-wait-title">{{ proofStatusText }}</view>
          <view class="muted">{{ latestProof.channel }} · 流水号 {{ latestProof.transaction_no }}</view>
          <view v-if="latestProof.resolution" class="muted">说明：{{ latestProof.resolution }}</view>
        </view>
        <view v-else-if="latestProof" class="pay-wait">
          <view class="pay-wait-title">{{ proofStatusText }}</view>
          <view class="muted">{{ latestProof.channel }} · 流水号 {{ latestProof.transaction_no }}</view>
          <view v-if="latestProof.resolution" class="muted">说明：{{ latestProof.resolution }}</view>
          <view class="muted">请在收银台重新提交清晰的付款凭证。</view>
        </view>

        <view class="actions">
          <button class="primary" @click="openCashier">聚合收款</button>
        </view>
        <view class="muted">
          聚合收款支持微信 / 支付宝在线支付与商家码人工核验；付款凭证统一在收银台提交。
        </view>

        <!-- 服务商在线支付：保留原有 pay_url 收银台链路，服务商配好后可用。 -->
        <view v-if="externalMethods.length && !proofPending" class="pay-online">
          <view class="pay-name">在线支付（服务商）</view>
          <view v-for="m in externalMethods" :key="m.channel" class="pay-method">
            <view>
              <text class="pay-name">{{ m.name }}</text>
              <text class="pay-hint">{{ accountHint(m) }}</text>
            </view>
            <button class="mini" :loading="submitting" @click="payOnline(m)">在线支付</button>
          </view>
        </view>

        <!-- 站内付款：余额足额核销，不走上传凭证链路。
             已有待核验凭证时隐藏，避免「转账凭证待核验 + 再扣一次余额」造成重复付款。 -->
        <view v-if="internalMethods.length && !proofPending" class="pay-internal">
          <view class="pay-name">站内付款</view>
          <view class="muted">用余额直接核销，成功后订单即时转为已付款。</view>
          <view class="actions">
            <button v-if="hasBalanceMethod" class="primary" :loading="submitting" @click="payByBalance">
              余额支付
            </button>
          </view>
        </view>
      </template>
    </view>

    <view class="card">
      <view class="section-title">报价确认</view>
      <view v-if="quote" class="muted">
        当前报价版本 v{{ quote.quote_version }} · 应付 {{ money(quote.payable_cents) }} ·
        {{ quote.confirmed ? '已确认' : '待确认' }}
      </view>
      <view v-else class="muted">正在读取报价…</view>
      <view class="actions">
        <button class="primary" :disabled="!canConfirm" @click="confirm(true)">
          确认报价
        </button>
        <button class="ghost" :disabled="!canConfirm" @click="confirm(false)">
          拒绝 / 需改单
        </button>
      </view>
      <view class="muted">确认会保存你看到的报价版本；报价已更新时请刷新后再确认。</view>
    </view>

    <!-- 待确认改期：客服发起提案后，客户与每名已接单成员各自确认才生效 -->
    <view v-if="proposals.length > 0" class="card">
      <view class="section-title">改期提案</view>
      <view class="muted">
        已付款订单的改期由客服发起提案，需你与已接单陪玩各自确认后才生效；拒绝即终结本次提案，订单保持原档期。
      </view>
      <view v-for="item in proposals" :key="item.proposal_id" class="proposal">
        <view class="row">
          <text class="proposal-no">{{ item.proposal_no }}</text>
          <text :class="item.status === 'pending' ? 'waiting' : 'muted'">
            {{ proposalStatusText(item.status) }}
          </text>
        </view>
        <view class="muted">
          原档期 {{ datetime(item.from_start_at) }} → 新档期 {{ datetime(item.to_start_at) }}
          （{{ item.to_service_duration_minutes }} 分钟）
        </view>
        <view v-if="item.status === 'pending'" class="muted">
          确认截止 {{ datetime(item.expires_at) }}
        </view>
        <view v-if="item.reason" class="muted">客服说明：{{ item.reason }}</view>
        <view class="muted">
          确认进度 {{ item.progress.confirmed_count }}/{{ item.progress.required_count }}
          <text v-if="item.progress.rejected_count">· 已拒绝 {{ item.progress.rejected_count }}</text>
          <text v-if="item.progress.complete">· 已齐备待生效</text>
        </view>
        <view v-if="item.my_decision !== 'pending'" class="muted">
          我的表态：{{ item.my_decision === 'confirmed' ? '已接受' : '已拒绝' }}
        </view>
        <view v-else-if="item.status === 'pending'" class="actions">
          <button class="primary" :loading="submitting" @click="decideReschedule(item, true)">
            接受改期
          </button>
          <button class="ghost" :loading="submitting" @click="decideReschedule(item, false)">
            拒绝改期
          </button>
        </view>
      </view>
      <view class="muted">提案有时限，超时后自动失效，可请客服重新发起。</view>
    </view>

    <view class="card">
      <view class="section-title">需要帮助？</view>
      <view class="actions">
        <button class="ghost" @click="openAfterSale">发起售后</button>
        <button
          v-if="order.fulfillment_status === 'completed' && members.length > 0"
          class="ghost"
          @click="reviewVisible = true"
        >
          服务评价
        </button>
      </view>
      <view class="muted">
        售后进度可在「我的 → 我的售后」查看；赔付与退款一律走系统流程，请勿私下转账。
      </view>
    </view>

    <view v-if="reviewVisible" class="card">
      <view class="section-title">服务评价</view>
      <view class="field">
        <text class="muted">选择陪玩</text>
        <picker
          :range="memberLabels"
          :value="reviewForm.memberIndex"
          @change="onMemberChange"
        >
          <view class="picker">{{ memberLabels[reviewForm.memberIndex] }}</view>
        </picker>
      </view>
      <view class="field">
        <text class="muted">评分</text>
        <view class="rating">
          <text
            v-for="star in 5"
            :key="star"
            class="star"
            :class="{ on: star <= reviewForm.rating }"
            @click="reviewForm.rating = star"
            >★</text
          >
        </view>
      </view>
      <view class="field">
        <text class="muted">评价内容</text>
        <textarea
          v-model="reviewForm.comment"
          class="textarea"
          maxlength="500"
          placeholder="说说本次服务体验（选填）"
        />
      </view>
      <view class="actions">
        <button class="primary" :loading="submitting" @click="submitReview">
          提交评价
        </button>
        <button class="ghost" @click="reviewVisible = false">取消</button>
      </view>
    </view>

    <view v-if="afterSaleVisible" class="card">
      <view class="section-title">发起售后</view>
      <view class="field">
        <text class="muted">类型</text>
        <picker :range="kindLabels" :value="kindIndex" @change="onKindChange">
          <view class="picker">{{ kindLabels[kindIndex] }}</view>
        </picker>
      </view>
      <view class="field">
        <text class="muted">诉求描述</text>
        <textarea
          v-model="afterSaleForm.demand"
          class="textarea"
          maxlength="500"
          placeholder="请描述具体问题，如时长不足、服务不符等"
        />
      </view>
      <view class="field">
        <text class="muted">期望方案</text>
        <input
          v-model="afterSaleForm.expected_plan"
          class="input"
          maxlength="255"
          placeholder="如：按差额退款"
        />
      </view>
      <view class="field">
        <text class="muted">联系方式</text>
        <input
          v-model="afterSaleForm.contact"
          class="input"
          maxlength="120"
          placeholder="微信号 / 手机号（选填）"
        />
      </view>
      <view class="field">
        <text class="muted">凭证附件</text>
        <view class="upload" @click="addAfterSaleEvidence">
          {{ afterSaleUploading ? '上传中…' : '点击上传截图 / PDF 凭证（选填）' }}
        </view>
        <view v-for="(id, index) in afterSaleEvidence" :key="index" class="muted">
          已上传凭证附件 #{{ id }}
        </view>
      </view>
      <view class="actions">
        <button class="primary" :loading="submitting" @click="submitAfterSale">
          提交售后
        </button>
        <button class="ghost" @click="afterSaleVisible = false">取消</button>
      </view>
    </view>
  </view>
  <view v-else class="empty">加载中…</view>
</template>

<script setup lang="ts">
  import { onLoad, onShow, onUnload } from '@dcloudio/uni-app';
  import { computed, reactive, ref } from 'vue';
  import {
	  cancelUnpaidOrder,
    confirmGrabbedPlayer,
    confirmOrderQuote,
    confirmRescheduleProposal,
    createAfterSale,
    declineGrabbedPlayer,
    fetchMyOrder,
    fetchMyRescheduleProposals,
    fetchOrderMembers,
    fetchOrderQuote,
    fetchPaymentMethods,
    fetchPaymentProofs,
    payOrderByBalance,
    startOrderPayment,
    submitOrderReview,
  } from '../../api/esports';
  import type {
    MyRescheduleProposal,
    Order,
    OrderMember,
    OrderQuote,
    PaymentMethod,
    PaymentProof,
  } from '../../api/esports';
  import { pickEvidenceAttachments } from '../../utils/evidence';
  import { datetime, fulfillmentText, money } from '../../utils/format';

  const orderId = ref(0);
  const order = ref<Order | null>(null);
  const quote = ref<OrderQuote | null>(null);
  const submitting = ref(false);
  const afterSaleVisible = ref(false);
  const members = ref<OrderMember[]>([]);
  const reviewVisible = ref(false);
  const reviewForm = reactive({ memberIndex: 0, rating: 5, comment: '' });

  // 支付方式：读取后台启用的收款方式与财务审核通过的收款账户。
  const paymentMethods = ref<PaymentMethod[]>([]);
  const proofs = ref<PaymentProof[]>([]);
  let pollTimer: ReturnType<typeof setInterval> | null = null;

  /** 报价确认门禁：未确认报价不展示收款账户与付款表单。 */
  const quoteConfirmed = computed(() => quote.value?.confirmed === true);
  const externalMethods = computed(() =>
    paymentMethods.value.filter((method) => method.kind === 'external' && method.enabled)
  );
  /** 站内付款方式（余额）：同样受后台启停约束。 */
  const internalMethods = computed(() =>
    paymentMethods.value.filter((method) => method.kind === 'internal' && method.enabled)
  );
  const hasBalanceMethod = computed(() =>
    internalMethods.value.some((method) => method.channel === 'customer_balance')
  );
  const latestProof = computed(() => proofs.value[0] || null);
  /** 已有待核验凭证：此时不再展示站内付款，避免转账凭证核验通过前被重复扣款。 */
  const proofPending = computed(() => latestProof.value?.status === 'pending_verification');
  const proofStatusText = computed(() => {
    if (!latestProof.value) return '';
    switch (latestProof.value.status) {
      case 'verified':
        return '已核销，订单已付款';
      case 'rejected':
        return '凭证被驳回，请重新提交';
      default:
        return '已提交，待财务核验到账';
    }
  });
  const memberLabels = computed(() =>
    members.value.map(
      (member) =>
        `${member.display_name || `陪玩 ${member.player_id}`}${
          member.reviewed ? '（已评价）' : ''
        }`
    )
  );

  const kinds = [
    { label: '时长 / 局数不足', value: 'duration_short' },
    { label: '服务不符', value: 'service_mismatch' },
    { label: '放鸽子 / 未服务', value: 'no_show' },
    { label: '货不对板', value: 'wrong_item' },
    { label: '多收 / 错收', value: 'overcharge' },
    { label: '退款申请', value: 'refund_request' },
    { label: '其他', value: 'other' },
  ];
  const kindLabels = kinds.map((item) => item.label);
  const kindIndex = ref(0);
  const afterSaleForm = reactive({ demand: '', expected_plan: '', contact: '' });
  const afterSaleEvidence = ref<number[]>([]);
  const afterSaleUploading = ref(false);

  // 报价确认只在待付款阶段有意义。
  const canConfirm = computed(
    () =>
      !!quote.value &&
      !quote.value.confirmed &&
      order.value?.fulfillment_status === 'pending_payment'
  );

  // 改期提案列表：服务端返回本人可见提案，待确认优先、其后为历史。
  const proposals = ref<MyRescheduleProposal[]>([]);

  async function decideReschedule(item: MyRescheduleProposal, accept: boolean) {
    submitting.value = true;
    try {
      await confirmRescheduleProposal(item.proposal_id, accept);
      uni.showToast({ title: accept ? '已接受改期' : '已拒绝改期', icon: 'none' });
      await load();
    } catch {
      // request 层已提示（提案已终结 / 目标档期不可用等）。
    } finally {
      submitting.value = false;
    }
  }

  const proposalStatusText = (status: string) =>
    (
      {
        pending: '待确认',
        confirmed: '已生效',
        rejected: '已拒绝',
        expired: '已超时',
        withdrawn: '已撤回',
      } as Record<string, string>
    )[status] || status;

  async function load() {
    try {
      order.value = await fetchMyOrder(orderId.value);
    } catch {
      order.value = null;
      return;
    }
    try {
      quote.value = await fetchOrderQuote(orderId.value);
    } catch {
      quote.value = null;
    }
    members.value = [];
    // 已完成（评价用）与待客户确认（展示抢单陪玩）都需要成员姓名。
    if (
      order.value?.fulfillment_status === 'completed' ||
      order.value?.fulfillment_status === 'pending_customer_confirm'
    ) {
      try {
        members.value = (await fetchOrderMembers(orderId.value)) || [];
      } catch {
        members.value = [];
      }
    }
    try {
      paymentMethods.value = (await fetchPaymentMethods()) || [];
    } catch {
      paymentMethods.value = [];
    }
    // 改期提案：按本人可见范围取本单提案（待确认优先），空列表即不展示该卡片。
    try {
      proposals.value = (await fetchMyRescheduleProposals(orderId.value)) || [];
    } catch {
      proposals.value = [];
    }
    await refreshProofs();
  }

  // 客户确认抢单陪玩：确认后订单转已接单，等待陪玩开工。
  async function confirmPlayer() {
    submitting.value = true;
    try {
      await confirmGrabbedPlayer(orderId.value);
      uni.showToast({ title: '已确认陪玩', icon: 'success' });
      await load();
    } catch {
      // request 层已提示（订单已流转或已过确认时限）。
    } finally {
      submitting.value = false;
    }
  }

  // 客户更换陪玩：释放当前席位，订单重新放回抢单大厅。
  async function changePlayer() {
    submitting.value = true;
    try {
      await declineGrabbedPlayer(orderId.value);
      uni.showToast({ title: '已放回抢单大厅，重新匹配中', icon: 'none' });
      await load();
    } catch {
      // request 层已提示（订单已流转或已过确认时限）。
    } finally {
      submitting.value = false;
    }
  }

  async function refreshProofs() {
    try {
      proofs.value = (await fetchPaymentProofs(orderId.value)) || [];
    } catch {
      proofs.value = [];
    }
  }

  function accountHint(method: PaymentMethod): string {
    if (!method.accounts.length) return '暂无可用的收款账户';
    const first = method.accounts[0];
    return `${first.subject_name}${first.account_no ? ' · ' + first.account_no : ''}`;
  }

  /** 聚合收款收银台：在线支付与商家码付款凭证统一在收银台提交。 */
  function openCashier() {
    uni.navigateTo({
      url: `/pages/pay/cashier?businessType=order&businessId=${orderId.value}`,
    });
  }

  /** 在线收银台：只跳转后端下发的 http(s) 收银台地址；失败引导使用聚合收款页。 */
  async function payOnline(method: PaymentMethod) {
    if (submitting.value) return;
    submitting.value = true;
    try {
      const view = await startOrderPayment(orderId.value, method.channel);
      const payUrl = (view?.pay_url || '').trim();
      if (!/^https?:\/\//i.test(payUrl)) {
        uni.showToast({ title: '收银台地址无效，请改用聚合收款', icon: 'none' });
        return;
      }
      uni.navigateTo({ url: `/pages/webview/index?url=${encodeURIComponent(payUrl)}` });
    } catch {
      // 渠道未配置网关等失败由 request 层提示后端中文文案，聚合收款页不受影响。
    } finally {
      submitting.value = false;
    }
  }

  /** 余额核销：成功即完成付款，失败只提示后端返回的中文错误。 */
  async function payByBalance() {
    if (submitting.value) return;
    submitting.value = true;
    try {
      await payOrderByBalance(orderId.value);
      uni.showToast({ title: '余额核销成功，订单已付款', icon: 'success' });
      await refreshOrder();
      await refreshProofs();
    } catch {
      // request 层已提示（余额停用 / 余额不足 / 非本人订单）。
    } finally {
      submitting.value = false;
    }
  }

  async function confirm(accepted: boolean) {
    if (!quote.value) return;
    try {
      await confirmOrderQuote(orderId.value, quote.value.quote_version, accepted);
      uni.showToast({ title: accepted ? '已确认报价' : '已反馈需改单', icon: 'none' });
      await load();
    } catch {
      // request 层已提示（如报价版本已变化）。
    }
  }

  async function cancelUnpaid() {
    const confirmed = await new Promise<boolean>((resolve) => {
      uni.showModal({
        title: '取消订单', content: '确认取消这张未付款订单？',
        success: (result) => resolve(result.confirm), fail: () => resolve(false),
      });
    });
    if (!confirmed) return;
    submitting.value = true;
    try {
      await cancelUnpaidOrder(orderId.value);
      uni.showToast({ title: '订单已取消', icon: 'success' });
      await load();
    } catch {
      // request 层已提示。
    } finally {
      submitting.value = false;
    }
  }

  function openAfterSale() {
    afterSaleVisible.value = true;
  }

  function onKindChange(event: { detail: { value: number } }) {
    kindIndex.value = Number(event.detail.value);
  }

  /** 售后凭证：逐张上传为私有附件，成功后以附件 ID 随建单提交。 */
  async function addAfterSaleEvidence() {
    afterSaleUploading.value = true;
    try {
      const ids = await pickEvidenceAttachments();
      afterSaleEvidence.value.push(...ids);
    } finally {
      afterSaleUploading.value = false;
    }
  }

  async function submitAfterSale() {
    if (!afterSaleForm.demand.trim()) {
      uni.showToast({ title: '请填写诉求描述', icon: 'none' });
      return;
    }
    submitting.value = true;
    try {
      await createAfterSale({
        source_id: orderId.value,
        kind: kinds[kindIndex.value].value,
        demand: afterSaleForm.demand.trim(),
        expected_plan: afterSaleForm.expected_plan.trim(),
        contact: afterSaleForm.contact.trim(),
        evidence_attachment_ids: afterSaleEvidence.value.length
          ? afterSaleEvidence.value
          : undefined,
      });
      afterSaleVisible.value = false;
      afterSaleForm.demand = '';
      afterSaleForm.expected_plan = '';
      afterSaleForm.contact = '';
      afterSaleEvidence.value = [];
      uni.showToast({ title: '已提交，请等待客服受理', icon: 'none' });
    } catch {
      // request 层已提示（如同问题已有进行中售后）。
    } finally {
      submitting.value = false;
    }
  }

  function onMemberChange(event: { detail: { value: number } }) {
    reviewForm.memberIndex = Number(event.detail.value);
  }

  async function submitReview() {
    const member = members.value[reviewForm.memberIndex];
    if (!member) return;
    if (member.reviewed) {
      uni.showToast({ title: '该陪玩已评价', icon: 'none' });
      return;
    }
    submitting.value = true;
    try {
      await submitOrderReview(
        orderId.value,
        member.player_id,
        reviewForm.rating,
        reviewForm.comment.trim()
      );
      reviewVisible.value = false;
      reviewForm.comment = '';
      uni.showToast({ title: '评价已提交', icon: 'none' });
      await load();
    } catch {
      // request 层已提示。
    } finally {
      submitting.value = false;
    }
  }

  /** 轮询刷新订单状态：待付款时每 5 秒刷新，直到离开待付款或离开页面。 */
  async function refreshOrder() {
    try {
      order.value = await fetchMyOrder(orderId.value);
    } catch {
      // 静默保持现状。
    }
  }

  function startPolling() {
    stopPolling();
    pollTimer = setInterval(async () => {
      const current = order.value;
      if (!current || current.fulfillment_status !== 'pending_payment') {
        stopPolling();
        return;
      }
      await refreshOrder();
    }, 5000);
  }

  function stopPolling() {
    if (pollTimer) {
      clearInterval(pollTimer);
      pollTimer = null;
    }
  }

  onLoad((query) => {
    orderId.value = Number(query?.id || 0);
    load().then(startPolling);
  });

  // 从聚合收款收银台返回时立即刷新订单与凭证状态，不等下一次轮询。
  onShow(() => {
    if (!orderId.value || !order.value) return;
    void refreshOrder();
    void refreshProofs();
  });

  onUnload(stopPolling);
</script>

<style scoped lang="scss">
  .order-no {
    font-weight: 600;
  }

  .status {
    color: $brand;
  }

  .section-title {
    font-size: 30rpx;
    font-weight: 600;
    margin-bottom: 12rpx;
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

  .ghost {
    flex: 1;
    background: $bg;
    color: $text-1;
    border-radius: $radius;
  }

  .field {
    margin-top: 20rpx;
  }

  .input,
  .picker,
  .textarea {
    margin-top: 8rpx;
    padding: 16rpx 20rpx;
    background: $bg;
    border-radius: $radius;
  }

  .textarea {
    height: 160rpx;
    width: 100%;
    box-sizing: border-box;
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

  .mini {
    margin-left: 16rpx;
    padding: 0 20rpx;
    font-size: 24rpx;
    line-height: 56rpx;
    background: $brand;
    color: #fff;
    border-radius: $radius;
  }

  .pay-locked {
    margin-top: 20rpx;
    padding: 20rpx;
    background: $bg;
    border-radius: $radius;
  }

  .pay-internal {
    margin-top: 24rpx;
    padding-top: 20rpx;
    border-top: 1rpx solid $border;
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

  .upload {
    margin-top: 8rpx;
    padding: 24rpx 20rpx;
    background: $bg;
    border: 1rpx dashed $border;
    border-radius: $radius;
    color: $brand;
    text-align: center;
  }

  .rating {
    margin-top: 8rpx;
  }

  .star {
    font-size: 48rpx;
    color: $border;
    margin-right: 12rpx;
  }

  .star.on {
    color: #f7ba1e;
  }

  .proposal {
    margin-top: 16rpx;
    padding: 16rpx;
    background: $bg;
    border-radius: $radius;
  }

  .proposal-no {
    font-weight: 600;
  }

  .waiting {
    color: #d46b08;
  }
</style>
