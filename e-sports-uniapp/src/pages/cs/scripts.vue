<template>
  <view>
    <view class="card">
      <view class="row">
        <text class="section-title" style="margin-bottom: 0">话术库</text>
        <text class="link" @click="creating = !creating">{{ creating ? '收起' : '新增话术' }}</text>
      </view>

      <view v-if="creating" class="form">
        <input v-model="form.title" class="input" placeholder="标题（必填，≤120字）" />
        <input v-model="form.category" class="input" placeholder="分类（选填，≤60字）" />
        <textarea v-model="form.content" class="textarea" placeholder="话术内容（必填，≤2000字）" />
        <button class="primary" :loading="saving" @click="submit">保存话术</button>
      </view>
    </view>

    <view v-if="scripts.length === 0" class="empty">暂无话术</view>
    <view v-for="item in scripts" :key="item.id" class="card script">
      <view class="row">
        <text class="title">{{ item.title }}</text>
        <text class="status" :class="{ off: item.status === 'disabled' }">
          {{ item.status === 'enabled' ? '启用' : '禁用' }}
        </text>
      </view>
      <view v-if="item.category" class="muted">{{ item.category }}</view>
      <view class="content">{{ item.content }}</view>
      <view class="actions">
        <button
          class="mini"
          :class="item.status === 'enabled' ? 'plain' : 'success'"
          :loading="actingId === item.id"
          @click="toggle(item)"
        >
          {{ item.status === 'enabled' ? '停用' : '启用' }}
        </button>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
  import { onShow } from '@dcloudio/uni-app';
  import { reactive, ref } from 'vue';
  import { createScript, fetchScripts, setScriptStatus } from '../../api/cs';
  import type { CsScript } from '../../api/cs';

  const scripts = ref<CsScript[]>([]);
  const creating = ref(false);
  const saving = ref(false);
  const actingId = ref(0);
  const form = reactive({ title: '', category: '', content: '' });

  async function load() {
    try {
      scripts.value = (await fetchScripts()) || [];
    } catch {
      scripts.value = [];
    }
  }

  async function submit() {
    if (!form.title.trim() || !form.content.trim()) {
      uni.showToast({ title: '请填写标题与内容', icon: 'none' });
      return;
    }
    saving.value = true;
    try {
      await createScript({
        title: form.title.trim(),
        category: form.category.trim(),
        content: form.content.trim(),
      });
      uni.showToast({ title: '已保存', icon: 'success' });
      form.title = '';
      form.category = '';
      form.content = '';
      creating.value = false;
      await load();
    } catch {
      // csRequest 层已提示。
    } finally {
      saving.value = false;
    }
  }

  async function toggle(item: CsScript) {
    const next = item.status === 'enabled' ? 'disabled' : 'enabled';
    actingId.value = item.id;
    try {
      await setScriptStatus(item.id, next, item.version);
      uni.showToast({ title: next === 'enabled' ? '已启用' : '已停用', icon: 'none' });
      await load();
    } catch {
      // csRequest 层已提示。
    } finally {
      actingId.value = 0;
    }
  }

  onShow(load);
</script>

<style scoped lang="scss">
  .section-title {
    font-size: 30rpx;
    font-weight: 600;
  }

  .link {
    color: $brand;
    font-size: 26rpx;
  }

  .form {
    margin-top: 16rpx;
  }

  .input {
    height: 80rpx;
    padding: 0 24rpx;
    background: $bg;
    border-radius: $radius;
    margin-top: 16rpx;
  }

  .textarea {
    width: 100%;
    height: 200rpx;
    padding: 16rpx;
    background: $bg;
    border-radius: $radius;
    box-sizing: border-box;
    margin-top: 16rpx;
  }

  .primary {
    margin-top: 24rpx;
    background: $brand;
    color: #fff;
    border-radius: $radius;
  }

  .title {
    font-weight: 600;
  }

  .status {
    color: $success;
    font-size: 26rpx;
  }

  .status.off {
    color: $text-3;
  }

  .content {
    margin-top: 8rpx;
    font-size: 26rpx;
    color: $text-2;
    white-space: pre-wrap;
  }

  .actions {
    display: flex;
    margin-top: 16rpx;
  }

  .mini {
    font-size: 24rpx;
    padding: 0 24rpx;
    line-height: 56rpx;
    border-radius: 28rpx;
  }

  .success {
    background: $success;
    color: #fff;
  }

  .plain {
    background: #fff;
    color: $text-2;
    border: 1rpx solid $border;
  }
</style>
