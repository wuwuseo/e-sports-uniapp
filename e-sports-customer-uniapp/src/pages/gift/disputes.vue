<template>
  <view>
    <view class="card">
      <view class="title">我的礼物</view>
      <view v-for="order in orders" :key="order.id" class="item">
        <view class="row"><text>礼物单号</text><text>{{ order.gift_no }}</text></view>
        <view class="row"><text>收礼陪玩</text><text>{{ order.player_name }}</text></view>
        <view class="row"><text>数量</text><text>{{ order.quantity }}</text></view>
        <view class="row"><text>金额</text><text>{{ money(order.amount_cents) }}</text></view>
        <view class="row"><text>已退</text><text>{{ money(order.refund_cents) }}</text></view>
        <view class="muted">可退 {{ money(order.amount_cents - order.refund_cents) }}（{{ refundStatusText(order.refund_status) }}）</view>
        <button
          v-if="refundable(order)"
          class="primary"
          :disabled="submitting"
          @click="apply(order)"
        >
          发起争议退款
        </button>
        <button class="ghost" :disabled="submitting" @click="openAfterSale(order)">
          申请售后
        </button>
      </view>
      <view v-if="!loading && !orders.length" class="muted">暂无礼物记录</view>
    </view>

    <view v-if="afterSaleVisible" class="card">
      <view class="title">申请售后（礼物）</view>
      <view class="muted">{{ afterSaleTarget?.gift_no }}</view>
      <view class="row">
        <text>售后类型</text>
        <picker
          mode="selector"
          :range="afterSaleKinds"
          range-key="label"
          @change="onAfterSaleKindChange"
        >
          <text class="picker-value">
            {{ afterSaleKind ? afterSaleKindText(afterSaleKind) : '请选择' }} ›
          </text>
        </picker>
      </view>
      <textarea
        v-model="afterSaleDemand"
        class="textarea"
        maxlength="255"
        placeholder="请描述售后诉求"
      />
      <view class="row">
        <text>期望方案</text>
        <input
          v-model="afterSaleExpectedPlan"
          class="input"
          maxlength="255"
          placeholder="如：按差额退款（选填）"
        />
      </view>
      <view class="row">
        <text>联系方式</text>
        <input
          v-model="afterSaleContact"
          class="input"
          maxlength="120"
          placeholder="微信号 / 手机号（选填）"
        />
      </view>
      <view class="row evidence">
        <text>凭证</text>
        <button class="ghost" :disabled="afterSaleUploading" @click="addEvidence">
          上传凭证
        </button>
      </view>
      <view v-for="(id, index) in afterSaleEvidence" :key="index" class="muted">
        已上传凭证附件 #{{ id }}
      </view>
      <view class="actions">
        <button class="primary" :loading="afterSaleSubmitting" @click="submitAfterSale">
          提交售后
        </button>
        <button class="ghost" @click="afterSaleVisible = false">取消</button>
      </view>
    </view>

    <view class="card">
      <view class="title">我的礼物争议</view>
      <view v-for="item in disputes" :key="item.id" class="item">
        <view class="row"><text>争议单号</text><text>{{ item.dispute_no }}</text></view>
        <view class="row"><text>礼物单号</text><text>{{ item.gift_no }}</text></view>
        <view class="row"><text>类型</text><text>{{ kindText(item.kind) }}</text></view>
        <view class="row"><text>状态</text><text>{{ statusText(item.status) }}</text></view>
        <view class="row"><text>申请退款</text><text>{{ money(item.requested_refund_cents) }}</text></view>
        <view v-if="item.approved_refund_cents" class="row">
          <text>确认退款</text><text>{{ money(item.approved_refund_cents) }}</text>
        </view>
        <view class="muted">诉求：{{ item.demand }}</view>
        <view v-if="item.resolution" class="muted">客服说明：{{ item.resolution }}</view>
        <button
          v-if="openStatus(item.status)"
          class="ghost"
          :disabled="withdrawingId === item.id"
          @click="withdraw(item)"
        >
          撤回申请
        </button>
      </view>
      <view v-if="!loading && !disputes.length" class="muted">暂无争议单</view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { onShow } from '@dcloudio/uni-app';
