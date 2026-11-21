// 消息列表共用逻辑（客服 / 客户 / 陪玩三端同一份实现）。
// 分页协议按端区分：客服端是 page + page_size + total，客户/陪玩端是 before_id 游标。
// 差异全部通过 options 注入，页面只保留模板、实时订阅与生命周期钩子。

import { computed, shallowRef, ref } from 'vue';
import {
  onRealtime,
  onRealtimeReconnect,
  realtimeUnread,
  updateRealtimeUnread,
} from '../api/realtime';

export interface PagedMessage {
  id: number;
  read_at?: string | null;
}

export interface PagedMessagesOptions<T extends PagedMessage> {
  fetchPage: (query: { beforeId?: number; page: number }) => Promise<{ items: T[]; total?: number }>;
  markRead: (ids: number[]) => Promise<unknown>;
  pageSize?: number;
  mode?: 'cursor' | 'page';
  /** 全部已读走独立接口时提供（客服端 read-all）；缺省对本页未读逐条 markRead。 */
  markAll?: () => Promise<unknown>;
  /** 未读数来源；缺省统计已加载列表，客服端传入实时通道下发的服务端未读数。 */
  countUnread?: () => number;
  /** 已读后的未读角标校正；all=true 表示本次走的是全部已读。 */
  onRead?: (ids: number[], all: boolean) => void;
}

export function usePagedMessages<T extends PagedMessage>(options: PagedMessagesOptions<T>) {
  const PAGE_SIZE = options.pageSize ?? 30;

  // 每次都整表替换，用 shallowRef 避免深层代理开销。
  const items = shallowRef<T[]>([]);
  const loading = ref(false);
  const loadingMore = ref(false);
  const marking = ref(false);
  const failed = ref(false);
  const hasMore = ref(true);
  /** 页面是否在前台：只有前台才在收到推送时重拉列表。 */
  const visible = ref(false);
  let page = 1;

  const isUnread = (msg: T) => !msg.read_at;
  const finished = computed(() => !hasMore.value);
  const unreadCount = computed(() =>
    options.countUnread ? options.countUnread() : items.value.filter(isUnread).length
  );
  const footerText = computed(() => {
    if (loadingMore.value) return '加载中…';
    return hasMore.value ? '上拉加载更多' : '没有更多了';
  });

  /** 当前已加载列表中的最小 id，作为下一页的 before_id 游标。 */
  function oldestId(): number {
    return items.value.reduce((min, msg) => (min === 0 || msg.id < min ? msg.id : min), 0);
  }

  /** 本地置为已读，避免标记成功后重新拉列表。 */
  function applyLocalRead(ids: number[]) {
    if (!ids.length) return;
    const set = new Set(ids);
    const now = new Date().toISOString();
    items.value = items.value.map((msg) =>
      set.has(msg.id) && !msg.read_at ? ({ ...msg, read_at: now } as T) : msg
    );
  }

  /** 红点跟随服务端未读数：默认按本次标记的条数做减法，客服端按服务端全量清零另配。 */
  function notifyRead(ids: number[], all: boolean) {
    if (options.onRead) {
      options.onRead(ids, all);
      return;
    }
    updateRealtimeUnread(realtimeUnread.value - ids.length);
  }

  async function load() {
    if (loading.value) return;
    loading.value = true;
    failed.value = false;
    try {
      const result = await options.fetchPage({ page: 1 });
      items.value = result?.items || [];
      page = 1;
      hasMore.value =
        options.mode === 'page'
          ? items.value.length < (result?.total ?? 0)
          : items.value.length >= PAGE_SIZE;
    } catch {
      // request 层已统一 toast，这里只记录状态供空态提示。
      failed.value = true;
    } finally {
      loading.value = false;
    }
  }

  async function loadMore() {
    if (loading.value || loadingMore.value || !hasMore.value) return;
    const beforeId = options.mode === 'page' ? 0 : oldestId();
    if (options.mode !== 'page' && !beforeId) return;
    loadingMore.value = true;
    try {
      const nextPage = page + 1;
      const result =
        options.mode === 'page'
          ? await options.fetchPage({ page: nextPage })
          : await options.fetchPage({ beforeId, page: nextPage });
      const list = result?.items || [];
      const seen = new Set(items.value.map((msg) => msg.id));
      items.value = items.value.concat(list.filter((msg) => !seen.has(msg.id)));
      page = nextPage;
      hasMore.value =
        options.mode === 'page'
          ? items.value.length < (result?.total ?? 0)
          : list.length >= PAGE_SIZE;
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

  async function openMessage(msg: T) {
    if (!isUnread(msg) || marking.value) return;
    marking.value = true;
    try {
      await options.markRead([msg.id]);
      applyLocalRead([msg.id]);
      notifyRead([msg.id], false);
    } catch {
      // request 层已统一 toast。
    } finally {
      marking.value = false;
    }
  }

  async function markAllRead() {
    if (marking.value) return;
    const ids = items.value.filter(isUnread).map((msg) => msg.id);
    // 有独立 read-all 接口时不受已加载列表限制；否则本页没有未读就不必请求。
    if (!options.markAll && ids.length === 0) return;
    marking.value = true;
    try {
      if (options.markAll) {
        await options.markAll();
      } else {
        await options.markRead(ids);
      }
      applyLocalRead(ids);
      notifyRead(ids, true);
      uni.showToast({ title: '已全部标为已读', icon: 'none' });
    } catch {
      // request 层已统一 toast。
    } finally {
      marking.value = false;
    }
  }

  /** 页面可见性：仅前台时收到推送才重拉。 */
  function setVisible(value: boolean) {
    visible.value = value;
  }

  /**
   * 实时通道：前台收到新消息直接重拉；断线恢复后同样补拉（离线期间的消息本来就在库里）。
   * 返回取消订阅函数，供页面 onUnload 调用。
   */
  function bindRealtime(): () => void {
    const offMessage = onRealtime('message.created', () => {
      if (visible.value) reload();
    });
    const offReconnect = onRealtimeReconnect(() => {
      if (visible.value) reload();
    });
    return () => {
      offMessage();
      offReconnect();
    };
  }

  return {
    items,
    loading,
    loadingMore,
    marking,
    failed,
    hasMore,
    finished,
    visible,
    unreadCount,
    footerText,
    isUnread,
    applyLocalRead,
    load,
    loadMore,
    reload,
    openMessage,
    markAllRead,
    setVisible,
    bindRealtime,
  };
}
