// 统一实名认证（客户 / 陪玩共用一页）：?role=customer 走 /user/realname，
// 其余（含旧链接 /pages/player/identity）走 /user/player/realname。
// 状态机：'' 未提交 → pending 待审 → verified / rejected / expired；
// 可用渠道由服务端按配置下发：manual 人工审核恒可用，third_party 需运营配置，
// 微信 / 支付宝未接入前不出现。证件号仅保存脱敏值（前 6 后 4）。

<template>
  <view class="identity">
    <view class="card status" :class="statusClass">
      <view class="status-main">
        <text class="status-label">{{ current.text }}</text>
        <text class="status-hint">{{ current.hint }}</text>
      </view>
    </view>

    <view v-if="status === 'verified'" class="card locked">
      实名信息：{{ realName }}（{{ idNumberMasked }}）。如需变更实名信息请联系客服。
    </view>

    <view v-if="failReason" class="card notice">
      <view class="notice-title">未通过原因</view>
      <view class="notice-text">{{ failReason }}</view>
    </view>

    <view v-if="editable" class="card">
      <view class="section-title">提交认证资料</view>
      <view class="field">
        <text class="label">真实姓名</text>
        <input v-model="form.real_name" class="input" placeholder="与身份证一致的姓名" maxlength="30" />
      </view>
      <view class="field">
        <text class="label">身份证号</text>
        <input
          v-model="form.id_number"
          class="input"
          placeholder="15 位或 18 位身份证号"
          maxlength="18"
        />
      </view>

      <view v-if="channels.length > 1" class="field">
        <text class="label">认证渠道</text>
        <view class="chips">
          <view
            v-for="item in channels"
            :key="item.code"
            class="chip"
            :class="{ active: channel === item.code }"
            @click="selectChannel(item.code)"
          >
            {{ item.name }}
          </view>
        </view>
      </view>

      <view v-if="methods.length > 1" class="field">
        <text class="label">核验方式</text>
        <view class="chips">
          <view
            v-for="item in methods"
            :key="item"
            class="chip"
            :class="{ active: method === item }"
            @click="method = item"
          >
            {{ methodLabel(item) }}
          </view>
        </view>
      </view>

      <view class="tip">
        证件号提交后仅保存脱敏结果（保留前 6 位与后 4 位），原始号码不落库；当前认证流程不采集证件照片，
        如需补充材料由客服在审核环节联系。
      </view>
      <button class="primary" :loading="submitting" :disabled="submitting" @click="submit">
        {{ status ? '重新提交认证' : '提交认证' }}
      </button>
    </view>

    <view v-if="status === 'pending'" class="card locked">
      认证资料已提交，等待核验结果。核验通过前请勿重复提交；如需修改资料请联系客服。
      <button v-if="attemptRef" class="ghost refresh" :loading="submitting" @click="refresh">刷新状态</button>
    </view>

    <view class="card">
      <view class="section-title">认证说明</view>
      <view class="tip no-indent">
        1. 完成实名认证是{{ role === 'player' ? '陪玩开通接单资格' : '下单 / 充值的合规前提' }}；<br />
        2. 人工审核渠道提交后由管理员审核，审核结果以本页状态为准；<br />
        3. 姓名与账号实名需为同一人，冒用他人证件将导致账号受限。
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
  import { onLoad, onShow } from '@dcloudio/uni-app';
  import { computed, reactive, ref } from 'vue';
  import {
    enterPlayerMode,
    fetchRealName,
    submitRealName,
  } from '../../api/player';
  import type { RealNameChannelOption, RealNameRole } from '../../api/player';

  const role = ref<RealNameRole>('player');
  const status = ref('');
  const failReason = ref('');
  const realName = ref('');
  const idNumberMasked = ref('');
  const channels = ref<RealNameChannelOption[]>([]);
  const channel = ref('');
  const method = ref('');
  const attemptRef = ref('');
  const submitting = ref(false);
  const form = reactive({ real_name: '', id_number: '' });

  const STATUS_META: Record<string, { text: string; hint: string; cls: string }> = {
    '': {
      text: '未提交',
      hint: '完成实名认证后才能开通报单相关权限。',
      cls: 'idle',
    },
    pending: {
      text: '待审核',
      hint: '资料已提交，请等待核验结果。',
      cls: 'pending',
    },
    verified: {
      text: '已通过',
      hint: '实名认证已通过，无需再次提交。',
      cls: 'ok',
    },
    rejected: {
      text: '已驳回',
      hint: '认证未通过，请核对资料后重新提交。',
      cls: 'warn',
    },
    expired: {
      text: '已失效',
      hint: '本次核验超时未完成，请重新提交。',
      cls: 'warn',
    },
  };

  const METHOD_LABELS: Record<string, string> = {
    two_factor: '双要素核验',
    face: '人脸核验',
    manual: '人工审核',
  };

  const current = computed(
    () => STATUS_META[status.value] || { text: status.value || '未提交', hint: '', cls: 'idle' }
  );
  const statusClass = computed(() => current.value.cls);
  // 仅「未提交 / 已驳回 / 已失效」可提交：待审核与已通过由后端返回 409，前端先拦一层。
  const editable = computed(() =>
    ['', 'rejected', 'expired'].includes(status.value)
  );
  const methods = computed(
    () => channels.value.find((item) => item.code === channel.value)?.methods || []
  );

  function methodLabel(code: string): string {
    return METHOD_LABELS[code] || code;
  }

  /** 切换渠道时把核验方式重置为该渠道首项，避免提交到渠道不支持的组合。 */
  function selectChannel(code: string) {
    channel.value = code;
    method.value = channels.value.find((item) => item.code === code)?.methods[0] || '';
  }

  async function load() {
    try {
      const data = await fetchRealName(role.value);
      status.value = data?.status || '';
      failReason.value = data?.fail_reason || '';
      realName.value = data?.real_name || '';
      idNumberMasked.value = data?.id_number_masked || '';
      attemptRef.value = data?.attempt_ref || '';
      channels.value = data?.channels || [];
      // 保留用户已选渠道；首次进入或被驳回后默认第一项（服务端排序里 manual 在前）。
      if (!channels.value.some((item) => item.code === channel.value)) {
        selectChannel(channels.value[0]?.code || 'manual');
      } else if (!methods.value.includes(method.value)) {
        method.value = methods.value[0] || '';
      }
    } catch {
      status.value = '';
    }
  }

  /** 15 位纯数字或 18 位（前 17 位数字 + 数字/X），与服务端 validIDNumber 同口径。 */
  function validIDNumber(value: string): boolean {
    return /^(\d{15}|\d{17}[\dXx])$/.test(value);
  }

  async function submit() {
    const realNameInput = form.real_name.trim();
    const idNumber = form.id_number.trim();
    if (!realNameInput) {
      uni.showToast({ title: '请填写真实姓名', icon: 'none' });
      return;
    }
    if (!validIDNumber(idNumber)) {
      uni.showToast({ title: '请填写正确的身份证号', icon: 'none' });
      return;
    }
    if (!editable.value) {
      uni.showToast({ title: '当前状态不可重复提交', icon: 'none' });
      return;
    }
    if (!channel.value || !method.value) {
      uni.showToast({ title: '请选择认证渠道', icon: 'none' });
      return;
    }
    submitting.value = true;
    try {
      const result = await submitRealName(role.value, {
        real_name: realNameInput,
        id_number: idNumber,
        channel: channel.value,
        method: method.value,
      });
      form.real_name = '';
      form.id_number = '';
      if (result?.redirect_url && /^https?:\/\//i.test(result.redirect_url)) {
        uni.navigateTo({
          url: `/pages/webview/index?url=${encodeURIComponent(result.redirect_url)}`,
        });
      } else if (result?.qr_content) {
        uni.showModal({
          title: '请完成核验',
          content: `二维码内容：${result.qr_content}`,
          showCancel: false,
        });
      } else {
        uni.showToast({ title: '已提交，等待审核', icon: 'none' });
      }
      await load();
    } catch {
      // request 层已提示具体错误（待审核 / 已通过重复提交为 409）。
    } finally {
      submitting.value = false;
    }
  }

  async function refresh() {
    submitting.value = true;
    try {
      await load();
    } finally {
      submitting.value = false;
    }
  }

  onLoad((query) => {
    role.value = query?.role === 'customer' ? 'customer' : 'player';
    uni.setNavigationBarTitle({ title: role.value === 'player' ? '实名认证' : '我的实名认证' });
  });

  onShow(() => {
    // 陪玩端依赖陪玩模式下的 token 上下文；客户侧不切换。
    if (role.value === 'player') enterPlayerMode();
    load();
  });
