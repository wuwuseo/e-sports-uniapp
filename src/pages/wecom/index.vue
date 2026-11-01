<!--
  企微侧边栏 H5（骨架）。
  挂载方式：本 H5 构建后部署到可被企业微信侧边栏访问的 URL，由企微管理后台将侧边栏
  应用指向该 URL（如 https://host/h5/#/pages/wecom/index）。

  接入模式（后端配置 app.esports.wecom_sidebar_auth_mode，通过 GET /wecom/sidebar-config 下发）：
    - js_sdk（默认，启用）：宿主容器页在挂载前注入已签名的企微 JS-SDK 适配层
      （见 src/utils/wecom.ts 的 window.__WECOM_ADAPTER__ 或 injectWecomHost），用于自动获取
      当前外部联系人 / 发送消息；无宿主上下文时自动降级为手动输入。
    - account（关闭 JS-SDK）：客服用账号登录后手动输入外部联系人标识建档。

  两种模式最终都要求客服 admin 登录态（/admin/* 接口均需 esports_admin_token）；无 token 时
  本页先显示登录表单，登录后按接入模式识别当前客户。
-->
<template>
  <view>
    <!-- 账号登录（无 admin 登录态时先登录） -->
    <view v-if="needLogin" class="card">
      <view class="section-title">客服登录</view>
      <view class="muted">
        接入模式：{{ authMode === 'js_sdk' ? '企微 JS-SDK 自动识别' : '账号登录 + 手动识别' }}
      </view>
      <input v-model="loginForm.username" class="input" placeholder="客服账号" />
      <input v-model="loginForm.password" class="input" password placeholder="密码" />
      <button class="primary" :loading="loggingIn" @click="doLogin">登录</button>
    </view>

    <!-- 当前客户识别 / 建档 -->
    <view v-else class="card">
      <view class="section-title">当前客户</view>

      <view v-if="customer" class="customer">
        <view class="row">
          <text class="name">{{ customer.display_name || `客户#${customer.id}` }}</text>
          <text class="muted">#{{ customer.id }}</text>
        </view>
        <view class="muted">手机 {{ customer.phone || '未留' }} · 来源 {{ customer.source }}</view>
      </view>

      <view v-else-if="identifying" class="muted">正在识别企微外部联系人…</view>

      <view v-else class="manual">
        <view class="muted">
          <template v-if="authMode === 'js_sdk'">
            未检测到宿主 JS-SDK（{{ isHost ? '已注入但无上下文' : '未注入' }}），请手动输入外部联系人标识
          </template>
          <template v-else>当前为账号登录模式，请手动输入外部联系人标识</template>
        </view>
        <input v-model="manualCorpId" class="input" placeholder="企业主体 corpId（必填）" />
        <input v-model="manualExternalId" class="input" placeholder="外部联系人 externalId（必填）" />
        <input v-model="manualName" class="input" placeholder="客户昵称（选填）" />
        <button class="primary" :loading="intaking" @click="manualIntake">自动建档</button>
      </view>
    </view>

    <!-- 会员权益：等级 / 折扣 / 成长值 / 等级权益标识 -->
    <view v-if="customer" class="card">
      <view class="section-title">会员权益</view>
      <view v-if="member && (member.level_code || member.level_name)" class="member">
        <view class="row">
          <text class="title">{{ member.level_name || member.level_code }}</text>
          <text class="discount">{{ discountText(member.discount_bps) }}</text>
        </view>
        <view class="muted">累计成长值 {{ money(member.growth_total) }}</view>
        <view v-if="member.pending_level_code" class="muted">
          待降级至 {{ member.pending_level_code }}
          <template v-if="member.downgrade_after">· {{ datetime(member.downgrade_after) }}</template>
        </view>
        <view v-if="memberBenefits.length" class="badges">
          <text v-for="b in memberBenefits" :key="b" class="badge">{{ b }}</text>
        </view>
      </view>
      <view v-else class="empty">该客户暂未定级</view>
    </view>

    <!-- 快捷报单 -->
    <view v-if="customer" class="card">
      <view class="section-title">快捷报单</view>
      <picker :range="skuNames" :value="skuIndex" @change="onSkuChange">
        <view class="picker">{{ skuNames[skuIndex] || '请选择服务项目（商品）' }}</view>
      </picker>
      <view v-if="selectedSku" class="muted">
        {{ selectedSku.title }} · 单价 {{ money(selectedSku.unit_price_cents) }} ·
        每份 {{ selectedSku.service_units }}{{ selectedSku.service_unit_name }}
      </view>
      <input v-model="quantityText" class="input" type="number" placeholder="数量（默认 1）" />
      <view v-if="estimated > 0" class="muted">预计应付 {{ money(estimated) }}</view>
      <button class="primary" :loading="submitting" @click="submitOrder">提交报单</button>
    </view>

    <!-- 订单速览：服务端按 customer_id 查询最近 N 单，前端再兜底过滤一次防串客户 -->
    <view v-if="customer" class="card">
      <view class="section-head">
        <text class="section-title">最近订单</text>
        <text class="muted">最近 {{ orders.length }} 单</text>
      </view>
      <view v-if="orders.length === 0" class="empty">暂无订单</view>
      <view v-for="o in orders" :key="o.id" class="order">
        <view class="row">
          <text class="order-no">{{ o.order_no }}</text>
          <text class="amount">{{ money(o.payable_cents) }}</text>
        </view>
        <view class="muted">
          {{ fulfillmentText(o.fulfillment_status) }} · 商品#{{ o.product_id }} · {{ o.required_seats }} 席
        </view>
        <view class="muted">{{ datetime(o.created_at) }}</view>
      </view>
      <view v-if="ordersTruncated" class="muted hint">
        仅显示最近 {{ ORDER_LIMIT }} 单，更多请到客服订单页查看
      </view>
    </view>

    <!-- 代客售后：会话侧一键代建，来源类型与来源单据自动带出 -->
    <view v-if="customer" class="card">
      <view class="section-title">代客售后</view>
      <view class="muted">在会话内直接为客户代建售后，来源单据自动带出，凭证在售后页上传。</view>
      <picker
        :range="afterSaleTypeLabels"
        :value="afterSaleTypeIndex"
        @change="onAfterSaleTypeChange"
      >
        <view class="picker">来源类型：{{ afterSaleTypeLabels[afterSaleTypeIndex] }}</view>
      </picker>
      <picker
        v-if="afterSaleDocOptions.length > 0"
        :range="afterSaleDocLabels"
        :value="afterSaleDocIndex"
        @change="onAfterSaleDocChange"
      >
        <view class="picker">来源单据：{{ afterSaleDocLabels[afterSaleDocIndex] || '请选择' }}</view>
      </picker>
      <view v-else class="muted">该客户暂无可选的{{ afterSaleTypeLabels[afterSaleTypeIndex] }}单据，可在售后页手动填写来源 ID。</view>
      <button class="primary" @click="goAfterSale">代建售后</button>
    </view>

    <!-- 快速跟进：最近 5 条记录 + 新增跟进表单 -->
    <view v-if="customer" class="card">
      <view class="section-title">快速跟进</view>
      <view v-if="followUps.length === 0" class="empty">暂无跟进记录</view>
      <view v-for="f in recentFollowUps" :key="f.id" class="follow">
        <view class="muted">{{ channelText(f.channel) }} · {{ datetime(f.created_at) }}</view>
        <view class="follow-summary">{{ f.summary }}</view>
        <view v-if="f.next_follow_at" class="muted">下次跟进：{{ datetime(f.next_follow_at) }}</view>
      </view>
      <view v-if="followUps.length > recentFollowUps.length" class="muted hint">
        仅显示最近 {{ recentFollowUps.length }} 条，完整记录见客服客户页
      </view>

      <view class="follow-form">
        <picker :range="channelLabels" :value="followChannelIndex" @change="onFollowChannelChange">
          <view class="picker">渠道：{{ channelLabels[followChannelIndex] }}</view>
        </picker>
        <textarea
          v-model="followForm.summary"
          class="textarea"
          maxlength="500"
          placeholder="跟进摘要（必填，≤500 字）"
        />
        <button class="primary" :loading="followSubmitting" @click="submitFollowUp">记录跟进</button>
      </view>
    </view>

    <!-- 当前活动：公开接口返回已生效的充值赠送活动 -->
    <view v-if="customer" class="card">
      <view class="section-title">当前活动</view>
      <view v-if="campaigns.length === 0" class="empty">当前无进行中活动</view>
      <view v-for="c in campaigns" :key="c.id" class="campaign">
        <view class="row">
          <text class="title">{{ c.name }}</text>
          <text class="muted">{{ campaignTypeText(c.activity_type) }}</text>
        </view>
        <view class="muted">{{ campaignTiersText(c) }}</view>
        <view class="muted">{{ datetime(c.starts_at) }} ~ {{ datetime(c.ends_at) }}</view>
      </view>
    </view>

    <!-- 话术发送：复制到剪贴板，宿主注入 sendMessage 时尝试直接发送 -->
    <view v-if="customer" class="card">
      <view class="section-title">话术库</view>
      <view v-if="scripts.length === 0" class="empty">暂无话术</view>
      <view v-for="s in scripts" :key="s.id" class="script">
        <view class="row">
          <text class="title">{{ s.title }}</text>
          <text v-if="s.category" class="muted">{{ s.category }}</text>
        </view>
        <view class="content">{{ s.content }}</view>
        <view class="actions">
          <button class="mini primary" @click="copyScript(s)">复制</button>
        </view>
      </view>
    </view>

    <!-- 收款方式：复用客户自助端收款方式视图，展示收款账户与二维码 -->
    <view v-if="customer" class="card">
      <view class="section-title">收款方式</view>
      <view v-if="internalMethods.length" class="muted">
        站内方式：{{ internalMethods.map((m) => m.name).join('、') }}（无需上传凭证）
      </view>
      <view v-if="externalMethods.length === 0" class="empty">暂无启用的外部收款方式</view>
      <view v-for="m in externalMethods" :key="m.channel" class="method">
        <view class="row">
          <text class="title">{{ m.name }}</text>
        </view>
        <view v-for="a in m.accounts" :key="a.id" class="account">
          <view class="muted">{{ a.subject_name }} · {{ a.bank_name || '—' }}</view>
          <view class="muted">账号 {{ a.account_no }}</view>
          <image v-if="a.qr_url" :src="a.qr_url" mode="widthFix" class="qr" />
        </view>
      </view>
    </view>

    <!-- 收款核验：上传凭证 + 查询核验结果 -->
    <view v-if="customer" class="card">
      <view class="section-title">收款核验</view>
      <picker :range="orderNos" :value="proofOrderIndex" @change="onProofOrderChange">
        <view class="picker">{{ orderNos[proofOrderIndex] || '请选择订单' }}</view>
      </picker>

      <view v-if="proofs.length" class="proof-list">
        <view v-for="p in proofs" :key="p.id" class="proof">
          <view class="row">
            <text class="order-no">{{ p.proof_no }}</text>
            <text class="proof-status">{{ proofStatusText(p.status) }}</text>
          </view>
          <view class="muted">{{ money(p.amount_cents) }} · 流水 {{ p.transaction_no }}</view>
          <view v-if="p.resolution" class="muted">备注 {{ p.resolution }}</view>
        </view>
      </view>
      <view v-else class="empty">该订单暂无收款凭证</view>

      <view class="proof-form">
        <picker :range="accountLabels" :value="proofAccountIndex" @change="onProofAccountChange">
          <view class="picker">{{ accountLabels[proofAccountIndex] || '请选择收款账户' }}</view>
        </picker>
        <input v-model="proofForm.transaction_no" class="input" placeholder="转账流水号（必填）" />
        <input v-model="proofForm.amountText" class="input" type="digit" placeholder="到账金额（分）" />
        <input v-model="proofForm.proof_ref" class="input" placeholder="凭证引用（截图链接/转账备注，≥8 字）" />
        <button class="primary" :loading="proofSubmitting" @click="submitProof">提交收款凭证</button>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
  import { onLoad } from '@dcloudio/uni-app';
  import { computed, reactive, ref } from 'vue';
  import {
    adminLogin,
    createCustomerFollowUp,
    createWecomOrder,
    fetchCsOrdersByCustomer,
    fetchCsSkus,
    fetchCustomerFollowUps,
    fetchCustomerMember,
    fetchMemberLevels,
    fetchOfflinePaymentProofs,
    fetchPublicCampaigns,
    fetchScripts,
    fetchWecomJsConfig,
    fetchWecomPaymentMethods,
    fetchWecomSidebarConfig,
    getAdminToken,
    setAdminToken,
    submitOfflinePaymentProof,
    wecomIntake,
  } from '../../api/cs';
  import type {
    CsCampaign,
    CsCustomer,
    CsCustomerMember,
    CsMemberLevel,
    CsOrder,
    CsScript,
    CsSku,
    CustomerFollowUp,
    OfflinePaymentProof,
    WecomPaymentMethod,
  } from '../../api/cs';
  import {
    configWecomJsSdk,
    getCurExternalUserid,
    getExternalContact,
    hasWecomJsSdk,
    isWecomHost,
    loadWecomJsSdk,
    sendMessage,
  } from '../../utils/wecom';
  import type { WecomContactContext } from '../../utils/wecom';
  import { datetime, fulfillmentText, idempotencyKey, money } from '../../utils/format';

  const customer = ref<CsCustomer | null>(null);
  const identifying = ref(false);
  const intaking = ref(false);
  const isHost = ref(false);

  // 接入模式与登录态
  const authMode = ref<'js_sdk' | 'account'>('js_sdk');
  const needLogin = ref(false);
  const loggingIn = ref(false);
  const loginForm = reactive({ username: '', password: '' });

  // 手动输入兜底
  const manualCorpId = ref('');
  const manualExternalId = ref('');
  const manualName = ref('');

  // 报单
  const skus = ref<CsSku[]>([]);
  const skuIndex = ref(-1);
  const quantityText = ref('1');
  const submitting = ref(false);

  // 订单速览
  const ORDER_LIMIT = 20;
  const orders = ref<CsOrder[]>([]);
  const ordersTruncated = ref(false);

  // 会员 / 活动
  const member = ref<CsCustomerMember | null>(null);
  const memberRule = ref<CsMemberLevel | null>(null);
  const campaigns = ref<CsCampaign[]>([]);

  // 跟进记录
  const FOLLOW_PREVIEW_LIMIT = 5;
  const channelOptions = ['pc', 'mobile', 'wecom', 'phone', 'other'];
  const followChannelIndex = ref(2); // 默认 wecom（企微侧边栏）
  const followUps = ref<CustomerFollowUp[]>([]);
  const followSubmitting = ref(false);
  const followForm = reactive({ summary: '' });

  // 话术
  const scripts = ref<CsScript[]>([]);

  // 代客售后：来源类型 + 来源单据，单据取自当前客户已加载的订单
  const afterSaleTypes = ['order', 'gift', 'recharge'];
  const afterSaleTypeLabels = ['订单', '礼物', '充值'];
  const afterSaleTypeIndex = ref(0);
  const afterSaleDocIndex = ref(0);

  /** 当前来源类型下可选的单据（仅 order 有已加载列表）。 */
  const afterSaleDocOptions = computed<Array<{ id: number; label: string }>>(() => {
    switch (afterSaleTypes[afterSaleTypeIndex.value]) {
      case 'order':
        return orders.value.map((o) => ({
          id: o.id,
          label: `${o.order_no} · ${money(o.payable_cents)}`,
        }));
      default:
        return [];
    }
  });
  const afterSaleDocLabels = computed(() => afterSaleDocOptions.value.map((o) => o.label));

  // 收款：方式 / 账户 / 核验进度 / 上传凭证
  const paymentMethods = ref<WecomPaymentMethod[]>([]);
  const proofs = ref<OfflinePaymentProof[]>([]);
  const proofOrderIndex = ref(-1);
  const proofAccountIndex = ref(-1);
  const proofSubmitting = ref(false);
  const proofForm = reactive({ transaction_no: '', amountText: '', proof_ref: '' });

  const externalMethods = computed(() =>
    paymentMethods.value.filter((m) => m.kind === 'external')
  );
  const internalMethods = computed(() =>
    paymentMethods.value.filter((m) => m.kind === 'internal')
  );
  const proofAccounts = computed(() =>
    externalMethods.value.flatMap((m) => m.accounts)
  );
  const accountLabels = computed(() =>
    proofAccounts.value.map((a) => `${a.subject_name} ${a.account_no}`)
  );
  const orderNos = computed(() => orders.value.map((o) => o.order_no));

  const recentFollowUps = computed(() => followUps.value.slice(0, FOLLOW_PREVIEW_LIMIT));
  const channelLabels = computed(() => channelOptions.map((c) => channelText(c)));

  // 会员权益标识：memberView 只下发等级与折扣，专属客服 / 优先预约开关在同等级的配置里，
  // 因此按 level_code 匹配 member-levels 的启用规则。
  const memberBenefits = computed(() => {
    const list: string[] = [];
    const dedicated = member.value?.dedicated_cs ?? memberRule.value?.dedicated_cs ?? false;
    if (dedicated) list.push('专属客服');
    if (member.value?.priority_booking ?? memberRule.value?.priority_booking ?? false) {
      list.push('优先预约');
    }
    return list;
  });

  const skuNames = computed(() =>
    skus.value.map((s) => `${s.title}（${money(s.unit_price_cents)}）`)
  );

  const selectedSku = computed<CsSku | null>(() =>
    skuIndex.value >= 0 ? skus.value[skuIndex.value] : null
  );

  const quantity = computed(() => {
    const n = Number(quantityText.value);
    return Number.isSafeInteger(n) && n > 0 ? n : 0;
  });

  const estimated = computed(() =>
    selectedSku.value ? selectedSku.value.unit_price_cents * quantity.value : 0
  );

  async function intake(corpId: string, externalId: string, displayName = '', phone = '') {
    intaking.value = true;
    try {
      const res = await wecomIntake({
        corp_id: corpId,
        external_id: externalId,
        display_name: displayName,
        phone,
      });
      customer.value = res.customer;
      await loadCustomerData();
    } catch {
      // csRequest 层已提示。
    } finally {
      intaking.value = false;
      identifying.value = false;
    }
  }

  async function loadCustomerData() {
    const cid = customer.value?.id;
    if (!cid) return;
    try {
      skus.value = (await fetchCsSkus()) || [];
    } catch {
      skus.value = [];
    }
    await loadOrders(cid);
    try {
      scripts.value = (await fetchScripts()) || [];
    } catch {
      scripts.value = [];
    }
    try {
      paymentMethods.value = (await fetchWecomPaymentMethods()) || [];
    } catch {
      paymentMethods.value = [];
    }
    // 新卡片各自独立降级：任一项失败不影响其它卡片。
    await Promise.all([loadMember(cid), loadCampaigns(), loadFollowUps(cid)]);
    await loadProofs();
  }

  // 订单速览：服务端按客户查询；后端若尚未支持 customer_id 参数，返回值里仍带全量订单，
  // 因此再按 customer_id 过滤一次，避免串客户数据。
  async function loadOrders(cid: number) {
    try {
      const list = (await fetchCsOrdersByCustomer(cid, ORDER_LIMIT)) || [];
      orders.value = list.filter((o) => o.customer_id === cid);
      ordersTruncated.value = orders.value.length >= ORDER_LIMIT;
    } catch {
      orders.value = [];
      ordersTruncated.value = false;
    }
  }

  async function loadMember(cid: number) {
    try {
      member.value = (await fetchCustomerMember(cid)) || null;
    } catch {
      member.value = null;
    }
    // 权益开关挂在等级配置上：按当前等级 code 匹配启用中的规则。
    const levelCode = member.value?.level_code || '';
    if (!levelCode) {
      memberRule.value = null;
      return;
    }
    try {
      const levels = (await fetchMemberLevels()) || [];
      memberRule.value =
        levels.find((l) => l.code === levelCode && l.status === 'enabled') || null;
    } catch {
      memberRule.value = null;
    }
  }

  async function loadCampaigns() {
    try {
      campaigns.value = (await fetchPublicCampaigns()) || [];
    } catch {
      campaigns.value = [];
    }
  }

  async function loadFollowUps(cid: number) {
    try {
      followUps.value = (await fetchCustomerFollowUps(cid)) || [];
    } catch {
      followUps.value = [];
    }
  }

  async function loadProofs() {
    const order = orders.value[proofOrderIndex.value];
    if (!order) {
      proofs.value = [];
      return;
    }
    try {
      proofs.value = (await fetchOfflinePaymentProofs('', order.id)) || [];
    } catch {
      proofs.value = [];
    }
  }

  // 按接入模式识别当前客户。js_sdk 模式先尝试真实 JS-SDK → 宿主 adapter，失败落手动输入；
  // account 模式直接手动输入。
  async function identify() {
    identifying.value = true;
    isHost.value = isWecomHost() || hasWecomJsSdk();
    if (authMode.value === 'js_sdk') {
      const ctx = await resolveHostContact();
      if (ctx) {
        await intake(ctx.corp_id, ctx.external_id, ctx.display_name, ctx.phone);
        return;
      }
    }
    identifying.value = false; // 落到手动输入
  }

  // 依次尝试真实 JS-SDK → 宿主 adapter，返回可建档的客户上下文；均失败返回 null。
  async function resolveHostContact(): Promise<WecomContactContext | null> {
    // 真实 JS-SDK：加载脚本 → 拉签名 → wx.config → 读 external_userid（corpId 取签名返回的 app_id）。
    if (await loadWecomJsSdk()) {
      try {
        const cfg = await fetchWecomJsConfig(currentPageUrl());
        if (cfg && (await configWecomJsSdk(cfg, ['getCurExternalContact']))) {
          const externalId = await getCurExternalUserid();
          if (externalId) {
            return { corp_id: cfg.app_id, external_id: externalId };
          }
        }
      } catch {
        // 签名接口 503（企微未配置）或 config 失败，落 adapter / 手动。
      }
    }
    return getExternalContact();
  }

  function currentPageUrl(): string {
    if (typeof window === 'undefined') return '';
    return window.location.href.split('#')[0];
  }

  async function init() {
    // 1. 读取侧边栏接入模式（公开接口，无需登录）。
    try {
      const cfg = await fetchWecomSidebarConfig();
      authMode.value = cfg.auth_mode;
    } catch {
      authMode.value = 'account'; // 接口不可用时回落账号登录模式
    }
    // 2. 检查客服登录态；无 token 时先登录。
    if (!getAdminToken()) {
      needLogin.value = true;
      return;
    }
    await identify();
  }

  async function doLogin() {
    if (!loginForm.username.trim() || !loginForm.password) {
      uni.showToast({ title: '请填写账号与密码', icon: 'none' });
      return;
    }
    loggingIn.value = true;
    try {
      const data = await adminLogin(loginForm.username.trim(), loginForm.password);
      if (!data.access_token) {
        uni.showToast({ title: '登录响应缺少 access_token', icon: 'none' });
        return;
      }
      setAdminToken(data.access_token);
      needLogin.value = false;
      await identify();
    } catch {
      // csRequest 层已提示。
    } finally {
      loggingIn.value = false;
    }
  }

  async function manualIntake() {
    const corpId = manualCorpId.value.trim();
    const externalId = manualExternalId.value.trim();
    if (!corpId || !externalId) {
      uni.showToast({ title: '请填写 corpId 与 externalId', icon: 'none' });
      return;
    }
    await intake(corpId, externalId, manualName.value.trim());
  }

  function onSkuChange(e: Event) {
    const v = Number((e as unknown as { detail?: { value?: number } }).detail?.value);
    if (Number.isInteger(v)) skuIndex.value = v;
  }

  async function submitOrder() {
    if (!customer.value) return;
    if (skuIndex.value < 0) {
      uni.showToast({ title: '请选择服务项目', icon: 'none' });
      return;
    }
    if (quantity.value <= 0) {
      uni.showToast({ title: '请填写有效数量', icon: 'none' });
      return;
    }
    submitting.value = true;
    try {
      const order = await createWecomOrder(
        {
          customer_id: customer.value.id,
          product_id: skus.value[skuIndex.value].id,
          quantity: quantity.value,
        },
        idempotencyKey('wecom-order')
      );
      uni.showToast({ title: `报单成功 ${order.order_no}`, icon: 'success' });
      await loadOrders(customer.value.id);
    } catch {
      // csRequest 层已提示。
    } finally {
      submitting.value = false;
    }
  }

  // 话术发送：有宿主且已授权时走 JS-SDK 发送到会话，否则复制到剪贴板。
  async function copyScript(s: CsScript) {
    let sent = false;
    try {
      sent = await sendMessage(s.content);
    } catch {
      sent = false;
    }
    if (sent) {
      uni.showToast({ title: '已发送', icon: 'success' });
      return;
    }
    uni.setClipboardData({
      data: s.content,
      success: () => uni.showToast({ title: '已复制到剪贴板', icon: 'none' }),
      fail: () => uni.showToast({ title: '复制失败', icon: 'none' }),
    });
  }

  function proofStatusText(status: string) {
    return (
      ({
        pending_verification: '待核验',
        verified: '已核销',
        rejected: '已驳回',
      }) as Record<string, string>
    )[status] || status;
  }

  // 会员折扣：基点转「折」，10000 = 原价不打折。
  function discountText(bps: number | undefined) {
    if (!bps || bps >= 10000) return '无折扣';
    return `${Number((bps / 1000).toFixed(1))} 折`;
  }

  function campaignTypeText(type: string) {
    return (
      ({
        full_gift: '满赠',
        ladder: '阶梯',
        limited: '限时',
      }) as Record<string, string>
    )[type] || type;
  }

  function campaignTiersText(c: CsCampaign) {
    if (!c.tiers?.length) return '档位以活动说明为准';
    return c.tiers
      .map((t) => `满 ${money(t.threshold_cents)} 赠 ${money(t.bonus_cents)}`)
      .join(' · ');
  }

  function channelText(channel: string) {
    return (
      ({
        pc: 'PC',
        mobile: '移动端',
        wecom: '企微',
        phone: '电话',
        other: '其他',
      }) as Record<string, string>
    )[channel] || channel;
  }

  function onFollowChannelChange(e: Event) {
    const v = Number((e as unknown as { detail?: { value?: number } }).detail?.value);
    if (Number.isInteger(v)) followChannelIndex.value = v;
  }

  // 快速跟进：渠道 + 摘要必填（后端限制 500 字以内）。
  async function submitFollowUp() {
    const cid = customer.value?.id;
    if (!cid) return;
    const summary = followForm.summary.trim();
    if (!summary) {
      uni.showToast({ title: '请填写跟进摘要', icon: 'none' });
      return;
    }
    if (Array.from(summary).length > 500) {
      uni.showToast({ title: '跟进摘要不能超过 500 字', icon: 'none' });
      return;
    }
    followSubmitting.value = true;
    try {
      await createCustomerFollowUp(cid, {
        channel: channelOptions[followChannelIndex.value],
        summary,
      });
      uni.showToast({ title: '已记录跟进', icon: 'success' });
      followForm.summary = '';
      await loadFollowUps(cid);
    } catch {
      // csRequest 层已提示。
    } finally {
      followSubmitting.value = false;
    }
  }

  function onAfterSaleTypeChange(e: Event) {
    const v = Number((e as unknown as { detail?: { value?: number } }).detail?.value);
    if (Number.isInteger(v) && v >= 0 && v < afterSaleTypeLabels.length) {
      afterSaleTypeIndex.value = v;
      afterSaleDocIndex.value = 0;
    }
  }

  function onAfterSaleDocChange(e: Event) {
    const v = Number((e as unknown as { detail?: { value?: number } }).detail?.value);
    if (Number.isInteger(v) && v >= 0 && v < afterSaleDocOptions.value.length) {
      afterSaleDocIndex.value = v;
    }
  }

  /** 跳转客服售后页代建：能选到单据时来源自动带出，否则带来源类型让客服补单据 ID。 */
  function goAfterSale() {
    const type = afterSaleTypes[afterSaleTypeIndex.value];
    const doc = afterSaleDocOptions.value[afterSaleDocIndex.value];
    const query = doc
      ? `source_type=${type}&source_id=${doc.id}`
      : `source_type=${type}&create=1`;
    uni.navigateTo({ url: `/pages/cs/after-sales?${query}` });
  }

  function onProofOrderChange(e: Event) {
    const v = Number((e as unknown as { detail?: { value?: number } }).detail?.value);
    if (Number.isInteger(v)) {
      proofOrderIndex.value = v;
      void loadProofs();
    }
  }

  function onProofAccountChange(e: Event) {
    const v = Number((e as unknown as { detail?: { value?: number } }).detail?.value);
    if (Number.isInteger(v)) proofAccountIndex.value = v;
  }

  // 上传收款凭证：复用客服端 offline-payment-proof 提交链路，落「待核验收款」由财务核验。
  async function submitProof() {
    const order = orders.value[proofOrderIndex.value];
    const account = proofAccounts.value[proofAccountIndex.value];
    const amount = Number(proofForm.amountText);
    if (!order) {
      uni.showToast({ title: '请选择订单', icon: 'none' });
      return;
    }
    if (!account) {
      uni.showToast({ title: '请选择收款账户', icon: 'none' });
      return;
    }
    if (!proofForm.transaction_no.trim()) {
      uni.showToast({ title: '请填写转账流水号', icon: 'none' });
      return;
    }
    if (!Number.isSafeInteger(amount) || amount <= 0) {
      uni.showToast({ title: '请填写有效的到账金额（分）', icon: 'none' });
      return;
    }
    if (proofForm.proof_ref.trim().length < 8) {
      uni.showToast({ title: '凭证引用至少 8 字（截图链接/转账备注）', icon: 'none' });
      return;
    }
    proofSubmitting.value = true;
    try {
      await submitOfflinePaymentProof({
        order_id: order.id,
        account_id: account.id,
        transaction_no: proofForm.transaction_no.trim(),
        amount_cents: amount,
        proof_ref: proofForm.proof_ref.trim(),
      });
      uni.showToast({ title: '凭证已提交，待财务核验', icon: 'success' });
      proofForm.transaction_no = '';
      proofForm.amountText = '';
      proofForm.proof_ref = '';
      await loadProofs();
    } catch {
      // csRequest 层已提示。
    } finally {
      proofSubmitting.value = false;
    }
  }

  onLoad(init);
