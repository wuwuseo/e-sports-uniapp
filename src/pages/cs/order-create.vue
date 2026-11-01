<template>
  <view>
    <view class="card">
      <view class="section-title">报单建单</view>

      <view class="field">
        <view class="label">客户</view>
        <picker :range="customerNames" :value="customerIndex" @change="onCustomerChange">
          <view class="picker">{{ customerNames[customerIndex] || '请选择客户' }}</view>
        </picker>
      </view>

      <view class="field">
        <view class="label">服务项目</view>
        <picker :range="skuNames" :value="skuIndex" @change="onSkuChange">
          <view class="picker">{{ skuNames[skuIndex] || '请选择服务项目' }}</view>
        </picker>
        <view v-if="selectedSku" class="muted">
          {{ selectedSku.title }} · 单价 {{ money(selectedSku.unitPriceCents) }} ·
          每份 {{ selectedSku.serviceUnits }}{{ selectedSku.serviceUnitName }}
        </view>
      </view>

      <view class="field">
        <view class="label">数量</view>
        <input
          v-model="quantityText"
          class="input"
          type="number"
          placeholder="请输入数量"
          @blur="onQuantityBlur"
        />
      </view>

      <view v-if="quoteError" class="notice">{{ quoteError }}</view>

      <!-- 报价构成：单价×份数 → 会员折扣 → 人工调整 → 最终应付 -->
      <view v-if="selectedSku && quantity > 0" class="quote">
        <view class="section-title">报价构成</view>
        <view class="quote-row">
          <text class="muted">单价 × 份数</text>
          <text>{{ money(selectedSku.unitPriceCents) }} × {{ quantity }} = {{ money(subtotalCents) }}</text>
        </view>
        <view class="quote-row">
          <text class="muted">会员折扣</text>
          <text v-if="quote">
            {{ quote.member_level_code || '未定级' }}（{{ discountText(quote.member_discount_bps) }}）
            -{{ money(quote.member_discount_cents) }}
          </text>
          <text v-else class="muted">{{ quoteLoading ? '试算中…' : '待试算' }}</text>
        </view>
        <view class="quote-row">
          <text class="muted">人工调整</text>
          <text>{{ manualAdjustCents ? money(manualAdjustCents) : money(0) }}</text>
        </view>
        <view class="quote-row total">
          <text>最终应付</text>
          <text v-if="quote" class="amount">{{ money(payableCents) }}</text>
          <text v-else class="muted">待服务端试算</text>
        </view>
        <view v-if="quote" class="muted">
          承诺服务量 {{ quote.promised_service_units }}{{ quote.service_unit_name }} ·
          结单要求 {{ quote.close_rule_code || '按默认口径' }}
        </view>
        <view v-else-if="quoteLoading" class="muted">正在读取服务端试算…</view>
        <view v-else class="warn-text">
          未能取到服务端试算，最终应付以提交后的服务端报价为准。
        </view>
      </view>

      <!-- 人工调整：非零须填 4–255 字原因，超过 商品 免审额度服务端会拒绝 -->
      <view class="field">
        <view class="label">人工调整（元，可为负）</view>
        <input
          v-model="manualAdjustText"
          class="input"
          type="digit"
          placeholder="0.00 表示不调整"
        />
      </view>
      <view v-if="manualAdjustCents" class="field">
        <view class="label">调整原因（4–255 字，必填）</view>
        <textarea
          v-model="manualAdjustReason"
          class="textarea"
          maxlength="255"
          placeholder="如：老客户议价补偿"
        />
      </view>

      <button class="primary" :loading="submitting" @click="submit">提交报单</button>
    </view>
  </view>
</template>

