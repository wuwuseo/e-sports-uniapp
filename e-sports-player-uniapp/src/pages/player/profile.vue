<template>
  <view>
    <view class="card head">
      <view class="nickname">{{ profile?.display_name || '陪玩' }}</view>
      <view class="tags">
        <text class="tag level">{{ levelText(profile?.level) }}</text>
        <text class="tag" :class="qualClass">{{ qualificationText(profile?.qualification) }}</text>
      </view>
    </view>

    <view class="card identity" @click="go('/pages/player/identity')">
      <view class="identity-main">
        <view class="section-title">实名认证</view>
        <view class="muted">{{ identityHint }}</view>
      </view>
      <view class="identity-right">
        <text class="badge" :class="identityClass">{{ identityText }}</text>
        <text class="arrow">›</text>
      </view>
    </view>

    <view class="card">
      <view class="section-head">
        <text class="section-title">基本资料</text>
        <text v-if="!editing" class="action" @click="startEdit">编辑</text>
      </view>
      <template v-if="!editing">
        <view class="info-row">
          <text class="label">昵称</text>
          <text class="value">{{ profile?.display_name || '—' }}</text>
        </view>
        <view v-if="knownPhone" class="info-row">
          <text class="label">预留手机号</text>
          <text class="value">{{ knownPhone }}</text>
        </view>
        <view class="info-row">
          <text class="label">擅长游戏</text>
          <text class="value">{{ (profile?.games || []).length ? profile!.games.join(' / ') : '不限' }}</text>
        </view>
      </template>
      <template v-else>
        <view class="field">
          <text class="label">昵称</text>
          <input v-model="form.display_name" class="input" placeholder="请输入昵称" maxlength="30" />
        </view>
        <view class="field">
          <text class="label">预留手机号</text>
          <input
            v-model="form.phone"
            class="input"
            type="number"
            placeholder="留空表示不修改"
            maxlength="11"
          />
        </view>
        <view class="field">
          <text class="label">擅长游戏</text>
          <input v-model="form.games" class="input" placeholder="多个用逗号分隔，留空表示不限" />
        </view>
        <view class="muted form-tip">
          昵称、预留手机号与擅长游戏可自助修改；资格、等级、在线状态与接单上限由考核结果和管理端维护。
        </view>
        <view class="actions">
          <button class="ghost" :disabled="saving" @click="cancelEdit">取消</button>
          <button class="primary" :loading="saving" :disabled="saving" @click="save">保存</button>
        </view>
      </template>
    </view>

    <view class="card">
      <view class="section-title">接单信息</view>
      <view class="info-row">
        <text class="label">接单游戏</text>
        <text class="value">{{ (profile?.games || []).length ? profile!.games.join(' / ') : '不限' }}</text>
      </view>
      <view class="info-row">
        <text class="label">每日接单上限</text>
        <text class="value">{{ profile?.daily_limit || '不限' }}</text>
      </view>
      <view class="info-row">
        <text class="label">并发接单上限</text>
        <text class="value">{{ profile?.concurrent_limit || '不限' }}</text>
      </view>
      <view class="info-row">
        <text class="label">最近定级</text>
        <text class="value">{{ datetime(profile?.level_appraised_at) }}</text>
      </view>
    </view>

    <view class="card">
      <view class="section-head">
        <text class="section-title">期望报价</text>
        <text class="badge" :class="priceClass">{{ expectedPriceStatusText }}</text>
      </view>
      <view class="info-row">
        <text class="label">当前期望单价</text>
        <text class="value">
          {{ profile?.expected_price_cents ? money(profile.expected_price_cents) : '未提交' }}
        </text>
      </view>
      <view v-if="profile?.expected_price_submitted_at" class="muted">
        提交时间 {{ datetime(profile.expected_price_submitted_at) }}
      </view>
      <view v-if="profile?.expected_price_reviewed_at" class="muted">
        审核时间 {{ datetime(profile.expected_price_reviewed_at) }}
      </view>
      <view v-if="profile?.expected_price_review_note" class="muted">
        审核说明：{{ profile.expected_price_review_note }}
      </view>
      <view class="field price-field">
        <text class="label">期望单价（元）</text>
        <input
          v-model="expectedPriceYuan"
          class="input"
          type="digit"
          placeholder="如：30"
          :disabled="pricePending"
        />
      </view>
      <button
        class="primary"
        :loading="priceSubmitting"
        :disabled="pricePending || priceSubmitting"
        @click="submitPrice"
      >
        {{ pricePending ? '审核中，暂不可再次提交' : '提交期望报价' }}
      </button>
      <view class="muted form-tip">提交后由运营复核；审核中不可重复提交，驳回后可重新填写。</view>
    </view>

    <view class="card">
      <view class="section-title">更多</view>
      <view class="link" @click="go('/pages/player/notices')">
        <text>优先通知</text>
        <text class="arrow">›</text>
      </view>
      <view class="link" @click="go('/pages/player/assessments')">
        <text>我的考核</text>
        <text class="arrow">›</text>
      </view>
      <view class="link" @click="go('/pages/player/teammates')">
        <text>我的固排</text>
        <text class="arrow">›</text>
      </view>
      <view class="link" @click="go('/pages/player/transfer')">
        <text>我的转单</text>
        <text class="arrow">›</text>
      </view>
      <view class="link" @click="go('/pages/player/recoveries')">
        <text>我的追偿</text>
        <text class="arrow">›</text>
      </view>
      <view class="link" @click="go('/pages/player/appeals')">
        <text>售后申诉</text>
        <text class="arrow">›</text>
      </view>
      <view class="link" @click="go('/pages/player/recoveries')">
        <text>信用记载与追偿</text>
        <text class="arrow">›</text>
      </view>
    </view>

    <view class="card">
      <button class="logout" @click="logout">退出登录</button>
    </view>
  </view>
