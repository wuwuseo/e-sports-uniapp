<template>
  <view>
    <view class="card create-bar">
      <button class="mini primary" @click="openCreate">代建售后</button>
    </view>

    <scroll-view class="tabs" scroll-x>
      <view
        v-for="tab in tabs"
        :key="tab.value"
        class="tab"
        :class="{ active: status === tab.value }"
        @click="status = tab.value"
      >
        {{ tab.label }}
      </view>
    </scroll-view>

    <view v-if="items.length === 0" class="empty">暂无售后单</view>
    <view v-for="item in items" :key="item.id" class="card item">
      <view class="row" @click="toggle(item.id)">
        <text class="no">{{ item.after_sale_no }}</text>
        <text class="status">{{ afterSaleStatusText(item.status) }}</text>
      </view>
      <view class="muted" @click="toggle(item.id)">
        {{ afterSaleKindText(item.kind) }} · 来源 {{ item.source_type }}#{{ item.source_id }} ·
        退款 {{ money(item.refund_cents) }}
      </view>
      <view class="muted" @click="toggle(item.id)">{{ item.demand }}</view>

      <view v-if="expanded === item.id" class="detail">
        <view class="muted">
          逐项进度：待执行 {{ actionCount('pending') }} 项 · 执行中 {{ actionCount('executing') }} 项 ·
          已执行 {{ actionCount('succeeded') }} 项 · 失败 {{ actionCount('failed') }} 项
        </view>
        <view v-if="actions.length === 0" class="muted">暂无动作项（方案提交后按项生成）。</view>
        <view v-for="action in actions" :key="action.id" class="action">
          <view class="row">
            <text>{{ action.seq }}. {{ actionLabel(action.action_type) }}</text>
            <text :class="action.status === 'succeeded' ? 'ok' : 'waiting'">
              {{ actionStatusText(action.status) }}
            </text>
          </view>
          <view class="muted">
            <text v-if="action.amount_cents">金额 {{ money(action.amount_cents) }} · </text>
            <text v-if="action.result_summary">{{ action.result_summary }}</text>
          </view>
        </view>

        <!-- 单内沟通：客服与客户在同一张售后单里回复；内部备注仅客服可见 -->
        <view class="messages">
          <view class="muted">沟通记录</view>
          <view v-if="messages.length === 0" class="muted">暂无沟通记录</view>
          <view v-for="message in messages" :key="message.id" class="message">
            <view class="muted">
              {{ messageAuthorText(message) }} · {{ datetime(message.created_at) }} ·
              {{ message.visibility === 'internal' ? '内部备注（客户不可见）' : '客户可见' }}
            </view>
            <view>{{ message.content }}</view>
            <view v-if="message.attachments?.length" class="muted">
              附件 {{ message.attachments.map((ref) => `#${ref}`).join('、') }}
            </view>
          </view>
          <textarea
            v-model="messageText"
            class="textarea"
            maxlength="1000"
            placeholder="单内回复（≤1000 字）"
          />
          <view class="switch-row">
            <switch :checked="messageInternal" color="#165dff" @change="onInternalChange" />
            <text class="muted">内部备注（仅客服可见，客户侧不展示）</text>
          </view>
          <view class="row evidence">
            <button class="mini plain" :disabled="messageUploading" @click="addMessageAttachment">
              {{ messageUploading ? '上传中…' : '添加附件' }}
            </button>
            <button class="mini primary" :loading="messageSending" @click="submitMessage(item.id)">
              发送
            </button>
          </view>
          <view v-for="(id, index) in messageAttachments" :key="index" class="muted">
            已上传附件 #{{ id }}
          </view>
          <view class="field evidence">
            <input
              v-model="evidenceNote"
              class="input"
              maxlength="200"
              placeholder="补证说明（1–200 字）"
            />
            <button
              class="mini plain"
              :loading="requestingEvidence"
              @click="submitEvidenceRequest(item.id)"
            >
              提示补证
            </button>
          </view>
          <view class="muted">
            提示补证会给客户发一条「客户可见」的沟通记录；客户带附件回复后待补证标记自动解除。
          </view>
        </view>
      </view>

      <view v-if="expanded === item.id" class="actions">
        <button
          v-if="item.status === 'pending_accept'"
          class="mini primary"
          :loading="actingId === item.id"
          @click="accept(item)"
        >
          受理
        </button>
        <button
          v-if="item.status === 'processing'"
          class="mini primary"
          @click="openPlan(item)"
        >
          提交方案
        </button>
        <!-- 代客确认（待客户确认 → 待审批）：只推进状态，不写审批人、不占退款额度，不等于审批 -->
        <button
          v-if="item.status === 'pending_customer_confirm'"
          class="mini success"
          :loading="actingId === item.id"
          @click="confirmByAdmin(item)"
        >
          代客确认
        </button>
        <!-- 审批通过 / 审批驳回是两个独立动作，只对待审批单可见（且审批人不得是该单处理人） -->
        <button
          v-if="item.status === 'pending_approval'"
          class="mini primary"
          :loading="actingId === item.id"
          @click="approve(item)"
        >
          审批通过
        </button>
        <button
          v-if="item.status === 'pending_approval'"
          class="mini danger"
          @click="openReject(item)"
        >
          审批驳回
        </button>
        <button
          v-if="item.status === 'pending_execution'"
          class="mini success"
          :loading="actingId === item.id"
          @click="execute(item)"
        >
          执行
        </button>
        <button
          v-if="['processing', 'pending_approval'].includes(item.status)"
          class="mini plain"
          :loading="actingId === item.id"
          @click="withdraw(item)"
        >
          撤回
        </button>
      </view>
    </view>

    <!-- 代建售后 -->
    <view v-if="creating" class="mask">
      <view class="sheet">
        <view class="sheet-title">代建售后</view>
        <picker :range="sourceTypeOptions" :value="sourceTypeIndex" @change="onSourceTypeChange">
          <view class="field">来源类型：{{ sourceTypeOptions[sourceTypeIndex] }}</view>
        </picker>
        <input v-model="createForm.source_id" class="field" type="number" placeholder="来源 ID（订单 / 礼物 / 充值）" />
        <picker :range="kindLabels" :value="kindIndex" @change="onKindChange">
          <view class="field">问题类型：{{ kindLabels[kindIndex] }}</view>
        </picker>
        <textarea v-model="createForm.demand" class="field textarea" placeholder="诉求描述（必填，≤500字）" />
        <input v-model="createForm.expected_plan" class="field" placeholder="期望方案（选填）" />
        <input v-model="createForm.contact" class="field" placeholder="联系方式（选填）" />
        <view class="field evidence">
          <text>凭证附件</text>
          <button class="mini plain" :disabled="uploading" @click="addEvidence">
            {{ uploading ? '上传中…' : '上传凭证' }}
          </button>
        </view>
        <view v-for="(id, index) in evidence" :key="index" class="muted">
          已上传凭证附件 #{{ id }}
        </view>
        <view class="sheet-actions">
          <button class="mini plain" @click="creating = false">取消</button>
          <button class="mini primary" :loading="submitting" @click="submitCreate">提交</button>
        </view>
      </view>
    </view>

    <!-- 提交方案 -->
    <view v-if="planning" class="mask">
      <view class="sheet">
        <view class="sheet-title">提交售后方案</view>
        <picker :range="faultOptions" :value="faultIndex" @change="onFaultChange">
          <view class="field">责任方：{{ faultOptions[faultIndex] }}</view>
        </picker>
        <picker :range="planOptions" :value="planIndex" @change="onPlanChange">
          <view class="field">方案动作：{{ planOptions[planIndex] }}</view>
        </picker>
        <input v-model="planForm.refund_cents" class="field" type="number" placeholder="退款金额（分）" />
        <textarea v-model="planForm.resolution" class="field textarea" placeholder="处理说明（选填）" />
        <view class="sheet-actions">
          <button class="mini plain" @click="planning = false">取消</button>
          <button class="mini primary" :loading="submitting" @click="submitPlan">提交</button>
        </view>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
  import { onLoad, onShow } from '@dcloudio/uni-app';
  import { reactive, ref } from 'vue';
  import {
    acceptAfterSale,
    approveAfterSale,
    confirmAfterSale,
    createAfterSale,
    executeAfterSale,
    fetchAfterSaleActions,
    fetchAfterSaleMessages,
    fetchAfterSales,
    planAfterSale,
    postAfterSaleMessage,
    rejectAfterSale,
    requestAfterSaleEvidence,
    uploadCsAttachment,
    withdrawAfterSale,
  } from '../../api/cs';
  import type { CsAfterSale, CsAfterSaleAction, CsAfterSaleMessage } from '../../api/cs';
  import { afterSaleKindText, afterSaleStatusText, afterSaleKinds, datetime, money } from '../../utils/format';
  import { pickEvidenceAttachments } from '../../utils/evidence';

  const tabs = [
    { label: '全部', value: '' },
    { label: '待受理', value: 'pending_accept' },
    { label: '处理中', value: 'processing' },
    { label: '待客户确认', value: 'pending_customer_confirm' },
    { label: '待审批', value: 'pending_approval' },
    { label: '待执行', value: 'pending_execution' },
    { label: '已完成', value: 'completed' },
  ];
  const sourceTypeOptions = ['order', 'gift', 'recharge'];
  // 问题类型：下拉展示中文 label，提交时取对应枚举 value
  const kindLabels = afterSaleKinds.map((i) => i.label);
  const kindOptions = afterSaleKinds.map((i) => i.value);
  const faultOptions = ['undetermined', 'player', 'admin', 'customer', 'platform', 'none'];
  const planOptions = ['refund_original', 'compensate', 'makeup_service', 'none'];

  const status = ref('');
  const items = ref<CsAfterSale[]>([]);
  const expanded = ref(0);
  const actingId = ref(0);
  const creating = ref(false);
  const planning = ref(false);
  const submitting = ref(false);
  const evidence = ref<number[]>([]);
  const uploading = ref(false);
  const actions = ref<CsAfterSaleAction[]>([]);
  // 单内沟通与提示补证
  const messages = ref<CsAfterSaleMessage[]>([]);
  const messageText = ref('');
  const messageInternal = ref(false);
  const messageAttachments = ref<number[]>([]);
  const messageUploading = ref(false);
  const messageSending = ref(false);
  const evidenceNote = ref('');
  const requestingEvidence = ref(false);

  const createForm = reactive({ source_id: '', demand: '', expected_plan: '', contact: '' });
  const sourceTypeIndex = ref(0);
  const kindIndex = ref(0);
  const planForm = reactive({ refund_cents: '', resolution: '' });
  const faultIndex = ref(0);
  const planIndex = ref(0);

  async function load() {
    try {
      items.value = (await fetchAfterSales(status.value)) || [];
    } catch {
      items.value = [];
    }
  }

  function toggle(id: number) {
    if (expanded.value === id) {
      expanded.value = 0;
      actions.value = [];
      resetMessageForm();
      messages.value = [];
      return;
    }
    expanded.value = id;
    actions.value = [];
    resetMessageForm();
    messages.value = [];
    loadActions(id);
    loadMessages(id);
  }

  function resetMessageForm() {
    messageText.value = '';
    messageInternal.value = false;
    messageAttachments.value = [];
    evidenceNote.value = '';
  }

  /** 逐项进度：客服侧据 pending / succeeded 区分「待执行」与「已到账」。 */
  async function loadActions(id: number) {
    try {
      const view = await fetchAfterSaleActions(id);
      actions.value = view?.actions || [];
    } catch {
      actions.value = [];
    }
  }

  /** 单内沟通记录（含内部备注）：客服在单内回复客户或留内部备注。 */
  async function loadMessages(id: number) {
    try {
      messages.value = (await fetchAfterSaleMessages(id)) || [];
    } catch {
      messages.value = [];
    }
  }

  function messageAuthorText(message: CsAfterSaleMessage): string {
    if (message.visibility === 'internal') return `内部备注 · ${message.author_name || `客服#${message.author_id}`}`;
    return (
      { customer: '客户', admin: message.author_name || `客服#${message.author_id}`, player: '陪玩', system: '系统' }[
        message.author_type
      ] || message.author_type
    );
  }

  function onInternalChange(e: Event) {
    messageInternal.value = !!(e as unknown as { detail?: { value?: boolean } }).detail?.value;
  }

  /** 回复附件走 admin 上传通道：附件引用与 evidence_ref 同口径（非空即视为已补证）。 */
  async function addMessageAttachment() {
    messageUploading.value = true;
    try {
      const ids = await pickEvidenceAttachments((filePath) => uploadCsAttachment(filePath));
      messageAttachments.value.push(...ids);
    } finally {
      messageUploading.value = false;
    }
  }

  async function submitMessage(id: number) {
    if (!messageText.value.trim()) {
      uni.showToast({ title: '请填写回复内容', icon: 'none' });
      return;
    }
    messageSending.value = true;
    try {
      await postAfterSaleMessage(id, {
        content: messageText.value.trim(),
        visibility: messageInternal.value ? 'internal' : 'all',
        attachments: messageAttachments.value.map((attachmentId) => String(attachmentId)),
      });
      uni.showToast({ title: messageInternal.value ? '内部备注已记录' : '已回复', icon: 'success' });
      resetMessageForm();
      await loadMessages(id);
    } catch {
      // csRequest 层已提示（如售后单已结束）。
    } finally {
      messageSending.value = false;
    }
  }

  /** 提示补证：写一条客户可见的提示；说明必填 1–200 字。 */
  async function submitEvidenceRequest(id: number) {
    const note = evidenceNote.value.trim();
    if (!note) {
      uni.showToast({ title: '请填写补证说明', icon: 'none' });
      return;
    }
    requestingEvidence.value = true;
    try {
      await requestAfterSaleEvidence(id, note);
      uni.showToast({ title: '已提示客户补证', icon: 'success' });
      evidenceNote.value = '';
      await loadMessages(id);
    } catch {
      // csRequest 层已提示（如售后单已结束）。
    } finally {
      requestingEvidence.value = false;
    }
  }

  function actionCount(status: string): number {
    return actions.value.filter((action) => action.status === status).length;
  }

  function actionLabel(type: string): string {
    return (
      ({ refund: '退款', compensate: '补偿', makeup: '补钟', replace: '换人' }) as Record<
        string,
        string
      >
    )[type] || type;
  }

  function actionStatusText(status: string): string {
    return (
      ({
        pending: '待执行',
        executing: '执行中',
        succeeded: '已执行',
        failed: '执行失败',
        skipped: '已跳过',
      }) as Record<string, string>
    )[status] || status;
  }

  function onSourceTypeChange(e: Event) {
    const v = Number((e as unknown as { detail?: { value?: number } }).detail?.value);
    if (Number.isInteger(v)) sourceTypeIndex.value = v;
  }

  function onKindChange(e: Event) {
    const v = Number((e as unknown as { detail?: { value?: number } }).detail?.value);
    if (Number.isInteger(v)) kindIndex.value = v;
  }

  function onFaultChange(e: Event) {
    const v = Number((e as unknown as { detail?: { value?: number } }).detail?.value);
    if (Number.isInteger(v)) faultIndex.value = v;
  }

  function onPlanChange(e: Event) {
    const v = Number((e as unknown as { detail?: { value?: number } }).detail?.value);
    if (Number.isInteger(v)) planIndex.value = v;
  }

  function openCreate() {
    createForm.source_id = '';
    createForm.demand = '';
    createForm.expected_plan = '';
    createForm.contact = '';
    evidence.value = [];
    creating.value = true;
  }

  /** 凭证附件走 admin 上传通道：服务端按 admin.UID 校验归属，前台通道上传的会被拒。 */
  async function addEvidence() {
    uploading.value = true;
    try {
      const ids = await pickEvidenceAttachments((filePath) => uploadCsAttachment(filePath));
      evidence.value.push(...ids);
    } finally {
      uploading.value = false;
    }
  }

  async function submitCreate() {
    const sourceId = Number(createForm.source_id);
    if (!Number.isInteger(sourceId) || sourceId < 1) {
      uni.showToast({ title: '请填写有效的来源 ID', icon: 'none' });
      return;
    }
    if (!createForm.demand.trim()) {
      uni.showToast({ title: '请填写诉求描述', icon: 'none' });
      return;
    }
    submitting.value = true;
    try {
      await createAfterSale({
        source_type: sourceTypeOptions[sourceTypeIndex.value],
        source_id: sourceId,
        kind: kindOptions[kindIndex.value],
        demand: createForm.demand.trim(),
        expected_plan: createForm.expected_plan.trim(),
        contact: createForm.contact.trim() || undefined,
        evidence_attachment_ids: evidence.value.length ? evidence.value : undefined,
      });
      uni.showToast({ title: '已代建售后', icon: 'success' });
      creating.value = false;
      evidence.value = [];
      await load();
    } catch {
      // csRequest 层已提示（如引用他人附件被拒、来源归属不符）。
    } finally {
      submitting.value = false;
    }
  }

  function openPlan(item: CsAfterSale) {
    planForm.refund_cents = String(item.refund_cents || 0);
    planForm.resolution = '';
    faultIndex.value = 0;
    planIndex.value = 0;
    planning.value = true;
  }

  async function submitPlan() {
    const refundCents = Number(planForm.refund_cents);
    if (!Number.isFinite(refundCents) || refundCents < 0) {
      uni.showToast({ title: '请填写有效的退款金额', icon: 'none' });
      return;
    }
    submitting.value = true;
    try {
      await planAfterSale(expanded.value, {
        fault_party: faultOptions[faultIndex.value],
        plan_action: planOptions[planIndex.value],
        refund_cents: refundCents,
        resolution: planForm.resolution.trim(),
      });
      uni.showToast({ title: '方案已提交', icon: 'success' });
      planning.value = false;
      await load();
    } catch {
      // csRequest 层已提示。
    } finally {
      submitting.value = false;
    }
  }

  async function accept(item: CsAfterSale) {
    actingId.value = item.id;
    try {
      await acceptAfterSale(item.id);
      uni.showToast({ title: '已受理', icon: 'success' });
      await load();
    } catch {
      // csRequest 层已提示。
    } finally {
      actingId.value = 0;
    }
  }

  /**
   * 代客户确认方案（「待客户确认」→「待审批」）。
   * 与审批分开：只记 customer_confirm_channel=admin_proxy，不写审批人、不占退款额度；
   * 审批仍须另走「审批通过」，且审批人不得是该单处理人。
   */
  async function confirmByAdmin(item: CsAfterSale) {
    actingId.value = item.id;
    try {
      await confirmAfterSale(item.id);
      uni.showToast({ title: '已代客户确认，等待审批', icon: 'success' });
      await load();
      if (expanded.value === item.id) await loadActions(item.id);
    } catch {
      // csRequest 层已提示（如非「待客户确认」状态返回 409 中文文案）。
    } finally {
      actingId.value = 0;
    }
  }

  async function approve(item: CsAfterSale) {
    actingId.value = item.id;
    try {
      await approveAfterSale(item.id);
      uni.showToast({ title: '已审批通过', icon: 'success' });
      await load();
    } catch {
      // csRequest 层已提示。
    } finally {
      actingId.value = 0;
    }
  }

  /** 审批驳回：仅「待审批」单可用，与「代客确认」是两个独立动作。 */
  function openReject(item: CsAfterSale) {
    uni.showModal({
      title: '审批驳回',
      content: '请填写驳回原因',
      editable: true,
      placeholderText: '驳回原因',
      success: async (r) => {
        if (!r.confirm) return;
        if (!r.content?.trim()) {
          uni.showToast({ title: '驳回原因不能为空', icon: 'none' });
          return;
        }
        actingId.value = item.id;
        try {
          await rejectAfterSale(item.id, r.content.trim());
          uni.showToast({ title: '已审批驳回', icon: 'success' });
          await load();
        } catch {
          // csRequest 层已提示。
        } finally {
          actingId.value = 0;
        }
      },
    });
  }

  async function execute(item: CsAfterSale) {
    actingId.value = item.id;
    try {
      await executeAfterSale(item.id);
      uni.showToast({ title: '方案已执行', icon: 'success' });
      await load();
    } catch {
      // csRequest 层已提示。
    } finally {
      actingId.value = 0;
    }
  }

  async function withdraw(item: CsAfterSale) {
    actingId.value = item.id;
    try {
      await withdrawAfterSale(item.id);
      uni.showToast({ title: '已撤回', icon: 'success' });
      await load();
    } catch {
      // csRequest 层已提示。
    } finally {
      actingId.value = 0;
    }
  }

  onLoad((query) => {
    const sourceId = Number(query?.source_id || 0);
    const typeIndex = sourceTypeOptions.indexOf(String(query?.source_type || ''));
    if (typeIndex >= 0) sourceTypeIndex.value = typeIndex;
    if (Number.isInteger(sourceId) && sourceId > 0) {
      createForm.source_id = String(sourceId);
      creating.value = true;
    } else if (query?.create === '1') {
      // 企微会话侧「代建售后」：来源类型已预填，单据 ID 由客服从会话上下文确认。
      creating.value = true;
    }
  });
  onShow(load);