<script setup lang="ts">
  import { onShow } from '@dcloudio/uni-app';
  import { computed, ref, watch } from 'vue';
  import { createCsOrder, fetchCsCustomers, fetchCsSkus, fetchCsSkuQuotes } from '../../api/cs';
  import type { CsCustomer, CsSku, CsSkuQuote, CsSkuWithQuotes } from '../../api/cs';
  import { idempotencyKey, money, yuanToCents } from '../../utils/format';

  interface SkuOption {
    id: number;
    title: string;
    unitPriceCents: number;
    serviceUnits: number;
    serviceUnitName: string;
    closeRuleCode: string;
    /** 服务端试算结果；取不到试算时为 null（不本地估算，避免与实际应付不一致）。 */
    quote: CsSkuQuote | null;
  }

  const customers = ref<CsCustomer[]>([]);
  const skus = ref<SkuOption[]>([]);
  const customerIndex = ref(-1);
  const skuIndex = ref(-1);
  const quantityText = ref('1');
  const manualAdjustText = ref('');
  const manualAdjustReason = ref('');
  const submitting = ref(false);
  const quoteLoading = ref(false);
  const quoteError = ref('');
  /** 已完成试算的「客户:份数」键，用于提交前确认报价与当前输入一致。 */
  const quotedKey = ref('');

  const customerNames = computed(() => customers.value.map((c) => c.display_name || `客户#${c.id}`));
  const skuNames = computed(() =>
    skus.value.map((s) =>
      s.quote ? `${s.title}（${money(s.quote.payable_cents)}）` : `${s.title}（${money(s.unitPriceCents)}）`
    )
  );

  const selectedSku = computed<SkuOption | null>(() =>
    skuIndex.value >= 0 ? skus.value[skuIndex.value] : null
  );
  const selectedCustomer = computed<CsCustomer | null>(() =>
    customerIndex.value >= 0 ? customers.value[customerIndex.value] : null
  );
  const quote = computed<CsSkuQuote | null>(() => selectedSku.value?.quote || null);

  const quantity = computed(() => {
    const n = Number(quantityText.value);
    return Number.isSafeInteger(n) && n > 0 ? n : 0;
  });

  const subtotalCents = computed(() =>
    selectedSku.value ? selectedSku.value.unitPriceCents * quantity.value : 0
  );

  /** 人工调整（分）：允许负数，非法输入按 0 处理。 */
  const manualAdjustCents = computed(() => {
    const trimmed = manualAdjustText.value.trim();
    if (!trimmed) return 0;
    const value = Number(trimmed);
    return Number.isFinite(value) ? yuanToCents(trimmed) : 0;
  });

  /** 最终应付 = 小计 + 人工调整 − 会员折扣（与后端 applyOrderManualAdjust 同式）。 */
  const payableCents = computed(() =>
    quote.value ? quote.value.payable_cents + manualAdjustCents.value : 0
  );

  function discountText(bps: number): string {
    if (!bps || bps >= 10000) return '无折扣';
    return `${Number((bps / 1000).toFixed(1))} 折`;
  }

  function quoteKey(): string {
    return `${selectedCustomer.value?.id || 0}:${quantity.value}`;
  }

  function applyPlainSkus(list: CsSku[]) {
    skus.value = list.map((s) => ({
      id: s.id,
      title: s.title,
      unitPriceCents: s.unit_price_cents,
      serviceUnits: s.service_units,
      serviceUnitName: s.service_unit_name,
      closeRuleCode: s.close_rule_code || '',
      quote: null,
    }));
  }

  function applyQuotedSkus(res: CsSkuWithQuotes) {
    skus.value = (res.items || []).map((s) => ({
      id: s.id,
      title: s.title,
      unitPriceCents: s.unit_price_cents,
      serviceUnits: s.service_units,
      serviceUnitName: s.service_unit_name,
      closeRuleCode: s.close_rule_code || '',
      quote: res.quotes?.[String(s.id)] || null,
    }));
  }

  /** 试算：/admin/products 带客户 + 份数逐 商品 返回会员折扣、应付与结单要求。 */
  async function loadSkus() {
    const cid = selectedCustomer.value?.id || 0;
    const qty = quantity.value;
    quoteError.value = '';
    if (cid > 0 && qty > 0) {
      quoteLoading.value = true;
      try {
        const res = await fetchCsSkuQuotes(cid, qty);
        if (Array.isArray(res)) {
          applyPlainSkus(res);
          quoteError.value = '服务端未返回试算结果，金额以提交后的报价为准。';
        } else {
          applyQuotedSkus(res);
          quotedKey.value = quoteKey();
        }
        return;
      } catch (err) {
        quoteError.value = `服务端试算不可用：${
          err instanceof Error ? err.message : '未知错误'
        }；金额以提交后的报价为准。`;
      } finally {
        quoteLoading.value = false;
      }
    }
    // 未选客户 / 未填份数：只回落到公开 商品 列表（标价、席位、每席量）。
    try {
      applyPlainSkus((await fetchCsSkus()) || []);
    } catch {
      skus.value = [];
    }
  }

  let quoteTimer: ReturnType<typeof setTimeout> | null = null;
  function scheduleQuoteReload() {
    if (quoteTimer) clearTimeout(quoteTimer);
    quoteTimer = setTimeout(() => {
      quoteTimer = null;
      loadSkus();
    }, 300);
  }

  watch([customerIndex, quantityText], () => {
    quotedKey.value = '';
    scheduleQuoteReload();
  });

  async function load() {
    try {
      customers.value = (await fetchCsCustomers()) || [];
    } catch {
      customers.value = [];
    }
    await loadSkus();
  }

  function onCustomerChange(e: Event) {
    const v = Number((e as unknown as { detail?: { value?: number } }).detail?.value);
    if (Number.isInteger(v)) customerIndex.value = v;
  }

  function onSkuChange(e: Event) {
    const v = Number((e as unknown as { detail?: { value?: number } }).detail?.value);
    if (Number.isInteger(v)) skuIndex.value = v;
  }

  function onQuantityBlur() {
    if (quotedKey.value !== quoteKey()) scheduleQuoteReload();
  }

  async function submit() {
    if (customerIndex.value < 0 || skuIndex.value < 0) {
      uni.showToast({ title: '请选择客户与服务项目', icon: 'none' });
      return;
    }
    if (quantity.value <= 0) {
      uni.showToast({ title: '请填写有效数量', icon: 'none' });
      return;
    }
    if (manualAdjustCents.value) {
      const reasonLength = Array.from(manualAdjustReason.value.trim()).length;
      if (reasonLength < 4 || reasonLength > 255) {
        uni.showToast({ title: '人工调整须填写 4–255 字的调整原因', icon: 'none' });
        return;
      }
      if (payableCents.value <= 0) {
        uni.showToast({ title: '人工调整后应付金额必须大于 0', icon: 'none' });
        return;
      }
    }
    // 报价尚未按当前客户 + 份数试算时先补齐，避免提交前的金额与实际应付不一致。
    if (quotedKey.value !== quoteKey()) {
      await loadSkus();
    }
    submitting.value = true;
    try {
      const order = await createCsOrder(
        {
          customer_id: customers.value[customerIndex.value].id,
          product_id: skus.value[skuIndex.value].id,
          quantity: quantity.value,
          ...(manualAdjustCents.value
            ? {
                manual_adjust_cents: manualAdjustCents.value,
                manual_adjust_reason: manualAdjustReason.value.trim(),
              }
            : {}),
        },
        idempotencyKey('cs-order')
      );
      uni.showToast({ title: '报单成功', icon: 'success' });
      setTimeout(() => {
        // 新建订单尚未付款，跳转到待付款列表，而非全部订单。
        uni.redirectTo({ url: `/pages/cs/orders?status=pending_payment&highlight=${order.id}` });
      }, 600);
    } catch {
      // csRequest 层已提示（如每席承诺量缺失、超免审额度、折扣上限等具体原因）。
    } finally {
      submitting.value = false;
    }
  }

  onShow(load);
