<template>
  <view class="webview">
    <web-view v-if="url" :src="url" />
    <view v-else class="empty">收银台地址无效，请返回订单改用上传凭证。</view>
  </view>
</template>

<script setup lang="ts">
  import { onLoad } from '@dcloudio/uni-app';
  import { ref } from 'vue';

  // 收银台容器：只承载后端下发的 http(s) 收银台地址，不接受其它 scheme，
  // 也不在本地拼装支付参数。地址来源必须经 startOrderPayment 由服务端验签下发的 pay_url。
  const url = ref('');

  onLoad((query) => {
    const raw = typeof query?.url === 'string' ? query.url : '';
    let decoded = '';
    try {
      decoded = decodeURIComponent(raw);
    } catch {
      decoded = '';
    }
    if (!/^https?:\/\//i.test(decoded)) {
      uni.showToast({ title: '收银台地址无效', icon: 'none' });
      url.value = '';
      return;
    }
    url.value = decoded;
  });
</script>

<style lang="scss" scoped>
  .webview {
    min-height: 100vh;
  }

  .empty {
    padding: 60rpx 32rpx;
    color: $text-3;
    text-align: center;
  }
</style>