</script>

<style scoped lang="scss">
  .section-title {
    font-size: 30rpx;
    font-weight: 600;
    margin-bottom: 16rpx;
  }

  .name {
    font-size: 32rpx;
    font-weight: 600;
  }

  .manual {
    margin-top: 8rpx;
  }

  .input {
    height: 80rpx;
    padding: 0 24rpx;
    background: $bg;
    border-radius: $radius;
    margin-top: 16rpx;
  }

  .picker {
    height: 80rpx;
    line-height: 80rpx;
    padding: 0 24rpx;
    background: $bg;
    border-radius: $radius;
  }

  .primary {
    margin-top: 24rpx;
    background: $brand;
    color: #fff;
    border-radius: $radius;
  }

  .order {
    padding: 16rpx 0;
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

  .script {
    padding: 16rpx 0;
    border-bottom: 1rpx solid $border;
  }

  .script:last-child {
    border-bottom: none;
  }

  .title {
    font-weight: 600;
  }

  .content {
    margin-top: 8rpx;
    font-size: 26rpx;
    color: $text-2;
    white-space: pre-wrap;
  }

  .actions {
    display: flex;
    margin-top: 12rpx;
  }

  .mini {
    font-size: 24rpx;
    padding: 0 24rpx;
    line-height: 56rpx;
    border-radius: 28rpx;
  }

  .method {
    padding: 12rpx 0;
    border-bottom: 1rpx solid $border;
  }

  .method:last-child {
    border-bottom: none;
  }

  .account {
    margin-top: 8rpx;
  }

  .qr {
    width: 320rpx;
    margin-top: 8rpx;
    border-radius: $radius;
  }

  .proof-list {
    margin-top: 12rpx;
  }

  .proof {
    padding: 12rpx 0;
    border-bottom: 1rpx solid $border;
  }

  .proof:last-child {
    border-bottom: none;
  }

  .proof-status {
    color: $brand;
    font-weight: 600;
  }

  .proof-form {
    margin-top: 12rpx;
  }

  .section-head {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    margin-bottom: 16rpx;
  }

  .section-head .section-title {
    margin-bottom: 0;
  }

  .member {
    padding-bottom: 8rpx;
  }

  .badges {
    display: flex;
    flex-wrap: wrap;
    gap: 12rpx;
    margin-top: 12rpx;
  }

  .badge {
    padding: 4rpx 16rpx;
    background: $bg;
    border-radius: 999rpx;
    color: $brand;
    font-size: 24rpx;
  }

  .campaign,
  .follow {
    padding: 16rpx 0;
  }

  .campaign + .campaign,
  .follow + .follow {
    border-top: 1rpx solid $border;
  }

  .discount {
    color: $brand;
    font-weight: 600;
  }

  .hint {
    margin-top: 12rpx;
  }

  .follow-summary {
    margin-top: 8rpx;
    font-size: 26rpx;
    color: $text-2;
    white-space: pre-wrap;
  }

  .follow-form {
    margin-top: 16rpx;
  }

  .textarea {
    width: 100%;
    height: 160rpx;
    padding: 16rpx 24rpx;
    margin-top: 16rpx;
    background: $bg;
    border-radius: $radius;
    font-size: 28rpx;
    box-sizing: border-box;
  }
</style>