</script>

<style scoped lang="scss">
  .section-title {
    font-size: 30rpx;
    font-weight: 600;
    margin-bottom: 16rpx;
  }

  .field {
    margin-top: 24rpx;
  }

  .label {
    font-size: 26rpx;
    color: $text-2;
    margin-bottom: 12rpx;
  }

  .picker {
    height: 80rpx;
    line-height: 80rpx;
    padding: 0 24rpx;
    background: $bg;
    border-radius: $radius;
  }

  .input {
    height: 80rpx;
    padding: 0 24rpx;
    background: $bg;
    border-radius: $radius;
  }

  .textarea {
    width: 100%;
    height: 140rpx;
    padding: 16rpx 24rpx;
    background: $bg;
    border-radius: $radius;
    box-sizing: border-box;
  }

  .quote {
    margin-top: 24rpx;
    padding: 20rpx 24rpx;
    background: $bg;
    border-radius: $radius;
  }

  .quote-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 8rpx 0;
  }

  .quote-row.total {
    margin-top: 8rpx;
    padding-top: 16rpx;
    border-top: 1rpx solid $border;
    font-weight: 600;
  }

  .amount {
    color: $danger;
    font-weight: 600;
  }

  .warn-text {
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

  .primary {
    margin-top: 40rpx;
    background: $brand;
    color: #fff;
    border-radius: $radius;
  }
</style>
