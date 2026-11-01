<template>
  <view>
    <view class="card search">
      <input v-model="keyword" class="input" placeholder="搜索客户姓名 / 手机号" />
    </view>

    <scroll-view class="tabs" scroll-x>
      <view
        v-for="tab in statusTabs"
        :key="tab.value"
        class="tab"
        :class="{ active: followStatus === tab.value }"
        @click="followStatus = tab.value"
      >
        {{ tab.label }}
      </view>
    </scroll-view>

    <view v-if="filtered.length === 0" class="empty">暂无客户</view>
    <view
      v-for="item in filtered"
      :key="item.id"
      class="card customer"
      @click="goDetail(item.id)"
    >
      <view class="row">
        <text class="name">{{ item.display_name }}</text>
        <text class="status">{{ followText(item.follow_status) }}</text>
      </view>
      <view class="muted">
        {{ item.phone || '未留手机号' }} · 等级 {{ item.member_level_code || '未定级' }}
      </view>
      <view v-if="item.tags?.length" class="tags">
        <text v-for="tag in item.tags" :key="tag" class="tag">{{ tag }}</text>
      </view>
      <view v-if="item.last_contact_at" class="muted">最近联系 {{ datetime(item.last_contact_at) }}</view>
    </view>
  </view>
</template>

<script setup lang="ts">
  import { onShow } from '@dcloudio/uni-app';
  import { computed, ref } from 'vue';
  import { fetchCsCustomers } from '../../api/cs';
  import type { CsCustomer } from '../../api/cs';
  import { datetime } from '../../utils/format';

  const statusTabs = [
    { label: '全部', value: '' },
    { label: '新客', value: 'new' },
    { label: '跟进中', value: 'following' },
    { label: '待跟进', value: 'pending' },
    { label: '沉睡', value: 'dormant' },
    { label: '已关闭', value: 'closed' },
  ];

  const keyword = ref('');
  const followStatus = ref('');
  const customers = ref<CsCustomer[]>([]);

  const filtered = computed(() => {
    const kw = keyword.value.trim().toLowerCase();
    return customers.value.filter((item) => {
      if (followStatus.value && item.follow_status !== followStatus.value) return false;
      if (!kw) return true;
      return (
        item.display_name.toLowerCase().includes(kw) ||
        (item.phone || '').toLowerCase().includes(kw)
      );
    });
  });

  function followText(status: string): string {
    return (
      (
        {
          new: '新客',
          following: '跟进中',
          pending: '待跟进',
          dormant: '沉睡',
          closed: '已关闭',
        } as Record<string, string>
      )[status] || status
    );
  }

  async function load() {
    try {
      customers.value = (await fetchCsCustomers()) || [];
    } catch {
      customers.value = [];
    }
  }

  function goDetail(id: number) {
    uni.navigateTo({ url: `/pages/cs/customer-detail?id=${id}` });
  }

  onShow(load);
</script>

<style scoped lang="scss">
  .search {
    padding: 16rpx 24rpx;
  }

  .input {
    height: 72rpx;
    padding: 0 24rpx;
    background: $bg;
    border-radius: $radius;
  }

  .tabs {
    white-space: nowrap;
    background: #fff;
    padding: 16rpx 0;
  }

  .tab {
    display: inline-block;
    padding: 12rpx 28rpx;
    margin-left: 16rpx;
    border-radius: 999rpx;
    background: $bg;
    color: $text-2;
    font-size: 26rpx;
  }

  .tab.active {
    background: $brand;
    color: #fff;
  }

  .name {
    font-weight: 600;
  }

  .status {
    color: $brand;
    font-size: 26rpx;
  }

  .tags {
    margin-top: 12rpx;
    display: flex;
    flex-wrap: wrap;
    gap: 12rpx;
  }

  .tag {
    padding: 4rpx 16rpx;
    background: $bg;
    border-radius: 999rpx;
    color: $text-2;
    font-size: 24rpx;
  }
</style>
