<template>
  <view>
    <view class="card upgrade">
      <view class="section-head">
        <text class="section-title">升级考核</text>
        <text class="muted">目标档位按所选分区等级推导</text>
      </view>
      <view class="muted">
        累计服务量、综合评分与在岗天数达标后可在线上申请；冷却期内或已有进行中考核时申请会被服务端拦回。
      </view>
      <view class="row">
        <text>升级分区</text>
        <picker
          v-if="gameOptions.length"
          mode="selector"
          :range="gameOptions"
          :value="gameIndex"
          @change="onGameChange"
        >
          <text
            >{{ selectedGame }} · {{ levelText(profile?.game_levels[selectedGame] || '') }} ›</text
          >
        </picker>
        <text v-else class="muted">暂无已开通分区</text>
      </view>
      <button
        class="primary apply"
        :loading="applying"
        :disabled="applying || !selectedGame"
        @click="applyUpgrade"
      >
        申请升级考核
      </button>
    </view>

    <view class="card">
      <view v-if="items.length === 0" class="empty">暂无考核记录</view>
      <view v-for="row in items" :key="row.assessment.id" class="assess">
        <view class="row">
          <text class="task-no">{{ row.assessment.task_no }}</text>
          <text
            class="score"
            :class="
              row.assessment.status === 'passed'
                ? 'pass'
                : row.assessment.status === 'failed'
                ? 'fail'
                : ''
            "
          >
            {{ row.assessment.total_score }} 分
          </text>
        </view>
        <view class="muted">
          {{ typeText(row.assessment.assessment_type) }} · {{ row.assessment.game }} · 目标等级
          {{ levelText(row.assessment.target_level) }} · {{ statusText(row.assessment.status) }}
        </view>
        <view v-if="row.assessment.scheduled_at" class="muted">
          考核时间 {{ datetime(row.assessment.scheduled_at) }}
        </view>
        <view v-if="row.assessment.scored_at" class="muted">
          打分时间 {{ datetime(row.assessment.scored_at) }}
        </view>
        <view v-if="row.assessment.appeal_status !== 'none'" class="muted">
          申诉状态：{{ appealText(row.assessment.appeal_status) }}
        </view>
        <view v-if="row.assessment.note" class="muted">备注：{{ row.assessment.note }}</view>

        <!-- 评级依据：逐维度得分 + 打分时快照的权重，权重合计用于核对口径。 -->
        <view v-if="(row.scores || []).length" class="dims">
          <view class="dim-head">
            <text>维度得分</text>
            <text class="muted">权重合计 {{ percent(row.weight_total_bp) }}</text>
          </view>
          <view v-for="score in row.scores || []" :key="score.dimension" class="dim">
            <view class="row">
              <text>{{ dimensionText(score.dimension) }}</text>
              <text class="dim-score">
                {{ score.score }} 分 · 权重 {{ percent(score.weight_bp) }}
              </text>
            </view>
            <view v-if="score.comment" class="muted">{{ score.comment }}</view>
          </view>
        </view>
        <view v-else class="muted">尚未打分（暂无维度得分）</view>

        <button
          v-if="canAppeal(row)"
          class="mini primary"
          :loading="actingId === row.assessment.id"
          @click="appeal(row.assessment)"
        >
          发起申诉
        </button>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
  import { onShow } from '@dcloudio/uni-app';
  import { computed, ref } from 'vue';
  import {
    appealAssessment,
    applyUpgradeAssessment,
    fetchPlayerAssessments,
    fetchPlayerProfile,
  } from '../../api/player';
  import type { PlayerAssessment, PlayerAssessmentView, PlayerProfile } from '../../api/player';
  import { datetime } from '../../utils/format';

  import { skillLevelText } from '../../utils/levels';
  // 服务端返回嵌套视图 `{ assessment, scores, weight_total_bp, dimension_count }`：
  // 主表字段必须从 row.assessment 读，逐维度得分与权重合计用于展示评级依据。
  const items = ref<PlayerAssessmentView[]>([]);
  const actingId = ref<number>(0);
  const applying = ref(false);
  const profile = ref<PlayerProfile | null>(null);
  const gameIndex = ref(0);
  const gameOptions = computed(() =>
    (profile.value?.games || []).filter((game) => !!profile.value?.game_levels[game])
  );
  const selectedGame = computed(() => gameOptions.value[gameIndex.value] || '');

  function onGameChange(event: { detail: { value: string | number } }) {
    gameIndex.value = Number(event.detail.value);
  }

  async function load() {
    try {
      const selected = selectedGame.value;
      const [assessments, playerProfile] = await Promise.all([
        fetchPlayerAssessments(),
        fetchPlayerProfile(),
      ]);
      items.value = assessments || [];
      profile.value = playerProfile;
      gameIndex.value = Math.max(0, gameOptions.value.indexOf(selected));
    } catch {
      items.value = [];
      profile.value = null;
    }
  }

  function canAppeal(row: PlayerAssessmentView) {
    // 已出结论（通过 / 不通过）且未发起过申诉的考核可申诉（服务端每单仅一条申诉记录）。
    return (
      (row.assessment.status === 'passed' || row.assessment.status === 'failed') &&
      row.assessment.appeal_status === 'none'
    );
  }

  async function appeal(item: PlayerAssessment) {
    const res = await new Promise<{ confirm: boolean; content?: string }>(
      (resolve) => {
        uni.showModal({
          title: '发起申诉',
          content: '请填写申诉理由',
          editable: true,
          placeholderText: '申诉理由',
          success: (r) => resolve(r),
          fail: () => resolve({ confirm: false }),
        });
      }
    );
    if (!res.confirm) return;
    if (!res.content?.trim()) {
      uni.showToast({ title: '申诉理由不能为空', icon: 'none' });
      return;
    }
    actingId.value = item.id;
    try {
      await appealAssessment(item.id, res.content.trim());
      uni.showToast({ title: '已提交申诉', icon: 'success' });
      load();
    } catch {
      // request 层已提示。
    } finally {
      actingId.value = 0;
    }
  }

  async function applyUpgrade() {
    if (!selectedGame.value) {
      uni.showToast({ title: '请选择要升级的游戏分区', icon: 'none' });
      return;
    }
    applying.value = true;
    try {
      await applyUpgradeAssessment(selectedGame.value);
      uni.showToast({ title: '已提交升级申请', icon: 'success' });
      await load();
    } catch {
      // 门槛未达标 / 冷却期内 / 已有进行中考核等由 request 层提示后端中文文案。
    } finally {
      applying.value = false;
    }
  }

  /** 基点 → 百分比文案（10000 基点 = 100%）。 */
  const percent = (bp: number) => `${((Number(bp) || 0) / 100).toFixed(2)}%`;

  const typeText = (type: string) =>
    (
      ({
        entry: '入职考核',
        upgrade: '升级考核',
        spot_check: '抽查复核',
        retry: '复考',
      }) as Record<string, string>
    )[type] || type;

  const dimensionText = (dimension: string) =>
    (
      ({
        game_skill: '游戏技术',
        teaching: '带教能力',
        attitude: '服务态度',
        communication: '沟通表达',
        compliance: '合规守则',
        stability: '稳定性',
      }) as Record<string, string>
    )[dimension] || dimension;

  // 技能等级文案走系统配置，App 启动时已拉取。
  const levelText = (level: string) => skillLevelText(level) || '未指定';

  const statusText = (status: string) =>
    (
      ({
        pending: '待分配',
        scheduled: '已约考核',
        passed: '已通过',
        failed: '未通过',
      }) as Record<string, string>
    )[status] || status;

  const appealText = (status: string) =>
    (
      ({
        pending: '待复核',
        approved: '申诉成立',
        rejected: '维持原结论',
      }) as Record<string, string>
    )[status] || status;

  onShow(load);
