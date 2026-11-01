<template>
  <view>
    <view class="card guide">
      <view class="guide-title">自助送礼</view>
      <view class="muted">选择礼物、收礼陪玩与付款来源，提交后生成礼物确认单；确认授权后由客服执行送达。</view>
      <view class="muted">付款仅从你选择的本金来源扣除，赠送权益不可用于送礼。</view>
      <view class="muted">确认后如需在线支付或商家码付款，可在确认单下方进入本站收银台。</view>
    </view>

    <!-- 礼物下单：客户自行选礼物 + 收礼陪玩 + 付款来源 -->
    <view class="card">
      <view class="section-title">选择礼物</view>
      <picker
        mode="selector"
        :range="gifts"
        range-key="name"
        @change="onGiftChange"
      >
        <view class="picker-value">{{ selectedGift ? selectedGift.name : '请选择礼物' }} ›</view>
      </picker>
      <view class="muted">单价 {{ money(selectedGift?.price_cents || 0) }}</view>

      <view class="section-title">选择收礼陪玩</view>
      <picker
        mode="selector"
        :range="players"
        range-key="display_name"
        @change="onPlayerChange"
      >
        <view class="picker-value">{{ selectedPlayer ? selectedPlayer.display_name : '请选择收礼陪玩' }} ›</view>
      </picker>
      <view v-if="selectedPlayer" class="muted">
        等级 {{ playerLevelText(selectedPlayer.level) }} · {{ selectedPlayer.games && selectedPlayer.games.length ? selectedPlayer.games.join(' / ') : '全游戏' }}
      </view>

      <view class="section-title">数量</view>
      <input
        v-model="quantityText"
        class="quantity"
        type="number"
        placeholder="请输入数量"
      />

      <view class="section-title">付款来源</view>
      <radio-group @change="onPaymentSourceChange">
        <label class="radio-row">
          <radio value="customer_balance_principal" :checked="paymentSource === 'customer_balance_principal'" />
          <text>客户余额本金（可用 {{ money(wallet?.principal_cents || 0) }}）</text>
        </label>
      </radio-group>

      <view class="amount">预估合计 {{ money(amountCents) }}</view>

      <button class="primary" :loading="submitting" @click="submit">生成礼物确认单</button>
      <view class="muted">提交后请在下方确认单中点击「确认以上明细并授权扣款」，客服执行后礼物送达。</view>
    </view>

    <view v-for="intent in intents" :key="intent.id" class="card">
      <view class="row"><text>礼物</text><text>{{ intent.gift_name }}</text></view>
      <view class="row"><text>收礼陪玩</text><text>{{ intent.player_name }}</text></view>
      <view class="row"><text>数量</text><text>{{ intent.quantity }}</text></view>
      <view class="row"><text>单价</text><text>{{ money(intent.unit_price_cents) }}</text></view>
      <view class="row"><text>合计</text><text>{{ money(intent.amount_cents) }}</text></view>
      <view class="row"><text>支付来源</text><text>客户余额本金</text></view>
      <view v-if="intent.order_id" class="row"><text>关联订单</text><text>{{ intent.order_id }}</text></view>
      <view class="row"><text>确认状态</text><text>{{ statusText(intent.status) }}</text></view>
      <view class="muted">有效期至 {{ datetime(intent.expires_at) }}</view>
      <button v-if="intent.status === 'pending' && !expired(intent.expires_at)" class="primary" :loading="savingId === intent.id" @click="confirm(intent)">
        确认以上明细并授权扣款
      </button>
      <button v-if="intent.status === 'confirmed' && !expired(intent.expires_at)" class="ghost" @click="goCashier(intent)">
        去收银台付款
      </button>
    </view>
    <view v-if="!loading && !intents.length" class="card muted">暂无礼物确认单</view>
  </view>
</template>

