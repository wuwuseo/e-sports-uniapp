<template>
  <view>
    <scroll-view class="tabs" scroll-x>
      <view
        v-for="tab in tabs"
        :key="tab.value"
        class="tab"
        :class="{ active: status === tab.value }"
        @click="switchStatus(tab.value)"
      >
        {{ tab.label }}
      </view>
    </scroll-view>

    <view v-if="filtered.length === 0" class="empty">暂无订单</view>
    <view v-for="item in filtered" :key="item.id" class="card order">
      <view class="row" @click="toggleDetail(item.id)">
        <text class="order-no">{{ item.order_no }}</text>
        <text class="amount">{{ money(item.payable_cents) }}</text>
      </view>
      <view class="muted" @click="toggleDetail(item.id)">
        {{ fulfillmentText(item.fulfillment_status) }} · 客户#{{ item.customer_id }} ·
        商品#{{ item.product_id }} · {{ item.required_seats }} 席
      </view>
      <view class="muted" @click="toggleDetail(item.id)">{{ datetime(item.created_at) }}</view>

      <view v-if="expanded === item.id" class="detail">
        <view class="muted">付款状态：{{ paymentStatusText(item.payment_status) }}（{{ item.payment_channel }}）</view>
        <view class="muted">预约状态：{{ appointmentStatusText(item.appointment_status) }}</view>
        <view v-if="item.requested_start_at" class="muted">预约开始：{{ datetime(item.requested_start_at) }}</view>
        <view class="muted">负责客服：{{ item.responsible_admin_id ?? '未认领' }}</view>
        <view class="muted">加钟追加：{{ money(item.addon_cents) }} · 已退款：{{ money(item.refunded_cents) }}</view>
        <view class="detail-actions">
          <button
            v-if="item.fulfillment_status === 'pending_payment'"
            class="mini primary"
            :loading="payingId === item.id"
            @click="payBalance(item)"
          >
            余额核销
          </button>
          <button
            v-if="item.fulfillment_status === 'pending_payment'"
            class="mini primary"
            @click="openProof(item)"
          >
            提交到账凭证
          </button>
          <button class="mini primary" @click="goDetail(item)">跟进操作</button>
          <button class="mini plain" @click="goAfterSale(item)">代建售后</button>
          <button class="mini plain" @click="goFollowUp(item)">跟进客户</button>
        </view>
      </view>

      <view class="actions">
        <button class="mini plain" @click="toggleDetail(item.id)">
          {{ expanded === item.id ? '收起' : '详情' }}
        </button>
        <button
          v-if="item.fulfillment_status === 'pending_dispatch' && !item.responsible_admin_id"
          class="mini primary"
          :loading="actingId === item.id"
          @click="claim(item)"
        >
          认领
        </button>
        <button
          v-if="item.fulfillment_status === 'pending_dispatch'"
          class="mini primary"
          @click="openDispatch(item)"
        >
          {{ dispatchingId === item.id ? '收起派单' : '派单' }}
        </button>
        <button
          v-if="item.fulfillment_status === 'pending_dispatch' || item.fulfillment_status === 'pending_acceptance'"
          class="mini plain"
          :loading="actingId === item.id"
          @click="remind(item)"
        >
          催单
        </button>
      </view>

      <view v-if="dispatchingId === item.id" class="dispatch">
        <view v-if="candidates.length === 0" class="muted">加载中或暂无可派候选</view>
        <view v-for="cand in candidates" :key="cand.player_id" class="candidate">
          <view class="row">
            <text class="cand-name">
              {{ cand.display_name }}<text v-if="cand.preferred" class="preferred"> 指定</text>
            </text>
            <text class="muted">{{ levelText(cand.level) }} · {{ cand.presence }}</text>
          </view>
          <view class="muted">
            评分 {{ cand.rating_samples > 0 ? cand.rating_average.toFixed(1) : '暂无' }}
            · 在途 {{ cand.active_seats }} 席 · 历史 {{ cand.history_completed }} 单
          </view>
          <button class="mini success" :loading="assigningId === cand.player_id" @click="assign(item, cand)">
            指派
          </button>
        </view>
      </view>
    </view>

    <!-- 提交到账凭证 -->
    <view v-if="proofOpen" class="mask">
      <view class="sheet">
        <view class="sheet-title">提交到账凭证</view>
        <picker :range="accountNames" :value="accountIndex" @change="onAccountChange">
          <view class="field">{{ accountNames[accountIndex] || '请选择收款账户' }}</view>
        </picker>
        <input v-model="proofForm.transaction_no" class="field" placeholder="交易流水号（必填）" />
        <input v-model="proofForm.amount_cents" class="field" type="number" placeholder="到账金额（分）" />
        <input v-model="proofForm.proof_ref" class="field" placeholder="凭证说明（截图备注，≥8 字）" />
        <view class="sheet-actions">
          <button class="mini plain" @click="proofOpen = false">取消</button>
          <button class="mini primary" :loading="payingId === proofOrderId" @click="submitProof">提交</button>
        </view>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
  import { onLoad, onShow } from '@dcloudio/uni-app';
  import { computed, ref } from 'vue';
  import {
    assignSeat,
    claimOrder,
    fetchCsOrders,
    fetchDispatchCandidates,
    fetchPaymentAccounts,
    payOrderByBalance,
    remindOrder,
    submitOfflinePaymentProof,
  } from '../../api/cs';
  import type { CsOrder, DispatchCandidate, PaymentAccount } from '../../api/cs';
  import {
    appointmentStatusText,
    datetime,
    fulfillmentText,
    money,
    paymentStatusText,
  } from '../../utils/format';
  import { promptModal } from '../../utils/dialog';

  import { skillLevelText } from '../../utils/levels';
  const tabs = [
    { label: '全部', value: 'all' },
    { label: '待付款', value: 'pending_payment' },
    { label: '待派单', value: 'pending_dispatch' },
    { label: '抢单中', value: 'grabbing' },
    { label: '待接单', value: 'pending_acceptance' },
    { label: '待客户确认', value: 'pending_customer_confirm' },
    { label: '已接单', value: 'accepted' },
    { label: '服务中', value: 'in_service' },
    { label: '待结单', value: 'pending_close' },
    { label: '已完成', value: 'completed' },
    { label: '已取消', value: 'cancelled' },
  ];

  const status = ref('all');
  const orders = ref<CsOrder[]>([]);
  const expanded = ref(0);
  const actingId = ref(0);
  const dispatchingId = ref(0);
  const assigningId = ref(0);
  const candidates = ref<DispatchCandidate[]>([]);
  const payingId = ref(0);
  const accounts = ref<PaymentAccount[]>([]);
  const proofOpen = ref(false);
  const proofOrderId = ref(0);
  const proofForm = ref({
    account_id: '',
    transaction_no: '',
    amount_cents: '',
    proof_ref: '',
  });

  const filtered = computed(() => {
    if (status.value === 'all') return orders.value;
    return orders.value.filter((o) => o.fulfillment_status === status.value);
  });

  const accountNames = computed(() =>
    accounts.value.map(
      (a) => `${a.channel} · ${a.subject_name || a.account_no || a.bank_name || `账户#${a.id}`}`
    )
  );
  const accountIndex = ref(-1);

  function onAccountChange(e: Event) {
    const v = Number((e as unknown as { detail?: { value?: number } }).detail?.value);
    if (!Number.isInteger(v)) return;
    accountIndex.value = v;
    proofForm.value.account_id = String(accounts.value[v]?.id ?? '');
  }

  // 技能等级文案走系统配置，App 启动时已拉取。
  const levelText = (s: string) => skillLevelText(s);

  async function load() {
    try {
      orders.value = (await fetchCsOrders()) || [];
    } catch {
      orders.value = [];
    }
  }

  function switchStatus(value: string) {
    status.value = value;
  }

  function toggleDetail(id: number) {
    expanded.value = expanded.value === id ? 0 : id;
  }

  async function claim(item: CsOrder) {
    actingId.value = item.id;
    try {
      await claimOrder(item.id);
      uni.showToast({ title: '已认领', icon: 'success' });
      await load();
    } catch {
      // csRequest 层已提示。
    } finally {
      actingId.value = 0;
    }
  }

  async function openDispatch(item: CsOrder) {
    if (dispatchingId.value === item.id) {
      dispatchingId.value = 0;
      return;
    }
    dispatchingId.value = item.id;
    candidates.value = [];
    try {
      const res = await fetchDispatchCandidates(item.id);
      candidates.value = res.candidates || [];
    } catch {
      candidates.value = [];
    }
  }

  async function assign(item: CsOrder, cand: DispatchCandidate) {
    let seatIndex = 1;
    if (item.required_seats > 1) {
      const { confirm, text } = await promptModal(
        '选择席位',
        '席位序号',
        `该订单共 ${item.required_seats} 席，请输入指派席位序号（1-${item.required_seats}）`
      );
      if (!confirm) return;
      const n = Number(text);
      if (!Number.isInteger(n) || n < 1 || n > item.required_seats) {
        uni.showToast({ title: '席位序号无效', icon: 'none' });
        return;
      }
      seatIndex = n;
    }
    assigningId.value = cand.player_id;
    try {
      await assignSeat(item.id, seatIndex, cand.player_id);
      uni.showToast({ title: '已指派', icon: 'success' });
      dispatchingId.value = 0;
      candidates.value = [];
      await load();
    } catch {
      // csRequest 层已提示。
    } finally {
      assigningId.value = 0;
    }
  }

  async function remind(item: CsOrder) {
    const { confirm, text } = await promptModal(
      '催单',
      '催单备注',
      '请填写催单备注'
    );
    if (!confirm) return;
    actingId.value = item.id;
    try {
      await remindOrder(item.id, 1, text);
      uni.showToast({ title: '已催单', icon: 'success' });
    } catch {
      // csRequest 层已提示。
    } finally {
      actingId.value = 0;
    }
  }

  async function payBalance(item: CsOrder) {
    const res = await new Promise<{ confirm: boolean }>((resolve) => {
      uni.showModal({
        title: '余额核销',
        content: `确认用客户余额核销订单 ${item.order_no} 的 ${money(item.payable_cents)}？`,
        success: (r) => resolve(r),
        fail: () => resolve({ confirm: false }),
      });
    });
    if (!res.confirm) return;
    payingId.value = item.id;
    try {
      await payOrderByBalance(item.id);
      uni.showToast({ title: '已用余额核销', icon: 'success' });
      await load();
    } catch {
      // csRequest 层已提示。
    } finally {
      payingId.value = 0;
    }
  }

  async function openProof(item: CsOrder) {
    if (accounts.value.length === 0) {
      try {
        accounts.value = (await fetchPaymentAccounts()) || [];
      } catch {
        accounts.value = [];
      }
    }
    if (accounts.value.length === 0) {
      uni.showToast({ title: '暂无可用收款账户', icon: 'none' });
      return;
    }
    proofOrderId.value = item.id;
    proofForm.value = {
      account_id: '',
      transaction_no: '',
      amount_cents: String(item.payable_cents),
      proof_ref: '',
    };
    proofOpen.value = true;
  }

  async function submitProof() {
    const accountId = Number(proofForm.value.account_id);
    const amount = Number(proofForm.value.amount_cents);
    if (!Number.isInteger(accountId) || accountId < 1) {
      uni.showToast({ title: '请选择收款账户', icon: 'none' });
      return;
    }
    if (!proofForm.value.transaction_no.trim()) {
      uni.showToast({ title: '请填写交易流水号', icon: 'none' });
      return;
    }
    if (!Number.isFinite(amount) || amount <= 0) {
      uni.showToast({ title: '请填写有效的到账金额', icon: 'none' });
      return;
    }
    if (proofForm.value.proof_ref.trim().length < 8) {
      uni.showToast({ title: '凭证说明至少 8 位', icon: 'none' });
      return;
    }
    payingId.value = proofOrderId.value;
    try {
      await submitOfflinePaymentProof({
        order_id: proofOrderId.value,
        account_id: accountId,
        transaction_no: proofForm.value.transaction_no.trim(),
        amount_cents: amount,
        proof_ref: proofForm.value.proof_ref.trim(),
      });
      uni.showToast({ title: '到账凭证已提交，待财务核验', icon: 'success' });
      proofOpen.value = false;
      await load();
    } catch {
      // csRequest 层已提示。
    } finally {
      payingId.value = 0;
    }
  }

  function goDetail(item: CsOrder) {
    uni.navigateTo({ url: `/pages/cs/order-detail?id=${item.id}` });
  }

  function goAfterSale(item: CsOrder) {
    uni.navigateTo({ url: `/pages/cs/after-sales?source_id=${item.id}` });
  }

  function goFollowUp(item: CsOrder) {
    uni.navigateTo({ url: `/pages/cs/customer-detail?id=${item.customer_id}` });
  }

  onLoad((query) => {
    if (query?.status) status.value = String(query.status);
  });
  onShow(() => {
    // 工作台经 switchTab 跳转时无法携带 query，筛选状态从 storage 取
    const pendingStatus = (uni.getStorageSync('cs_orders_status') as string) || '';
    if (pendingStatus) {
      status.value = pendingStatus;
      uni.removeStorageSync('cs_orders_status');
    }
    load();
  });
