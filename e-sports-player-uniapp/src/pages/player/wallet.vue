<template>
  <view>
    <view class="card balance">
      <view class="muted">可提现{{ catfoodName }}（{{ catfoodDescription }}）</view>
      <view class="total">{{ amountText(wdSummary?.withdrawable_cents || 0, true) }}</view>
      <view v-if="yuanHint(wdSummary?.withdrawable_cents || 0)" class="muted">
        {{ yuanHint(wdSummary?.withdrawable_cents || 0) }}
      </view>
      <view class="split">
        <text>待结算 {{ amountText(commSummary?.pending_settlement_cents || 0) }}</text>
        <text>已结算 {{ amountText(commSummary?.settled_cents || 0) }}</text>
      </view>
      <view v-if="showYuanHint" class="muted">
        待结算 {{ yuanHint(commSummary?.pending_settlement_cents || 0) }} · 已结算
        {{ yuanHint(commSummary?.settled_cents || 0) }}
      </view>
      <view v-if="commSummary?.frozen_cents" class="muted">
        争议冻结中 {{ amountText(commSummary.frozen_cents) }}（争议结案后自动解冻）
      </view>
      <view class="muted">下次结算：{{ datetime(commSummary?.next_settlement_at) }}</view>
    </view>

    <view class="card">
      <view class="section-title">收款账户</view>
      <view v-for="t in PAYOUT_ACCOUNT_TYPES" :key="t.key" class="entry">
        <view class="row">
          <text>{{ t.title }}</text>
          <text :class="{ pos: payoutOf(t.key)?.status === 'active' }">
            {{ payoutStatusText(payoutOf(t.key)) }}
          </text>
        </view>
        <view v-if="payoutOf(t.key)" class="muted">{{ payoutAccountText(payoutOf(t.key)) }}</view>
        <view class="actions">
          <button class="ghost" size="mini" :loading="payoutSigning" @click="signPayout(t.key)">
            去签约
          </button>
          <button
            v-if="payoutOf(t.key) && payoutOf(t.key)?.status !== 'disabled'"
            class="ghost"
            size="mini"
            @click="unbindPayout(t.key)"
          >
            解约
          </button>
        </view>
      </view>
      <view class="muted tip">开启云账户代发后须先签约，签约在浏览器中完成后返回本页自动刷新。</view>
    </view>

    <view class="card">
      <view class="section-title">申请提现</view>
      <view class="field">
        <text class="label">金额（元）</text>
        <input v-model="withdrawForm.amount" class="input" type="digit" placeholder="请输入提现金额" />
      </view>
      <view class="field">
        <text class="label">提现方式</text>
        <view v-if="channels.length === 0" class="muted">
          当前工作室未开通任何提现方式，请联系管理员开通后再申请。
        </view>
        <view v-else class="channels">
          <view
            v-for="c in channels"
            :key="c.key"
            class="channel"
            :class="{ active: withdrawForm.channel === c.key }"
            @click="withdrawForm.channel = c.key"
          >
            {{ c.title }}
          </view>
        </view>
      </view>
      <view class="field">
        <text class="label">收款账号</text>
        <input v-model="withdrawForm.accountRef" class="input" placeholder="卡号 / 微信号 / 支付宝账号" />
      </view>
      <button
        class="primary"
        :loading="withdrawing"
        :disabled="channels.length === 0"
        @click="submitWithdraw"
      >
        提交提现申请
      </button>
      <view class="muted tip">提现由财务审核后打款，实际到账 = 申请金额 − 手续费 − 税费。</view>
    </view>

    <view class="card">
      <view class="section-title">收入明细</view>
      <view v-if="entries.length === 0" class="muted">暂无收入明细</view>
      <view v-for="item in entries" :key="item.id" class="entry">
        <view class="row">
          <text>{{ kindText(item.kind) }}</text>
          <text :class="item.amount_cents >= 0 ? 'pos' : 'neg'">{{
            amountText(item.amount_cents)
          }}</text>
        </view>
        <view class="muted">
          {{ datetime(item.created_at) }} · {{ calcModeText(item) }} ·
          {{ ruleVersionText(item) }}
        </view>
        <view class="muted">
          分成基数 {{ money(item.base_cents) }}
          <text v-if="item.deducted_cents">
            · 冲回 {{ money(item.deducted_cents) }} · 到手 {{ money(item.net_cents) }}
          </text>
          <text v-else> · 到手 {{ money(item.net_cents) }}</text>
        </view>
        <view v-if="item.service_unit_amounts?.length" class="muted">
          逐单位：{{ item.service_unit_amounts.map((c) => money(c)).join(' / ') }}
        </view>
      </view>
    </view>

    <view class="card">
      <view class="section-title">收礼记录</view>
      <view class="periods">
        <view
          v-for="p in giftPeriods"
          :key="p.value"
          class="period"
          :class="{ active: giftPeriod === p.value }"
          @click="switchGiftPeriod(p.value)"
        >
          {{ p.label }}
        </view>
      </view>
      <view class="muted">
        本期共收 {{ money(giftView?.total_cents || 0) }} · {{ giftView?.total_count || 0 }} 笔
        <text v-if="giftView?.rank_in_board"> · 收礼榜第 {{ giftView.rank }} 名</text>
      </view>
      <view v-if="!(giftView?.records || []).length" class="muted">本期暂无收礼记录</view>
      <view v-for="(item, index) in giftView?.records || []" :key="`${item.gift_no}-${index}`" class="entry">
        <view class="row">
          <text>{{ item.gift_name || '礼物' }} × {{ item.quantity }}</text>
          <text class="pos">{{ money(item.amount_cents) }}</text>
        </view>
        <view class="muted">
          来自 {{ item.sender_name || `客户 #${item.sender_id}` }} · 分成到手
          {{ money(item.income_cents) }}
        </view>
        <view class="muted">{{ item.gift_no }} · {{ datetime(item.created_at) }}</view>
      </view>
    </view>

    <view class="card">
      <view class="section-title">提现记录</view>
      <view v-if="withdrawals.length === 0" class="muted">暂无提现记录</view>
      <view v-for="item in withdrawals" :key="item.id" class="entry">
        <view class="row">
          <text>{{ channelText(item.channel) }} · 申请 {{ money(item.amount_cents) }}</text>
          <text>{{ withdrawalStatusText(item.status) }}</text>
        </view>
        <view class="muted">
          手续费 {{ money(item.fee_cents) }} · 税费 {{ money(item.tax_cents) }} · 实际到账
          {{ money(item.net_cents) }}
        </view>
        <view class="muted">
          {{ datetime(item.created_at) }}
          <text v-if="item.reject_reason"> · 驳回原因：{{ item.reject_reason }}</text>
        </view>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
  import { onShow } from '@dcloudio/uni-app';
  import { computed, reactive, ref } from 'vue';
  import {
    applyWithdrawal,
    fetchCommissionEntries,
    fetchCommissionSummary,
    fetchPayoutAccounts,
    fetchPayoutSignURL,
    fetchPlayerGiftRecords,
    fetchWithdrawals,
    fetchWithdrawalSummary,
    unbindPayoutAccount,
  } from '../../api/player';
  import type {
    CommissionEntry,
    CommissionSummary,
    PayoutAccount,
    PlayerGiftRecordView,
    Withdrawal,
    WithdrawalSummary,
  } from '../../api/player';
  import { fetchWalletDisplay, walletPrimaryAmount, walletUnitAmount } from '../../api/esports';
  import type { WalletDisplay } from '../../api/esports';
  import { datetime, idempotencyKey, money, yuanToCents } from '../../utils/format';

  /** 提现方式名称表（充值渠道开关由服务端 channels 决定）。 */
  const CHANNEL_TITLES: Array<{ key: string; title: string }> = [
    { key: 'bank_card', title: '银行卡' },
    { key: 'wechat', title: '微信' },
    { key: 'alipay', title: '支付宝' },
  ];

  /** 收款账户类型：云账户代发只支持银行卡 / 支付宝。 */
  const PAYOUT_ACCOUNT_TYPES: Array<{ key: string; title: string }> = [
    { key: 'bank_card', title: '银行卡' },
    { key: 'alipay', title: '支付宝' },
  ];

  const commSummary = ref<CommissionSummary | null>(null);
  const wdSummary = ref<WithdrawalSummary | null>(null);
  const payoutAccounts = ref<PayoutAccount[]>([]);
  const payoutSigning = ref(false);
  const entries = ref<CommissionEntry[]>([]);
  const withdrawals = ref<Withdrawal[]>([]);
  const withdrawing = ref(false);
  // 收礼记录：按周期查看本人礼物明细与收礼榜名次。
  const giftPeriods: Array<{ label: string; value: string }> = [
    { label: '日榜', value: 'daily' },
    { label: '周榜', value: 'weekly' },
    { label: '月榜', value: 'monthly' },
  ];
  const giftPeriod = ref('daily');
  const giftView = ref<PlayerGiftRecordView | null>(null);
  // 陪玩猫粮的展示口径：接口未返回时回落「猫粮 / 已结算收入 / ¥」旧文案。
  const catfoodDisplay = ref<WalletDisplay | null>(null);
  const withdrawForm = reactive({
    amount: '',
    channel: 'bank_card',
    accountRef: '',
  });

  const catfoodName = computed(() => catfoodDisplay.value?.display_name || '猫粮');
  const catfoodDescription = computed(() => catfoodDisplay.value?.description || '已结算收入');

  /** 每展示单位对应的分数：缺省 100（即元）。 */
  const catfoodUnitCents = computed(() => {
    const unit = catfoodDisplay.value?.unit_cents;
    return unit && unit > 0 ? unit : 100;
  });

  /** 展示单位不是人民币时才补一行 ¥ 对照，避免同一数字重复展示。 */
  const showYuanHint = computed(() => !!catfoodDisplay.value && catfoodUnitCents.value !== 100);

  /**
   * 金额文案：有展示口径时按 unit_cents 换算一次（主金额优先用服务端 display_amount，不再二次换算），
   * 否则沿用 ¥ 分转元。提现单金额为实际打款法币，仍用 money()。
   */
  function amountText(cents: number, primary = false) {
    const display = catfoodDisplay.value;
    if (!display) return money(cents);
    const value = primary
      ? walletPrimaryAmount(cents, display)
      : walletUnitAmount(cents, display);
    return display.unit_name ? `${value} ${display.unit_name}` : value;
  }

  /** 人民币对照文案：未配置展示口径或口径即人民币时返回空串。 */
  function yuanHint(cents: number | null | undefined): string {
    return showYuanHint.value ? `≈ ${money(cents)}` : '';
  }

  /** 提现方式：只保留服务端判定为已开通的渠道；未下发时按全部开通回落。 */
  const channels = computed(() => {
    const options = wdSummary.value?.channels;
    if (!options || options.length === 0) return CHANNEL_TITLES;
    return CHANNEL_TITLES.filter((c) =>
      options.some((option) => option.channel === c.key && option.enabled)
    );
  });

  /** 取本人指定类型的签约账户；无记录返回 null（展示为未签约）。 */
  function payoutOf(type: string): PayoutAccount | null {
    return payoutAccounts.value.find((item) => item.account_type === type) || null;
  }

  function payoutStatusText(item: PayoutAccount | null): string {
    const map: Record<string, string> = {
      pending: '待签约',
      active: '已签约',
      disabled: '已停用',
      expired: '签约过期',
    };
    return map[item?.status || ''] || '未签约';
  }

  function payoutAccountText(item: PayoutAccount | null): string {
    if (!item) return '';
    return `${item.account_name || '未回填户名'} · ${item.account_no_masked || '未回填账号'}`;
  }

  async function loadPayoutAccounts() {
    try {
      payoutAccounts.value = (await fetchPayoutAccounts()) || [];
    } catch {
      payoutAccounts.value = [];
    }
  }

  /** 取签约地址并跳转：签约托管页只在 H5 打开，小程序内提示改用 H5。 */
  async function signPayout(type: string) {
    if (typeof window === 'undefined') {
      uni.showToast({ title: '仅支持在浏览器（H5）中完成签约', icon: 'none' });
      return;
    }
    payoutSigning.value = true;
    try {
      const result = await fetchPayoutSignURL(type);
      window.location.href = result.url;
    } catch {
      // request 层已提示。
    } finally {
      payoutSigning.value = false;
    }
  }

  /** 解约：二次确认后置为已停用，重新签约前不能代发到账。 */
  function unbindPayout(type: string) {
    uni.showModal({
      title: '解约确认',
      content: '解约后需重新签约才能代发到账，确定解约该收款账户？',
      success: async (res) => {
        if (!res.confirm) return;
        try {
          await unbindPayoutAccount(type);
          uni.showToast({ title: '已解约', icon: 'success' });
          await loadPayoutAccounts();
        } catch {
          // request 层已提示。
        }
      },
    });
  }

  /** 签约回跳参数：H5 可能在 search 或 hash 路由的 query 中。 */
  function payoutSignReturn(): string {
    if (typeof window === 'undefined') return '';
    const { search, hash } = window.location;
    const fromSearch = new URLSearchParams(search).get('payout_sign');
    const hashQuery = hash.includes('?') ? hash.slice(hash.indexOf('?') + 1) : '';
    return fromSearch || new URLSearchParams(hashQuery).get('payout_sign') || '';
  }

  async function load() {
    try {
      commSummary.value = await fetchCommissionSummary();
    } catch {
      commSummary.value = null;
    }
    try {
      wdSummary.value = await fetchWithdrawalSummary();
    } catch {
      wdSummary.value = null;
    }
    try {
      entries.value = (await fetchCommissionEntries()) || [];
    } catch {
      entries.value = [];
    }
    try {
      withdrawals.value = (await fetchWithdrawals()) || [];
    } catch {
      withdrawals.value = [];
    }
    await loadPayoutAccounts();
    try {
      giftView.value = await fetchPlayerGiftRecords(giftPeriod.value);
    } catch {
      giftView.value = null;
    }
    // 展示口径：概览接口内嵌的 display 优先，其次读展示口径接口，都取不到则回落旧文案。
    let fallback: WalletDisplay | null = null;
    try {
      fallback = (await fetchWalletDisplay())?.player_catfood || null;
    } catch {
      fallback = null;
    }
    const embedded = (wdSummary.value as (WithdrawalSummary & { display?: WalletDisplay }) | null)
      ?.display;
    catfoodDisplay.value = embedded || fallback;
    // 未开通的渠道不选中：选中项失效时回落到第一个可用渠道。
    const available = channels.value;
    if (available.length && !available.some((c) => c.key === withdrawForm.channel)) {
      withdrawForm.channel = available[0].key;
    }
  }

  /** 切换收礼周期（daily / weekly / monthly）后重取明细。 */
  async function switchGiftPeriod(period: string) {
    if (giftPeriod.value === period) return;
    giftPeriod.value = period;
    try {
      giftView.value = await fetchPlayerGiftRecords(period);
    } catch {
      giftView.value = null;
    }
  }

  async function submitWithdraw() {
    if (!channels.value.some((c) => c.key === withdrawForm.channel)) {
      uni.showToast({ title: '该提现方式未开通，请更换方式', icon: 'none' });
      return;
    }
    const amountYuan = Number(withdrawForm.amount);
    if (!Number.isFinite(amountYuan) || amountYuan <= 0) {
      uni.showToast({ title: '请填写有效的提现金额', icon: 'none' });
      return;
    }
    if (!withdrawForm.accountRef.trim()) {
      uni.showToast({ title: '请填写收款账号', icon: 'none' });
      return;
    }
    withdrawing.value = true;
    try {
      await applyWithdrawal({
        amount_cents: yuanToCents(withdrawForm.amount),
        channel: withdrawForm.channel,
        account_ref: withdrawForm.accountRef.trim(),
        idempotency_key: idempotencyKey('wd'),
      });
      uni.showToast({ title: '已提交，待财务审核', icon: 'success' });
      withdrawForm.amount = '';
      withdrawForm.accountRef = '';
      load();
    } catch {
      // request 层已提示。
    } finally {
      withdrawing.value = false;
    }
  }

  const kindText = (kind: string) =>
    (
      ({
        service: '订单分成',
        addon: '加钟分成',
        gift: '礼物收入',
        reversal: '退款冲回',
        gift_reversal: '礼物退款冲回',
      }) as Record<string, string>
    )[kind] || kind;

  /** 分成方式 + 规则数值。 */
  const calcModeText = (entry: CommissionEntry) => {
    switch (entry.calc_mode) {
      case 'percent':
        return `按比例 ${(entry.rule_value_bp / 100).toFixed(2)}%`;
      case 'fixed_per_order':
        return `按单固定 ${money(entry.rule_value_cents)}`;
      case 'fixed_per_unit':
        return `按单位固定 ${money(entry.rule_value_cents)}`;
      default:
        return entry.calc_mode || '未记录分成方式';
    }
  };

  /** 规则编号 + 版本号：事后改规则不追溯，凭该字段可追溯到当时生效版本。 */
  const ruleVersionText = (entry: CommissionEntry) =>
    entry.rule_no ? `规则 ${entry.rule_no} v${entry.rule_version}` : '无规则快照';

  const channelText = (channel: string) =>
    (
      ({ bank_card: '银行卡', wechat: '微信', alipay: '支付宝' }) as Record<string, string>
    )[channel] || channel;

  const withdrawalStatusText = (status: string) =>
    (
      ({
        pending_review: '待审核',
        approved: '待打款',
        paid: '已到账',
        rejected: '已驳回',
      }) as Record<string, string>
    )[status] || status;

  onShow(() => {
    load();
    // 签约回跳：load 已重新拉取账户列表，这里只按 URL 的 payout_sign 参数提示结果。
    const flag = payoutSignReturn();
    if (flag) {
      uni.showToast({ title: flag === 'ok' ? '签约成功' : '已返回，请查看签约状态', icon: 'none' });
    }
  });
