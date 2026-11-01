<template>
  <view class="login">
    <view class="card">
      <view class="title">客服工作台登录</view>
      <view class="muted">请使用客服（admin）账号登录，登录后进入移动客服工作台。</view>
      <view class="field">
        <input v-model="form.username" class="input" placeholder="账号" />
      </view>
      <view class="field">
        <input v-model="form.password" class="input" password placeholder="密码" />
      </view>
      <button class="primary" :loading="loading" @click="submit">登录</button>
      <view class="muted" style="margin-top: 24rpx">
        登录接口：{{ loginPath }}
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
  import { onShow } from '@dcloudio/uni-app';
  import { reactive, ref } from 'vue';
  import { adminLogin, getAdminToken, setAdminToken, ADMIN_LOGIN_PATH } from '../../api/cs';

  const loginPath = ADMIN_LOGIN_PATH;
  const loading = ref(false);
  const form = reactive({ username: '', password: '' });

  // 已登录客服直接进工作台，避免重复登录。
  onShow(() => {
    if (getAdminToken()) {
      uni.reLaunch({ url: '/pages/cs/workbench' });
    }
  });

  async function submit() {
    if (!form.username.trim() || !form.password) {
      uni.showToast({ title: '请填写账号与密码', icon: 'none' });
      return;
    }
    loading.value = true;
    try {
      // 注意：admin 登录接口由验证码中间件保护（captchaAdapter.Require("admin_login")）。
      // 验证码场景未启用时 username/password 即可；若服务端启用验证码，需在此补充验证码流程。
      const data = await adminLogin(form.username.trim(), form.password);
      if (!data.access_token) {
        uni.showToast({ title: '登录响应缺少 access_token', icon: 'none' });
        return;
      }
      setAdminToken(data.access_token);
      uni.reLaunch({ url: '/pages/cs/workbench' });
    } catch {
      // csRequest 层已提示具体错误。
    } finally {
      loading.value = false;
    }
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
</style>
