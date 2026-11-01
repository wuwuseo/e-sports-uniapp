<template>
  <view>
    <view class="card">
      <view class="section-title">代客送礼</view>
      <picker :range="customerNames" :value="customerIndex" @change="onCustomerChange">
        <view class="field">{{ customerNames[customerIndex] || '请选择客户' }}</view>
      </picker>
      <picker :range="giftNames" :value="giftIndex" @change="onGiftChange">
        <view class="field">{{ giftNames[giftIndex] || '请选择礼物' }}</view>
      </picker>
      <picker :range="playerNames" :value="playerIndex" @change="onPlayerChange">
        <view class="field">{{ playerNames[playerIndex] || '请选择收礼陪玩' }}</view>
      </picker>
      <input v-model="quantityText" class="field" type="number" placeholder="数量" />
      <view v-if="estimated > 0" class="muted">预计金额 {{ money(estimated) }}</view>
      <button class="primary" :loading="submitting" @click="submitIntent">生成送礼单</button>
    </view>

    <view class="card">
      <view class="section-title">送礼单（待客户确认后执行）</view>
      <view v-if="intents.length === 0" class="muted">暂无送礼单</view>
      <view v-for="item in intents" :key="item.id" class="intent">
        <view class="row">
          <text class="no">{{ item.gift_name }} × {{ item.quantity }}</text>
          <text class="status">{{ intentStatusText(item.status) }}</text>
        </view>
        <view class="muted">
          客户#{{ item.customer_id }} · 收礼 {{ item.player_name }} · {{ money(item.amount_cents) }}
        </view>
        <view v-if="item.status === 'confirmed'" class="actions">
          <button class="mini success" :loading="actingId === item.id" @click="send(item.id)">执行送礼</button>
        </view>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
  import { onLoad, onShow } from '@dcloudio/uni-app';
  import { computed, ref } from 'vue';
  import {
    createGiftIntent,
    fetchAdminPlayers,
    fetchCsCustomers,
    fetchGiftIntents,
    fetchGifts,
    sendGift,
  } from '../../api/cs';
  import type { CsCustomer, CsGift, CsGiftIntent, CsPlayer } from '../../api/cs';
  import { idempotencyKey, money } from '../../utils/format';

  const customers = ref<CsCustomer[]>([]);
  const gifts = ref<CsGift[]>([]);
  const players = ref<CsPlayer[]>([]);
  const intents = ref<CsGiftIntent[]>([]);
  const customerIndex = ref(-1);
  const giftIndex = ref(-1);
  const playerIndex = ref(-1);
  const quantityText = ref('1');
  const submitting = ref(false);
  const actingId = ref(0);
  const pendingCustomerId = ref(0);

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

  const customerNames = computed(() => customers.value.map((c) => c.display_name || `客户#${c.id}`));
  const giftNames = computed(() => gifts.value.map((g) => `${g.name}（${money(g.price_cents)}）`));
  const playerNames = computed(() => players.value.map((p) => p.display_name || `陪玩#${p.id}`));

  const estimated = computed(() => {
    const gift = giftIndex.value >= 0 ? gifts.value[giftIndex.value] : null;
    const qty = Number(quantityText.value);
    return gift && Number.isSafeInteger(qty) && qty > 0 ? gift.price_cents * qty : 0;
  });

  function intentStatusText(status: string): string {
    return (
      (
        {
          pending: '待确认',
          confirmed: '已确认',
          consumed: '已送出',
          cancelled: '已取消',
        } as Record<string, string>
      )[status] || status
    );
  }

  async function load() {
    try {
      customers.value = (await fetchCsCustomers()) || [];
    } catch {
      customers.value = [];
    }
    if (pendingCustomerId.value) {
      const idx = customers.value.findIndex((c) => c.id === pendingCustomerId.value);
      if (idx >= 0) customerIndex.value = idx;
    }
    try {
      gifts.value = (await fetchGifts('on_sale')) || [];
    } catch {
      gifts.value = [];
    }
    try {
      players.value = (await fetchAdminPlayers()) || [];
    } catch {
      players.value = [];
    }
    try {
      intents.value = (await fetchGiftIntents()) || [];
    } catch {
      intents.value = [];
    }
  }

  function onCustomerChange(e: Event) {
    const v = Number((e as unknown as { detail?: { value?: number } }).detail?.value);
    if (Number.isInteger(v)) customerIndex.value = v;
  }

  function onGiftChange(e: Event) {
    const v = Number((e as unknown as { detail?: { value?: number } }).detail?.value);
    if (Number.isInteger(v)) giftIndex.value = v;
  }

  function onPlayerChange(e: Event) {
    const v = Number((e as unknown as { detail?: { value?: number } }).detail?.value);
    if (Number.isInteger(v)) playerIndex.value = v;
  }

  async function submitIntent() {
    if (submitting.value) return;
    if (customerIndex.value < 0 || giftIndex.value < 0 || playerIndex.value < 0) {
      uni.showToast({ title: '请选择客户、礼物与收礼陪玩', icon: 'none' });
      return;
    }
    const qty = Number(quantityText.value);
    if (!Number.isSafeInteger(qty) || qty < 1) {
      uni.showToast({ title: '请填写有效的数量', icon: 'none' });
      return;
    }
    submitting.value = true;
    try {
      // 幂等键绑定提交内容（不含 client_key 本身）。
      const body = {
        customer_id: customers.value[customerIndex.value].id,
        gift_id: gifts.value[giftIndex.value].id,
        player_id: players.value[playerIndex.value].id,
        quantity: qty,
        payment_source: 'customer_balance_principal',
      };
      await createGiftIntent({
        ...body,
        client_key: ensureSubmitClientKey(JSON.stringify(body)),
      });
      uni.showToast({ title: '送礼单已生成', icon: 'success' });
      // 表单会话结束才清键：同一份内容重复提交仍命中同一条确认单。
      submitClientKey = '';
      submitKeyBody = '';
      quantityText.value = '1';
      await load();
    } catch {
      // csRequest 层已提示。
    } finally {
      submitting.value = false;
    }
  }

  async function send(id: number) {
    actingId.value = id;
    try {
      await sendGift(id);
      uni.showToast({ title: '已执行送礼', icon: 'success' });
      await load();
    } catch {
      // csRequest 层已提示。
    } finally {
      actingId.value = 0;
    }
  }

  onLoad((query) => {
    const customerId = Number(query?.customer_id || 0);
    if (Number.isInteger(customerId) && customerId > 0) pendingCustomerId.value = customerId;
  });
  onShow(load);
</script>

<style scoped lang="scss">
  .section-title {
    font-size: 30rpx;
    font-weight: 600;
    margin-bottom: 16rpx;
  }

  .field {
    height: 80rpx;
    line-height: 80rpx;
    padding: 0 24rpx;
    background: $bg;
    border-radius: $radius;
    margin-top: 16rpx;
  }

  .primary {
    margin-top: 32rpx;
    background: $brand;
    color: #fff;
    border-radius: $radius;
  }

  .intent {
    padding: 20rpx 0;
    border-bottom: 1rpx solid $border;
  }

  .intent:last-child {
    border-bottom: none;
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
    gap: 16rpx;
    margin-top: 12rpx;
  }

  .mini {
    font-size: 24rpx;
    padding: 0 24rpx;
    line-height: 56rpx;
    border-radius: 28rpx;
  }

  .success {
    background: $success;
    color: #fff;
  }
</style>
