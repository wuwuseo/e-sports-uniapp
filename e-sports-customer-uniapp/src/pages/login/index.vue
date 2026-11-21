<template>
  <view class="login">
    <view class="card">
      <view class="title">陪玩报单 · 用户端</view>
      <view class="muted">登录后可自助下单、查看订单与售后进度。</view>

      <view class="tabs">
        <view class="tab" :class="{ active: mode === 'account' }" @click="switchMode('account')">
          账号登录
        </view>
        <view class="tab" :class="{ active: mode === 'phone' }" @click="switchMode('phone')">
          手机号登录
        </view>
      </view>

      <view class="field">
        <input
          v-if="mode === 'account'"
          v-model="form.account"
          class="input"
          placeholder="账号"
        />
        <input
          v-else
          v-model="form.phone"
          class="input"
          type="number"
          maxlength="11"
          placeholder="11 位手机号"
        />
      </view>
      <view class="field">
        <input v-model="form.password" class="input" password placeholder="密码" />
      </view>
      <button class="primary" :loading="loading" @click="submit">登录</button>

      <view v-if="mode === 'phone'" class="muted note">
        手机号登录使用系统预留手机号 + 密码；短信验证码登录待短信通道接入。
        手机号需已在账号资料中预留。
      </view>
      <view v-else class="muted note">
        登录接口：{{ loginPath }}（由宿主服务提供，可用 VITE_USER_LOGIN_PATH 覆盖）
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
  import { useAccountLogin } from '@esports/shared/composables/useAccountLogin';
  import { ensureRealtime } from '../../api/realtime';

  const { loginPath, loading, mode, form, switchMode, submit } = useAccountLogin({
    onAuthenticated: () => {
      // 登录后立刻建立实时通道（幂等）；失败会在 App.onShow 再次尝试。
      ensureRealtime();
      // 用户端没有角色分流，登录成功直接回报单首页。
      uni.reLaunch({ url: '/pages/index/index' });
    },
  });
</script>

<style scoped lang="scss">
  .login {
    padding-top: 120rpx;
  }

  .title {
    font-size: 36rpx;
    font-weight: 600;
    margin-bottom: 16rpx;
  }

  .tabs {
    display: flex;
    gap: 16rpx;
    margin-top: 32rpx;
    padding: 6rpx;
    background: $bg;
    border-radius: $radius;
  }

  .tab {
    flex: 1;
    text-align: center;
    padding: 14rpx 0;
    font-size: 26rpx;
    color: $text-2;
    border-radius: $radius;
  }

  .tab.active {
    background: #fff;
    color: $brand;
    font-weight: 600;
  }

  .field {
    margin-top: 32rpx;
  }

  .input {
    height: 88rpx;
    padding: 0 24rpx;
    background: $bg;
    border-radius: $radius;
  }

  .primary {
    margin-top: 48rpx;
    background: $brand;
    color: #fff;
    border-radius: $radius;
  }

  .note {
    margin-top: 24rpx;
    line-height: 1.6;
  }
</style>