import { ref } from 'vue';
import {
  createAfterSale,
  createMyGiftDispute,
  fetchMyGiftDisputes,
  fetchMyGiftOrders,
  withdrawMyGiftDispute,
} from '../../api/esports';
import type { GiftDispute, GiftOrder } from '../../api/esports';
import {
  afterSaleKindText,
  afterSaleKinds,
  money,
  yuanToCents,
} from '../../utils/format';
import { pickEvidenceAttachments } from '../../utils/evidence';

const kinds: Array<{ label: string; value: GiftDispute['kind'] }> = [
  { label: '未收到礼物', value: 'not_received' },
  { label: '送错对象', value: 'wrong_gift' },
  { label: '礼物与说明不符', value: 'quality' },
  { label: '非本人授权送礼', value: 'unauthorized' },
  { label: '其他', value: 'other' },
];

const orders = ref<GiftOrder[]>([]);
const disputes = ref<GiftDispute[]>([]);
const loading = ref(false);
const submitting = ref(false);
const withdrawingId = ref(0);

const afterSaleVisible = ref(false);
const afterSaleTarget = ref<GiftOrder | null>(null);
const afterSaleKind = ref('');
const afterSaleDemand = ref('');
const afterSaleExpectedPlan = ref('');
const afterSaleContact = ref('');
const afterSaleEvidence = ref<number[]>([]);
const afterSaleUploading = ref(false);
const afterSaleSubmitting = ref(false);

const refundable = (order: GiftOrder) =>
  order.status === 'paid' && order.refund_status !== 'full';
const openStatus = (status: GiftDispute['status']) =>
  status === 'pending_review' || status === 'approved';
const refundStatusText = (value: GiftOrder['refund_status']) =>
  ({ none: '未退款', partial: '部分退款', full: '已全额退款' })[value];
const statusText = (value: GiftDispute['status']) =>
  ({
    pending_review: '待客服审核',
    approved: '审核通过，等待执行退款',
    rejected: '已驳回',
    completed: '已完成退款',
    withdrawn: '已撤回',
  })[value];
const kindText = (value: GiftDispute['kind']) =>
  kinds.find((item) => item.value === value)?.label || value;

async function load() {
  loading.value = true;
  try {
    const [orderList, disputeList] = await Promise.all([
      fetchMyGiftOrders(),
      fetchMyGiftDisputes(),
    ]);
    orders.value = orderList || [];
    disputes.value = disputeList || [];
  } catch {
    uni.showToast({ title: '加载失败', icon: 'none' });
  } finally {
    loading.value = false;
  }
}

function prompt(title: string, placeholder: string, value = '') {
  return new Promise<string>((resolve) => {
    uni.showModal({
      title,
      editable: true,
      placeholderText: placeholder,
      content: value,
      success: (res) => resolve(res.confirm ? (res.content || '').trim() : ''),
      fail: () => resolve(''),
    });
  });
}

async function apply(order: GiftOrder) {
  const available = order.amount_cents - order.refund_cents;
  if (available <= 0) {
    uni.showToast({ title: '该礼物已退满', icon: 'none' });
    return;
  }
  const kind = await new Promise<GiftDispute['kind'] | null>((resolve) => {
    uni.showActionSheet({
      itemList: kinds.map((item) => item.label),
      success: (res) => resolve(kinds[res.tapIndex]?.value || null),
      fail: () => resolve(null),
    });
  });
  if (!kind) return;
  const demand = await prompt('争议诉求', '请描述遇到的情况');
  if (!demand) return;
  const amountText = await prompt('申请退款金额（元）', '不超过可退余额', (available / 100).toFixed(2));
  if (!amountText) return;
  const amount = yuanToCents(amountText);
  if (!Number.isFinite(amount) || amount <= 0 || amount > available) {
    uni.showToast({ title: '金额非法或超出可退余额', icon: 'none' });
    return;
  }
  submitting.value = true;
  try {
    await createMyGiftDispute({
      gift_order_id: order.id,
      kind,
      demand,
      requested_refund_cents: amount,
    });
    uni.showToast({ title: '已提交，等待客服审核', icon: 'none' });
    await load();
  } catch {
    uni.showToast({ title: '提交失败：已有进行中争议或参数无效', icon: 'none' });
  } finally {
    submitting.value = false;
  }
}

