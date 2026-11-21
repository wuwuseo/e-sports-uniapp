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
  import { ref } from 'vue';
  import { useRealNameForm } from '@esports/shared/composables/useRealNameForm';
  import { enterPlayerMode } from '../../api/player';
  import type { RealNameRole } from '../../api/player';

  const role = ref<RealNameRole>('player');

  /** 陪玩端依赖陪玩模式下的 token 上下文；客户侧不切换。 */
  function ensurePlayerMode() {
    if (role.value === 'player') enterPlayerMode();
  }

  const {
    status,
    failReason,
    realName,
    idNumberMasked,
    channels,
    channel,
    method,
    attemptRef,
    submitting,
    form,
    current,
    statusClass,
    editable,
    methods,
    methodLabel,
    selectChannel,
    load,
    submit,
    refresh,
  } = useRealNameForm({ role, onSubmitted: ensurePlayerMode });

  onLoad((query) => {
    role.value = query?.role === 'customer' ? 'customer' : 'player';
    uni.setNavigationBarTitle({ title: role.value === 'player' ? '实名认证' : '我的实名认证' });
  });

  onShow(() => {
    ensurePlayerMode();
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
