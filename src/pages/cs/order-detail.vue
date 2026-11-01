<template>
  <view>
    <view v-if="order" class="card">
      <view class="row">
        <text class="order-no">{{ order.order_no }}</text>
        <text class="amount">{{ money(order.payable_cents) }}</text>
      </view>
      <view class="muted">
        {{ fulfillmentText(order.fulfillment_status) }} · 客户#{{ order.customer_id }} ·
        商品#{{ order.product_id }} · {{ order.quantity }} 份
      </view>
      <view class="muted">付款：{{ paymentText(order.payment_status) }}（{{ order.payment_channel }}）</view>
      <view class="muted">预约：{{ appointmentText(order.appointment_status) }}</view>
      <view v-if="order.requested_start_at" class="muted">预约开始：{{ datetime(order.requested_start_at) }}</view>
      <view class="muted">负责客服：{{ order.responsible_admin_id ?? '未认领' }}</view>
      <view class="muted">
        席位 {{ order.required_seats }} · 承诺服务量 {{ order.promised_service_units }} ·
        加钟追加 {{ money(order.addon_cents) }} · 已退款 {{ money(order.refunded_cents) }}
      </view>
      <view class="muted">下单时间：{{ datetime(order.created_at) }}</view>
    </view>

    <view v-if="order" class="card">
      <view class="section-title">订单操作</view>
      <view class="ops">
        <button
          v-if="order.fulfillment_status === 'pending_dispatch' || order.fulfillment_status === 'pending_acceptance'"
          class="mini plain"
          :loading="actingId === order.id"
          @click="remind"
        >
          催单
        </button>
        <button v-if="canTransfer" class="mini plain" @click="openTransfer">转单</button>
        <button v-if="order.fulfillment_status === 'in_service'" class="mini primary" @click="openAddon">
          加钟
        </button>
        <button v-if="order.fulfillment_status === 'pending_close'" class="mini success" @click="openClose">
          结单
        </button>
        <button v-if="order.fulfillment_status === 'pending_close_review'" class="mini success" @click="approve">
          复核通过
        </button>
        <button v-if="order.fulfillment_status === 'pending_close_review'" class="mini danger" @click="openReject">
          复核驳回
        </button>
        <button v-if="canCancel" class="mini danger" @click="openCancel">取消订单</button>
      </view>
    </view>

    <!-- 转单 -->
    <view v-if="transferOpen" class="mask">
      <view class="sheet">
        <view class="sheet-title">转单</view>
        <input v-model="transferForm.adminId" class="field" type="number" placeholder="目标客服 ID（必填）" />
        <input v-model="transferForm.reason" class="field" placeholder="转单原因（必填）" />
        <view class="sheet-actions">
          <button class="mini plain" @click="transferOpen = false">取消</button>
          <button class="mini primary" :loading="actingId === order?.id" @click="submitTransfer">提交</button>
        </view>
      </view>
    </view>

    <!-- 加钟 -->
    <view v-if="addonOpen" class="mask">
      <view class="sheet sheet-lg">
        <view class="sheet-title">订单加钟</view>
        <input v-model="addonForm.addedYuan" class="field" type="digit" placeholder="追加金额（元）" />
        <input v-model="addonForm.addedUnits" class="field" type="number" placeholder="追加服务量" />
        <input v-model="addonForm.note" class="field" placeholder="备注（选填）" />
        <view class="muted">金额与服务量至少一项为正；发起后由陪玩确认，确认前无法结单。</view>
        <view class="sheet-actions">
          <button class="mini plain" @click="addonOpen = false">关闭</button>
          <button class="mini primary" :loading="addonSubmitting" @click="submitAddon">发起加钟</button>
        </view>
        <view v-if="addons.length === 0" class="muted" style="margin-top: 16rpx">暂无加钟记录</view>
        <view v-for="item in addons" :key="item.id" class="candidate">
          <view class="row">
            <text class="cand-name">{{ item.addon_no }}</text>
            <text class="muted">{{ money(item.added_cents) }} · {{ item.added_units }} 单位</text>
          </view>
          <view class="muted">状态：{{ addonStatusText(item.status) }} · 收款：{{ addonPayText(item) }}</view>
          <view class="sheet-actions">
            <button v-if="item.status === 'pending'" class="mini plain" @click="withdrawAddon(item)">撤回</button>
            <button
              v-if="item.status === 'confirmed' && item.payment_status === 'unpaid'"
              class="mini success"
              @click="collectAddon(item)"
            >
              余额收款
            </button>
          </view>
        </view>
      </view>
    </view>

    <!-- 结单 -->
    <view v-if="closeOpen" class="mask">
      <view class="sheet sheet-lg">
        <view class="sheet-title">结单</view>
        <textarea v-model="closeNote" class="textarea" placeholder="结单备注（必填）" />
        <view v-if="closeCondition && closeCondition.items.length > 0" class="cond">
          <view class="muted">结单条件（{{ closeCondition.rule_code || '内置默认' }}）</view>
          <view v-for="(item, idx) in closeCondition.items" :key="idx" class="cond-row">
            <text :class="item.satisfied ? 'ok' : 'fail'">{{ item.satisfied ? '满足' : '未满足' }}</text>
            <text class="muted">{{ item.label }} 需 {{ item.operator }} {{ item.expected }}，当前 {{ item.actual }}</text>
          </view>
        </view>
        <view v-if="closeForm && closeForm.fields.length > 0">
          <view class="muted" style="margin-top: 16rpx">
            结单表单（{{ closeForm.template ? `${closeForm.template.name}` : '无适用模板' }}）
          </view>
          <view v-for="field in closeForm.fields" :key="field.key" class="field-block">
            <view class="label">
              {{ field.label }}
              <text v-if="isCloseFormRequired(field)" class="req">*</text>
            </view>
            <input
              v-if="field.field_type === 'text' || field.field_type === 'datetime' || field.field_type === 'image' || field.field_type === 'reference'"
              class="input"
              :value="closeFormText(field.key)"
              :maxlength="field.max_length > 0 ? field.max_length : -1"
              :placeholder="closeFormPlaceholder(field)"
              @input="setCloseFormText(field.key, $event)"
            />
            <input
              v-else-if="field.field_type === 'number'"
              class="input"
              type="number"
              :value="closeFormNumber(field.key)"
              placeholder="请输入数字"
              @input="setCloseFormNumber(field.key, $event)"
            />
            <view v-else-if="field.field_type === 'money'" class="input readonly">
              {{ money(order ? order.payable_cents : 0) }}
            </view>
            <picker
              v-else-if="field.field_type === 'select'"
              :range="field.options || []"
              :value="selectIndex(field)"
              @change="setCloseFormSelect(field, $event)"
            >
              <view class="picker">{{ closeFormText(field.key) || '请选择' }}</view>
            </picker>
            <view v-else-if="field.field_type === 'multiselect'" class="chips">
              <view
                v-for="option in field.options || []"
                :key="option"
                class="chip"
                :class="{ active: closeFormMulti(field.key).includes(option) }"
                @click="toggleCloseFormMulti(field.key, option)"
              >
                {{ option }}
              </view>
            </view>
            <view
              v-else-if="field.field_type === 'switch'"
              class="chip"
              :class="{ active: closeFormBool(field.key) }"
              @click="toggleCloseFormBool(field.key)"
            >
              {{ closeFormBool(field.key) ? '是' : '否' }}
            </view>
          </view>
        </view>
        <!-- 查看服务凭证：后端要求结单回传覆盖全部图片附件的 viewed_evidence_attachment_ids -->
        <view v-if="evidenceIds.length > 0" class="evidence">
          <view class="evidence-head">
            <text class="evidence-title">查看服务凭证</text>
            <text class="muted">
              共 {{ evidenceIds.length }} 张 · 已查看 {{ viewedEvidenceIds.length }} 张
            </text>
          </view>
          <view class="muted">
            结单前须逐张查看陪玩上传的凭证图片；点缩略图即计为已查看，未全部确认时结单会被拦下。
          </view>
          <view class="evidence-grid">
            <view v-for="attachmentId in evidenceIds" :key="attachmentId" class="evidence-item">
              <image
                v-if="evidenceUrls[attachmentId]"
                :src="evidenceUrls[attachmentId]"
                mode="aspectFill"
                class="evidence-thumb"
                @click="previewEvidence(attachmentId)"
              />
              <view
                v-else
                class="evidence-thumb evidence-missing"
                @click="loadEvidenceUrl(attachmentId)"
              >
                <text class="evidence-missing-title">地址获取失败</text>
                <text class="muted">点击重试</text>
              </view>
              <view class="evidence-meta">
                <text class="muted">附件 #{{ attachmentId }}</text>
                <text :class="isEvidenceViewed(attachmentId) ? 'ok' : 'fail'">
                  {{ isEvidenceViewed(attachmentId) ? '已查看' : '未查看' }}
                </text>
              </view>
              <view class="evidence-actions">
                <button class="mini plain" @click="openEvidence(attachmentId)">下载 / 打开</button>
                <button class="mini plain" @click="toggleEvidenceViewed(attachmentId)">
                  {{ isEvidenceViewed(attachmentId) ? '取消标记' : '标记已查看' }}
                </button>
              </view>
            </view>
          </view>
          <view class="sheet-actions">
            <button class="mini success" :disabled="allEvidenceViewed" @click="markAllEvidenceViewed">
              全部我已查看
            </button>
          </view>
        </view>
        <view v-if="substituteRows.length > 0" class="muted" style="margin-top: 16rpx">
          代提交：第 {{ substituteRows.map((r) => r.seatIndex).join('、') }} 席未上报，可代填服务量后结单
        </view>
        <view v-for="row in substituteRows" :key="row.seatIndex" class="field-block">
          <view class="label">第 {{ row.seatIndex }} 席服务量</view>
          <input v-model="row.units" class="input" type="number" placeholder="上报服务量" />
        </view>
        <view class="sheet-actions">
          <button class="mini plain" @click="closeOpen = false">取消</button>
          <button class="mini success" :loading="closeSubmitting" @click="submitClose">提交结单</button>
        </view>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
  import { onLoad, onShow } from '@dcloudio/uni-app';
  import { computed, ref } from 'vue';
  import {
    approveCloseReview,
    cancelOrder,
    cancelOrderAddon,
    closeOrder,
    createOrderAddon,
    fetchCsOrder,
    fetchOrderAddons,
    fetchOrderCloseConditions,
    fetchOrderCloseForm,
    payOrderAddonByBalance,
    rejectCloseReview,
    remindOrder,
    resolveCsAttachmentUrl,
    transferOrder,
  } from '../../api/cs';
  import type {
    CsCloseConditionStatus,
    CsCloseFormField,
    CsOrder,
    CsOrderAddon,
    CsOrderCloseFormView,
  } from '../../api/cs';
  import {
    datetime,
    fulfillmentText,
    money,
    yuanToCents,
  } from '../../utils/format';

  const id = ref(0);
  const order = ref<CsOrder | null>(null);
  const actingId = ref(0);

  const transferOpen = ref(false);
  const transferForm = ref({ adminId: '', reason: '' });

  const addonOpen = ref(false);
  const addonSubmitting = ref(false);
  const addons = ref<CsOrderAddon[]>([]);
  const addonForm = ref({ addedYuan: '', addedUnits: '', note: '' });

  const closeOpen = ref(false);
  const closeSubmitting = ref(false);
  const closeNote = ref('');
  const closeForm = ref<CsOrderCloseFormView | null>(null);
  const closeCondition = ref<CsCloseConditionStatus | null>(null);
  const closeFormValues = ref<Record<string, unknown>>({});
  const substituteRows = ref<{ seatIndex: number; playerId: number; units: number }[]>([]);

  // ── 服务凭证逐张确认 ──
  // 后端 close-form 的 evidence_attachment_ids 是「结单前必须逐张查看」的图片附件清单，
  // 结单时须把全部 ID 作为 viewed_evidence_attachment_ids 回传，缺一即 400 并列出还差的 ID。
  const evidenceIds = ref<number[]>([]);
  const viewedEvidenceIds = ref<number[]>([]);
  const evidenceUrls = ref<Record<number, string>>({});

  const allEvidenceViewed = computed(
    () => evidenceIds.value.length > 0 && viewedEvidenceIds.value.length >= evidenceIds.value.length
  );
  const unviewedEvidenceCount = computed(() =>
    Math.max(0, evidenceIds.value.length - viewedEvidenceIds.value.length)
  );

  const isEvidenceViewed = (attachmentId: number) =>
    viewedEvidenceIds.value.includes(attachmentId);

  function markEvidenceViewed(attachmentId: number) {
    if (!isEvidenceViewed(attachmentId)) {
      viewedEvidenceIds.value = [...viewedEvidenceIds.value, attachmentId];
    }
  }

  function toggleEvidenceViewed(attachmentId: number) {
    viewedEvidenceIds.value = isEvidenceViewed(attachmentId)
      ? viewedEvidenceIds.value.filter((item) => item !== attachmentId)
      : [...viewedEvidenceIds.value, attachmentId];
  }

  function markAllEvidenceViewed() {
    viewedEvidenceIds.value = [...evidenceIds.value];
  }

  /** 单张地址补取（缩略图加载失败时点击重试）。 */
  async function loadEvidenceUrl(attachmentId: number) {
    const url = await resolveCsAttachmentUrl(attachmentId);
    if (!url) {
      uni.showToast({ title: '附件地址获取失败，请重新打开结单弹窗重试', icon: 'none' });
      return;
    }
    evidenceUrls.value = { ...evidenceUrls.value, [attachmentId]: url };
  }

  /** 拉取全部凭证的可访问地址；单张失败只留空，页面显示「点击重试」。 */
  async function loadEvidence(attachmentIds: number[]) {
    evidenceIds.value = [...attachmentIds];
    viewedEvidenceIds.value = [];
    evidenceUrls.value = {};
    const resolved = await Promise.all(
      attachmentIds.map(async (attachmentId) => {
        const url = await resolveCsAttachmentUrl(attachmentId);
        return [attachmentId, url] as const;
      })
    );
    const urls: Record<number, string> = {};
    resolved.forEach(([attachmentId, url]) => {
      if (url) urls[attachmentId] = url;
    });
    evidenceUrls.value = urls;
  }

  /** 点缩略图查看原图：查看即视为已确认，并支持左右滑动看其余凭证。 */
  function previewEvidence(attachmentId: number) {
    const url = evidenceUrls.value[attachmentId];
    if (!url) {
      loadEvidenceUrl(attachmentId);
      return;
    }
    markEvidenceViewed(attachmentId);
    const urls = evidenceIds.value
      .map((item) => evidenceUrls.value[item])
      .filter((item): item is string => !!item);
    uni.previewImage({ current: url, urls });
  }

  /** 下载 / 打开附件：非图片（PDF 等）走下载后由系统文档查看器打开。 */
  function openEvidence(attachmentId: number) {
    const url = evidenceUrls.value[attachmentId];
    if (!url) {
      loadEvidenceUrl(attachmentId);
      return;
    }
    uni.showLoading({ title: '正在打开附件' });
    uni.downloadFile({
      url,
      success: (res) => {
        uni.hideLoading();
        if (res.statusCode !== 200) {
          uni.showToast({ title: '附件下载失败，请重试', icon: 'none' });
          return;
        }
        markEvidenceViewed(attachmentId);
        uni.openDocument({
          filePath: res.tempFilePath,
          showMenu: true,
          fail: () => {
            // 小程序容器对部分类型不支持直接打开，回落到图片预览 / 复制地址提示。
            uni.showToast({ title: '当前环境无法打开该附件，请用图片预览查看', icon: 'none' });
          },
        });
      },
      fail: () => {
        uni.hideLoading();
        uni.showToast({ title: '附件下载失败，请检查网络后重试', icon: 'none' });
      },
    });
  }

  const canTransfer = computed(() => {
    if (!order.value) return false;
    return (
      order.value.fulfillment_status !== 'cancelled' &&
      order.value.fulfillment_status !== 'completed'
    );
  });
  const canCancel = computed(() => {
    if (!order.value) return false;
    return (
      order.value.fulfillment_status !== 'cancelled' &&
      order.value.fulfillment_status !== 'completed'
    );
  });

  function inputValue(e: Event): string {
    return String((e as unknown as { detail?: { value?: unknown } }).detail?.value ?? '');
  }

  function pickerValue(e: Event): number {
    const v = Number((e as unknown as { detail?: { value?: number } }).detail?.value);
    return Number.isInteger(v) ? v : -1;
  }

  function paymentText(s: string): string {
    return (
      (
        {
          unpaid: '未付款',
          partial: '部分付款',
          paid: '已付款',
          exception: '异常',
        } as Record<string, string>
      )[s] || s
    );
  }

  function appointmentText(s: string): string {
    return (
      (
        {
          instant: '即时',
          request: '待确认档期',
          confirmed: '已确认档期',
        } as Record<string, string>
      )[s] || s
    );
  }

  function addonStatusText(s: string): string {
    return (
      (
        {
          pending: '待陪玩确认',
          confirmed: '已确认',
          rejected: '已拒绝',
          cancelled: '已撤回',
        } as Record<string, string>
      )[s] || s
    );
  }

  function addonPayText(item: CsOrderAddon): string {
    if (item.status !== 'confirmed') return '—';
    return item.payment_status === 'paid' ? `已收 ${money(item.paid_cents)}` : '待收款';
  }

  async function load() {
    if (!id.value) return;
    try {
      order.value = await fetchCsOrder(id.value);
    } catch {
      order.value = null;
    }
  }

  // ── 催单 ──
  async function remind() {
    const res = await new Promise<{ confirm: boolean; content?: string }>((resolve) => {
      uni.showModal({
        title: '催单',
        content: '请填写催单备注',
        editable: true,
        placeholderText: '催单备注',
        success: (r) => resolve(r),
        fail: () => resolve({ confirm: false }),
      });
    });
    if (!res.confirm) return;
    actingId.value = id.value;
    try {
      await remindOrder(id.value, 1, (res.content || '').trim());
      uni.showToast({ title: '已催单', icon: 'success' });
    } catch {
      // csRequest 层已提示。
    } finally {
      actingId.value = 0;
    }
  }

  // ── 转单 ──
  function openTransfer() {
    transferForm.value = { adminId: '', reason: '' };
    transferOpen.value = true;
  }

  async function submitTransfer() {
    const adminId = Number(transferForm.value.adminId);
    const reason = transferForm.value.reason.trim();
    if (!Number.isInteger(adminId) || adminId < 1) {
      uni.showToast({ title: '请填写目标客服 ID', icon: 'none' });
      return;
    }
    if (!reason) {
      uni.showToast({ title: '请填写转单原因', icon: 'none' });
      return;
    }
    actingId.value = id.value;
    try {
      await transferOrder(id.value, adminId, reason);
      uni.showToast({ title: '已转单', icon: 'success' });
      transferOpen.value = false;
      await load();
    } catch {
      // csRequest 层已提示。
    } finally {
      actingId.value = 0;
    }
  }

  // ── 取消 ──
  function openCancel() {
    uni.showModal({
      title: '取消订单',
      content: '请填写取消原因',
      editable: true,
      placeholderText: '取消原因',
      success: async (r) => {
        if (!r.confirm || !(r.content || '').trim()) return;
        actingId.value = id.value;
        try {
          await cancelOrder(id.value, (r.content || '').trim());
          uni.showToast({ title: '已取消', icon: 'success' });
          await load();
        } catch {
          // csRequest 层已提示。
        } finally {
          actingId.value = 0;
        }
      },
    });
  }

  // ── 加钟 ──
  async function openAddon() {
    addonForm.value = { addedYuan: '', addedUnits: '', note: '' };
    addonOpen.value = true;
    addons.value = [];
    try {
      addons.value = (await fetchOrderAddons(id.value)) || [];
    } catch {
      addons.value = [];
    }
  }

  async function submitAddon() {
    const addedCents = yuanToCents(addonForm.value.addedYuan || 0);
    const addedUnits = Number(addonForm.value.addedUnits || 0);
    if (!(addedCents > 0 || addedUnits > 0)) {
      uni.showToast({ title: '金额与服务量至少填一项', icon: 'none' });
      return;
    }
    addonSubmitting.value = true;
    try {
      await createOrderAddon(id.value, {
        added_cents: addedCents,
        added_units: addedUnits,
        note: addonForm.value.note.trim(),
      });
      uni.showToast({ title: '已发起加钟，等待陪玩确认', icon: 'success' });
      addonForm.value = { addedYuan: '', addedUnits: '', note: '' };
      addons.value = (await fetchOrderAddons(id.value)) || [];
    } catch {
      // csRequest 层已提示。
    } finally {
      addonSubmitting.value = false;
    }
  }

  async function withdrawAddon(item: CsOrderAddon) {
    try {
      await cancelOrderAddon(item.id);
      uni.showToast({ title: '已撤回加钟', icon: 'success' });
      addons.value = (await fetchOrderAddons(id.value)) || [];
    } catch {
      // csRequest 层已提示。
    }
  }

  async function collectAddon(item: CsOrderAddon) {
    try {
      await payOrderAddonByBalance(item.id);
      uni.showToast({ title: '已完成加钟收款', icon: 'success' });
      addons.value = (await fetchOrderAddons(id.value)) || [];
    } catch {
      // csRequest 层已提示。
    }
  }

  // ── 结单 ──
  function isCloseFormRequired(field: CsCloseFormField): boolean {
    if (field.field_type === 'money') return false;
    if (field.required) return true;
    return (closeForm.value?.template?.fields || []).some(
      (b) => b.field_key === field.key && b.required
    );
  }

  function closeFormPlaceholder(field: CsCloseFormField): string {
    if (field.field_type === 'datetime') return 'ISO 时间，如 2026-10-14T10:00:00Z';
    if (field.field_type === 'image') return '附件引用或图片地址';
    if (field.field_type === 'reference') return '关联对象 ID';
    return '';
  }

  function closeFormText(key: string): string {
    const v = closeFormValues.value[key];
    return typeof v === 'string' ? v : '';
  }

  function setCloseFormText(key: string, e: Event) {
    closeFormValues.value[key] = inputValue(e);
  }

  function closeFormNumber(key: string): string {
    const v = closeFormValues.value[key];
    return typeof v === 'number' ? String(v) : '';
  }

  function setCloseFormNumber(key: string, e: Event) {
    const n = Number(inputValue(e));
    closeFormValues.value[key] = Number.isFinite(n) ? n : null;
  }

  function selectIndex(field: CsCloseFormField): number {
    const options = field.options || [];
    const idx = options.indexOf(closeFormText(field.key));
    return idx >= 0 ? idx : 0;
  }

  function setCloseFormSelect(field: CsCloseFormField, e: Event) {
    const index = pickerValue(e);
    const options = field.options || [];
    if (index >= 0 && index < options.length) {
      closeFormValues.value[field.key] = options[index];
    }
  }

  function closeFormMulti(key: string): string[] {
    const v = closeFormValues.value[key];
    return Array.isArray(v) ? v.map((item) => String(item)) : [];
  }

  function toggleCloseFormMulti(key: string, option: string) {
    const arr = closeFormMulti(key);
    const idx = arr.indexOf(option);
    if (idx >= 0) arr.splice(idx, 1);
    else arr.push(option);
    closeFormValues.value[key] = arr;
  }

  function closeFormBool(key: string): boolean {
    return closeFormValues.value[key] === true;
  }

  function toggleCloseFormBool(key: string) {
    closeFormValues.value[key] = !closeFormBool(key);
  }

  function isEmptyCloseFormValue(value: unknown): boolean {
    return value == null || value === '' || (Array.isArray(value) && value.length === 0);
  }

  async function openClose() {
    closeNote.value = '';
    closeForm.value = null;
    closeCondition.value = null;
    closeFormValues.value = {};
    substituteRows.value = [];
    evidenceIds.value = [];
    viewedEvidenceIds.value = [];
    evidenceUrls.value = {};
    closeOpen.value = true;
    try {
      closeCondition.value = await fetchOrderCloseConditions(id.value);
    } catch {
      closeCondition.value = null;
    }
    try {
      const view = await fetchOrderCloseForm(id.value);
      closeForm.value = view;
      substituteRows.value = (view?.unsubmitted || []).map((m) => ({
        seatIndex: m.seat_index,
        playerId: m.player_id,
        units: 0,
      }));
      // 服务凭证清单随 close-form 一起下发；没有图片凭证时为空数组，无需逐张确认。
      await loadEvidence(view?.evidence_attachment_ids || []);
    } catch {
      closeForm.value = null;
    }
  }

  async function submitClose() {
    const note = closeNote.value.trim();
    if (!note) {
      uni.showToast({ title: '请填写结单备注', icon: 'none' });
      return;
    }
    if (closeCondition.value && !closeCondition.value.satisfied) {
      uni.showToast({ title: `结单条件未满足：${closeCondition.value.reasons.join('；')}`, icon: 'none' });
      return;
    }
    const missing = (closeForm.value?.fields || []).filter(
      (field) => isCloseFormRequired(field) && isEmptyCloseFormValue(closeFormValues.value[field.key])
    );
    if (missing.length > 0) {
      uni.showToast({ title: `请填写必填项：${missing.map((f) => f.label).join('、')}`, icon: 'none' });
      return;
    }
    // 服务凭证：未逐张看完不允许提交，避免后端 400；看完后把全部 ID 原样回传。
    if (unviewedEvidenceCount.value > 0) {
      uni.showToast({
        title: `还有 ${unviewedEvidenceCount.value} 张服务凭证未查看，请逐张确认后再结单`,
        icon: 'none',
      });
      return;
    }
    const substitutes = substituteRows.value
      .filter((row) => row.units > 0)
      .map((row) => ({
        seat_index: row.seatIndex,
        reported_units: row.units,
        evidence_ref: '',
      }));
    closeSubmitting.value = true;
    try {
      await closeOrder(
        id.value,
        note,
        closeFormValues.value,
        substitutes,
        // 无图片凭证时传 undefined（后端不要求该字段），有则传全部 ID。
        evidenceIds.value.length > 0 ? [...evidenceIds.value] : undefined
      );
      uni.showToast({ title: '已结单', icon: 'success' });
      closeOpen.value = false;
      await load();
    } catch {
      // csRequest 层已提示（如后端返回「还差 N 张凭证未查看」的中文原文）。
    } finally {
      closeSubmitting.value = false;
    }
  }

  // ── 结单复核 ──
  async function approve() {
    try {
      await approveCloseReview(id.value);
      uni.showToast({ title: '已复核通过，订单完成', icon: 'success' });
      await load();
    } catch {
      // csRequest 层已提示。
    }
  }

  function openReject() {
    uni.showModal({
      title: '复核驳回',
      content: '请填写驳回原因',
      editable: true,
      placeholderText: '驳回原因',
      success: async (r) => {
        if (!r.confirm || !(r.content || '').trim()) return;
        try {
          await rejectCloseReview(id.value, (r.content || '').trim());
          uni.showToast({ title: '已驳回，订单回退待结单', icon: 'success' });
          await load();
        } catch {
          // csRequest 层已提示。
        }
      },
    });
  }

  onLoad((query) => {
    id.value = Number(query?.id || 0);
  });
  onShow(load);