<script setup lang="ts">
import { onLoad, onShow } from '@dcloudio/uni-app';
import { computed, ref } from 'vue';
import {
  confirmMyGiftIntent,
  createMyGiftIntent,
  fetchGiftCatalog,
  fetchMyGiftIntents,
  fetchRecommendedPlayers,
  fetchWallet,
} from '../../api/esports';
import type {
  CustomerWallet,
  GiftCatalogItem,
  GiftIntent,
  GiftPaymentSource,
  RecommendedPlayer,
} from '../../api/esports';
import { datetime, idempotencyKey, money } from '../../utils/format';

import { skillLevelText } from '../../utils/levels';
const intents = ref<GiftIntent[]>([]);
const loading = ref(false);
const savingId = ref(0);

// 自助送礼表单
const gifts = ref<GiftCatalogItem[]>([]);
const players = ref<RecommendedPlayer[]>([]);
const wallet = ref<CustomerWallet | null>(null);
const giftIndex = ref(-1);
const playerIndex = ref(-1);
const quantityText = ref('1');
const paymentSource = ref<GiftPaymentSource>('customer_balance_principal');
const submitting = ref(false);

// 礼物确认单幂等：client_key 与「本次提交内容」绑定——同一份内容连点两次复用同一个键，
// 只产生一张确认单（服务端按 client_key + 请求体哈希去重）；内容变了就换键，
// 否则同键异体会被后端判为冲突，改正表单后重试将一直失败。
let submitClientKey = '';
let submitKeyBody = '';

function ensureSubmitClientKey(body: string) {
  if (!submitClientKey || submitKeyBody !== body) {
    submitClientKey = idempotencyKey('gift');
    submitKeyBody = body;
  }
  return submitClientKey;
}

const expired = (value: string) => new Date(value).getTime() <= Date.now();
const statusText = (value: GiftIntent['status']) => ({
  pending: '待确认', confirmed: '已确认，等待客服执行', consumed: '已送礼', cancelled: '已取消',
}[value]);

const selectedGift = computed<GiftCatalogItem | null>(() =>
  giftIndex.value >= 0 && giftIndex.value < gifts.value.length ? gifts.value[giftIndex.value] : null
);
const selectedPlayer = computed<RecommendedPlayer | null>(() =>
  playerIndex.value >= 0 && playerIndex.value < players.value.length ? players.value[playerIndex.value] : null
);

const amountCents = computed(() => {
  const qty = Math.max(0, Math.floor(Number(quantityText.value) || 0));
  return (selectedGift.value?.price_cents || 0) * qty;
});

// 技能等级文案走系统配置，App 启动时已拉取。
const playerLevelText = (level: string) => skillLevelText(level);

function onGiftChange(e: { detail: { value: number | string } }) {
  giftIndex.value = Number(e.detail.value);
}

function onPlayerChange(e: { detail: { value: number | string } }) {
  playerIndex.value = Number(e.detail.value);
}

function onPaymentSourceChange(e: { detail: { value: string } }) {
  paymentSource.value = (e.detail.value as GiftPaymentSource) || 'customer_balance_principal';
}

async function load() {
  loading.value = true;
  try { intents.value = await fetchMyGiftIntents(); }
  catch { uni.showToast({ title: '加载失败', icon: 'none' }); }
  finally { loading.value = false; }
}

async function loadForm() {
  try {
    const [catalog, playerList, w] = await Promise.all([
      fetchGiftCatalog(),
      fetchRecommendedPlayers(),
      fetchWallet(),
    ]);
    gifts.value = catalog || [];
    players.value = playerList || [];
    wallet.value = w || null;
  } catch {
    // 表单依赖的公开/登录接口失败时保持空列表，提交时由后端再次校验。
  }
}

function applyPresetPlayer(playerId: number) {
  const index = players.value.findIndex((p) => p.id === playerId);
  if (index >= 0) playerIndex.value = index;
}