</script>

<style scoped lang="scss">
  .assess {
    padding: 20rpx 0;
    border-bottom: 1rpx solid $border;
  }

  .assess:last-child {
    border-bottom: none;
  }

  .section-head {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
  }

  .section-title {
    font-size: 30rpx;
    font-weight: 600;
    margin-bottom: 12rpx;
  }

  .apply {
    background: $brand;
    color: #fff;
    border-radius: $radius;
    margin-top: 16rpx;
  }

  .task-no {
    font-weight: 600;
  }

  .score {
    font-weight: 600;
  }

  .score.pass {
    color: $success;
  }

  .score.fail {
    color: $danger;
  }

  .dims {
    margin-top: 12rpx;
    padding: 16rpx;
    background: $bg;
    border-radius: $radius;
  }

  .dim-head {
    display: flex;
    justify-content: space-between;
    font-weight: 600;
    margin-bottom: 8rpx;
  }

  .dim {
    padding: 10rpx 0;
    border-bottom: 1rpx solid $border;
  }

  .dim:last-child {
    border-bottom: none;
  }

  .dim-score {
    color: $text-2;
  }

  .mini {
    margin-top: 12rpx;
    font-size: 24rpx;
    padding: 0 24rpx;
    line-height: 56rpx;
    border-radius: 28rpx;
    background: $brand;
    color: #fff;
  }
</style>
