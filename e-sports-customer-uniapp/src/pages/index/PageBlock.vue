<template>
  <!-- 布局容器：每列一个组件，子组件复用同一套渲染逻辑。 -->
  <view v-if="comp.type === 'layout'" class="layout-row" :style="layoutStyle">
    <view
      v-for="(child, childIndex) in layoutChildren"
      :key="childIndex"
      class="layout-col"
      :style="columnStyle(childIndex)"
    >
      <PageBlock v-if="child" :comp="child" />
    </view>
  </view>

  <!-- 搜索框 -->
  <view v-else-if="comp.type === 'search'" class="card search">
    <view class="search-box">
      <input
        v-model="searchKeyword"
        class="search-input"
        confirm-type="search"
        :placeholder="searchPlaceholder(comp)"
        @confirm="onSearch"
      />
      <text class="search-btn" @click="onSearch">搜索</text>
    </view>
  </view>

  <!-- 轮播图 -->
  <view
    v-else-if="comp.type === 'carousel' && carouselItems(comp).length"
    class="card carousel"
  >
    <swiper
      class="swiper"
      :autoplay="true"
      :circular="true"
      :interval="carouselInterval(comp)"
    >
      <swiper-item v-for="(item, i) in carouselItems(comp)" :key="i">
        <image
          class="banner-img"
          :src="pageImageUrl(item.image)"
          mode="aspectFill"
          @click="onCarouselItemClick(item)"
        />
      </swiper-item>
    </swiper>
  </view>

  <!-- 单图：可配点击跳转 -->
  <view
    v-else-if="comp.type === 'image'"
    class="image-entry"
    :style="imageWrapperStyle(comp)"
    @click="onComponentLink(comp)"
  >
    <image
      v-if="imageOf(comp)"
      class="image-entry-img"
      :src="pageImageUrl(imageOf(comp))"
      :mode="imageFit(comp)"
      :style="imageStyle(comp)"
    />
    <view v-else class="empty">图片未配置</view>
  </view>

  <!-- 公告条 -->
  <view
    v-else-if="comp.type === 'notice' && noticeText(comp)"
    class="card notice"
  >
    <text class="notice-text">{{ noticeText(comp) }}</text>
  </view>

  <!-- 快捷导航宫格：按装修配置的数组顺序渲染，每项可配图标 -->
  <view v-else-if="comp.type === 'quick_nav'" class="card quick-nav">
    <view
      v-for="item in navItems(comp)"
      :key="item.target + '-' + item.name"
      class="nav-item"
      @click="onQuickNav(item)"
    >
      <image
        v-if="item.icon"
        class="nav-icon"
        :src="pageImageUrl(item.icon)"
        mode="aspectFit"
      />
      <text class="nav-name">{{ item.name }}</text>
    </view>
  </view>

  <!-- 游戏/服务分类入口 -->
  <view v-else-if="comp.type === 'category'" class="card category">
    <view class="section-title">{{ categoryTitle(comp) }}</view>
    <view class="category-grid">
      <view
        v-for="item in categoryItems(comp)"
        :key="item.target + '-' + item.name"
        class="category-item"
        @click="onQuickNav(item)"
      >
        <image
          v-if="item.icon"
          class="category-icon"
          :src="pageImageUrl(item.icon)"
          mode="aspectFit"
        />
        {{ item.name }}
      </view>
    </view>
    <view class="category-more" @click="scrollToProducts"
      >查看全部服务 ›</view
    >
  </view>

  <!-- 商品/套餐列表 -->
  <view
    v-else-if="comp.type === 'product_list' && (productTitle(comp) || skusOf(comp).length)"
    id="product-list"
    class="card"
  >
    <view v-if="productTitle(comp)" class="section-title">{{ productTitle(comp) }}</view>
    <view
      v-for="item in skusOf(comp)"
      :key="item.id"
      class="sku"
      @click="goCreate(item)"
    >
      <view class="sku-head">
        <text class="sku-title">{{ item.title }}</text>
        <text class="sku-price">{{ money(item.unit_price_cents) }}</text>
      </view>
      <view class="muted">
        {{ item.service_units }}{{ item.service_unit_name }}
      </view>
      <view v-if="item.description" class="muted">{{
        item.description
      }}</view>
    </view>
  </view>

  <!-- 陪玩推荐 -->
  <view v-else-if="comp.type === 'player_recommend'" class="card">
    <view class="section-title">{{ componentTitle(comp, '陪玩推荐') }}</view>
    <view v-if="playersOf(comp).length === 0" class="muted">
      {{
        emptyTextOf(
          comp,
          '暂无在线可接单的陪玩，可联系归属客服为你安排心仪陪玩。'
        )
      }}
    </view>
    <view
      v-for="p in playersOf(comp)"
      :key="p.id"
      class="player-item"
    >
      <view class="player-head">
        <text class="player-name">{{ p.display_name }}</text>
        <text class="player-level">{{ playerLevelText(p.level) }}</text>
      </view>
      <view class="muted">{{
        p.games && p.games.length ? p.games.join(' / ') : '全游戏'
      }}</view>
      <view class="player-foot">
        <!-- 可接单 = 服务端判定（在线 ∩ 时段 ∩ 容量），不能只凭在线状态展示下单按钮。 -->
        <text :class="p.bookable ? 'online' : 'offline'">
          {{ p.bookable ? '可接单' : '暂不可接单' }}
        </text>
        <text v-if="p.bookable" class="order-btn" @click="goCreateForPlayer(p)"
          >立即下单</text
        >
      </view>
    </view>
  </view>

  <!-- 活动专区 -->
  <view v-else-if="comp.type === 'activity'" class="card">
    <view class="section-title">{{ componentTitle(comp, '活动专区') }}</view>
    <view v-if="campaignsOf(comp).length === 0" class="muted">
      {{ emptyTextOf(comp, '暂无进行中的充值赠送活动。') }}
    </view>
    <view
      v-for="c in campaignsOf(comp)"
      :key="c.id"
      class="campaign-item"
    >
      <view class="campaign-name">{{ c.name }}</view>
      <view class="muted">{{ campaignRuleText(c) }}</view>
      <view class="muted"
        >活动时间 {{ datetime(c.starts_at) }} ~ {{ datetime(c.ends_at) }}</view
      >
    </view>
  </view>

  <!-- 会员/余额入口 -->
  <view
    v-else-if="comp.type === 'member_entry'"
    class="card member-entry"
    @click="go('/pages/wallet/index')"
  >
    <view>
      <view class="member-title">{{ componentTitle(comp, `会员与${balanceName}`) }}</view>
      <view class="muted">查看{{ balanceName }}与会员权益</view>
    </view>
    <text class="arrow">›</text>
  </view>

  <!-- 客服与订单入口 -->
  <view v-else-if="comp.type === 'support_entry'" class="card support">
    <view class="support-actions">
      <view class="support-btn" @click="contactCs">
        <text class="support-name">联系客服</text>
        <text class="muted">归属客服跟进</text>
      </view>
      <view class="support-btn" @click="go('/pages/order/list')">
        <text class="support-name">我的订单</text>
        <text class="muted">订单与去付款</text>
      </view>
      <view class="support-btn" @click="go('/pages/aftersale/list')">
        <text class="support-name">我的售后</text>
        <text class="muted">售后进度查询</text>
      </view>
    </view>
  </view>

  <view v-else-if="comp.type === 'contact_entry'" class="card entry-card" @click="contactCs">
    <text class="support-name">联系客服</text>
    <text class="muted">归属客服跟进</text>
  </view>
  <view v-else-if="comp.type === 'orders_entry'" class="card entry-card" @click="go('/pages/order/list')">
    <text class="support-name">我的订单</text>
    <text class="muted">订单与去付款</text>
  </view>
  <view v-else-if="comp.type === 'aftersale_entry'" class="card entry-card" @click="go('/pages/aftersale/list')">
    <text class="support-name">我的售后</text>
    <text class="muted">售后进度查询</text>
  </view>