</script>

<style scoped lang="scss">
  .tabs {
    white-space: nowrap;
    background: #fff;
    padding: 16rpx 0;
  }

  .tab {
    display: inline-block;
    padding: 12rpx 28rpx;
    margin-left: 16rpx;
    border-radius: 999rpx;
    background: $bg;
    color: $text-2;
    font-size: 26rpx;
  }

  .tab.active {
    background: $brand;
    color: #fff;
  }

  .order-no {
    font-weight: 600;
  }

  .amount {
    color: $danger;
    font-weight: 600;
  }

  .detail {
    margin-top: 12rpx;
    padding: 16rpx;
    background: $bg;
    border-radius: $radius;
  }

  .detail-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 16rpx;
    margin-top: 16rpx;
  }

  .actions {
    display: flex;
    flex-wrap: wrap;
    gap: 16rpx;
    margin-top: 16rpx;
  }

  .mini {
    font-size: 24rpx;
    padding: 0 24rpx;
    line-height: 56rpx;
    border-radius: 28rpx;
  }

  .primary {
    background: $brand;
    color: #fff;
  }

  .success {
    background: $success;
    color: #fff;
  }

  .plain {
    background: #fff;
    color: $text-2;
    border: 1rpx solid $border;
  }

  .dispatch {
    margin-top: 16rpx;
    padding: 16rpx;
    background: $bg;
    border-radius: $radius;
  }

  .candidate {
    padding: 16rpx 0;
    border-bottom: 1rpx solid $border;
  }

  .candidate:last-child {
    border-bottom: none;
  }

  .cand-name {
    font-weight: 600;
  }

  .preferred {
    color: $brand;
    font-size: 24rpx;
  }

  .mask {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.4);
    display: flex;
    align-items: flex-end;
    z-index: 100;
  }

  .sheet {
    width: 100%;
    background: #fff;
    border-radius: 24rpx 24rpx 0 0;
    padding: 32rpx;
    box-sizing: border-box;
  }

  .sheet-title {
    font-size: 32rpx;
    font-weight: 600;
    margin-bottom: 24rpx;
  }

  .field {
    height: 80rpx;
    line-height: 80rpx;
    padding: 0 24rpx;
    background: $bg;
    border-radius: $radius;
    margin-top: 16rpx;
  }

  .sheet-actions {
    display: flex;
    justify-content: flex-end;
    gap: 16rpx;
    margin-top: 24rpx;
  }
</style>
