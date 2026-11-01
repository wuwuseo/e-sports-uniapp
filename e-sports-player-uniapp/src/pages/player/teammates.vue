<template>
  <view>
    <view class="card">
      <view class="section-title">添加固排</view>
      <view class="field">
        <input v-model="keyword" class="input" placeholder="输入陪玩昵称搜索" confirm-type="search" @confirm="search" />
        <button class="search-btn" size="mini" @click="search">搜索</button>
      </view>
      <view v-if="candidates.length" class="candidates">
        <view v-for="c in candidates" :key="c.id" class="candidate">
          <view class="row">
            <text class="name">{{ c.display_name }}</text>
            <text class="muted">{{ qualificationText(c.qualification) }}</text>
          </view>
          <view class="muted">等级 {{ levelText(c.level) }}</view>
          <button
            class="mini primary"
            :disabled="picked?.id === c.id"
            @click="picked = c"
          >
            {{ picked?.id === c.id ? '已选' : '选择' }}
          </button>
        </view>
      </view>
      <view v-if="picked" class="picked">
        <view class="field">
          <text class="label">游戏分区</text>
          <input v-model="game" class="input" placeholder="如：王者 / 和平精英" />
        </view>
        <button class="primary" :loading="sending" @click="send">发起固排邀请</button>
      </view>
    </view>

    <view class="card">
      <view class="section-title">待处理邀请</view>
      <view v-if="requests.length === 0" class="muted">暂无待确认的邀请</view>
      <view v-for="item in requests" :key="item.id" class="item">
        <view class="row">
          <text class="name">{{ item.teammate_name }}</text>
          <text class="muted">{{ item.game }}</text>
        </view>
        <view class="actions">
          <button class="mini success" @click="accept(item)">接受</button>
          <button class="mini danger" @click="decline(item)">拒绝</button>
        </view>
      </view>
    </view>

    <view class="card">
      <view class="section-title">我的固排</view>
      <view v-if="teammates.length === 0" class="muted">暂无固排队友</view>
      <view v-for="item in teammates" :key="item.id" class="item">
        <view class="row">
          <text class="name">{{ item.teammate_name }}</text>
          <text class="presence" :class="item.teammate_presence === 'online' ? 'on' : 'off'">
            {{ presenceText(item.teammate_presence) }}
          </text>
        </view>
        <view class="muted">等级 {{ levelText(item.teammate_level) }} · {{ item.game }}</view>
        <button class="mini danger" @click="dissolve(item)">解除固排</button>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
  import { onShow } from '@dcloudio/uni-app';
  import { ref } from 'vue';
  import {
    acceptTeammateRequest,
    declineTeammateRequest,
    dissolveTeammate,
    fetchTeammateRequests,
    fetchTeammates,
    requestTeammate,
    searchPlayerCandidates,
  } from '../../api/player';
  import type { PlayerCandidate, Teammate } from '../../api/player';
  import { idempotencyKey } from '../../utils/format';

  import { skillLevelText } from '../../utils/levels';
  const teammates = ref<Teammate[]>([]);
  const requests = ref<Teammate[]>([]);
  const candidates = ref<PlayerCandidate[]>([]);
  const picked = ref<PlayerCandidate | null>(null);
  const keyword = ref('');
  const game = ref('');
  const sending = ref(false);

  async function load() {
    try {
      teammates.value = (await fetchTeammates()) || [];
    } catch {
      teammates.value = [];
    }
    try {
      requests.value = (await fetchTeammateRequests()) || [];
    } catch {
      requests.value = [];
    }
  }

  async function search() {
    if (!keyword.value.trim()) {
      uni.showToast({ title: '请输入昵称', icon: 'none' });
      return;
    }
    try {
      candidates.value = (await searchPlayerCandidates(keyword.value.trim())) || [];
      if (candidates.value.length === 0) {
        uni.showToast({ title: '未找到匹配陪玩', icon: 'none' });
      }
    } catch {
      candidates.value = [];
    }
  }

  async function send() {
    if (!picked.value) return;
    if (!game.value.trim()) {
      uni.showToast({ title: '请填写游戏分区', icon: 'none' });
      return;
    }
    sending.value = true;
    try {
      await requestTeammate(picked.value.id, game.value.trim(), idempotencyKey('tm'));
      uni.showToast({ title: '邀请已发出', icon: 'success' });
      picked.value = null;
      game.value = '';
      keyword.value = '';
      candidates.value = [];
      load();
    } catch {
      // request 层已提示。
    } finally {
      sending.value = false;
    }
  }

  async function accept(item: Teammate) {
    try {
      await acceptTeammateRequest(item.id);
      uni.showToast({ title: '已接受', icon: 'success' });
      load();
    } catch {
      // request 层已提示。
    }
  }

  async function decline(item: Teammate) {
    try {
      await declineTeammateRequest(item.id);
      uni.showToast({ title: '已拒绝', icon: 'none' });
      load();
    } catch {
      // request 层已提示。
    }
  }

  async function dissolve(item: Teammate) {
    const res = await new Promise<{ confirm: boolean }>((resolve) => {
      uni.showModal({
        title: '解除固排',
        content: `确定解除与 ${item.teammate_name} 的固排关系吗？`,
        success: (r) => resolve({ confirm: r.confirm }),
        fail: () => resolve({ confirm: false }),
      });
    });
    if (!res.confirm) return;
    try {
      await dissolveTeammate(item.id);
      uni.showToast({ title: '已解除', icon: 'none' });
      load();
    } catch {
      // request 层已提示。
    }
  }

  // 技能等级文案走系统配置，App 启动时已拉取。
  const levelText = (level: string) => skillLevelText(level) || '未定级';

  const qualificationText = (q: string) =>
    (
      ({
        pending: '待考核',
        qualified: '已开通接单',
        suspended: '已暂停接单',
      }) as Record<string, string>
    )[q] || q || '未知';

  const presenceText = (presence: string) =>
    presence === 'online' ? '在线' : '离线';

  onShow(load);
</script>

<style scoped lang="scss">
  .section-title {
    font-size: 30rpx;
    font-weight: 600;
    margin-bottom: 16rpx;
  }

  .field {
    display: flex;
    align-items: center;
    gap: 12rpx;
    margin-bottom: 20rpx;
  }

  .input {
    flex: 1;
    height: 80rpx;
    padding: 0 20rpx;
    background: $bg;
    border-radius: $radius;
  }

  .label {
    display: block;
    color: $text-2;
    margin-bottom: 12rpx;
  }

  .candidate {
    padding: 16rpx 0;
    border-bottom: 1rpx solid $border;
  }

  .name {
    font-weight: 600;
  }

  .picked {
    margin-top: 12rpx;
  }

  .item {
    padding: 20rpx 0;
    border-bottom: 1rpx solid $border;
  }

  .item:last-child {
    border-bottom: none;
  }

  .presence {
    font-size: 24rpx;
  }

  .presence.on {
    color: $success;
  }

  .presence.off {
    color: $text-3;
  }

  .actions {
    display: flex;
    gap: 16rpx;
    margin-top: 12rpx;
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
    border-radius: $radius;
  }

  .success {
    background: $success;
    color: #fff;
  }

  .danger {
    background: #fff;
    color: $danger;
    border: 1rpx solid $danger;
  }
</style>
