<template>
  <view>
    <view class="card tip muted">抢单大厅：先到先得，抢单成功即视为已接单。优先通知单排在最前。</view>

    <!-- 筛选：服务端已按游戏分区 + 等级过滤，这里只做同口径的收窄，不改变可见集合 -->
    <view class="card filters">
      <view class="filter-row">
        <text class="filter-label">游戏分区</text>
        <picker
          v-if="gameOptions.length > 1"
          mode="selector"
          :range="gameOptions"
          :value="gameIndex"
          @change="onGameChange"
        >
          <text class="picker-value">{{ gameOptions[gameIndex] }} ›</text>
        </picker>
        <text v-else class="muted">暂无可筛选分区</text>
      </view>
      <view class="filter-row">
        <text class="filter-label">所需等级</text>
        <picker mode="selector" :range="levelLabels" :value="levelIndex" @change="onLevelChange">
          <text class="picker-value">{{ levelLabels[levelIndex] }} ›</text>
        </picker>
      </view>
      <view class="filter-row">
        <text class="filter-label">每席单价（元）</text>
        <input v-model="minPriceText" class="price-input" type="digit" placeholder="最低" />
        <text class="muted">~</text>
        <input v-model="maxPriceText" class="price-input" type="digit" placeholder="最高" />
      </view>
      <view class="muted">
        共 {{ orders.length }} 单，筛选后 {{ filteredOrders.length }} 单
        <text v-if="hasFilter" class="link" @click="resetFilters">清除筛选</text>
      </view>
    </view>

    <view class="card">
      <view v-if="filteredOrders.length === 0" class="empty">
        {{ hasFilter ? '没有符合筛选条件的订单' : '暂无可抢的订单' }}
      </view>
      <view v-for="item in filteredOrders" :key="item.id" class="order">
        <view class="row">
          <text class="order-no">{{ item.order_no }}</text>
          <text class="amount">{{ money(item.payable_cents) }}</text>
        </view>
        <view class="muted">
          商品 {{ item.product_id }} · {{ item.promised_service_units }} 服务量 ·
          {{ item.required_seats }} 席 · 每席 {{ money(perSeatPrice(item)) }}
        </view>
        <view class="muted">
          要求等级 {{ levelText(item.required_level) }}
          <text v-if="item.priority_game"> · 分区 {{ item.priority_game }}</text>
        </view>
        <view class="tags">
          <text v-if="item.priority_notice_status === 'pending'" class="tag warn"
            >优先通知 · 至 {{ datetime(item.priority_notice_until) }}</text
          >
          <text v-else class="tag">抢单中</text>
        </view>
        <button class="grab" :loading="grabbingId === item.id" @click="grab(item)">
          抢单
        </button>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
  import { onHide, onShow, onUnload } from '@dcloudio/uni-app';
  import { computed, ref } from 'vue';
  import { fetchGrabHall, grabOrder } from '../../api/player';
  import type { PlayerOrder } from '../../api/player';
  import { onRealtime, onRealtimeReconnect } from '../../api/realtime';
  import { datetime, divideCents, money, yuanToCents } from '../../utils/format';

  import { skillLevelText, skillLevelRank } from '../../utils/levels';
  const orders = ref<PlayerOrder[]>([]);
  const grabbingId = ref<number>(0);

  // ── 筛选条件 ──

  const ALL = '全部分区';
  const levelLabels = ['全部等级', '仅新手', '熟练及以下', '资深及以上'];
  const levelIndex = ref(0);
  const gameIndex = ref(0);
  const minPriceText = ref('');
  const maxPriceText = ref('');

  /**
   * 分区选项取自当前大厅订单的 priority_game 快照：服务端已按陪玩的分区权限过滤，
   * 快照为空的订单（未开过优先通知窗口）不参与分区筛选，只在「全部分区」下展示。
   */
  const gameOptions = computed(() => {
    const games = orders.value
      .map((item) => item.priority_game)
      .filter((game, index, list) => !!game && list.indexOf(game) === index)
      .sort();
    return games.length ? [ALL, ...games] : [ALL];
  });

  const selectedGame = computed(() =>
    gameIndex.value > 0 ? gameOptions.value[gameIndex.value] || '' : ''
  );

  // 等级序数与文案走系统配置（配置驱动）。
  const levelRange = computed<{ min: number; max: number } | null>(() => {
    switch (levelIndex.value) {
      case 1:
        return { min: 0, max: 0 };
      case 2:
        return { min: 0, max: 1 };
      case 3:
        return { min: 2, max: 3 };
      default:
        return null;
    }
  });

  function perSeatPrice(order: PlayerOrder): number {
    const seats = order.required_seats > 0 ? order.required_seats : 1;
    return divideCents(order.payable_cents, seats);
  }

  function parseYuanToCents(text: string): number | null {
    const trimmed = text.trim();
    if (!trimmed) return null;
    const value = Number(trimmed);
    if (!Number.isFinite(value) || value < 0) return null;
    return yuanToCents(trimmed);
  }

  const hasFilter = computed(
    () =>
      !!selectedGame.value ||
      levelIndex.value > 0 ||
      !!minPriceText.value.trim() ||
      !!maxPriceText.value.trim()
  );

  const filteredOrders = computed<PlayerOrder[]>(() =>
    orders.value.filter((order) => {
      if (selectedGame.value && order.priority_game !== selectedGame.value) return false;
      const range = levelRange.value;
      if (range) {
        const rank = skillLevelRank(order.required_level);
        if (rank < range.min || rank > range.max) return false;
      }
      const price = perSeatPrice(order);
      const min = parseYuanToCents(minPriceText.value);
      if (min !== null && price < min) return false;
      const max = parseYuanToCents(maxPriceText.value);
      if (max !== null && price > max) return false;
      return true;
    })
  );

  function onGameChange(e: Event) {
    const v = Number((e as unknown as { detail?: { value?: number } }).detail?.value);
    if (Number.isInteger(v) && v >= 0 && v < gameOptions.value.length) gameIndex.value = v;
  }

  function onLevelChange(e: Event) {
    const v = Number((e as unknown as { detail?: { value?: number } }).detail?.value);
    if (Number.isInteger(v) && v >= 0 && v < levelLabels.length) levelIndex.value = v;
  }

  function resetFilters() {
    gameIndex.value = 0;
    levelIndex.value = 0;
    minPriceText.value = '';
    maxPriceText.value = '';
  }

  const levelText = (level: string) => skillLevelText(level);

  async function load() {
    try {
      orders.value = (await fetchGrabHall()) || [];
      // 分区选项变化后索引可能越界，回落到「全部分区」。
      if (gameIndex.value >= gameOptions.value.length) gameIndex.value = 0;
    } catch {
      orders.value = [];
    }
  }

  async function grab(item: PlayerOrder) {
    grabbingId.value = item.id;
    try {
      await grabOrder(item.id);
      uni.showToast({ title: '抢单成功', icon: 'success' });
      load();
    } catch {
      // request 层已提示具体原因。
    } finally {
      grabbingId.value = 0;
    }
  }

  /** 页面是否在前台：只有前台才响应大厅推送。 */
  const visible = ref(false);
  let reloadTimer: ReturnType<typeof setTimeout> | null = null;

  /** 大厅新单：300ms 防抖后重拉，结果以 listGrabHall 接口为准（服务端不做收件人过滤）。 */
  function scheduleReload() {
    if (reloadTimer) clearTimeout(reloadTimer);
    reloadTimer = setTimeout(() => {
      reloadTimer = null;
      load();
    }, 300);
  }

  const offHall = onRealtime('hall.order_created', () => {
    if (visible.value) scheduleReload();
  });
  const offReconnect = onRealtimeReconnect(() => {
    if (visible.value) load();
  });

  onShow(() => {
    visible.value = true;
    load();
  });
  onHide(() => {
    visible.value = false;
  });
  onUnload(() => {
    offHall();
    offReconnect();
    if (reloadTimer) clearTimeout(reloadTimer);
  });