async function withdraw(item: GiftDispute) {
  const confirmed = await new Promise<boolean>((resolve) => {
    uni.showModal({
      title: '撤回争议',
      content: `确认撤回争议单 ${item.dispute_no}？撤回后需重新申请。`,
      success: (res) => resolve(res.confirm),
      fail: () => resolve(false),
    });
  });
  if (!confirmed) return;
  withdrawingId.value = item.id;
  try {
    await withdrawMyGiftDispute(item.id);
    uni.showToast({ title: '已撤回', icon: 'none' });
    await load();
  } catch {
    uni.showToast({ title: '撤回失败，请刷新后重试', icon: 'none' });
    await load();
  } finally {
    withdrawingId.value = 0;
  }
}

function openAfterSale(order: GiftOrder) {
  afterSaleTarget.value = order;
  afterSaleKind.value = '';
  afterSaleDemand.value = '';
  afterSaleExpectedPlan.value = '';
  afterSaleContact.value = '';
  afterSaleEvidence.value = [];
  afterSaleVisible.value = true;
}

function onAfterSaleKindChange(e: { detail: { value: number | string } }) {
  const index = Number(e.detail.value);
  afterSaleKind.value = afterSaleKinds[index]?.value || '';
}

async function addEvidence() {
  afterSaleUploading.value = true;
  try {
    const ids = await pickEvidenceAttachments();
    afterSaleEvidence.value.push(...ids);
  } finally {
    afterSaleUploading.value = false;
  }
}

async function submitAfterSale() {
  if (!afterSaleTarget.value) return;
  if (!afterSaleKind.value) {
    uni.showToast({ title: '请选择售后类型', icon: 'none' });
    return;
  }
  if (!afterSaleDemand.value.trim()) {
    uni.showToast({ title: '请填写售后诉求', icon: 'none' });
    return;
  }
  afterSaleSubmitting.value = true;
  try {
    await createAfterSale({
      source_type: 'gift',
      source_id: afterSaleTarget.value.id,
      kind: afterSaleKind.value,
      demand: afterSaleDemand.value.trim(),
      expected_plan: afterSaleExpectedPlan.value.trim(),
      contact: afterSaleContact.value.trim(),
      evidence_attachment_ids: afterSaleEvidence.value.length
        ? afterSaleEvidence.value
        : undefined,
    });
    uni.showToast({ title: '售后申请已提交', icon: 'none' });
    afterSaleVisible.value = false;
  } catch {
    // request 层已提示。
  } finally {
    afterSaleSubmitting.value = false;
  }
}

onShow(load);
</script>

<style scoped lang="scss">
.title {
  font-weight: 600;
  margin-bottom: 16rpx;
}

.item {
  padding: 20rpx 0;
  border-top: 1rpx solid $border;
}

.item:first-of-type {
  border-top: none;
}

.row {
  display: flex;
  justify-content: space-between;
  margin-bottom: 14rpx;
}

.muted {
  color: $text-2;
  font-size: 26rpx;
  margin-top: 8rpx;
}

.primary {
  margin-top: 20rpx;
  background: $brand;
  color: #fff;
  border-radius: $radius;
}

.ghost {
  margin-top: 20rpx;
  background: $bg;
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
</style>
