<template>
  <view>
    <view class="card">
      <button class="ghost entry" @click="openApply">发起售后申请</button>
    </view>

    <view v-if="applyVisible" class="card">
      <view class="section-title">发起售后申请</view>
      <view class="row">
        <text>来源类型</text>
        <picker
          mode="selector"
          :range="afterSaleSourceTypes"
          range-key="label"
          @change="onSourceTypeChange"
        >
          <text class="picker-value">{{ sourceTypeText }} ›</text>
        </picker>
      </view>
      <view class="row">
        <text>来源 ID</text>
        <input
          v-model="sourceIdText"
          class="input"
          type="number"
          placeholder="订单/礼物/充值 ID"
        />
      </view>
      <view class="row">
        <text>售后类型</text>
        <picker
          mode="selector"
          :range="afterSaleKinds"
          range-key="label"
          @change="onKindChange"
        >
          <text class="picker-value">
            {{ afterSaleKind ? afterSaleKindText(afterSaleKind) : '请选择' }} ›
          </text>
        </picker>
      </view>
      <textarea
        v-model="demand"
        class="textarea"
        maxlength="255"
        placeholder="请描述售后诉求"
      />
      <view class="row">
        <text>期望方案</text>
        <input
          v-model="expectedPlan"
          class="input"
          maxlength="255"
          placeholder="如：按差额退款（选填）"
        />
      </view>
      <view class="row">
        <text>联系方式</text>
        <input
          v-model="contact"
          class="input"
          maxlength="120"
          placeholder="微信号 / 手机号（选填）"
        />
      </view>
      <view class="row evidence">
        <text>凭证</text>
        <button class="ghost" :disabled="uploading" @click="addEvidence">上传凭证</button>
      </view>
      <view v-for="(id, index) in evidence" :key="index" class="muted">
        已上传凭证附件 #{{ id }}
      </view>
      <view class="actions">
        <button class="primary" :loading="submittingApply" @click="submitApply">提交</button>
        <button class="ghost" @click="applyVisible = false">取消</button>
      </view>
    </view>

    <view v-if="items.length === 0" class="empty">暂无售后单</view>
    <view v-for="item in items" :key="item.id" class="card">
      <view class="row" @click="toggle(item.id)">
        <text class="no">{{ item.after_sale_no.slice(0, 12) }}</text>
        <text class="status">{{ afterSaleStatusText(item.status) }}</text>
      </view>
      <view class="muted">关联订单 #{{ item.source_id }}</view>
      <view class="muted">{{ afterSaleKindText(item.kind) }} · {{ item.demand }}</view>
      <view v-if="item.expected_plan" class="muted">期望方案：{{ item.expected_plan }}</view>

      <view v-if="item.status === 'pending_customer_confirm'" class="confirm">
        <view class="muted">
          客服给出的方案：{{ planActionText(item.plan_action) }}
          <text v-if="item.refund_cents > 0"> · 赔付 {{ money(item.refund_cents) }}</text>
        </view>
        <view v-if="item.resolution" class="muted">说明：{{ item.resolution }}</view>
        <view class="actions">
          <button class="primary" @click="confirm(item.id)">确认方案</button>
          <button class="ghost" @click="openDecline(item.id)">拒绝</button>
        </view>
      </view>

      <view v-else-if="item.status === 'pending_execution'" class="muted">
        方案已确认，等待执行；到账前不会显示为「已退款」。
      </view>
      <view v-else-if="item.customer_decline_reason" class="muted">
        你已拒绝方案：{{ item.customer_decline_reason }}
      </view>

      <view class="expand" @click="toggle(item.id)">
        {{ expanded === item.id ? '收起进度与沟通' : '查看逐项进度与沟通' }}
      </view>

      <!-- 逐项进度：待执行与已到账分开显示，待执行绝不显示成已到账 -->
      <view v-if="expanded === item.id" class="detail">
        <view v-if="progress" class="progress">
          <view class="muted">{{ progress.settlement_label }}</view>
          <view class="muted">
            已到账 {{ money(progress.refunded_cents) }} · 待执行 {{ money(progress.pending_cents) }}
          </view>
          <view v-for="action in progress.actions" :key="action.seq" class="action">
            <view class="row">
              <text>{{ action.seq }}. {{ action.action_label }}</text>
              <text :class="action.status === 'succeeded' ? 'ok' : 'waiting'">
                {{ action.status_label }}
              </text>
            </view>
            <view class="muted">
              <text v-if="action.amount_cents">金额 {{ money(action.amount_cents) }} · </text>
              <text v-if="action.result_summary">{{ action.result_summary }}</text>
              <text v-if="action.executed_at"> · {{ datetime(action.executed_at) }}</text>
            </view>
          </view>
          <view v-if="progress.actions.length === 0" class="muted">
            暂无逐项动作，方案执行后这里会逐项显示进度。
          </view>
        </view>
        <view v-else class="muted">正在读取进度…</view>

        <!-- 补证提示：客服提示补证后，带附件回复即视为已补证 -->
        <view v-if="evidenceStatus?.pending_evidence" class="notice">
          <view>客服提示补证：{{ evidenceStatus.request_note || '请补充凭证' }}</view>
          <view class="muted">回复时请附带截图 / PDF 附件，未带附件的回复不会解除待补证。</view>
        </view>

        <!-- 售后凭证：建单时上传的附件清单，只读确认 -->
        <view class="evidence-list">
          <view class="muted">售后凭证</view>
          <view v-if="attachments.length === 0" class="muted">暂无凭证附件</view>
          <view v-for="file in attachments" :key="file.id" class="attachment">
            <text>{{ file.original_name || file.name || `附件 #${file.id}` }}</text>
            <text class="muted">
              {{ file.mime_type }} · {{ sizeText(file.size) }}
            </text>
          </view>
        </view>

        <view class="messages">
          <view class="muted">沟通记录</view>
          <view v-if="messages.length === 0" class="muted">暂无沟通记录</view>
          <view v-for="message in messages" :key="message.id" class="message">
            <view class="muted">
              {{ message.author_type === 'customer' ? '我' : message.author_name || '客服' }} ·
              {{ datetime(message.created_at) }}
            </view>
            <view>{{ message.content }}</view>
            <view v-if="message.attachments?.length" class="muted">
              附件 {{ message.attachments.map((ref) => `#${ref}`).join('、') }}
            </view>
          </view>
          <textarea
            v-model="replyContent"
            class="textarea"
            maxlength="1000"
            placeholder="补充说明或回复补证（≤1000 字）"
          />
          <view class="row evidence">
            <text>回复附件</text>
            <button class="ghost" :disabled="replyUploading" @click="addReplyEvidence">
              上传附件
            </button>
          </view>
          <view v-for="(id, index) in replyEvidence" :key="index" class="muted">
            已上传附件 #{{ id }}
          </view>
          <button class="primary" :loading="replySubmitting" @click="submitReply(item.id)">
            发送回复
          </button>
        </view>
      </view>
    </view>

    <view v-if="declineVisible" class="card">
      <view class="section-title">拒绝方案</view>
      <textarea
        v-model="declineReason"
        class="textarea"
        maxlength="255"
        placeholder="请说明原因，客服会据此调整方案"
      />
      <view class="actions">
        <button class="primary" :loading="submitting" @click="submitDecline">提交</button>
        <button class="ghost" @click="declineVisible = false">取消</button>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
  import { onLoad, onShow } from '@dcloudio/uni-app';
  import { computed, ref } from 'vue';
  import {
    confirmAfterSalePlan,
    createAfterSale,
    declineAfterSalePlan,
    fetchAfterSaleEvidence,
    fetchAfterSaleEvidenceStatus,
    fetchAfterSaleMessages,
    fetchAfterSaleProgress,
    fetchMyAfterSales,
    postAfterSaleMessage,
  } from '../../api/esports';
  import type {
    AfterSale,
    AfterSaleEvidenceStatus,
    AfterSaleMessage,
    AfterSaleProgress,
    AfterSaleSourceType,
    EsportsAttachment,
  } from '../../api/esports';
  import {
    afterSaleKindText,
    afterSaleKinds,
    afterSaleSourceTypes,
    afterSaleStatusText,
    datetime,
    money,
    planActionText,
  } from '../../utils/format';
  import { pickEvidenceAttachments } from '../../utils/evidence';

  const items = ref<AfterSale[]>([]);
  const declineVisible = ref(false);
  const declineReason = ref('');
  const declineTarget = ref(0);
  const submitting = ref(false);

  const applyVisible = ref(false);
  const sourceType = ref<AfterSaleSourceType>('order');
  const sourceIdText = ref('');
  const afterSaleKind = ref('');
  const demand = ref('');
  const expectedPlan = ref('');
  const contact = ref('');
  const evidence = ref<number[]>([]);
  const uploading = ref(false);
  const submittingApply = ref(false);

  // 逐项进度 / 补证状态 / 沟通记录（按展开的售后单懒加载）
  const expanded = ref(0);
  const progress = ref<AfterSaleProgress | null>(null);
  const evidenceStatus = ref<AfterSaleEvidenceStatus | null>(null);
  const messages = ref<AfterSaleMessage[]>([]);
  const attachments = ref<EsportsAttachment[]>([]);
  const replyContent = ref('');
  const replyEvidence = ref<number[]>([]);
  const replyUploading = ref(false);
  const replySubmitting = ref(false);

  const sourceTypeText = computed(
    () => afterSaleSourceTypes.find((item) => item.value === sourceType.value)?.label || '订单'
  );

  /** 附件大小文案（KB / MB）。 */
  const sizeText = (size: number) => {
    const bytes = Number(size) || 0;
    if (bytes <= 0) return '—';
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  };

  async function load() {
    try {
      items.value = (await fetchMyAfterSales()) || [];
    } catch {
      items.value = [];
    }
  }

  /** 展开时按需读取逐项进度、补证状态与沟通记录；单项失败不影响其它两项。 */
  async function toggle(id: number) {
    if (expanded.value === id) {
      expanded.value = 0;
      return;
    }
    expanded.value = id;
    progress.value = null;
    evidenceStatus.value = null;
    messages.value = [];
    attachments.value = [];
    replyContent.value = '';
    replyEvidence.value = [];
    try {
      progress.value = await fetchAfterSaleProgress(id);
    } catch {
      progress.value = null;
    }
    try {
      evidenceStatus.value = await fetchAfterSaleEvidenceStatus(id);
    } catch {
      evidenceStatus.value = null;
    }
    try {
      attachments.value = (await fetchAfterSaleEvidence(id)) || [];
    } catch {
      attachments.value = [];
    }
    try {
      messages.value = (await fetchAfterSaleMessages(id)) || [];
    } catch {
      messages.value = [];
    }
  }

  async function confirm(id: number) {
    try {
      await confirmAfterSalePlan(id);
      uni.showToast({ title: '已确认方案', icon: 'none' });
      await load();
    } catch {
      // request 层已提示。
    }
  }

  function openDecline(id: number) {
    declineTarget.value = id;
    declineReason.value = '';
    declineVisible.value = true;
  }

  async function submitDecline() {
    if (!declineReason.value.trim()) {
      uni.showToast({ title: '请填写拒绝原因', icon: 'none' });
      return;
    }
    submitting.value = true;
    try {
      await declineAfterSalePlan(declineTarget.value, declineReason.value.trim());
      declineVisible.value = false;
      uni.showToast({ title: '已拒绝，客服会重新处理', icon: 'none' });
      await load();
    } catch {
      // request 层已提示。
    } finally {
      submitting.value = false;
    }
  }

  function openApply() {
    sourceType.value = 'order';
    sourceIdText.value = '';
    afterSaleKind.value = '';
    demand.value = '';
    expectedPlan.value = '';
    contact.value = '';
    evidence.value = [];
    applyVisible.value = true;
  }

  function onSourceTypeChange(e: { detail: { value: number | string } }) {
    const item = afterSaleSourceTypes[Number(e.detail.value)];
    if (item) sourceType.value = item.value;
  }

  function onKindChange(e: { detail: { value: number | string } }) {
    afterSaleKind.value = afterSaleKinds[Number(e.detail.value)]?.value || '';
  }

  async function addEvidence() {
    uploading.value = true;
    try {
      const ids = await pickEvidenceAttachments();
      evidence.value.push(...ids);
    } finally {
      uploading.value = false;
    }
  }

  async function addReplyEvidence() {
    replyUploading.value = true;
    try {
      const ids = await pickEvidenceAttachments();
      replyEvidence.value.push(...ids);
    } finally {
      replyUploading.value = false;
    }
  }

  /** 回复沟通记录：附件引用用附件 ID 的字符串形式，服务端以「非空附件」判定已补证。 */
  async function submitReply(id: number) {
    if (!replyContent.value.trim()) {
      uni.showToast({ title: '请填写回复内容', icon: 'none' });
      return;
    }
    replySubmitting.value = true;
    try {
      await postAfterSaleMessage(id, {
        content: replyContent.value.trim(),
        attachments: replyEvidence.value.map((attachmentId) => String(attachmentId)),
      });
      uni.showToast({ title: '已发送', icon: 'success' });
      replyContent.value = '';
      replyEvidence.value = [];
      messages.value = (await fetchAfterSaleMessages(id)) || [];
      evidenceStatus.value = await fetchAfterSaleEvidenceStatus(id);
    } catch {
      // request 层已提示（如售后单已结束）。
    } finally {
      replySubmitting.value = false;
    }
  }

  async function submitApply() {
    const sourceId = Number(sourceIdText.value);
    if (!Number.isFinite(sourceId) || sourceId <= 0) {
      uni.showToast({ title: '请填写正确的来源 ID', icon: 'none' });
      return;
    }
    if (!afterSaleKind.value) {
      uni.showToast({ title: '请选择售后类型', icon: 'none' });
      return;
    }
    if (!demand.value.trim()) {
      uni.showToast({ title: '请填写售后诉求', icon: 'none' });
      return;
    }
    submittingApply.value = true;
    try {
      await createAfterSale({
        source_type: sourceType.value,
        source_id: sourceId,
        kind: afterSaleKind.value,
        demand: demand.value.trim(),
        expected_plan: expectedPlan.value.trim(),
        contact: contact.value.trim(),
        evidence_attachment_ids: evidence.value.length ? evidence.value : undefined,
      });
      uni.showToast({ title: '售后申请已提交', icon: 'none' });
      applyVisible.value = false;
      await load();
    } catch {
      // request 层已提示。
    } finally {
      submittingApply.value = false;
    }
  }

  /** 从订单列表 / 帮助中心跳转时带出来源单据并直接展开申请表单。 */
  onLoad((query) => {
    const querySourceType = String(query?.source_type || '');
    const matched = afterSaleSourceTypes.find((item) => item.value === querySourceType);
    if (matched) sourceType.value = matched.value;
    const sourceId = Number(query?.source_id || 0);
    if (Number.isInteger(sourceId) && sourceId > 0) sourceIdText.value = String(sourceId);
    if (sourceIdText.value || query?.apply === '1') applyVisible.value = true;
  });

  onShow(load);
