<template>
  <view>
    <view class="card">
      <view class="row head">
        <view class="head-text">
          <view class="title">售后申诉</view>
          <view class="muted">仅本人服务过的订单可发起；退款 / 赔付口径由客服核定。</view>
        </view>
        <button class="mini primary" @click="toggleApply">
          {{ applyVisible ? '收起' : '发起申诉' }}
        </button>
      </view>
    </view>

    <view v-if="applyVisible" class="card">
      <view class="section-title">发起售后申诉</view>

      <view class="row">
        <text>关联订单</text>
        <text class="link" @click="manualOrder = !manualOrder">
          {{ manualOrder ? '从我的订单选择' : '手动填写订单 ID' }}
        </text>
      </view>
      <view v-if="manualOrder" class="field">
        <input
          v-model="form.orderIdText"
          class="input"
          type="number"
          placeholder="请输入订单 ID"
        />
      </view>
      <view v-else class="field">
        <picker
          :range="orderLabels"
          :value="orderIndex"
          :disabled="orderOptions.length === 0"
          @change="onOrderChange"
        >
          <view class="picker">
            {{ orderOptions.length === 0 ? '暂无可选订单' : orderLabels[orderIndex] }}
          </view>
        </picker>
        <view v-if="orderOptions.length === 0" class="muted">
          订单列表为空或加载失败，可手动填写订单 ID。
        </view>
      </view>

      <view class="row">
        <text>申诉类型</text>
        <picker mode="selector" :range="kindLabels" :value="kindIndex" @change="onKindChange">
          <text class="picker-value">{{ kindIndex < 0 ? '请选择' : kindLabels[kindIndex] }} ›</text>
        </picker>
      </view>

      <view class="field">
        <text class="muted">诉求描述（必填）</text>
        <textarea
          v-model="form.demand"
          class="textarea"
          maxlength="500"
          placeholder="请说明问题经过、时间与影响，便于客服核实"
        />
      </view>
      <view class="field">
        <text class="muted">期望方案</text>
        <input
          v-model="form.expectedPlan"
          class="input"
          maxlength="255"
          placeholder="如：核实服务量后补钟 / 撤销追偿（不指定金额）"
        />
      </view>
      <view class="field">
        <text class="muted">联系方式</text>
        <input
          v-model="form.contact"
          class="input"
          maxlength="120"
          placeholder="微信号 / 手机号，便于客服回访"
        />
      </view>

      <view class="row evidence">
        <text>证据</text>
        <button class="mini ghost" :disabled="uploading" @click="addEvidence">
          {{ uploading ? '上传中…' : '上传附件' }}
        </button>
      </view>
      <view v-if="evidenceIds.length" class="muted">
        已上传 {{ evidenceIds.length }} 个附件，提交时作为证据引用。
      </view>
      <view v-else class="field">
        <input
          v-model="form.evidenceText"
          class="input"
          maxlength="255"
          placeholder="无附件时填写证据说明 / 截图编号（选填）"
        />
      </view>
      <view class="muted">附件与文字说明二选一；单据、截图等请尽量上传附件。</view>

      <view class="actions">
        <button class="mini primary" :loading="submitting" @click="submit">提交申诉</button>
        <button class="mini ghost" @click="applyVisible = false">取消</button>
      </view>
    </view>

    <view v-if="loading" class="empty">加载中…</view>
    <view v-else-if="loadError" class="card">
      <view class="muted">{{ loadError }}</view>
      <button class="mini ghost retry" @click="load">重新加载</button>
    </view>
    <view v-else-if="items.length === 0" class="empty">暂无售后申诉记录</view>

    <view v-for="item in items" :key="item.id" class="card">
      <view class="row" @click="toggleDetail(item.id)">
        <text class="no">{{ item.after_sale_no }}</text>
        <text class="status" :class="statusClass(item.status)">{{ statusText(item.status) }}</text>
      </view>
      <view class="muted">{{ sourceText(item) }} · {{ kindText(item.kind) }}</view>
      <view class="muted">创建时间 {{ datetime(item.created_at) }}</view>

      <view v-if="expandedId === item.id" class="detail">
        <view class="section-title">处理进度</view>
        <view v-for="step in steps(item)" :key="step.label" class="step">
          <text class="dot" :class="{ done: step.done }">●</text>
          <text class="step-label" :class="{ done: step.done }">{{ step.label }}</text>
          <text class="muted">{{ step.at ? datetime(step.at) : '—' }}</text>
        </view>

        <view class="kv">
          <text class="muted">诉求描述</text>
          <text class="kv-value">{{ item.demand || '—' }}</text>
        </view>
        <view class="kv">
          <text class="muted">期望方案</text>
          <text class="kv-value">{{ item.expected_plan || '—' }}</text>
        </view>
        <view class="kv">
          <text class="muted">客服结论</text>
          <text class="kv-value">{{ item.resolution || '客服处理中，暂无结论' }}</text>
        </view>
        <view class="kv">
          <text class="muted">处理方案</text>
          <text class="kv-value">{{ planActionText(item.plan_action) }}</text>
        </view>
        <view v-if="item.refund_cents > 0" class="kv">
          <text class="muted">退款 / 赔付</text>
          <text class="kv-value">{{ money(item.refund_cents) }}</text>
        </view>
        <view v-if="item.recovery_cents > 0" class="kv">
          <text class="muted">向本人追偿</text>
          <text class="kv-value danger">{{ money(item.recovery_cents) }}</text>
        </view>
        <view v-if="item.customer_decline_reason" class="kv">
          <text class="muted">客户拒绝原因</text>
          <text class="kv-value">{{ item.customer_decline_reason }}</text>
        </view>
        <view v-if="item.evidence_ref" class="muted evidence-ref">
          证据：{{ evidenceText(item.evidence_ref) }}
        </view>
      </view>

      <view class="muted toggle" @click="toggleDetail(item.id)">
        {{ expandedId === item.id ? '收起' : '查看处理进度 ›' }}
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
  import { onShow } from '@dcloudio/uni-app';
  import { computed, reactive, ref } from 'vue';
  import {
    createPlayerAfterSale,
    enterPlayerMode,
    fetchPlayerAfterSales,
    fetchPlayerOrders,
  } from '../../api/player';
  import type { PlayerAfterSale, PlayerOrder } from '../../api/player';
  import { pickEvidenceAttachments } from '../../utils/evidence';
  import { datetime, fulfillmentText, money, planActionText } from '../../utils/format';

  // 与后端 playerAfterSaleKinds 一一对应：陪玩端不含「退款申请」，
  // 金额与赔付方式由客服在售后方案中确定。
  const kinds: Array<{ label: string; value: string }> = [
    { label: '服务不符', value: 'service_mismatch' },
    { label: '时长 / 局数不足', value: 'duration_short' },
    { label: '放鸽子 / 未服务', value: 'no_show' },
    { label: '货不对板', value: 'wrong_item' },
    { label: '多收 / 错收', value: 'overcharge' },
    { label: '陪玩申诉', value: 'player_appeal' },
    { label: '其他', value: 'other' },
  ];
  const kindLabels = kinds.map((item) => item.label);

  // 与后端 esportsaftersale.status 枚举一致；陪玩视角把「待客户确认」改写为第三人称。
  const statusText = (status: string) =>
    (
      ({
        pending_accept: '待受理',
        processing: '处理中',
        pending_customer_confirm: '待客户确认方案',
        pending_approval: '待审批',
        pending_execution: '待执行',
        execution_failed: '执行失败',
        completed: '已完成',
        rejected: '已驳回',
        withdrawn: '已撤回',
      }) as Record<string, string>
    )[status] || status;

  const kindText = (kind: string) =>
    kinds.find((item) => item.value === kind)?.label || kind || '—';

  // 售后来源按后端 validAfterSaleSourceType 取值（order / gift / recharge /
  // assessment）：陪玩端以订单为主，其余来源如实标注，避免把非订单 ID 写成订单号。
  const sourceText = (item: PlayerAfterSale) => {
    const labels: Record<string, string> = {
      order: '关联订单',
      gift: '关联礼物',
      recharge: '关联充值',
      assessment: '关联考核',
    };
    return `${labels[item.source_type] || '来源'} #${item.source_id}`;
  };

  const statusClass = (status: string) => {
    if (status === 'completed') return 'ok';
    if (status === 'rejected' || status === 'execution_failed') return 'danger';
    if (status === 'withdrawn') return 'muted';
    return 'warn';
  };

  const items = ref<PlayerAfterSale[]>([]);
  const loading = ref(false);
  const loadError = ref('');
  const expandedId = ref(0);

  const orderOptions = ref<PlayerOrder[]>([]);
  const orderIndex = ref(0);
  const orderLabels = computed(() =>
    orderOptions.value.map(
      (item) => `${item.order_no} · ${fulfillmentText(item.fulfillment_status)}`
    )
  );

  const applyVisible = ref(false);
  const manualOrder = ref(false);
  const kindIndex = ref(-1);
  const evidenceIds = ref<number[]>([]);
  const uploading = ref(false);
  const submitting = ref(false);

  const form = reactive({
    orderIdText: '',
    demand: '',
    expectedPlan: '',
    contact: '',
    evidenceText: '',
  });

  async function load() {
    loading.value = true;
    loadError.value = '';
    try {
      items.value = (await fetchPlayerAfterSales()) || [];
    } catch {
      items.value = [];
      loadError.value = '售后申诉列表加载失败，请检查网络后重试。';
    } finally {
      loading.value = false;
    }
  }

  /** 订单候选：进行中 + 已完成（售后也可能针对已完成订单）。 */
  async function loadOrders() {
    try {
      const [active, completed] = await Promise.all([
        fetchPlayerOrders(),
        fetchPlayerOrders('completed'),
      ]);
      const map = new Map<number, PlayerOrder>();
      for (const item of [...(active || []), ...(completed || [])]) {
        map.set(item.id, item);
      }
      orderOptions.value = Array.from(map.values());
    } catch {
      orderOptions.value = [];
    }
  }

  function toggleApply() {
    applyVisible.value = !applyVisible.value;
    if (applyVisible.value) {
      loadOrders();
    }
  }

  function toggleDetail(id: number) {
    expandedId.value = expandedId.value === id ? 0 : id;
  }

  function onOrderChange(e: { detail: { value: number | string } }) {
    orderIndex.value = Number(e.detail.value) || 0;
  }

  function onKindChange(e: { detail: { value: number | string } }) {
    kindIndex.value = Number(e.detail.value);
  }

  function selectedOrderId(): number {
    if (manualOrder.value) {
      return Number(form.orderIdText);
    }
    return orderOptions.value[orderIndex.value]?.id || 0;
  }

  async function addEvidence() {
    if (evidenceIds.value.length >= 9) {
      uni.showToast({ title: '最多上传 9 个附件', icon: 'none' });
      return;
    }
    uploading.value = true;
    try {
      const ids = await pickEvidenceAttachments();
      for (const id of ids) {
        if (!evidenceIds.value.includes(id)) evidenceIds.value.push(id);
      }
    } finally {
      uploading.value = false;
    }
  }

  /** 附件与文字说明二选一：有附件时按后端约定序列化为 JSON 数组。 */
  function buildEvidenceRef(): string {
    if (evidenceIds.value.length) return `[${evidenceIds.value.join(',')}]`;
    return form.evidenceText.trim();
  }

  async function submit() {
    const orderId = selectedOrderId();
    if (!Number.isSafeInteger(orderId) || orderId <= 0) {
      uni.showToast({ title: '请选择或填写订单 ID', icon: 'none' });
      return;
    }
    const kind = kinds[kindIndex.value]?.value || '';
    if (!kind) {
      uni.showToast({ title: '请选择申诉类型', icon: 'none' });
      return;
    }
    const demand = form.demand.trim();
    if (!demand) {
      uni.showToast({ title: '请填写诉求描述', icon: 'none' });
      return;
    }
    submitting.value = true;
    try {
      await createPlayerAfterSale({
        order_id: orderId,
        kind,
        demand,
        expected_plan: form.expectedPlan.trim(),
        evidence_ref: buildEvidenceRef(),
        contact: form.contact.trim(),
      });
      uni.showToast({ title: '申诉已提交，等待客服受理', icon: 'none' });
      resetForm();
      applyVisible.value = false;
      await load();
    } catch {
      // request 层已提示（如同一订单同类型已有进行中售后）。
    } finally {
      submitting.value = false;
    }
  }

  function resetForm() {
    form.orderIdText = '';
    form.demand = '';
    form.expectedPlan = '';
    form.contact = '';
    form.evidenceText = '';
    kindIndex.value = -1;
    orderIndex.value = 0;
    evidenceIds.value = [];
  }

  /** 处理进度节点：按后端时间戳回放，未发生的节点显示为待处理。 */
  function steps(item: PlayerAfterSale) {
    const list = [
      { label: '提交申诉', at: item.created_at, done: true },
      { label: '客服受理', at: item.accepted_at, done: !!item.accepted_at },
      { label: '客服出方案', at: item.planned_at, done: !!item.planned_at },
      { label: '方案审批通过', at: item.approved_at, done: !!item.approved_at },
    ];
    if (item.status === 'completed') {
      list.push({ label: '处理完成', at: item.resolved_at, done: true });
    } else if (item.status === 'rejected') {
      list.push({ label: '申诉已驳回', at: item.resolved_at, done: true });
    } else if (item.status === 'withdrawn') {
      list.push({ label: '申诉已撤回', at: item.updated_at, done: true });
    } else if (item.status === 'execution_failed') {
      list.push({ label: '执行失败，客服跟进中', at: item.updated_at, done: true });
    } else {
      // 进行中：保留一个未完成的终点节点，让用户看到「还差最后一步」。
      list.push({ label: '处理结果', at: item.resolved_at, done: false });
    }
    return list;
  }

  function evidenceText(ref: string): string {
    const text = (ref || '').trim();
    if (!text) return '—';
    if (text.startsWith('[')) {
      try {
        const ids = JSON.parse(text) as number[];
        if (Array.isArray(ids) && ids.length) {
          return `附件 ${ids.map((id) => `#${id}`).join('、')}`;
        }
      } catch {
        // 非 JSON 的历史纯文本证据按原文展示。
      }
    }
    return text;
  }

  onShow(() => {
    enterPlayerMode();
    load();
  });
