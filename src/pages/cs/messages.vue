<template>
  <view>
    <view class="card head">
      <view class="head-main">
        <text class="head-title">消息中心</text>
        <text class="muted">{{ unread ? `${unread} 条未读` : '全部已读' }}</text>
      </view>
      <view class="head-actions">
        <text class="action" @click="reload">刷新</text>
        <text v-if="unread" class="action" @click="markAll">全部已读</text>
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
        <view v-if="summaryOf(item)" class="msg-summary">{{ summaryOf(item) }}</view>
      </view>

      <view v-if="items.length > 0" class="footer muted">{{ footerText }}</view>
    </view>
  </view>
</template>

<script setup lang="ts">
  import { onHide, onReachBottom, onShow, onUnload } from '@dcloudio/uni-app';
  import { computed, ref } from 'vue';
  import {
    fetchCsMessages,
    markAllCsMessagesRead,
    markCsMessagesRead,
  } from '../../api/cs';
  import type { CsMessage } from '../../api/cs';
  import {
    onRealtime,
    onRealtimeReconnect,
    realtimeUnread,
    updateRealtimeUnread,
  } from '../../api/realtime';
  import { datetime } from '../../utils/format';

  const PAGE_SIZE = 30;
  const SUMMARY_RUNES = 120;

  const items = ref<CsMessage[]>([]);
  const loading = ref(false);
  const loadingMore = ref(false);
  const marking = ref(false);
  const failed = ref(false);
  const hasMore = ref(true);
  const page = ref(1);
  /** 页面是否在前台：只有前台才在收到推送时重拉列表。 */
  const visible = ref(false);
  // 未读总数由服务端下发（含广播消息之外的本人消息），比只统计当前页更准。
  const unread = realtimeUnread;

  const isUnread = (msg: CsMessage) => !msg.read_at;
  const footerText = computed(() => {
    if (loadingMore.value) return '加载中…';
    return hasMore.value ? '上拉加载更多' : '没有更多了';
  });

  /** 消息正文只展示前若干字，完整内容仍在服务端。 */
  function summaryOf(msg: CsMessage): string {
    const content = (msg.content || '').trim();
    if (content.length <= SUMMARY_RUNES) return content;
    return `${content.slice(0, SUMMARY_RUNES)}…`;
  }

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
      const result = await fetchCsMessages({ page: 1, page_size: PAGE_SIZE });
      items.value = result?.data || [];
      page.value = 1;
      hasMore.value = items.value.length < (result?.total ?? 0);
    } catch {
      // csRequest 层已统一 toast，这里只记录状态供空态提示。
      failed.value = true;
    } finally {
      loading.value = false;
    }
  }

  async function loadMore() {
    if (loading.value || loadingMore.value || !hasMore.value) return;
    loadingMore.value = true;
    try {
      const nextPage = page.value + 1;
      const result = await fetchCsMessages({ page: nextPage, page_size: PAGE_SIZE });
      const seen = new Set(items.value.map((msg) => msg.id));
      items.value = items.value.concat((result?.data || []).filter((msg) => !seen.has(msg.id)));
      page.value = nextPage;
      hasMore.value = items.value.length < (result?.total ?? items.value.length);
    } catch {
      // csRequest 层已统一 toast。
    } finally {
      loadingMore.value = false;
    }
  }

  function reload() {
    if (loading.value) return;
    hasMore.value = true;
    load();
  }

  async function openMsg(msg: CsMessage) {
    if (!isUnread(msg) || marking.value) return;
    marking.value = true;
    try {
      await markCsMessagesRead([msg.id]);
      applyRead([msg.id]);
      updateRealtimeUnread(realtimeUnread.value - 1);
    } catch {
      // csRequest 层已统一 toast。
    } finally {
      marking.value = false;
    }
  }

  async function markAll() {
    if (marking.value) return;
    marking.value = true;
    try {
      await markAllCsMessagesRead();
      applyRead(items.value.filter(isUnread).map((msg) => msg.id));
      updateRealtimeUnread(0);
      uni.showToast({ title: '已全部标为已读', icon: 'none' });
    } catch {
      // csRequest 层已统一 toast。
    } finally {
      marking.value = false;
    }
  }

  // 实时通道：前台收到新消息直接重拉；断线恢复后同样补拉（离线期间的消息本来就在库里）。
  const offMessage = onRealtime('message.created', () => {
    if (visible.value) reload();
  });
  const offReconnect = onRealtimeReconnect(() => {
    if (visible.value) reload();
  });

  onShow(() => {
    visible.value = true;
    load();
  });
  onHide(() => {
    visible.value = false;
  });
  onUnload(() => {
    offMessage();
    offReconnect();
  });
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
