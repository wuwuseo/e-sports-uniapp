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
  import { usePagedMessages } from '@esports/shared/composables/usePagedMessages';
  import {
    fetchCsMessages,
    markAllCsMessagesRead,
    markCsMessagesRead,
  } from '../../api/cs';
  import type { CsMessage } from '../../api/cs';
  import { realtimeUnread, updateRealtimeUnread } from '../../api/realtime';
  import { datetime } from '../../utils/format';

  const PAGE_SIZE = 30;
  const SUMMARY_RUNES = 120;

  const {
    items,
    loading,
    failed,
    unreadCount,
    footerText,
    isUnread,
    load,
    loadMore,
    reload,
    openMessage,
    markAllRead,
    setVisible,
    bindRealtime,
  } = usePagedMessages<CsMessage>({
    mode: 'page',
    pageSize: PAGE_SIZE,
    fetchPage: async ({ page }) => {
      const result = await fetchCsMessages({ page, page_size: PAGE_SIZE });
      return { items: result?.data || [], total: result?.total ?? 0 };
    },
    markRead: markCsMessagesRead,
    // 管理端有 read-all 接口，一次清空服务端未读，比逐条提交加载过的 id 更完整。
    markAll: () => markAllCsMessagesRead(),
    // 未读总数由服务端下发（含广播消息之外的本人消息），比只统计当前页更准。
    countUnread: () => realtimeUnread.value,
    onRead: (ids, all) => updateRealtimeUnread(all ? 0 : realtimeUnread.value - ids.length),
  });

  // 模板沿用原变量名，减少改动面。
  const unread = unreadCount;
  const openMsg = openMessage;
  const markAll = markAllRead;

  /** 消息正文只展示前若干字，完整内容仍在服务端。 */
  function summaryOf(msg: CsMessage): string {
    const content = (msg.content || '').trim();
    if (content.length <= SUMMARY_RUNES) return content;
    return `${content.slice(0, SUMMARY_RUNES)}…`;
  }

  const stopRealtime = bindRealtime();

  onShow(() => {
    setVisible(true);
    load();
  });
  onHide(() => setVisible(false));
  onUnload(stopRealtime);
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
