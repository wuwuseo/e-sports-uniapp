<template>
  <view>
    <!-- 客户会员权益：等级 / 折扣 / 成长值 / 待降级 -->
    <view class="card">
      <view class="section-title">客户会员权益</view>
      <picker :range="customerNames" :value="customerIndex" @change="onCustomerChange">
        <view class="picker">{{ customerNames[customerIndex] || '请选择客户' }}</view>
      </picker>

      <view v-if="member" class="member">
        <view class="row">
          <text class="level">{{ member.level_name || member.level_code || '未定级' }}</text>
          <text class="discount">{{ discountText(member.discount_bps) }}</text>
        </view>
        <view class="muted">累计成长值 {{ member.growth_total }}</view>
        <view v-if="member.level_changed_at" class="muted">
          定级时间 {{ datetime(member.level_changed_at) }}
        </view>
        <view v-if="member.pending_level_code" class="muted warn-text">
          待降级至 {{ member.pending_level_code }}
          <text v-if="member.downgrade_after">· {{ datetime(member.downgrade_after) }}</text>
        </view>
        <view v-if="benefits.length" class="badges">
          <text v-for="benefit in benefits" :key="benefit" class="badge">{{ benefit }}</text>
        </view>
      </view>
      <view v-else class="muted">
        {{ customerIndex >= 0 ? '正在读取会员权益…' : '选择客户后查看其会员等级与折扣' }}
      </view>
    </view>

    <!-- 等级配置：成长值门槛 / 折扣 / 权益开关 -->
    <view class="card">
      <view class="section-title">会员等级配置</view>
      <view v-if="levels.length === 0" class="muted">暂无会员等级配置</view>
      <view v-for="level in levels" :key="level.id" class="level-item">
        <view class="row">
          <text class="level">{{ level.name || level.code }}</text>
          <text class="discount">{{ discountText(level.discount_bps) }}</text>
        </view>
        <view class="muted">
          门槛成长值 {{ level.growth_threshold }} · {{ level.status === 'enabled' ? '启用中' : '已停用' }}
        </view>
        <view class="muted">{{ levelBenefits(level).join(' · ') || '无附加权益' }}</view>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
  import { onShow } from '@dcloudio/uni-app';
  import { computed, ref } from 'vue';
  import { fetchCsCustomers, fetchCustomerMember, fetchMemberLevels } from '../../api/cs';
  import type { CsCustomer, CsCustomerMember, CsMemberLevel } from '../../api/cs';
  import { datetime } from '../../utils/format';

  const customers = ref<CsCustomer[]>([]);
  const levels = ref<CsMemberLevel[]>([]);
  const member = ref<CsCustomerMember | null>(null);
  const customerIndex = ref(-1);

  const customerNames = computed(() =>
    customers.value.map((c) => c.display_name || `客户#${c.id}`)
  );
  const selectedCustomer = computed<CsCustomer | null>(() =>
    customerIndex.value >= 0 ? customers.value[customerIndex.value] : null
  );
  const memberRule = computed<CsMemberLevel | null>(() => {
    const code = member.value?.level_code || '';
    if (!code) return null;
    return levels.value.find((level) => level.code === code && level.status === 'enabled') || null;
  });
  const benefits = computed(() =>
    memberRule.value ? levelBenefits(memberRule.value) : []
  );

  /** 折扣基点转「折」：10000 = 原价不打折。 */
  function discountText(bps: number | undefined): string {
    if (!bps || bps >= 10000) return '无折扣';
    return `${Number((bps / 1000).toFixed(1))} 折`;
  }

  function levelBenefits(level: CsMemberLevel): string[] {
    const list: string[] = [];
    if (level.dedicated_cs) list.push('专属客服');
    if (level.priority_booking) list.push('优先预约');
    if (level.priority_dispatch) list.push('优先派单');
    if (level.prepay_bonus_bps > 0) {
      list.push(`预付加赠 ${(level.prepay_bonus_bps / 100).toFixed(2)}%`);
    }
    return list;
  }

  async function loadMember() {
    const customer = selectedCustomer.value;
    if (!customer) {
      member.value = null;
      return;
    }
    try {
      member.value = await fetchCustomerMember(customer.id);
    } catch {
      // csRequest 层已提示（如无会员查看权限）。
      member.value = null;
    }
  }

  async function load() {
    try {
      customers.value = (await fetchCsCustomers()) || [];
    } catch {
      customers.value = [];
    }
    try {
      levels.value = (await fetchMemberLevels()) || [];
    } catch {
      levels.value = [];
    }
    if (customerIndex.value < 0 && customers.value.length > 0) customerIndex.value = 0;
    await loadMember();
  }

  function onCustomerChange(e: Event) {
    const v = Number((e as unknown as { detail?: { value?: number } }).detail?.value);
    if (Number.isInteger(v)) {
      customerIndex.value = v;
      loadMember();
    }
  }

  onShow(load);
</script>

<style scoped lang="scss">
  .section-title {
    font-size: 30rpx;
    font-weight: 600;
    margin-bottom: 16rpx;
  }

  .picker {
    height: 80rpx;
    line-height: 80rpx;
    padding: 0 24rpx;
    background: $bg;
    border-radius: $radius;
  }

  .member {
    margin-top: 16rpx;
  }

  .level {
    font-weight: 600;
  }

  .discount {
    color: $brand;
    font-weight: 600;
  }

  .badges {
    display: flex;
    flex-wrap: wrap;
    gap: 12rpx;
    margin-top: 12rpx;
  }

  .badge {
    padding: 4rpx 16rpx;
    background: $bg;
    border-radius: 999rpx;
    color: $brand;
    font-size: 24rpx;
  }

  .warn-text {
    color: #d46b08;
  }

  .level-item {
    padding: 16rpx 0;
    border-bottom: 1rpx solid $border;
  }

  .level-item:last-child {
    border-bottom: none;
  }
</style>