</script>

<style scoped lang="scss">
  .tip {
    padding: 16rpx 24rpx;
  }

  .filters {
    padding: 8rpx 24rpx 16rpx;
  }

  .filter-row {
    display: flex;
    align-items: center;
    gap: 12rpx;
    padding: 12rpx 0;
  }

  .filter-label {
    width: 200rpx;
    color: $text-2;
    font-size: 26rpx;
  }

  .picker-value {
    color: $brand;
  }

  .price-input {
    flex: 1;
    height: 64rpx;
    padding: 0 16rpx;
    background: $bg;
    border-radius: $radius;
    font-size: 26rpx;
  }

  .link {
    color: $brand;
    margin-left: 16rpx;
  }

  .order {
    padding: 20rpx 0;
    border-bottom: 1rpx solid $border;
  }

  .order:last-child {
    border-bottom: none;
  }

  .order-no {
    font-weight: 600;
  }

  .amount {
    color: $danger;
    font-weight: 600;
  }

  .tags {
    margin: 12rpx 0;
  }

  .tag {
    font-size: 22rpx;
    color: $brand;
    background: #eef3ff;
    padding: 4rpx 12rpx;
    border-radius: 8rpx;
  }

  .tag.warn {
    color: #ff7d00;
    background: #fff3e8;
  }

  .grab {
    background: $brand;
    color: #fff;
    border-radius: $radius;
  }
</style>