</script>

<style scoped lang="scss">
  .create-bar {
    display: flex;
    justify-content: flex-end;
  }

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

  .no {
    font-weight: 600;
  }

  .status {
    color: $brand;
    font-size: 26rpx;
  }

  .actions {
    display: flex;
    flex-wrap: wrap;
    gap: 16rpx;
    margin-top: 16rpx;
  }

  .detail {
    margin-top: 16rpx;
    padding-top: 16rpx;
    border-top: 1rpx solid $border;
  }

  .action {
    padding: 12rpx 0;
  }

  .ok {
    color: $success;
  }

  .waiting {
    color: #d46b08;
  }

  .evidence {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16rpx;
  }

  .messages {
    margin-top: 16rpx;
    padding-top: 16rpx;
    border-top: 1rpx solid $border;
  }

  .message {
    margin-top: 16rpx;
    padding: 16rpx;
    background: $bg;
    border-radius: $radius;
  }

  .switch-row {
    display: flex;
    align-items: center;
    gap: 12rpx;
    margin-bottom: 16rpx;
  }

  .input {
    flex: 1;
    height: 72rpx;
    padding: 0 24rpx;
    background: $bg;
    border-radius: $radius;
    font-size: 28rpx;
    box-sizing: border-box;
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

  .textarea {
    height: 160rpx;
    line-height: 1.5;
    padding: 16rpx 24rpx;
  }

  .sheet-actions {
    display: flex;
    justify-content: flex-end;
    gap: 16rpx;
    margin-top: 24rpx;
  }
</style>