</script>

<style scoped lang="scss">
  .no {
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

  .confirm {
    margin-top: 16rpx;
    padding-top: 16rpx;
    border-top: 1rpx solid $border;
  }

  .actions {
    display: flex;
    gap: 16rpx;
    margin-top: 20rpx;
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
    border-radius: $radius;
  }

  .textarea {
    height: 160rpx;
    width: 100%;
    padding: 16rpx 20rpx;
    background: $bg;
    border-radius: $radius;
    box-sizing: border-box;
  }

  .entry {
    flex: none;
  }

  .picker-value {
    color: $brand;
  }

  .input {
    flex: 1;
    text-align: right;
    padding: 8rpx 0;
  }

  .evidence {
    align-items: center;
    margin-top: 16rpx;
  }

  .evidence .ghost {
    flex: none;
  }

  .expand {
    margin-top: 16rpx;
    color: $brand;
    font-size: 26rpx;
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

  .notice {
    margin-top: 16rpx;
    padding: 16rpx;
    background: #fff7e6;
    color: #d46b08;
    border-radius: $radius;
    font-size: 26rpx;
  }

  .messages {
    margin-top: 16rpx;
    padding-top: 16rpx;
    border-top: 1rpx solid $border;
  }

  .evidence-list {
    margin-top: 16rpx;
    padding-top: 16rpx;
    border-top: 1rpx solid $border;
  }

  .attachment {
    display: flex;
    justify-content: space-between;
    padding: 10rpx 0;
  }

  .message {
    margin-top: 16rpx;
    padding: 16rpx;
    background: $bg;
    border-radius: $radius;
  }
</style>