</template>

<script setup lang="ts">
  import { onShow } from '@dcloudio/uni-app';
  import { computed, reactive, ref } from 'vue';
  import {
    clearPlayerMode,
    enterPlayerMode,
    fetchPlayerProfile,
    fetchRealName,
    stopAllPlayerHeartbeat,
    submitExpectedPrice,
    updatePlayerProfile,
  } from '../../api/player';
  import type { PlayerProfile } from '../../api/player';
  import { closeRealtime } from '../../api/realtime';
  import { clearToken } from '../../api/request';
  import { datetime, money, yuanToCents } from '../../utils/format';

  import { skillLevelText } from '../../utils/levels';
  const profile = ref<PlayerProfile | null>(null);
  const identityStatus = ref('');
  // GET /user/player/profile 不含手机号（档案表无该列），只有自助修改接口会回传；
  // 因此手机号行仅在本次会话拿到过值时展示，避免误导。
  const knownPhone = ref('');

  const editing = ref(false);
  const saving = ref(false);
  const form = reactive({ display_name: '', phone: '', games: '' });

  // 期望报价：同一时间只允许一条待审核报价，审核中禁用提交。
  const expectedPriceYuan = ref('');
  const priceSubmitting = ref(false);

  const pricePending = computed(
    () => (profile.value?.expected_price_status || 'none') === 'pending'
  );

  const expectedPriceStatusText = computed(
    () =>
      (
        ({
          none: '未提交',
          pending: '待审核',
          approved: '已通过',
          rejected: '已驳回',
        }) as Record<string, string>
      )[profile.value?.expected_price_status || 'none'] || '未提交'
  );

  const priceClass = computed(() => {
    const status = profile.value?.expected_price_status || 'none';
    if (status === 'approved') return 'ok';
    if (status === 'rejected') return 'warn';
    return status === 'pending' ? 'pending' : 'idle';
  });

  const qualClass = computed(() =>
    profile.value?.qualification === 'qualified' ? 'ok' : 'warn'
  );

  const IDENTITY_META: Record<string, { text: string; hint: string; cls: string }> = {
    '': { text: '未提交', hint: '提交实名信息后由客服审核，通过前无法开通接单资格', cls: 'idle' },
    pending_verification: { text: '待审核', hint: '资料已提交，请等待审核结果', cls: 'pending' },
    verified: { text: '已通过', hint: '实名认证已通过', cls: 'ok' },
    rejected: { text: '已驳回', hint: '认证未通过，请核对资料后重新提交', cls: 'warn' },
  };

  const identityText = computed(
    () => (IDENTITY_META[identityStatus.value] || IDENTITY_META['']).text
  );
  const identityHint = computed(
    () => (IDENTITY_META[identityStatus.value] || IDENTITY_META['']).hint
  );
  const identityClass = computed(
    () => IDENTITY_META[identityStatus.value]?.cls || 'idle'
  );

  async function load() {
    try {
      profile.value = await fetchPlayerProfile();
    } catch {
      profile.value = null;
    }
    // 已提交过的期望报价预填到输入框，便于被驳回后微调重提。
    if (profile.value?.expected_price_cents && !expectedPriceYuan.value) {
      expectedPriceYuan.value = (profile.value.expected_price_cents / 100).toFixed(2);
    }
    try {
      identityStatus.value = (await fetchRealName('player'))?.status || '';
    } catch {
      identityStatus.value = '';
    }
  }

  /** 提交期望单价（元 → 分）：服务端只收分，且不允许带小数的分，故按两位小数换算。 */
  async function submitPrice() {
    const yuan = Number(expectedPriceYuan.value);
    if (!Number.isFinite(yuan) || yuan <= 0) {
      uni.showToast({ title: '请填写正确的期望单价', icon: 'none' });
      return;
    }
    const cents = yuanToCents(expectedPriceYuan.value);
    if (cents <= 0) {
      uni.showToast({ title: '请填写正确的期望单价', icon: 'none' });
      return;
    }
    priceSubmitting.value = true;
    try {
      await submitExpectedPrice(cents);
      uni.showToast({ title: '已提交，待运营复核', icon: 'none' });
      await load();
    } catch {
      // 审核中重复提交 / 金额非法等由 request 层提示后端中文文案。
    } finally {
      priceSubmitting.value = false;
    }
  }

  function go(url: string) {
    uni.navigateTo({ url });
  }

  function startEdit() {
    form.display_name = profile.value?.display_name || '';
    form.phone = '';
    form.games = (profile.value?.games || []).join('，');
    editing.value = true;
  }

  function cancelEdit() {
    editing.value = false;
  }

  /** 与服务端 normalizePlayerSelfGames 同口径：去空白、丢空项（服务端还会去重与限长）。 */
  function parseGames(raw: string): string[] {
    return raw
      .split(/[,，、/;；\s]+/)
      .map((item) => item.trim())
      .filter((item) => item.length > 0);
  }

  async function save() {
    const displayName = form.display_name.trim();
    if (!displayName) {
      uni.showToast({ title: '昵称不能为空', icon: 'none' });
      return;
    }
    const phone = form.phone.trim();
    if (phone && !/^1[3-9]\d{9}$/.test(phone)) {
      uni.showToast({ title: '请填写正确的 11 位手机号', icon: 'none' });
      return;
    }
    saving.value = true;
    try {
      const updated = await updatePlayerProfile({
        display_name: displayName,
        // 留空表示「不修改」，不传字段；服务端指针为空即跳过手机号写入。
        ...(phone ? { phone } : {}),
        games: parseGames(form.games),
        ...(profile.value?.version ? { version: profile.value.version } : {}),
      });
      if (updated?.phone) knownPhone.value = updated.phone;
      editing.value = false;
      uni.showToast({ title: '资料已更新', icon: 'none' });
      await load();
    } catch {
      // request 层已提示具体错误（版本冲突 / 手机号格式等为 4xx 中文提示）。
    } finally {
      saving.value = false;
    }
  }

  function logout() {
    uni.showModal({
      title: '退出登录',
      content: '确定要退出当前账号吗？',
      success: (res) => {
        if (res.confirm) {
          // 登出即身份切换：停表、清陪玩标记并断开实时通道，避免残留心跳与推送。
          stopAllPlayerHeartbeat();
          clearPlayerMode();
          closeRealtime();
          clearToken();
          uni.reLaunch({ url: '/pages/login/index' });
        }
      },
    });
  }

  // 技能等级文案走系统配置，App 启动时已拉取。
  const levelText = (level?: string) => skillLevelText(level) || '未定级';

  const qualificationText = (q?: string) =>
    (
      ({
        pending: '待考核',
        qualified: '已开通接单',
        suspended: '已暂停接单',
      }) as Record<string, string>
    )[q || ''] || q || '未知';

  onShow(() => {
    // 进入陪玩页即确认陪玩身份，保证应用前台心跳已启动（页面切换不受影响）。
    enterPlayerMode();
    load();
  });