</script>

<style scoped lang="scss">
  .identity {
    padding-bottom: 40rpx;
  }

  .status {
    display: flex;
    align-items: center;
  }

  .status.idle {
    background: linear-gradient(135deg, #165dff, #4080ff);
    color: #fff;
  }

  .status.pending {
    background: linear-gradient(135deg, #ff7d00, #ff9a2e);
    color: #fff;
  }

  .status.ok {
    background: linear-gradient(135deg, #00b42a, #23c343);
    color: #fff;
  }

  .status.warn {
    background: linear-gradient(135deg, #f53f3f, #ff7d7d);
    color: #fff;
  }

  .status-main {
    display: flex;
    flex-direction: column;
    gap: 8rpx;
  }

  .status-label {
    font-size: 40rpx;
    font-weight: 600;
  }

  .status-hint {
    font-size: 24rpx;
    opacity: 0.85;
  }

  .notice-title {
    font-size: 28rpx;
    font-weight: 600;
    color: $danger;
    margin-bottom: 8rpx;
  }

  .notice-text {
    font-size: 24rpx;
    color: $text-2;
    line-height: 1.6;
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
    font-size: 24rpx;
    color: $text-2;
    margin-bottom: 12rpx;
  }

  .input {
    height: 88rpx;
    padding: 0 24rpx;
    background: $bg;
    border: 1rpx solid $border;
    border-radius: $radius;
  }

  .chips {
    display: flex;
    flex-wrap: wrap;
    gap: 16rpx;
  }

  .chip {
    padding: 12rpx 28rpx;
    font-size: 24rpx;
    color: $text-2;
    background: $bg;
    border: 1rpx solid $border;
    border-radius: 999rpx;
  }

  .chip.active {
    color: $brand;
    border-color: $brand;
    background: rgba(22, 93, 255, 0.08);
  }

  .tip {
    font-size: 22rpx;
    color: $text-2;
    line-height: 1.6;
    padding: 16rpx 20rpx;
    background: $bg;
    border-radius: $radius;
  }

  .tip.no-indent {
    padding: 0;
    background: transparent;
  }

  .primary {
    margin-top: 32rpx;
    background: $brand;
    color: #fff;
    border-radius: $radius;
  }

  .locked {
    font-size: 24rpx;
    color: $text-2;
    line-height: 1.6;
  }

  .refresh {
    margin-top: 24rpx;
  }
</style>