</template>

<script setup lang="ts">
  import { computed, inject, onMounted } from 'vue';
  import { fetchWalletDisplay, getWalletDisplayState } from '../../api/esports';

  const walletDisplays = getWalletDisplayState();
  const balanceName = computed(() => walletDisplays.value.customer_balance.display_name);
  onMounted(() => { fetchWalletDisplay(); });
  import type { Ref } from 'vue';
  import type {
    CampaignView,
    PageComponent,
    RecommendedPlayer,
    Sku,
  } from '../../api/esports';
  import { pageImageUrl } from '../../api/request';
  import { datetime, money } from '../../utils/format';

    import { skillLevelText } from '../../utils/levels';
  interface NavItem {
    name: string;
    target: string;
    icon: string;
  }

  interface CarouselItem {
    image: string;
    link: string;
  }

  interface ComponentData {
    skus: Sku[];
    players: RecommendedPlayer[];
    campaigns: CampaignView[];
  }

  interface PageBlockContext {
    dataOf: (comp: PageComponent) => ComponentData;
    searchKeyword: Ref<string>;
    go: (url: string) => void;
    goCreate: (sku: Sku) => void;
    goCreateForPlayer: (player: RecommendedPlayer) => void;
    contactCs: () => void;
    scrollToProducts: () => void;
    onSearch: () => void;
    onQuickNav: (item: NavItem) => void;
    openLink: (link: string) => void;
  }

  const props = defineProps<{ comp: PageComponent }>();

  const ctx = inject<PageBlockContext>('pageBlockContext');
  if (!ctx) {
    throw new Error('PageBlock 缺少 pageBlockContext');
  }
  const {
    dataOf,
    searchKeyword,
    go,
    goCreate,
    goCreateForPlayer,
    contactCs,
    scrollToProducts,
    onSearch,
    onQuickNav,
    openLink,
  } = ctx;

  const layoutColumnCount = computed(() => {
    const value = Number(props.comp.props?.columns);
    return Number.isFinite(value) && value >= 1 && value <= 3
      ? Math.floor(value)
      : 1;
  });

  const layoutChildren = computed<(PageComponent | null)[]>(() => {
    const children = props.comp.children || [];
    return Array.from({ length: layoutColumnCount.value }, (_, index) => {
      const child = children[index];
      return child && child.visible !== false && child.type ? child : null;
    });
  });

  // 列宽比例（column_weights）：按列给出的相对宽度，缺省或非法时各列等宽。
  const layoutWeights = computed<number[]>(() => {
    const raw = props.comp.props?.column_weights;
    if (!Array.isArray(raw) || raw.length !== layoutColumnCount.value) return [];
    const list = raw.map((value) => Number(value));
    const valid = list.every(
      (value) => Number.isInteger(value) && value >= 1 && value <= 12
    );
    return valid ? list : [];
  });

  function columnStyle(index: number): Record<string, string> {
    const weight = layoutWeights.value[index];
    return weight && weight !== 1 ? { flexGrow: String(weight) } : {};
  }

  function layoutDimension(value: unknown, max: number): number | null {
    return typeof value === 'number' && Number.isFinite(value)
      ? Math.min(max, Math.max(0, value))
      : null;
  }

  const layoutStyle = computed(() => {
    const layoutProps = propsOf(props.comp);
    const gap = layoutDimension(layoutProps.gap, 80);
    const padding = layoutDimension(layoutProps.padding, 80);
    const spacing = layoutDimension(layoutProps.spacing, 80);
    const marginTop = layoutDimension(layoutProps.margin_top, 80) ?? spacing;
    const marginRight = layoutDimension(layoutProps.margin_right, 80);
    const marginBottom = layoutDimension(layoutProps.margin_bottom, 80) ?? spacing;
    const marginLeft = layoutDimension(layoutProps.margin_left, 80);
    const radius = layoutDimension(layoutProps.radius, 48);
    const background = asString(layoutProps.background_color);
    return {
      ...(gap !== null ? { gap: `${gap}px` } : {}),
      ...(padding !== null ? { padding: `${padding}px` } : {}),
      ...(marginTop !== null ? { marginTop: `${marginTop}px` } : {}),
      ...(marginRight !== null ? { marginRight: `${marginRight}px` } : {}),
      ...(marginBottom !== null ? { marginBottom: `${marginBottom}px` } : {}),
      ...(marginLeft !== null ? { marginLeft: `${marginLeft}px` } : {}),
      ...(radius !== null ? { borderRadius: `${radius}px` } : {}),
      ...(/^#[0-9a-fA-F]{6}$/.test(background)
        ? { backgroundColor: background }
        : {}),
    };
  });

  // 技能等级文案走系统配置（配置驱动）。

  function propsOf(comp: PageComponent): Record<string, unknown> {
    return (comp.props || {}) as Record<string, unknown>;
  }

  function asString(value: unknown): string {
    return typeof value === 'string' ? value : '';
  }

  function asStringArray(value: unknown): string[] {
    if (!Array.isArray(value)) return [];
    return value.filter((v): v is string => typeof v === 'string');
  }

  function asNavItems(value: unknown): NavItem[] {
    if (!Array.isArray(value)) return [];
    return value
      .map((v) => {
        if (typeof v === 'object' && v !== null) {
          const o = v as Record<string, unknown>;
          return {
            name: asString(o.name),
            target: asString(o.target),
            icon: asString(o.icon),
          };
        }
        return { name: '', target: '', icon: '' };
      })
      .filter((item) => item.name);
  }

  // 轮播项优先读 items（每张图独立跳转），旧配置只有 images 时按图片生成。
  function carouselItems(comp: PageComponent): CarouselItem[] {
    const items = propsOf(comp).items;
    if (Array.isArray(items)) {
      const list = items
        .map((v) => {
          if (typeof v === 'object' && v !== null) {
            const o = v as Record<string, unknown>;
            return { image: asString(o.image), link: asString(o.link) };
          }
          return { image: '', link: '' };
        })
        .filter((item) => item.image);
      if (list.length) return list;
    }
    return asStringArray(propsOf(comp).images).map((image) => ({
      image,
      link: '',
    }));
  }

  function onCarouselItemClick(item: CarouselItem) {
    const link = item.link.trim();
    if (link) openLink(link);
  }

  function carouselInterval(comp: PageComponent): number {
    const value = Number(propsOf(comp).interval);
    return Number.isFinite(value) && value > 0 ? value : 3000;
  }

  function noticeText(comp: PageComponent): string {
    return asString(propsOf(comp).text);
  }

  function imageOf(comp: PageComponent): string {
    return asString(propsOf(comp).image);
  }

  function imageFit(comp: PageComponent): string {
    const value = asString(propsOf(comp).fit);
    return ['widthFix', 'aspectFill', 'aspectFit'].includes(value)
      ? value
      : 'widthFix';
  }

  function imageHeight(comp: PageComponent): number {
    const value = Number(propsOf(comp).height);
    return Number.isFinite(value) && value > 0 ? value : 160;
  }

  function imageRadius(comp: PageComponent): number {
    const value = Number(propsOf(comp).radius);
    return Number.isFinite(value) ? Math.min(48, Math.max(0, value)) : 8;
  }

  function imageSpacing(comp: PageComponent): number | null {
    const value = Number(propsOf(comp).spacing);
    return Number.isFinite(value) ? Math.min(240, Math.max(0, value)) : null;
  }

  function imageWrapperStyle(comp: PageComponent) {
    const spacing = imageSpacing(comp);
    return {
      borderRadius: `${imageRadius(comp)}px`,
      ...(spacing !== null
        ? { marginTop: `${spacing}px`, marginBottom: `${spacing}px` }
        : {}),
    };
  }

  function imageStyle(comp: PageComponent) {
    const fit = imageFit(comp);
    return {
      height: fit === 'widthFix' ? undefined : `${imageHeight(comp)}px`,
      background: fit === 'aspectFit' ? '#f5f6f8' : undefined,
    };
  }

  // 单图 / 轮播共用：读取组件 props.link 并跳转。
  function onComponentLink(comp: PageComponent) {
    const link = asString(propsOf(comp).link).trim();
    if (link) openLink(link);
  }

  function searchPlaceholder(comp: PageComponent): string {
    return asString(propsOf(comp).placeholder) || '搜索服务 / 陪玩';
  }

  function navItems(comp: PageComponent): NavItem[] {
    return asNavItems(propsOf(comp).items);
  }

  function componentTitle(comp: PageComponent, fallback: string): string {
    return asString(propsOf(comp).title) || fallback;
  }

  function categoryTitle(comp: PageComponent): string {
    return componentTitle(comp, '游戏 / 服务分类');
  }

  function categoryItems(comp: PageComponent): NavItem[] {
    return asNavItems(propsOf(comp).items);
  }

  function productTitle(comp: PageComponent): string {
    return asString(propsOf(comp).title).trim();
  }

  function productLimitOf(comp: PageComponent): number {
    const value = Number(propsOf(comp).limit);
    return Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
  }

  function emptyTextOf(comp: PageComponent, fallback: string): string {
    return asString(propsOf(comp).empty_text) || fallback;
  }

  function filterSkus(list: Sku[]): Sku[] {
    const keyword = searchKeyword.value.trim().toLowerCase();
    if (!keyword) return list;
    return list.filter((item) =>
      `${item.title} ${item.description}`.toLowerCase().includes(keyword)
    );
  }

  function skusOf(comp: PageComponent): Sku[] {
    const list = filterSkus(dataOf(comp).skus);
    const limit = productLimitOf(comp);
    return limit > 0 ? list.slice(0, limit) : list;
  }

  function playersOf(comp: PageComponent): RecommendedPlayer[] {
    return dataOf(comp).players;
  }

  function campaignsOf(comp: PageComponent): CampaignView[] {
    return dataOf(comp).campaigns;
  }

  function playerLevelText(level: string): string {
    return skillLevelText(level);
  }

  function campaignRuleText(campaign: CampaignView): string {
    const tiers = (campaign.tiers || []).filter(
      (t) => t.threshold_cents > 0 && t.bonus_cents > 0
    );
    if (!tiers.length) return '充值有礼';
    return tiers
      .map(
        (t) =>
          `充 ${money(t.threshold_cents)} 送 ${money(t.bonus_cents)}`
      )
      .join('；');
  }
