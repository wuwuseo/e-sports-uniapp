<template>
  <view>
    <view class="card entry">
      <view class="row" @click="goAppeals">
        <view>
          <text>售后申诉</text>
          <view class="muted">就本人服务的订单发起申诉并查看处理进度</view>
        </view>
        <text class="arrow">›</text>
      </view>
    </view>

    <!-- 待确认改期：客服发起提案后，需客户与每名已接单成员各自确认才生效 -->
    <view v-if="pendingProposals.length > 0" class="card proposal-card">
      <view class="section-title">待确认改期</view>
      <view v-for="item in pendingProposals" :key="item.proposal_id" class="proposal">
        <view class="row">
          <text class="order-no">{{ item.order_no || `订单 #${item.order_id}` }}</text>
          <text class="waiting">待我确认</text>
        </view>
        <view class="muted">
          原档期 {{ datetime(item.from_start_at) }} → 新档期 {{ datetime(item.to_start_at) }}
          （{{ item.to_service_duration_minutes }} 分钟）
        </view>
        <view class="muted">确认截止 {{ datetime(item.expires_at) }}</view>
        <view v-if="item.reason" class="muted">客服说明：{{ item.reason }}</view>
        <view class="muted">
          确认进度 {{ item.progress.confirmed_count }}/{{ item.progress.required_count }}
          <text v-if="item.progress.rejected_count">· 已拒绝 {{ item.progress.rejected_count }}</text>
          <text v-if="item.progress.complete">· 已齐备待生效</text>
        </view>
        <view class="actions">
          <button
            class="mini success"
            :loading="actingId === item.proposal_id"
            @click="decideProposal(item, true)"
          >
            接受改期
          </button>
          <button
            class="mini danger"
            :loading="actingId === item.proposal_id"
            @click="decideProposal(item, false)"
          >
            拒绝改期
          </button>
        </view>
      </view>
    </view>

    <view class="tabs">
      <view
        v-for="tab in tabs"
        :key="tab.key"
        class="tab"
        :class="{ active: active === tab.key }"
        @click="active = tab.key"
      >
        {{ tab.title }}
      </view>
    </view>

    <view class="card">
      <view v-if="orders.length === 0" class="empty">暂无相关订单</view>
      <view v-for="item in orders" :key="item.id" class="order">
        <view class="row">
          <text class="order-no">{{ item.order_no }}</text>
          <text class="amount">{{ money(item.payable_cents) }}</text>
        </view>
        <view class="muted">
          状态 {{ fulfillmentText(item.fulfillment_status) }} ·
          {{ item.promised_service_units }} 服务量 · {{ item.required_seats }} 席
        </view>
		<view v-if="timings[item.id]" class="muted">
		  我的服务段：{{ timings[item.id].status === 'paused' ? '已暂停' : '服务中' }} ·
		  有效 {{ Math.floor(timings[item.id].effective_seconds / 60) }} 分钟 ·
		  暂停 {{ Math.floor(timings[item.id].paused_seconds / 60) }} 分钟
		</view>
        <view class="actions">
          <button
            v-if="(item.fulfillment_status === 'accepted' || item.fulfillment_status === 'in_service') && !timings[item.id]"
            class="mini primary"
            :loading="actingId === item.id"
            @click="start(item)"
          >
            开始服务
          </button>
          <button
            v-if="timings[item.id]?.status === 'in_service'"
            class="mini plain"
            :loading="actingId === item.id"
            @click="pause(item)"
          >
            暂停
          </button>
          <button
            v-if="timings[item.id]?.status === 'paused'"
            class="mini primary"
            :loading="actingId === item.id"
            @click="resume(item)"
          >
            恢复
          </button>
          <button
            v-if="timings[item.id]?.status === 'in_service'"
            class="mini success"
            :loading="actingId === item.id"
            @click="finish(item)"
          >
            结束服务
          </button>
          <button
            v-if="item.fulfillment_status === 'accepted'"
            class="mini plain"
            :loading="actingId === item.id"
            @click="transfer(item)"
          >
            转单
          </button>
          <button
            v-if="canInviteTeam(item)"
            class="mini plain"
            :loading="teamLoadingId === item.id"
            @click="openTeam(item)"
          >
            邀请固排
          </button>
        </view>

        <view v-if="teamOrderId === item.id" class="team-panel">
          <view v-if="teamCandidates.length === 0" class="muted">
            暂无可邀请的固排候选（需本人固排、资质合格且在线）
          </view>
          <view
            v-for="c in teamCandidates"
            :key="c.player_id"
            class="team-candidate"
            @click="toggleTeam(c.player_id)"
          >
            <text :class="{ picked: teamPicked.includes(c.player_id) }">
              {{ teamPicked.includes(c.player_id) ? '✓ ' : '' }}{{ c.display_name }}
            </text>
            <text class="muted">{{ qualificationText(c.qualification) }} · {{ levelText(c.level) }}</text>
          </view>
          <view class="actions">
            <button class="mini success" :loading="teamSubmitting" @click="submitTeam(item)">
              发送邀请
            </button>
            <button class="mini plain" @click="closeTeam">取消</button>
          </view>
          <view class="muted">邀请会占用剩余空席位，被邀请人需在时限内接受。</view>
        </view>

        <view v-if="finishingId === item.id" class="evidence">
          <view class="evidence-title">服务截图凭证（已上传 {{ evidenceList.length }} 张）</view>
          <view class="thumbs">
            <view
              v-for="(ev, idx) in evidenceList"
              :key="idx"
              class="thumb-wrap"
              @click="removeEvidence(idx)"
            >
              <image :src="ev.path" class="thumb" mode="aspectFill" />
            </view>
            <view class="thumb thumb-add" @click="addEvidence">+</view>
          </view>
          <view class="muted">点击缩略图可移除；结束服务前请确认截图已上传。</view>
          <view class="evidence-actions">
            <button class="mini plain" @click="cancelFinish">取消</button>
            <button class="mini success" :loading="actingId === item.id" @click="confirmFinish">
              确认结束服务
            </button>
          </view>
        </view>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
  import { onShow } from '@dcloudio/uni-app';
  import { computed, ref, watch } from 'vue';
  import {
    confirmPlayerRescheduleProposal,
    enterPlayerMode,
    fetchPlayerOrders,
    fetchPlayerRescheduleProposals,
    fetchPlayerServiceTimings,
    fetchTeammateCandidates,
    finishService,
    inviteTeammates,
    pauseService,
    requestTransfer,
    resumeService,
    startService,
  } from '../../api/player';
  import type {
    PlayerOrder,
    PlayerServiceTiming,
    TeammateDispatchCandidate,
  } from '../../api/player';
  import type { MyRescheduleProposal } from '../../api/esports';
  import { uploadAttachment } from '../../api/upload';
  import { datetime, fulfillmentText, idempotencyKey, money } from '../../utils/format';

  import { skillLevelText } from '../../utils/levels';
  import { promptModal } from '../../utils/dialog';
  const tabs = [
    { key: 'pending_acceptance', title: '待接单' },
    { key: 'accepted', title: '已接单' },
    { key: 'in_service', title: '服务中' },
    { key: 'pending_close', title: '待结单' },
    { key: 'completed', title: '已完成' },
  ];

  const active = ref('in_service');
  const orders = ref<PlayerOrder[]>([]);
  const timings = ref<Record<number, PlayerServiceTiming>>({});
  const actingId = ref<number>(0);
  const finishingId = ref<number>(0);
  const pendingFinish = ref<{ units: number; seconds: number }>({ units: 0, seconds: 0 });
  const evidenceList = ref<Array<{ id: number; path: string }>>([]);

  async function load() {
    try {
      const [items, segments] = await Promise.all([
        fetchPlayerOrders(active.value),
        fetchPlayerServiceTimings(),
      ]);
      orders.value = items || [];
      timings.value = Object.fromEntries((segments || []).map((item) => [item.order_id, item]));
    } catch {
      orders.value = [];
      timings.value = {};
    }
    // 待确认改期与当前分页无关：单独取一次，任何分页下都能看到待我表态的提案。
    try {
      proposals.value = (await fetchPlayerRescheduleProposals()) || [];
    } catch {
      proposals.value = [];
    }
  }

  async function pause(item: PlayerOrder) {
    const { confirm, text: reason } = await promptModal(
      '暂停服务',
      '暂停原因',
      '请填写暂停原因'
    );
    if (!confirm) return;
    if (!reason) {
      uni.showToast({ title: '请填写暂停原因', icon: 'none' });
      return;
    }
    actingId.value = item.id;
    try {
      await pauseService(item.id, reason);
      uni.showToast({ title: '服务已暂停', icon: 'success' });
      await load();
    } catch {
      // request 层已提示。
    } finally {
      actingId.value = 0;
    }
  }

  async function resume(item: PlayerOrder) {
    actingId.value = item.id;
    try {
      await resumeService(item.id);
      uni.showToast({ title: '服务已恢复', icon: 'success' });
      await load();
    } catch {
      // request 层已提示。
    } finally {
      actingId.value = 0;
    }
  }

  async function start(item: PlayerOrder) {
    actingId.value = item.id;
    try {
      await startService(item.id);
      uni.showToast({ title: '已开始服务', icon: 'success' });
      load();
    } catch {
      // request 层已提示。
    } finally {
      actingId.value = 0;
    }
  }

  async function finish(item: PlayerOrder) {
    const unitsInput = await promptModal(
      '结束服务',
      '上报服务量',
      '请填写本次上报的服务量（如局数 / 时长）'
    );
    if (!unitsInput.confirm) return;
    const units = Number(unitsInput.text);
    if (!Number.isSafeInteger(units) || units <= 0) {
      uni.showToast({ title: '请填写有效的服务量', icon: 'none' });
      return;
    }
    const durationInput = await promptModal(
      '上报服务时长',
      '实际服务分钟数',
      '请填写实际服务分钟数，系统会与计时记录核对'
    );
    if (!durationInput.confirm) return;
    const minutes = Number(durationInput.text);
    const reportedSeconds = Math.round(minutes * 60);
    if (
      !Number.isFinite(minutes) ||
      minutes <= 0 ||
      !Number.isSafeInteger(reportedSeconds)
    ) {
      uni.showToast({ title: '请填写有效的服务分钟数', icon: 'none' });
      return;
    }
    // 进入结单确认态：展示截图预览区，上传完成后再确认结束。
    finishingId.value = item.id;
    pendingFinish.value = { units, seconds: reportedSeconds };
    evidenceList.value = [];
  }

  async function addEvidence() {
    if (evidenceList.value.length >= 9) {
      uni.showToast({ title: '最多上传 9 张截图', icon: 'none' });
      return;
    }
    const chooseRes = await new Promise<{ tempFilePaths: string[] }>((resolve) => {
      uni.chooseImage({
        count: 9 - evidenceList.value.length,
        sizeType: ['compressed'],
        success: (r) =>
          resolve({
            tempFilePaths: Array.isArray(r.tempFilePaths) ? r.tempFilePaths : [r.tempFilePaths],
          }),
        fail: () => resolve({ tempFilePaths: [] }),
      });
    });
    if (chooseRes.tempFilePaths.length === 0) return;
    actingId.value = finishingId.value;
    let index = 0;
    for (const filePath of chooseRes.tempFilePaths) {
      index += 1;
      try {
        const id = await uploadAttachment(filePath, 'private/esports/service-evidence');
        evidenceList.value.push({ id, path: filePath });
      } catch {
        // upload 层已提示，此处补一条针对具体图片的失败提示。
        uni.showToast({ title: `第 ${index} 张截图上传失败，请重试`, icon: 'none' });
      }
    }
    actingId.value = 0;
  }

  function removeEvidence(idx: number) {
    evidenceList.value.splice(idx, 1);
  }

  function cancelFinish() {
    finishingId.value = 0;
    pendingFinish.value = { units: 0, seconds: 0 };
    evidenceList.value = [];
  }

  async function confirmFinish() {
    const id = finishingId.value;
    if (!id) return;
    actingId.value = id;
    try {
      await finishService(
        id,
        pendingFinish.value.units,
        pendingFinish.value.seconds,
        evidenceList.value.map((e) => e.id)
      );
      uni.showToast({ title: '已结束服务', icon: 'success' });
      cancelFinish();
      load();
    } catch {
      // request 层已提示。
    } finally {
      actingId.value = 0;
    }
  }

  async function transfer(item: PlayerOrder) {
    const { confirm, text } = await promptModal(
      '发起转单',
      '转单原因',
      '转单须客服确认后才生效，请填写转单原因'
    );
    if (!confirm) return;
    if (!text) {
      uni.showToast({ title: '转单原因不能为空', icon: 'none' });
      return;
    }
    actingId.value = item.id;
    try {
      await requestTransfer(item.id, text, idempotencyKey('tr'));
      uni.showToast({ title: '已提交，待客服确认', icon: 'success' });
      load();
    } catch {
      // request 层已提示。
    } finally {
      actingId.value = 0;
    }
  }

  function goAppeals() {
    uni.navigateTo({ url: '/pages/player/appeals' });
  }

  // ── 固排邀请：仅本人已接单、且订单处于待派单 / 待接单时可邀请 ──
  // 服务端还会校验固排关系、资质、在线、分区等级与接单容量，失败时原样提示后端中文文案。
  const teamOrderId = ref(0);
  const teamCandidates = ref<TeammateDispatchCandidate[]>([]);
  const teamPicked = ref<number[]>([]);
  const teamLoadingId = ref(0);
  const teamSubmitting = ref(false);

  const canInviteTeam = (item: PlayerOrder) =>
    item.fulfillment_status === 'pending_dispatch' ||
    item.fulfillment_status === 'pending_acceptance';

  async function openTeam(item: PlayerOrder) {
    teamLoadingId.value = item.id;
    try {
      teamCandidates.value = (await fetchTeammateCandidates(item.id)) || [];
      teamPicked.value = [];
      teamOrderId.value = item.id;
    } catch {
      // request 层已提示（如非本人接单 / 订单状态不允许）。
      teamOrderId.value = 0;
    } finally {
      teamLoadingId.value = 0;
    }
  }

  function toggleTeam(playerId: number) {
    const index = teamPicked.value.indexOf(playerId);
    if (index >= 0) {
      teamPicked.value.splice(index, 1);
    } else {
      teamPicked.value.push(playerId);
    }
  }

  function closeTeam() {
    teamOrderId.value = 0;
    teamCandidates.value = [];
    teamPicked.value = [];
  }

  async function submitTeam(item: PlayerOrder) {
    if (teamPicked.value.length === 0) {
      uni.showToast({ title: '请选择要邀请的固排', icon: 'none' });
      return;
    }
    teamSubmitting.value = true;
    try {
      await inviteTeammates(item.id, teamPicked.value);
      uni.showToast({ title: '邀请已发出', icon: 'success' });
      closeTeam();
      await load();
    } catch {
      // request 层已提示（空席位不足 / 固排未在线等）。
    } finally {
      teamSubmitting.value = false;
    }
  }

  // ── 待确认改期 ──
  // `GET /user/player/reschedule-proposals` 返回本人持席位订单的提案（待确认优先）；
  // 只把「提案仍在进行中且我尚未表态」的条目提到顶部待办卡，避免历史记录占位。
  const proposals = ref<MyRescheduleProposal[]>([]);

  const pendingProposals = computed(() =>
    proposals.value.filter(
      (item) => item.status === 'pending' && item.my_decision === 'pending'
    )
  );

  async function decideProposal(item: MyRescheduleProposal, accept: boolean) {
    actingId.value = item.proposal_id;
    try {
      await confirmPlayerRescheduleProposal(item.proposal_id, accept);
      uni.showToast({ title: accept ? '已接受改期' : '已拒绝改期', icon: 'none' });
      await load();
    } catch {
      // request 层已提示（提案已终结 / 目标档期不可用 / 非本人席位等）。
    } finally {
      actingId.value = 0;
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

  watch(active, load);
  onShow(() => {
    enterPlayerMode();
    load();
  });
</script>

<style scoped lang="scss">
  .entry {
    padding: 8rpx 24rpx;
  }

  .entry .row {
    align-items: flex-start;
  }

  .arrow {
    color: $text-3;
    font-size: 36rpx;
    align-self: center;
  }

  .tabs {
    display: flex;
    background: #fff;
    padding: 0 12rpx;
    position: sticky;
    top: 0;
    z-index: 10;
  }

  .tab {
    padding: 24rpx 20rpx;
    color: $text-2;
  }

  .tab.active {
    color: $brand;
    font-weight: 600;
    border-bottom: 4rpx solid $brand;
  }

  .order {
    padding: 20rpx 0;
    border-bottom: 1rpx solid $border;
  }

  .order:last-child {
    border-bottom: none;
  }

  .order-no {
    font-weight: 600;
  }

  .amount {
    color: $danger;
    font-weight: 600;
  }

  .actions {
    display: flex;
    gap: 16rpx;
    margin-top: 12rpx;
  }

  .evidence {
    margin-top: 16rpx;
    padding: 16rpx;
    background: $bg;
    border-radius: $radius;
  }

  .evidence-title {
    font-size: 26rpx;
    font-weight: 600;
    margin-bottom: 12rpx;
  }

  .thumbs {
    display: flex;
    flex-wrap: wrap;
    gap: 12rpx;
  }

  .thumb-wrap {
    width: 120rpx;
    height: 120rpx;
  }

  .thumb {
    width: 120rpx;
    height: 120rpx;
    border-radius: 8rpx;
    background: #eee;
  }

  .thumb-add {
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 48rpx;
    color: $text-3;
    border: 1rpx dashed $border;
    background: #fff;
    box-sizing: border-box;
  }

  .evidence-actions {
    display: flex;
    gap: 16rpx;
    margin-top: 16rpx;
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

  .success {
    background: $success;
    color: #fff;
  }

  .plain {
    background: #fff;
    color: $text-2;
    border: 1rpx solid $border;
  }

  .team-panel {
    margin-top: 16rpx;
    padding: 16rpx;
    background: $bg;
    border-radius: $radius;
  }

  .team-candidate {
    display: flex;
    justify-content: space-between;
    padding: 12rpx 0;
    border-bottom: 1rpx solid $border;
  }

  .team-candidate:last-child {
    border-bottom: none;
  }

  .picked {
    color: $brand;
    font-weight: 600;
  }

  .proposal-card .section-title {
    font-size: 30rpx;
    font-weight: 600;
    margin-bottom: 12rpx;
  }

  .proposal {
    margin-top: 16rpx;
    padding: 16rpx;
    background: $bg;
    border-radius: $radius;
  }

  .waiting {
    color: #d46b08;
    font-size: 24rpx;
  }
</style>