</script>

<style scoped lang="scss">
  .head {
    align-items: flex-start;
  }

  .head-text {
    flex: 1;
    padding-right: 16rpx;
  }

  .title {
    font-size: 34rpx;
    font-weight: 600;
    margin-bottom: 8rpx;
  }

  .section-title {
    font-size: 30rpx;
    font-weight: 600;
    margin-bottom: 12rpx;
  }

  .field {
    margin-top: 16rpx;
  }

  .input {
    height: 80rpx;
    padding: 0 20rpx;
    background: $bg;
    border-radius: $radius;
  }

  .textarea {
    width: 100%;
    height: 180rpx;
    padding: 16rpx 20rpx;
    background: $bg;
    border-radius: $radius;
    box-sizing: border-box;
  }

  .picker {
    padding: 20rpx 0;
    color: $text-1;
  }

  .picker-value {
    color: $brand;
  }

  .link {
    color: $brand;
    font-size: 24rpx;
  }

  .evidence {
    margin-top: 24rpx;
  }

  .actions {
    display: flex;
    gap: 16rpx;
    margin-top: 24rpx;
  }

  .retry {
    margin-top: 16rpx;
  }

  .mini {
    font-size: 24rpx;
    padding: 0 24rpx;
    line-height: 60rpx;
    border-radius: 30rpx;
  }

  .primary {
    background: $brand;
    color: #fff;
  }

  .ghost {
    background: $bg;
    color: $text-2;
  }

  .no {
    font-weight: 600;
  }

  .status {
    font-size: 24rpx;
    padding: 4rpx 16rpx;
    border-radius: 8rpx;
    background: $bg;
  }

  .status.ok {
    color: $success;
  }

  .status.warn {
    color: $brand;
  }

  .status.danger {
    color: $danger;
  }

  .status.muted {
    color: $text-3;
  }

  .detail {
    margin-top: 16rpx;
    padding-top: 16rpx;
    border-top: 1rpx solid $border;
  }

  .step {
    display: flex;
    align-items: center;
    gap: 12rpx;
    padding: 8rpx 0;
  }

  .dot {
    font-size: 16rpx;
    color: $border;
  }

  .dot.done {
    color: $brand;
  }

  .step-label {
    flex: 1;
    color: $text-3;
  }

  .step-label.done {
    color: $text-1;
  }

  .kv {
    display: flex;
    align-items: flex-start;
    gap: 16rpx;
    padding: 10rpx 0;
  }

  .kv .muted {
    width: 160rpx;
    flex: none;
  }

  .kv-value {
    flex: 1;
    color: $text-1;
    word-break: break-all;
  }

  .kv-value.danger {
    color: $danger;
  }

  .evidence-ref {
    margin-top: 12rpx;
    word-break: break-all;
  }

  .toggle {
    margin-top: 16rpx;
    text-align: right;
  }
</style>
