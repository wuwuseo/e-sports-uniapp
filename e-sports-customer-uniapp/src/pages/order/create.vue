<template>
  <view>
    <view class="card">
      <view class="section-title">{{ sku?.title || '下单' }}</view>
      <view class="muted">
        单价 {{ money(sku?.unit_price_cents || 0) }} · 每份
        {{ sku?.service_units || 0 }}{{ sku?.service_unit_name || '' }}
      </view>
      <view class="row">
        <text>购买份数</text>
        <view class="stepper">
          <button class="step" @click="changeQuantity(-1)">-</button>
          <input
            v-model="quantityText"
            class="quantity"
            type="number"
            @blur="normalizeQuantity"
          />
          <button class="step" @click="changeQuantity(1)">+</button>
        </view>
      </view>
      <view class="row">
        <text>预估应付</text>
        <text class="price">{{ money(estimateCents) }}</text>
      </view>
      <view v-if="contentImages.length" class="content-images">
        <image
          v-for="(src, index) in contentImages"
          :key="`${src}-${index}`"
          :src="src"
          mode="widthFix"
          class="content-image"
          @click="previewContentImage(index)"
        />
      </view>
      <view class="muted">最终金额以会员折扣与客服改价后的报价为准（下单后请确认报价）。</view>
    </view>

    <view class="card">
      <view class="section-title">选择陪玩（可选）</view>
      <view class="muted">
        不选则由陪玩抢单后你来确认；选中后将作为「客户指定陪玩」提交，由客服按该陪玩派单。
      </view>
      <view v-if="players.length === 0" class="muted">暂无可选陪玩</view>
      <scroll-view v-else class="player-list" scroll-y>
        <view
          v-for="player in players"
          :key="player.id"
          class="player"
          :class="{ selected: player.id === preferredPlayerId }"
          @click="togglePlayer(player)"
        >
          <text class="player-name">{{ player.display_name }}</text>
          <text class="muted">{{ player.level }} · {{ player.online ? '在线' : '不在线' }}</text>
        </view>
      </scroll-view>
      <view v-if="preferredPlayerId > 0" class="row">
        <text class="muted">已选择：{{ preferredPlayerName }}</text>
        <button class="mini" @click="preferredPlayerId = 0">清除</button>
      </view>
    </view>

    <view class="card">
      <button class="primary" :loading="submitting" @click="submit">
        提交报单（待付款）
      </button>
      <view class="muted center">
        提交后订单进入待付款，需在支付时限内完成付款；被限制自助下单的客户会被拦截。
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
  import { onLoad } from '@dcloudio/uni-app';
  import { computed, ref } from 'vue';
  import { fetchRecommendedPlayers, fetchSkus, placeSelfOrder } from '../../api/esports';
  import type { RecommendedPlayer, Sku } from '../../api/esports';
  import { idempotencyKey, money } from '../../utils/format';

  const skuId = ref(0);
  const sku = ref<Sku | null>(null);
  /** 客户指定陪玩：首页推荐卡带入或在本页选择，0 表示不指定、走抢单。 */
  const preferredPlayerId = ref(0);
  /** 可选陪玩：复用公开陪玩列表（资质合格 + 在线）。 */
  const players = ref<RecommendedPlayer[]>([]);
  const selectedPlayer = computed(
    () => players.value.find((item) => item.id === preferredPlayerId.value) || null
  );
  const preferredPlayerName = computed(() =>
    selectedPlayer.value?.display_name || (preferredPlayerId.value > 0 ? `#${preferredPlayerId.value}` : '')
  );

  async function loadPlayers() {
    try {
      players.value = (await fetchRecommendedPlayers()) || [];
    } catch {
      players.value = [];
    }
  }

  function togglePlayer(player: RecommendedPlayer) {
    preferredPlayerId.value = preferredPlayerId.value === player.id ? 0 : player.id;
  }
  const quantity = ref(1);
  const quantityText = ref('1');
  const submitting = ref(false);
  // 幂等键在进入页面时生成一次：重复点击提交只落一张单。
  const requestKey = idempotencyKey('self-order');

  const estimateCents = computed(
    () => (sku.value?.unit_price_cents || 0) * quantity.value
  );

  // 商品内容图片：管理端配置的公开地址（站内 /uploads/ 路径或绝对地址），按原顺序展示。
  const contentImages = computed(() =>
    Array.isArray(sku.value?.content) ? sku.value!.content : []
  );
  function previewContentImage(index: number) {
    const urls = contentImages.value;
    if (!urls.length) return;
    uni.previewImage({ urls, current: index });
  }

  function changeQuantity(delta: number) {
    const next = Math.min(1000, Math.max(1, quantity.value + delta));
    quantity.value = next;
    quantityText.value = String(next);
  }

  function normalizeQuantity() {
    const parsed = Number(quantityText.value);
    const next = Number.isFinite(parsed)
      ? Math.min(1000, Math.max(1, Math.floor(parsed)))
      : 1;
    quantity.value = next;
    quantityText.value = String(next);
  }

  async function loadSku() {
    try {
      const list = (await fetchSkus()) || [];
      sku.value = list.find((item) => item.id === skuId.value) || null;
    } catch {
      sku.value = null;
    }
  }

  async function submit() {
    // 防连点：button 的 loading 只显示图标、不会禁用点击，
    // 不拦住会在一次「提交不了」的反复点击里落下多张订单。
    if (submitting.value) return;
    if (!sku.value) {
      uni.showToast({ title: '商品不存在或已下架', icon: 'none' });
      return;
    }
    submitting.value = true;
    try {
      const order = await placeSelfOrder(
        sku.value.id,
        quantity.value,
        requestKey,
        preferredPlayerId.value
      );
      uni.showToast({ title: '报单成功', icon: 'success' });
      setTimeout(() => {
        uni.redirectTo({ url: `/pages/order/detail?id=${order.id}` });
      }, 600);
    } catch (error) {
      // request 层已 toast 服务端提示；403「无权访问该客户或订单」多数是账号未建客户档案，
      // 补一条可操作的引导，避免用户只看到一句看不懂的报错。
      if ((error as Error)?.message?.includes('无权访问')) {
        uni.showModal({
          title: '无法提交报单',
          content: '当前登录账号还未绑定客户档案，请联系客服建档后再下单。',
          showCancel: false,
        });
      }
    } finally {
      submitting.value = false;
    }
  }

  onLoad((query) => {
    skuId.value = Number(query?.skuId || 0);
    preferredPlayerId.value = Number(query?.playerId || 0) || 0;
    loadSku();
    loadPlayers();
  });
