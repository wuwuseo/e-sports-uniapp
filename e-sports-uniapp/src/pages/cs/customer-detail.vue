<template>
  <view>
    <view class="card">
      <view class="row">
        <text class="name">{{ overview?.customer.display_name || '客户' }}</text>
        <text class="status">{{ followText(overview?.follow_status || '') }}</text>
      </view>
      <view class="muted">
        {{ overview?.customer.phone || '未留手机号' }} · 等级 {{ overview?.member_level_code || '未定级' }}
      </view>
      <view v-if="overview?.customer.tags?.length" class="tags">
        <text v-for="tag in overview.customer.tags" :key="tag" class="tag">{{ tag }}</text>
      </view>
      <view v-if="overview?.customer.consumption_preference" class="muted" style="margin-top: 8rpx">
        偏好：{{ overview.customer.consumption_preference }}
      </view>
      <view v-if="overview?.customer.birthday" class="muted">生日：{{ overview.customer.birthday }}</view>
    </view>

    <view class="card">
      <view class="section-title">消费汇总</view>
      <view class="grid">
        <view class="stat">
          <view class="stat-num">{{ money(overview?.balance_cents) }}</view>
          <view class="muted">余额</view>
        </view>
        <view class="stat">
          <view class="stat-num">{{ money(overview?.recharged_cents) }}</view>
          <view class="muted">累计充值</view>
        </view>
        <view class="stat">
          <view class="stat-num">{{ money(overview?.consumed_cents) }}</view>
          <view class="muted">累计消费</view>
        </view>
        <view class="stat">
          <view class="stat-num">{{ overview?.growth_total ?? 0 }}</view>
          <view class="muted">成长值</view>
        </view>
      </view>
      <view class="muted" style="margin-top: 8rpx">
        累计送礼 {{ money(overview?.gifted_cents) }} · 累计退款 {{ money(overview?.refunded_cents) }} ·
        订单 {{ overview?.order_count ?? 0 }} 单
      </view>
    </view>

    <view class="card">
      <view class="section-title">快捷操作</view>
      <view class="ops">
        <button class="mini primary" @click="goGift">代客送礼</button>
      </view>
    </view>

    <view class="card">
      <view class="row">
        <text class="section-title" style="margin-bottom: 0">跟进记录</text>
        <text class="link" @click="editing = !editing">{{ editing ? '收起' : '新增跟进' }}</text>
      </view>

      <view v-if="editing" class="form">
        <textarea v-model="followForm.summary" class="textarea" placeholder="跟进内容（必填，≤500字）" />
        <view class="picker-row">
          <picker :range="channelOptions" :value="channelIndex" @change="onChannelChange">
            <view class="picker">渠道：{{ channelOptions[channelIndex] }}</view>
          </picker>
          <input v-model="followForm.next_follow_at" class="picker-input" placeholder="下次跟进时间（选填）" />
        </view>
        <button class="primary" :loading="submitting" @click="submitFollow">提交跟进</button>
      </view>

      <view v-if="followUps.length === 0 && !editing" class="muted">暂无跟进记录</view>
      <view v-for="item in followUps" :key="item.id" class="timeline">
        <view class="dot"></view>
        <view class="timeline-body">
          <view class="muted">{{ channelText(item.channel) }} · {{ datetime(item.created_at) }}</view>
          <view class="summary">{{ item.summary }}</view>
          <view v-if="item.next_follow_at" class="muted">下次跟进：{{ datetime(item.next_follow_at) }}</view>
        </view>
      </view>
    </view>

    <view class="card">
      <view class="row">
        <text class="section-title" style="margin-bottom: 0">编辑档案</text>
        <text class="link" @click="editOpen = !editOpen">{{ editOpen ? '收起' : '编辑' }}</text>
      </view>
      <view v-if="editOpen" class="form">
        <input v-model="profileForm.phone" class="input" placeholder="手机号" />
        <input v-model="profileForm.birthday" class="input" placeholder="生日（MM-DD，选填）" />
        <input v-model="profileForm.consumption_preference" class="input" placeholder="消费偏好（选填）" />
        <input v-model="profileForm.tagsText" class="input" placeholder="标签，逗号分隔（选填）" />
        <picker :range="followOptions" :value="followIndex" @change="onFollowChange">
          <view class="picker">跟进状态：{{ followOptions[followIndex] }}</view>
        </picker>
        <button class="primary" :loading="saving" @click="saveProfile">保存档案</button>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
  import { onLoad, onShow } from '@dcloudio/uni-app';
  import { reactive, ref } from 'vue';
  import {
    createCustomerFollowUp,
    fetchCustomerFollowUps,
    fetchCustomerProfile,
    updateCustomerProfile,
  } from '../../api/cs';
  import type { CustomerFollowUp, CustomerProfileOverview } from '../../api/cs';
  import { datetime, money } from '../../utils/format';

  const channelOptions = ['pc', 'mobile', 'wecom', 'phone', 'other'];
  const followOptions = ['new', 'following', 'pending', 'dormant', 'closed'];

  const id = ref(0);
  const overview = ref<CustomerProfileOverview | null>(null);
  const followUps = ref<CustomerFollowUp[]>([]);
  const editing = ref(false);
  const editOpen = ref(false);
  const submitting = ref(false);
  const saving = ref(false);

  const followForm = reactive({ summary: '', next_follow_at: '' });
  const channelIndex = ref(1); // 默认 mobile（移动客服端）
  const followIndex = ref(0);
  const profileForm = reactive({
    phone: '',
    birthday: '',
    consumption_preference: '',
    tagsText: '',
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

  function goGift() {
    uni.navigateTo({ url: `/pages/cs/gift?customer_id=${id.value}` });
  }

  function channelText(channel: string): string {
    return (
      (
        {
          pc: 'PC',
          mobile: '移动',
          wecom: '企微',
          phone: '电话',
          other: '其他',
        } as Record<string, string>
      )[channel] || channel
    );
  }

  async function load() {
    if (!id.value) return;
    try {
      overview.value = await fetchCustomerProfile(id.value);
      // 回填编辑表单
      profileForm.phone = overview.value.customer.phone || '';
      profileForm.birthday = overview.value.customer.birthday || '';
      profileForm.consumption_preference = overview.value.customer.consumption_preference || '';
      profileForm.tagsText = (overview.value.customer.tags || []).join(',');
      const fi = followOptions.indexOf(overview.value.customer.follow_status);
      if (fi >= 0) followIndex.value = fi;
    } catch {
      overview.value = null;
    }
    try {
      followUps.value = (await fetchCustomerFollowUps(id.value)) || [];
    } catch {
      followUps.value = [];
    }
  }

  function onChannelChange(e: Event) {
    const v = Number((e as unknown as { detail?: { value?: number } }).detail?.value);
    if (Number.isInteger(v)) channelIndex.value = v;
  }

  function onFollowChange(e: Event) {
    const v = Number((e as unknown as { detail?: { value?: number } }).detail?.value);
    if (Number.isInteger(v)) followIndex.value = v;
  }

  async function submitFollow() {
    if (!followForm.summary.trim()) {
      uni.showToast({ title: '请填写跟进内容', icon: 'none' });
      return;
    }
    submitting.value = true;
    try {
      await createCustomerFollowUp(id.value, {
        channel: channelOptions[channelIndex.value],
        summary: followForm.summary.trim(),
        next_follow_at: followForm.next_follow_at.trim() || undefined,
      });
      uni.showToast({ title: '已记录跟进', icon: 'success' });
      followForm.summary = '';
      followForm.next_follow_at = '';
      editing.value = false;
      await load();
    } catch {
      // csRequest 层已提示。
    } finally {
      submitting.value = false;
    }
  }

  async function saveProfile() {
    saving.value = true;
    try {
      await updateCustomerProfile(id.value, {
        phone: profileForm.phone.trim(),
        birthday: profileForm.birthday.trim(),
        consumption_preference: profileForm.consumption_preference.trim(),
        tags: profileForm.tagsText
          .split(',')
          .map((t) => t.trim())
          .filter(Boolean),
        follow_status: followOptions[followIndex.value],
      });
      uni.showToast({ title: '档案已保存', icon: 'success' });
      editOpen.value = false;
      await load();
    } catch {
      // csRequest 层已提示。
    } finally {
      saving.value = false;
    }
  }

  onLoad((query) => {
    id.value = Number(query?.id || 0);
  });
  onShow(load);
</script>

<style scoped lang="scss">
  .name {
    font-size: 34rpx;
    font-weight: 600;
  }

  .status {
    color: $brand;
    font-weight: 600;
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

  .ops {
    display: flex;
    gap: 16rpx;
  }

  .mini {
    font-size: 24rpx;
    padding: 0 24rpx;
    line-height: 56rpx;
    border-radius: 28rpx;
  }

  .primary {
    background: $brand;
    color: #fff;
  }

  .section-title {
    font-size: 30rpx;
    font-weight: 600;
    margin-bottom: 16rpx;
  }

  .link {
    color: $brand;
    font-size: 26rpx;
  }

  .grid {
    display: flex;
    flex-wrap: wrap;
  }

  .stat {
    width: 25%;
    text-align: center;
  }

  .stat-num {
    font-size: 30rpx;
    font-weight: 600;
    margin-bottom: 8rpx;
  }

  .form {
    margin-top: 16rpx;
  }

  .textarea {
    width: 100%;
    height: 160rpx;
    padding: 16rpx;
    background: $bg;
    border-radius: $radius;
    box-sizing: border-box;
  }

  .input {
    height: 80rpx;
    padding: 0 24rpx;
    background: $bg;
    border-radius: $radius;
    margin-top: 16rpx;
  }

  .picker-row {
    display: flex;
    gap: 16rpx;
    margin-top: 16rpx;
  }

  .picker {
    height: 80rpx;
    line-height: 80rpx;
    padding: 0 24rpx;
    background: $bg;
    border-radius: $radius;
  }

  .picker-input {
    flex: 1;
    height: 80rpx;
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

  .timeline {
    display: flex;
    gap: 16rpx;
    padding: 20rpx 0;
  }

  .dot {
    width: 16rpx;
    height: 16rpx;
    border-radius: 50%;
    background: $brand;
    margin-top: 8rpx;
    flex-shrink: 0;
  }

  .timeline-body {
    flex: 1;
  }

  .summary {
    font-size: 28rpx;
    margin-top: 8rpx;
  }
</style>
