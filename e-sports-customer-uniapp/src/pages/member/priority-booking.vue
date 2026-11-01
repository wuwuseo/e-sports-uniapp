<template>
  <view>
    <view class="card tip muted">
      优先预约是会员权益：选择陪玩与期望时段提交意向后，由客服确认时段并为你报单，意向不等于已下单。
    </view>

    <view v-if="!enabled" class="card notice">
      当前会员等级未开通优先预约权益，如需预约请联系你的归属客服。
    </view>

    <template v-else>
      <view class="card">
        <view class="section-title">选择陪玩</view>
        <view v-if="loadingPlayers" class="muted">正在读取陪玩列表…</view>
        <view v-else-if="players.length === 0" class="muted">暂无可预约的陪玩</view>
        <view
          v-for="p in players"
          :key="p.id"
          class="player"
          :class="{ active: playerId === p.id }"
          @click="pickPlayer(p.id)"
        >
          <view class="row">
            <text class="name">{{ p.display_name }}</text>
            <text class="muted">{{ levelText(p.level) }}</text>
          </view>
          <view class="muted">
            {{ (p.games || []).join(' / ') || '不限游戏' }} ·
            {{ p.bookable ? '当前可接单' : '当前不可接单' }}
          </view>
        </view>
      </view>

      <view v-if="playerId" class="card">
        <view class="section-title">选择期望时段</view>
        <view class="muted">
          按 {{ slotMinutes }} 分钟粒度展示未来 {{ rangeDays }} 天档期，仅可点选未被占用的时段。
        </view>
        <view v-if="loadingSlots" class="muted">正在读取档期…</view>
        <view v-else-if="slots.length === 0" class="muted">该陪玩近期暂无可预约时段</view>
        <view class="slots">
          <view
            v-for="slot in slots"
            :key="slot.start"
            class="slot"
            :class="{ active: startAt === slot.start }"
            @click="startAt = slot.start"
          >
            {{ datetime(slot.start) }}
          </view>
        </view>
      </view>

      <view v-if="playerId" class="card">
        <view class="section-title">备注</view>
        <textarea
          v-model="note"
          class="textarea"
          maxlength="500"
          placeholder="希望的服务内容 / 特殊要求（选填）"
        />
        <button class="primary" :loading="submitting" :disabled="!startAt || submitting" @click="submit">
          提交优先预约
        </button>
        <view class="muted">提交后由客服确认时段并报单；如需取消请联系客服。</view>
      </view>
    </template>
  </view>
</template>

<script setup lang="ts">
  import { onLoad } from '@dcloudio/uni-app';
  import { ref } from 'vue';
  import {
    createPriorityBooking,
    fetchPlayerAvailability,
    fetchProfile,
    fetchRecommendedPlayers,
  } from '../../api/esports';
  import type { PlayerAvailabilitySlot, RecommendedPlayer } from '../../api/esports';
  import { datetime } from '../../utils/format';

  import { skillLevelText } from '../../utils/levels';
  // 会员优先预约：入口由 GET /user/profile 的 priority_booking_enabled 控制显隐；
  // 提交前先用 GET /user/player/players/:id/availability 看档期，避免选到已占用时段。
  const enabled = ref(false);
  const players = ref<RecommendedPlayer[]>([]);
  const loadingPlayers = ref(false);
  const playerId = ref(0);
  const slots = ref<PlayerAvailabilitySlot[]>([]);
  const loadingSlots = ref(false);
  const startAt = ref('');
  const note = ref('');
  const submitting = ref(false);

  const slotMinutes = 60;
  const rangeDays = 3;

  async function loadProfile() {
    try {
      const profile = await fetchProfile();
      enabled.value = profile?.priority_booking_enabled === true;
    } catch {
      enabled.value = false;
    }
  }

  async function loadPlayers() {
    loadingPlayers.value = true;
    try {
      players.value = (await fetchRecommendedPlayers({ limit: 30 })) || [];
    } catch {
      players.value = [];
    } finally {
      loadingPlayers.value = false;
    }
  }

  async function pickPlayer(id: number) {
    playerId.value = id;
    startAt.value = '';
    slots.value = [];
    loadingSlots.value = true;
    try {
      const from = new Date();
      const to = new Date(from.getTime() + rangeDays * 24 * 60 * 60 * 1000);
      const view = await fetchPlayerAvailability(id, {
        from: from.toISOString(),
        to: to.toISOString(),
        slot_minutes: slotMinutes,
      });
      // 只展示可预约时段，最多 24 个，避免一次刷出上百个按钮。
      slots.value = (view?.slots || []).filter((slot) => slot.bookable).slice(0, 24);
    } catch {
      slots.value = [];
    } finally {
      loadingSlots.value = false;
    }
  }

  async function submit() {
    if (!playerId.value || !startAt.value) {
      uni.showToast({ title: '请选择陪玩与期望时段', icon: 'none' });
      return;
    }
    submitting.value = true;
    try {
      await createPriorityBooking({
        player_id: playerId.value,
        // 服务端按 RFC3339 解析并校验须为未来时间。
        requested_start_at: new Date(startAt.value).toISOString(),
        note: note.value.trim(),
      });
      uni.showToast({ title: '已提交预约意向', icon: 'success' });
      startAt.value = '';
      note.value = '';
    } catch {
      // 权益未开通 / 时段已过期等由 request 层提示后端中文文案。
    } finally {
      submitting.value = false;
    }
  }

  // 技能等级文案走系统配置，App 启动时已拉取。
  const levelText = (level: string) => skillLevelText(level) || '未定级';

  onLoad(async () => {
    await loadProfile();
    if (enabled.value) await loadPlayers();
  });
</script>

<style scoped lang="scss">
  .tip {
    padding: 16rpx 24rpx;
  }

  .notice {
    color: $danger;
  }

  .section-title {
    font-size: 30rpx;
    font-weight: 600;
    margin-bottom: 12rpx;
  }

  .player {
    padding: 16rpx 0;
    border-bottom: 1rpx solid $border;
  }

  .player:last-child {
    border-bottom: none;
  }

  .player.active .name {
    color: $brand;
  }

  .name {
    font-weight: 600;
  }

  .slots {
    display: flex;
    flex-wrap: wrap;
    gap: 16rpx;
    margin-top: 16rpx;
  }

  .slot {
    padding: 12rpx 20rpx;
    border: 1rpx solid $border;
    border-radius: $radius;
    font-size: 26rpx;
    color: $text-2;
  }

  .slot.active {
    border-color: $brand;
    color: $brand;
    background: #eef3ff;
  }

  .textarea {
    height: 160rpx;
    width: 100%;
    padding: 16rpx 20rpx;
    background: $bg;
    border-radius: $radius;
    box-sizing: border-box;
    margin: 16rpx 0;
  }

  .primary {
    background: $brand;
    color: #fff;
    border-radius: $radius;
  }
</style>