</script>

<style scoped lang="scss">
  .layout-row {
    display: flex;
    gap: 16rpx;
    align-items: flex-start;
    margin: 0;
  }

  .layout-col {
    flex: 1;
    min-width: 0;
  }

  .layout-col :deep(.card) {
    box-sizing: border-box;
    width: 100%;
    height: 100%;
    margin: 0;
    padding: 16rpx 8rpx;
  }

  .section-title {
    font-size: 30rpx;
    font-weight: 600;
    margin-bottom: 16rpx;
  }

  .search-box {
    display: flex;
    align-items: center;
    gap: 16rpx;
  }

  .search-input {
    flex: 1;
    height: 72rpx;
    padding: 0 24rpx;
    background: $bg;
    border-radius: 999rpx;
  }

  .search-btn {
    color: $brand;
    font-weight: 600;
  }

  .swiper {
    height: 320rpx;
    border-radius: $radius;
    overflow: hidden;
  }

  .banner-img {
    width: 100%;
    height: 320rpx;
  }

  .image-entry {
    margin-bottom: 24rpx;
    border-radius: $radius;
    overflow: hidden;
  }

  .image-entry-img {
    display: block;
    width: 100%;
  }

  .notice-text {
    color: $text-2;
  }

  .quick-nav {
    display: flex;
    flex-wrap: wrap;
  }

  .nav-item {
    width: 20%;
    padding: 20rpx 0;
    text-align: center;
  }

  .nav-name {
    font-size: 26rpx;
    color: $text-1;
  }

  .category-grid {
    display: flex;
    flex-wrap: wrap;
    gap: 16rpx;
  }

  .category-item {
    padding: 12rpx 28rpx;
    background: $bg;
    border-radius: 999rpx;
    font-size: 26rpx;
    color: $text-2;
  }

  .category-more {
    margin-top: 20rpx;
    color: $brand;
    font-size: 26rpx;
  }

  .sku {
    padding: 20rpx 0;
    border-bottom: 1rpx solid $border;
  }

  .sku:last-child {
    border-bottom: none;
  }

  .sku-head {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .sku-title {
    font-weight: 600;
  }

  .sku-price {
    color: $danger;
    font-weight: 600;
  }

  .member-entry {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .member-title {
    font-size: 30rpx;
    font-weight: 600;
  }

  .arrow {
    color: $text-3;
    font-size: 40rpx;
  }

  .support-actions {
    display: flex;
  }

  .support-btn {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8rpx;
  }

  .support-name {
    font-weight: 600;
  }

  .entry-card {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8rpx;
    text-align: center;
  }

  .player-item {
    padding: 20rpx 0;
    border-bottom: 1rpx solid $border;
  }

  .player-item:last-child {
    border-bottom: none;
  }

  .player-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 8rpx;
  }

  .player-name {
    font-weight: 600;
  }

  .player-level {
    font-size: 24rpx;
    color: $brand;
    background: rgba(22, 93, 255, 0.08);
    padding: 4rpx 16rpx;
    border-radius: 999rpx;
  }

  .player-foot {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-top: 12rpx;
  }

  .online {
    color: #00b578;
  }

  .offline {
    color: $text-3;
  }

  .order-btn {
    color: #fff;
    background: $brand;
    border-radius: 999rpx;
    padding: 8rpx 32rpx;
    font-size: 26rpx;
  }

  .campaign-item {
    padding: 20rpx 0;
    border-bottom: 1rpx solid $border;
  }

  .campaign-item:last-child {
    border-bottom: none;
  }

  .campaign-name {
    font-weight: 600;
    margin-bottom: 8rpx;
  }
</style>