</script>

<style scoped lang="scss">
  .balance {
    background: linear-gradient(135deg, #165dff, #4080ff);
    color: #fff;
  }

  .balance .muted {
    color: rgba(255, 255, 255, 0.8);
  }

  .total {
    font-size: 56rpx;
    font-weight: 600;
    margin: 12rpx 0;
  }

  .split {
    display: flex;
    gap: 32rpx;
    margin-bottom: 12rpx;
  }

  .section-title {
    font-size: 30rpx;
    font-weight: 600;
    margin-bottom: 16rpx;
  }

  .field {
    margin-bottom: 24rpx;
  }

  .label {
    display: block;
    color: $text-2;
    margin-bottom: 12rpx;
  }

  .input {
    height: 80rpx;
    padding: 0 20rpx;
    background: $bg;
    border-radius: $radius;
  }

  .channels {
    display: flex;
    gap: 16rpx;
  }

  .channel {
    padding: 12rpx 28rpx;
    border: 1rpx solid $border;
    border-radius: $radius;
    color: $text-2;
  }

  .channel.active {
    border-color: $brand;
    color: $brand;
    background: #eef3ff;
  }

  .primary {
    background: $brand;
    color: #fff;
    border-radius: $radius;
  }

  .tip {
    margin-top: 16rpx;
  }

  .actions {
    display: flex;
    gap: 16rpx;
    margin-top: 12rpx;
  }

  .ghost {
    background: #fff;
    color: $brand;
    border: 1rpx solid $border;
    border-radius: $radius;
  }

  .entry {
    padding: 16rpx 0;
    border-bottom: 1rpx solid $border;
  }

  .entry:last-child {
    border-bottom: none;
  }

  .pos {
    color: $success;
    font-weight: 600;
  }

  .neg {
    color: $danger;
    font-weight: 600;
  }

  .periods {
    display: flex;
    gap: 16rpx;
    margin-bottom: 16rpx;
  }

  .period {
    padding: 8rpx 24rpx;
    border: 1rpx solid $border;
    border-radius: 999rpx;
    color: $text-2;
    font-size: 26rpx;
  }

  .period.active {
    border-color: $brand;
    color: $brand;
    background: #eef3ff;
  }
</style>
