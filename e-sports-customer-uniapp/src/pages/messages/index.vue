<template>
  <view>
    <view class="card head">
      <view class="head-main">
        <text class="head-title">我的消息</text>
        <text class="muted">{{ unreadCount ? `${unreadCount} 条未读` : '全部已读' }}</text>
      </view>
      <view class="head-actions">
        <text class="action" @click="reload">刷新</text>
        <text v-if="unreadCount" class="action" @click="markAll">全部已读</text>
      </view>
    </view>

    <view class="card">
      <view v-if="loading && items.length === 0" class="empty">加载中…</view>
      <view v-else-if="items.length === 0" class="empty" @click="failed && reload()">
        {{ failed ? '加载失败，点击重试' : '暂无消息' }}
      </view>

      <view
        v-for="item in items"
        :key="item.id"
        class="msg"
        :class="{ unread: isUnread(item) }"
        @click="openMsg(item)"
      >
        <view class="msg-head">
          <view class="msg-title-wrap">
            <text v-if="isUnread(item)" class="dot" />
            <text class="msg-title">{{ item.title || '通知' }}</text>
          </view>
          <text class="muted">{{ datetime(item.created_at) }}</text>
        </view>
        <view v-if="item.summary" class="msg-summary">{{ item.summary }}</view>
      </view>

      <view v-if="items.length > 0" class="footer muted">{{ footerText }}</view>
    </view>
  </view>
</template>

<script setup lang="ts">
  import { onReachBottom, onShow } from '@dcloudio/uni-app';
  import { computed, ref } from 'vue';
  import {
    fetchMyMessages,
    markMyMessagesRead,
  } from '../../api/esports';
  import type { EsportsMessage, MessageListParams } from '../../api/esports';
  import { datetime } from '../../utils/format';

  const PAGE_SIZE = 30;

  const items = ref<EsportsMessage[]>([]);
  const loading = ref(false);
  const loadingMore = ref(false);
  const marking = ref(false);
  const failed = ref(false);
  const hasMore = ref(true);

  const isUnread = (msg: EsportsMessage) => !msg.read_at;
  const unreadCount = computed(() => items.value.filter(isUnread).length);
  const footerText = computed(() => {
    if (loadingMore.value) return '加载中…';
    return hasMore.value ? '上拉加载更多' : '没有更多了';
  });

  /** 当前已加载列表中的最小 id，作为下一页的 before_id 游标。 */
  function oldestId(): number {
    return items.value.reduce((min, msg) => (min === 0 || msg.id < min ? msg.id : min), 0);
  }

  // 用户端固定走客户消息接口，不再探测陪玩身份。
  function fetchMessages(params: MessageListParams) {
    return fetchMyMessages(params);
  }

  function markMessages(ids: number[]) {
    return markMyMessagesRead(ids);
  }

  /** 本地置为已读，避免标记成功后重新拉列表。 */
  function applyRead(ids: number[]) {
    const set = new Set(ids);
    const now = new Date().toISOString();
    items.value = items.value.map((msg) =>
      set.has(msg.id) && !msg.read_at ? { ...msg, read_at: now } : msg
    );
  }

  async function load() {
    if (loading.value) return;
    loading.value = true;
    failed.value = false;
    try {
      const list = (await fetchMessages({ limit: PAGE_SIZE })) || [];
      items.value = list;
      hasMore.value = list.length >= PAGE_SIZE;
    } catch {
      // request 层已统一 toast，这里只记录状态供空态提示。
      failed.value = true;
    } finally {
      loading.value = false;
    }
  }

  async function loadMore() {
    if (loading.value || loadingMore.value || !hasMore.value) return;
    const before = oldestId();
    if (!before) return;
    loadingMore.value = true;
    try {
      const list = (await fetchMessages({ limit: PAGE_SIZE, before_id: before })) || [];
      const seen = new Set(items.value.map((msg) => msg.id));
      items.value = items.value.concat(list.filter((msg) => !seen.has(msg.id)));
      hasMore.value = list.length >= PAGE_SIZE;
    } catch {
      // request 层已统一 toast。
    } finally {
      loadingMore.value = false;
    }
  }

  /** 下拉/按钮刷新：重新拉第一页。 */
  function reload() {
    if (loading.value) return;
    hasMore.value = true;
    load();
  }

  async function openMsg(msg: EsportsMessage) {
    if (!isUnread(msg) || marking.value) return;
    marking.value = true;
    try {
      await markMessages([msg.id]);
      applyRead([msg.id]);
    } catch {
      // request 层已统一 toast。
    } finally {
      marking.value = false;
    }
  }

  async function markAll() {
    const ids = items.value.filter(isUnread).map((msg) => msg.id);
    if (ids.length === 0 || marking.value) return;
    marking.value = true;
    try {
      await markMessages(ids);
      applyRead(ids);
      uni.showToast({ title: '已全部标为已读', icon: 'none' });
    } catch {
      // request 层已统一 toast。
    } finally {
      marking.value = false;
    }
  }

  onShow(load);
  onReachBottom(loadMore);
</script>

<style scoped lang="scss">
  .head {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .head-main {
    display: flex;
    flex-direction: column;
    gap: 6rpx;
  }

  .head-title {
    font-size: 32rpx;
    font-weight: 600;
    color: $text-1;
  }

  .head-actions {
    display: flex;
    align-items: center;
    gap: 24rpx;
  }

  .action {
    font-size: 26rpx;
    color: $brand;
  }

  .msg {
    padding: 24rpx 0;
  }

  .msg + .msg {
    border-top: 1rpx solid $border;
  }

  .msg-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16rpx;
  }

  .msg-title-wrap {
    display: flex;
    align-items: center;
    gap: 10rpx;
    flex: 1;
    min-width: 0;
  }

  .dot {
    width: 12rpx;
    height: 12rpx;
    border-radius: 50%;
    background: $danger;
    flex-shrink: 0;
  }

  .msg-title {
    font-size: 28rpx;
    color: $text-2;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
  }

  .msg.unread .msg-title {
    font-weight: 600;
    color: $text-1;
  }

  .msg-summary {
    margin-top: 8rpx;
    font-size: 26rpx;
    color: $text-3;
    line-height: 1.6;
  }

  .msg.unread .msg-summary {
    color: $text-2;
  }

  .footer {
    padding: 24rpx 0 8rpx;
    text-align: center;
  }
</style>