</script>

<style scoped lang="scss">
  .head {
    background: linear-gradient(135deg, #165dff, #4080ff);
    color: #fff;
  }

  .nickname {
    font-size: 40rpx;
    font-weight: 600;
    margin-bottom: 16rpx;
  }

  .tags {
    display: flex;
    gap: 12rpx;
  }

  .tag {
    font-size: 22rpx;
    padding: 4rpx 16rpx;
    border-radius: 8rpx;
    background: rgba(255, 255, 255, 0.2);
  }

  .tag.level {
    background: rgba(255, 255, 255, 0.9);
    color: $brand;
    font-weight: 600;
  }

  .identity {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .identity-main {
    flex: 1;
  }

  .identity-right {
    display: flex;
    align-items: center;
    gap: 8rpx;
  }

  .badge {
    font-size: 22rpx;
    padding: 4rpx 16rpx;
    border-radius: 8rpx;
  }

  .badge.idle {
    color: $brand;
    background: rgba(22, 93, 255, 0.1);
  }

  .badge.pending {
    color: #ff7d00;
    background: rgba(255, 125, 0, 0.12);
  }

  .badge.ok {
    color: $success;
    background: rgba(0, 180, 42, 0.12);
  }

  .badge.warn {
    color: $danger;
    background: rgba(245, 63, 63, 0.12);
  }

  .section-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 16rpx;
  }

  .section-head .section-title {
    margin-bottom: 0;
  }

  .section-title {
    font-size: 30rpx;
    font-weight: 600;
    margin-bottom: 16rpx;
  }

  .action {
    font-size: 24rpx;
    color: $brand;
  }

  .info-row {
    display: flex;
    justify-content: space-between;
    padding: 12rpx 0;
    border-bottom: 1rpx solid $border;
  }

  .info-row:last-child {
    border-bottom: none;
  }

  .label {
    color: $text-3;
  }

  .value {
    color: $text-1;
  }

  .field {
    margin-bottom: 24rpx;
  }

  .price-field {
    margin-top: 16rpx;
  }

  .input {
    height: 80rpx;
    padding: 0 24rpx;
    background: $bg;
    border: 1rpx solid $border;
    border-radius: $radius;
  }

  .form-tip {
    line-height: 1.6;
  }

  .actions {
    display: flex;
    gap: 24rpx;
    margin-top: 24rpx;
  }

  .actions button {
    flex: 1;
    border-radius: $radius;
  }

  .primary {
    background: $brand;
    color: #fff;
  }

  .ghost {
    background: #fff;
    color: $text-2;
    border: 1rpx solid $border;
  }

  .link {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 20rpx 0;
    border-bottom: 1rpx solid $border;
  }

  .link:last-child {
    border-bottom: none;
  }

  .arrow {
    color: $text-3;
    font-size: 36rpx;
  }

  .logout {
    background: #fff;
    color: $danger;
    border: 1rpx solid $danger;
    border-radius: $radius;
  }
</style>