</script>

<style scoped lang="scss">
  .section-title {
    font-size: 32rpx;
    font-weight: 600;
    margin-bottom: 12rpx;
  }

  .content-images {
    margin-top: 16rpx;
    display: flex;
    flex-direction: column;
    gap: 12rpx;
  }

  .content-image {
    width: 100%;
    border-radius: 12rpx;
    background-color: #f2f3f5;
  }

  .player-list {
    max-height: 420rpx;
    margin-top: 12rpx;
  }

  .player {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 16rpx 12rpx;
    border-radius: $radius;

    &.selected {
      background: $bg;
    }
  }

  .player-name {
    font-weight: 600;
  }

  .stepper {
    display: flex;
    align-items: center;
  }

  .step {
    width: 64rpx;
    height: 64rpx;
    line-height: 64rpx;
    padding: 0;
    background: $bg;
    border-radius: $radius;
    font-size: 32rpx;
  }

  .quantity {
    width: 120rpx;
    height: 64rpx;
    text-align: center;
    margin: 0 16rpx;
    background: $bg;
    border-radius: $radius;
  }

  .price {
    color: $danger;
    font-weight: 600;
  }

  .primary {
    background: $brand;
    color: #fff;
    border-radius: $radius;
  }

  .center {
    text-align: center;
    margin-top: 16rpx;
  }
</style>