async function confirm(intent: GiftIntent) {
  const result = await new Promise<boolean>((resolve) => {
    uni.showModal({ title: '确认礼物', content: `向 ${intent.player_name} 赠送 ${intent.gift_name} × ${intent.quantity}，将从客户余额本金扣除 ${money(intent.amount_cents)}。`,
      confirmText: '确认授权', success: (res) => resolve(res.confirm), fail: () => resolve(false) });
  });
  if (!result) return;
  savingId.value = intent.id;
  try {
    await confirmMyGiftIntent(intent.id, intent.version);
    uni.showToast({ title: '已确认，请等待客服执行', icon: 'none' });
    await load();
    // 确认后引导进入本站收银台：在线支付 / 商家码付款凭证统一在收银台完成。
    const goPay = await new Promise<boolean>((resolve) => {
      uni.showModal({
        title: '已确认礼物',
        content: '如尚未完成付款，是否前往收银台扫码支付？',
        confirmText: '去付款',
        cancelText: '稍后',
        success: (res) => resolve(res.confirm),
        fail: () => resolve(false),
      });
    });
    if (goPay) goCashier(intent);
  } catch {
    uni.showToast({ title: '确认失败，请刷新后重试', icon: 'none' });
    await load();
  } finally { savingId.value = 0; }
}

/** 礼物确认单进入聚合收款收银台：business_id 为礼物确认单 ID。 */
function goCashier(intent: GiftIntent) {
  uni.navigateTo({
    url: `/pages/pay/cashier?businessType=gift&businessId=${intent.id}`,
  });
}

async function submit() {
  if (submitting.value) return;
  if (!selectedGift.value) {
    uni.showToast({ title: '请选择礼物', icon: 'none' });
    return;
  }
  if (!selectedPlayer.value) {
    uni.showToast({ title: '请选择收礼陪玩', icon: 'none' });
    return;
  }
  const quantity = Math.floor(Number(quantityText.value) || 0);
  if (quantity < 1 || quantity > 999) {
    uni.showToast({ title: '数量需为 1–999 的整数', icon: 'none' });
    return;
  }
  submitting.value = true;
  try {
    // 幂等键绑定提交内容（不含 client_key 本身）。
    const body = {
      gift_id: selectedGift.value.id,
      player_id: selectedPlayer.value.id,
      quantity,
      payment_source: paymentSource.value,
    };
    await createMyGiftIntent({
      ...body,
      client_key: ensureSubmitClientKey(JSON.stringify(body)),
    });
    uni.showToast({ title: '已生成确认单，请确认授权', icon: 'none' });
    // 表单会话结束才清键：同一份内容重复提交仍命中同一条确认单。
    submitClientKey = '';
    submitKeyBody = '';
    giftIndex.value = -1;
    playerIndex.value = -1;
    quantityText.value = '1';
    paymentSource.value = 'customer_balance_principal';
    await load();
  } catch {
    // request 层已提示。
  } finally {
    submitting.value = false;
  }
}

onLoad((query) => {
  loadForm().then(() => {
    const playerId = Number(query?.playerId || 0);
    if (playerId > 0) applyPresetPlayer(playerId);
  });
});

onShow(load);
</script>

<style scoped lang="scss">
.guide { background: #f0f5ff; }

.guide-title { font-weight: 600; margin-bottom: 12rpx; }

.section-title {
  font-size: 30rpx;
  font-weight: 600;
  margin: 24rpx 0 12rpx;
}

.picker-value {
  color: $brand;
  padding: 16rpx 0;
}

.quantity {
  height: 72rpx;
  padding: 0 24rpx;
  background: $bg;
  border-radius: $radius;
}

.radio-row {
  display: flex;
  align-items: center;
  gap: 12rpx;
  padding: 12rpx 0;
}

.card-picker {
  margin-top: 8rpx;
}

.amount {
  margin: 20rpx 0;
  font-weight: 600;
}

.row { display: flex; justify-content: space-between; margin-bottom: 18rpx; }
.muted { color: $text-2; margin-top: 12rpx; }
.primary { margin-top: 24rpx; background: $brand; color: #fff; border-radius: $radius; }
.ghost { margin-top: 16rpx; background: $bg; color: $text-1; border-radius: $radius; }
</style>
