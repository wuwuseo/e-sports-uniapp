<template>
  <view>
    <view v-if="previewCode" class="card preview-tip">预览模式：当前展示的是草稿装修配置，正式发布前不对其他用户可见。</view>

    <view v-if="banner" class="card banner">
      <view class="banner-title">{{ banner.title }}</view>
      <view class="banner-sub">{{ banner.subtitle }}</view>
    </view>

    <PageBlock
      v-for="(comp, idx) in visibleComponents"
      :key="comp.type + '-' + idx"
      :comp="comp"
    />

    <view class="muted center">下单后由归属客服跟进，付款前可随时联系客服改单</view>
  </view>
</template>

<script setup lang="ts">
  import { onLoad, onShow } from '@dcloudio/uni-app';
  import { computed, provide, ref } from 'vue';
  import {
    fetchActiveCampaigns,
    fetchWalletDisplay,
    fetchPageConfig,
    fetchPagePreview,
    fetchRecommendedPlayers,
    fetchSkus,
  } from '../../api/esports';
  import type { CampaignView, PageComponent, RecommendedPlayer, Sku } from '../../api/esports';
  import PageBlock from './PageBlock.vue';

  /** 后端首页装修渠道：publicPage 缺省渠道为 uni_customer_home。 */
  const HOME_CHANNEL = 'uni_customer_home';

  /** 装修预览码：带 ?preview=<code> 进入时兑换该码对应的草稿配置。 */
  const previewCode = ref('');

  /** 单个装修组件自己的取数结果：重复组件各自取数，不共享同一批数据。 */
  interface ComponentData {
    skus: Sku[];
    players: RecommendedPlayer[];
    campaigns: CampaignView[];
  }

  /** 组件对象自身作为键：布局内外组件共用同一套取数结果，不依赖嵌套下标。 */
  const componentData = ref<Map<PageComponent, ComponentData>>(new Map());
  const emptyData: ComponentData = { skus: [], players: [], campaigns: [] };
  const banner = ref<{ title: string; subtitle: string } | null>(null);
  const components = ref<PageComponent[]>([]);
  const searchKeyword = ref('');
  /** 推荐卡片点「立即下单」后待带到下单页的指定陪玩，0 表示未选。 */
  const pendingPlayerId = ref(0);

  interface NavItem {
    name: string;
    target: string;
    /** 装修配置的可选图标地址；为空时只渲染文字。 */
    icon: string;
  }

  /** 系统默认模板（与后端 defaultPageConfig 对齐）：未装修或读取失败时兜底。 */
  const DEFAULT_COMPONENTS: PageComponent[] = [
    { type: 'search', visible: true },
    {
      type: 'quick_nav',
      visible: true,
      props: {
        items: [
          { name: '商品分类', target: 'category' },
          { name: '我的订单', target: 'orders' },
          { name: '会员', target: 'member' },
          { name: '联系客服', target: 'support' },
        ],
      },
    },
    { type: 'product_list', visible: true },
    {
      type: 'layout',
      visible: true,
      props: { columns: 3 },
      children: [
        { type: 'contact_entry', visible: true },
        { type: 'orders_entry', visible: true },
        { type: 'aftersale_entry', visible: true },
      ],
    },
  ];

  const visibleComponents = computed<PageComponent[]>(() => {
    const list = components.value.length ? components.value : DEFAULT_COMPONENTS;
    return list.filter((comp) => comp.type && comp.visible !== false);
  });

  function dataOf(comp: PageComponent): ComponentData {
    return componentData.value.get(comp) || emptyData;
  }

  /** 把顶层组件与布局内各层可见组件摊平，供逐组件取数使用（布局可嵌套，需递归）。 */
  function collectVisibleBlocks(
    list: (PageComponent | null)[]
  ): PageComponent[] {
    const out: PageComponent[] = [];
    for (const comp of list) {
      if (!comp || !comp.type || comp.visible === false) continue;
      if (comp.type === 'layout') {
        out.push(...collectVisibleBlocks(comp.children || []));
        continue;
      }
      out.push(comp);
    }
    return out;
  }

  function asString(value: unknown): string {
    return typeof value === 'string' ? value : '';
  }

  /** 解析单个组件；布局的 children 按列保留 null 占位。 */
  function parseComponent(item: unknown): PageComponent | null {
    if (typeof item !== 'object' || item === null) return null;
    const o = item as Record<string, unknown>;
    const type = asString(o.type);
    if (!type) return null;
    const children = Array.isArray(o.children)
      ? o.children.map((child) => parseComponent(child))
      : undefined;
    return {
      type,
      visible: o.visible === false ? false : true,
      props: (typeof o.props === 'object' && o.props !== null
        ? o.props
        : {}) as Record<string, unknown>,
      ...(children ? { children } : {}),
    };
  }

  // ── 数据加载 ──

  /** product_list 组件 props → 公开商品接口的同名查询参数（未配置的键不传 = 不过滤）。 */
  function skuQueryOf(comp: PageComponent): Record<string, string | number | number[]> {
    const props = (comp.props || {}) as Record<string, unknown>;
    const query: Record<string, string | number | number[]> = {};
    const limit = Number(props.limit);
    if (Number.isFinite(limit) && limit > 0) query.limit = Math.floor(limit);
    const skuIds = Array.isArray(props.product_ids)
      ? props.product_ids.map((value) => Number(value)).filter((value) => value > 0)
      : [];
    if (skuIds.length) query.product_ids = skuIds;
    for (const key of ['game', 'category_id', 'status', 'sort', 'data_source', 'rule_code']) {
      const raw = props[key];
      const value = typeof raw === 'string' ? raw.trim() : typeof raw === 'number' ? String(raw) : '';
      if (value) query[key] = value;
    }
    return query;
  }

  /** player_recommend 组件 props → 公开陪玩接口查询参数（online / bookable 为收窄开关）。 */
  function playerQueryOf(comp: PageComponent): Record<string, string | number | boolean> {
    const props = (comp.props || {}) as Record<string, unknown>;
    const query: Record<string, string | number | boolean> = {};
    for (const key of ['game', 'level']) {
      const value = asString(props[key]).trim();
      if (value) query[key] = value;
    }
    if (props.online === true) query.online = true;
    if (props.bookable === true) query.bookable = true;
    const limit = Number(props.limit);
    if (Number.isFinite(limit) && limit > 0) query.limit = Math.floor(limit);
    return query;
  }

  /**
   * 逐组件取数：每块组件按自己的 props 请求，结果按组件对象分别保存。
   * 单个组件失败只让它显示空态，不影响其它组件；不把一批数据复用到所有同类组件。
   */
  async function loadComponentData() {
    const blocks = collectVisibleBlocks(visibleComponents.value);
    const next = new Map<PageComponent, ComponentData>();
    await Promise.all(
      blocks.map(async (comp) => {
        const entry: ComponentData = { skus: [], players: [], campaigns: [] };
        try {
          if (comp.type === 'product_list') {
            entry.skus = (await fetchSkus(skuQueryOf(comp))) || [];
          } else if (comp.type === 'player_recommend') {
            entry.players = (await fetchRecommendedPlayers(playerQueryOf(comp))) || [];
          } else if (comp.type === 'activity') {
            const all = (await fetchActiveCampaigns()) || [];
            const campaignId = Number((comp.props || {}).campaign_id);
            entry.campaigns =
              Number.isFinite(campaignId) && campaignId > 0
                ? all.filter((item) => item.id === campaignId)
                : all;
          }
        } catch {
          // 请求层已提示；这里只退化为该组件的空态，不制造假数据。
        }
        next.set(comp, entry);
      })
    );
    componentData.value = next;
  }

  /** 首页装修：读已发布配置，缺失或字段不符时静默回落默认模板；配置就绪后逐组件取数。 */
  async function loadConfig() {
    try {
      // 预览码优先：兑换草稿配置（不含个人信息），未带预览码时读已发布配置。
      const page = previewCode.value
        ? await fetchPagePreview(previewCode.value)
        : await fetchPageConfig(HOME_CHANNEL);
      const config = (page?.config || {}) as Record<string, unknown>;
      const raw = config.components;
      if (Array.isArray(raw) && raw.length) {
        components.value = raw
          .map((item) => parseComponent(item))
          .filter((comp): comp is PageComponent => comp !== null);
      } else {
        components.value = [];
      }
      // 旧版 banner 兜底（config.banner），components 模式下通常不存在。
      const b = (config.banner || {}) as { title?: string; subtitle?: string };
      banner.value = b.title ? { title: b.title, subtitle: b.subtitle || '' } : null;
    } catch {
      components.value = [];
      banner.value = null;
    }
    await loadComponentData();
  }

  /**
   * 立即下单：记住该陪玩并引导到在售服务列表，选中服务后带 playerId 进下单页
   * （订单以「客户指定陪玩」提交）。不再跳到送礼页——那是礼物流程，不是报单。
   */
  function goCreateForPlayer(player: RecommendedPlayer) {
    pendingPlayerId.value = player.id;
    if (
      collectVisibleBlocks(visibleComponents.value).some(
        (comp) => comp.type === 'product_list'
      )
    ) {
      uni.showToast({ title: '请选择要下单的服务', icon: 'none' });
      scrollToProducts();
      return;
    }
    uni.showToast({ title: '暂无可下单的服务，请联系归属客服', icon: 'none' });
  }

  // ── 交互 ──

  function go(url: string) {
    uni.navigateTo({ url });
  }

  /** 图片入口跳转：站内走客户端路由，https 链接在 H5 新开页、其它端复制链接。 */
  function openLink(link: string) {
    const url = link.trim();
    if (!url) return;
    if (url.startsWith('/')) {
      const tabPages = [
        '/pages/index/index',
        '/pages/order/list',
        '/pages/mine/index',
      ];
      if (tabPages.includes(url)) {
        uni.switchTab({ url });
      } else {
        go(url);
      }
      return;
    }
    if (!/^https:\/\//i.test(url)) {
      uni.showToast({ title: '链接仅支持站内路径或 https 地址', icon: 'none' });
      return;
    }
    const opener = (
      globalThis as unknown as { open?: (target: string, name?: string) => void }
    ).open;
    if (opener) {
      opener(url, '_blank');
      return;
    }
    uni.setClipboardData({
      data: url,
      success: () =>
        uni.showToast({ title: '链接已复制，请在浏览器打开', icon: 'none' }),
    });
  }

  function goCreate(item: Sku) {
    // 推荐卡片选过陪玩时把它带进下单页，由后端按「客户指定陪玩」落单。
    const playerQuery = pendingPlayerId.value > 0 ? `&playerId=${pendingPlayerId.value}` : '';
    uni.navigateTo({ url: `/pages/order/create?skuId=${item.id}${playerQuery}` });
  }

  function contactCs() {
    uni.showToast({ title: '请联系你的归属客服', icon: 'none' });
  }

  function scrollToProducts() {
    uni.pageScrollTo({ selector: '#product-list', duration: 300 });
  }

  function onSearch() {
    const keyword = searchKeyword.value.trim();
    if (!keyword) {
      uni.showToast({ title: '请输入搜索关键词', icon: 'none' });
      return;
    }
    if (
      collectVisibleBlocks(visibleComponents.value).some(
        (comp) => comp.type === 'product_list'
      )
    ) {
      scrollToProducts();
    } else {
      uni.showToast({ title: `搜索：${keyword}`, icon: 'none' });
    }
  }

  function navPath(target: string): string {
    switch (target) {
      case 'orders':
        return '/pages/order/list';
      case 'member':
        return '/pages/wallet/index';
      case 'support':
        return 'cs';
      case 'category':
        return 'products';
      default:
        return '';
    }
  }

  function onQuickNav(item: NavItem) {
    const path = navPath(item.target);
    if (path === 'cs') {
      contactCs();
      return;
    }
    if (path === 'products') {
      scrollToProducts();
      return;
    }
    if (path) {
      go(path);
      return;
    }
    uni.showToast({ title: '功能建设中', icon: 'none' });
  }

  // 组件渲染（含布局内递归）通过 provide 取上下文，避免逐层透传 props / emits。
  provide('pageBlockContext', {
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
  });

  onLoad((query) => {
    // 预览码来自管理端签发的链接：?preview=<code>。
    previewCode.value = String(query?.preview || '');
  });

  onShow(() => {
    fetchWalletDisplay();
    // 先读装修配置，再按每块组件的 props 分别取数（loadConfig 内部触发 loadComponentData）。
    loadConfig();
  });
</script>

<style scoped lang="scss">
  .banner {
    background: linear-gradient(135deg, $brand, #4080ff);
    color: #fff;
  }

  .preview-tip {
    background: #fff7e6;
    color: #d46b08;
    font-size: 26rpx;
  }

  .banner-title {
    font-size: 34rpx;
    font-weight: 600;
    margin-bottom: 8rpx;
  }

  .banner-sub {
    color: rgba(255, 255, 255, 0.85);
  }

  .center {
    text-align: center;
    margin-bottom: 40rpx;
  }
</style>
