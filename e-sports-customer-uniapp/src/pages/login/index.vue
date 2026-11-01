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
  import { reactive, ref } from 'vue';
  import { login } from '../../api/esports';
  import { setToken, USER_LOGIN_PATH } from '../../api/request';

  const loginPath = USER_LOGIN_PATH;
  const loading = ref(false);
  // 账号登录 / 手机号登录：后端仅提供账号密码登录（无短信验证码接口），
  // 手机号登录把手机号作为账号提交同一接口，因此要求账号已预留该手机号。
  const mode = ref<'account' | 'phone'>('account');
  const form = reactive({ account: '', phone: '', password: '' });

  function switchMode(next: 'account' | 'phone') {
    mode.value = next;
  }

  async function submit() {
    const account = mode.value === 'account' ? form.account.trim() : form.phone.trim();
    if (!account || !form.password) {
      uni.showToast({ title: '请填写账号与密码', icon: 'none' });
      return;
    }
    if (mode.value === 'phone' && !/^1[3-9]\d{9}$/.test(account)) {
      uni.showToast({ title: '请填写正确的 11 位手机号', icon: 'none' });
      return;
    }
    loading.value = true;
    try {
      const data = await login(account, form.password, mode.value === 'phone');
      const token = extractToken(data);
      if (!token) {
        uni.showToast({ title: '登录响应缺少 token 字段', icon: 'none' });
        return;
      }
      setToken(token);
      // 用户端没有角色分流，登录成功直接回报单首页。
      uni.reLaunch({ url: '/pages/index/index' });
    } catch {
      // request 层已提示具体错误。
    } finally {
      loading.value = false;
    }
  }

  /** 兼容常见字段名：access_token / token / accessToken。 */
  function extractToken(data: Record<string, unknown>): string {
    const candidates = ['access_token', 'token', 'accessToken'];
    for (const key of candidates) {
      const value = data?.[key];
      if (typeof value === 'string' && value) return value;
    }
    return '';
  }
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