</script>

<style scoped lang="scss">
  .order-no {
    font-weight: 600;
  }

  .amount {
    color: $danger;
    font-weight: 600;
  }

  .section-title {
    font-size: 30rpx;
    font-weight: 600;
    margin-bottom: 16rpx;
  }

  .ops {
    display: flex;
    flex-wrap: wrap;
    gap: 16rpx;
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

  .danger {
    background: $danger;
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
    max-height: 80vh;
    overflow-y: auto;
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
    width: 100%;
    height: 140rpx;
    padding: 16rpx;
    background: $bg;
    border-radius: $radius;
    box-sizing: border-box;
  }

  .input {
    height: 80rpx;
    padding: 0 24rpx;
    background: $bg;
    border-radius: $radius;
  }

  .readonly {
    line-height: 80rpx;
    color: $text-2;
  }

  .picker {
    height: 80rpx;
    line-height: 80rpx;
    padding: 0 24rpx;
    background: $bg;
    border-radius: $radius;
  }

  .field-block {
    margin-top: 16rpx;
  }

  .label {
    font-size: 26rpx;
    color: $text-2;
    margin-bottom: 8rpx;
  }

  .req {
    color: $danger;
  }

  .chips {
    display: flex;
    flex-wrap: wrap;
    gap: 12rpx;
  }

  .chip {
    padding: 8rpx 20rpx;
    background: $bg;
    border-radius: 999rpx;
    color: $text-2;
    font-size: 24rpx;
    border: 1rpx solid $border;
  }

  .chip.active {
    background: $brand;
    color: #fff;
    border-color: $brand;
  }

  .sheet-actions {
    display: flex;
    justify-content: flex-end;
    gap: 16rpx;
    margin-top: 24rpx;
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

  .cond {
    margin-top: 16rpx;
  }

  .cond-row {
    display: flex;
    gap: 12rpx;
    align-items: center;
    margin-top: 8rpx;
    font-size: 24rpx;
  }

  .ok {
    color: $success;
  }

  .fail {
    color: $danger;
  }

  .evidence {
    margin-top: 20rpx;
    padding-top: 20rpx;
    border-top: 1rpx solid $border;
  }

  .evidence-head {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    margin-bottom: 8rpx;
  }

  .evidence-title {
    font-size: 28rpx;
    font-weight: 600;
  }

  .evidence-grid {
    display: flex;
    flex-wrap: wrap;
    gap: 16rpx;
    margin-top: 16rpx;
  }

  .evidence-item {
    width: 210rpx;
  }

  .evidence-thumb {
    width: 210rpx;
    height: 210rpx;
    border-radius: $radius;
    background: $bg;
  }

  .evidence-missing {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 8rpx;
    border: 1rpx dashed $border;
    box-sizing: border-box;
    font-size: 22rpx;
  }

  .evidence-missing-title {
    color: $danger;
  }

  .evidence-meta {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-top: 8rpx;
    font-size: 22rpx;
  }

  .evidence-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 8rpx;
    margin-top: 8rpx;
  }

  .evidence-actions .mini {
    padding: 0 12rpx;
    line-height: 48rpx;
    font-size: 22rpx;
  }
</style>
