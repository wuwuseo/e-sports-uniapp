// 实名认证表单状态机（客户 / 陪玩共用）：'' 未提交 → pending 待审 → verified / rejected / expired；
// 可用渠道由服务端按配置下发：manual 人工审核恒可用，third_party 需运营配置，
// 微信 / 支付宝未接入前不出现。证件号仅保存脱敏值（前 6 后 4）。

import { computed, reactive, ref, unref } from 'vue';
import type { Ref } from 'vue';
import { fetchRealName, submitRealName } from '../api/player';
import type { RealNameChannelOption, RealNameRole } from '../api/player';

/** 客户页固定传字面量，陪玩页由 onLoad 的 ?role= 决定，故同时接受 ref。 */
type RoleInput = RealNameRole | Ref<RealNameRole>;

export interface UseRealNameFormOptions {
  role: RoleInput;
  /** 提交成功并重新拉取状态后触发，供页面处理端特有的后续动作。 */
  onSubmitted?: () => void | Promise<void>;
}

const STATUS_META: Record<string, { text: string; hint: string; cls: string }> = {
  '': {
    text: '未提交',
    hint: '完成实名认证后才能开通报单相关权限。',
    cls: 'idle',
  },
  pending: {
    text: '待审核',
    hint: '资料已提交，请等待核验结果。',
    cls: 'pending',
  },
  verified: {
    text: '已通过',
    hint: '实名认证已通过，无需再次提交。',
    cls: 'ok',
  },
  rejected: {
    text: '已驳回',
    hint: '认证未通过，请核对资料后重新提交。',
    cls: 'warn',
  },
  expired: {
    text: '已失效',
    hint: '本次核验超时未完成，请重新提交。',
    cls: 'warn',
  },
};

const METHOD_LABELS: Record<string, string> = {
  two_factor: '双要素核验',
  face: '人脸核验',
  manual: '人工审核',
};

export function useRealNameForm(options: UseRealNameFormOptions) {
  const role = computed<RealNameRole>(() => unref(options.role));
  const status = ref('');
  const failReason = ref('');
  const realName = ref('');
  const idNumberMasked = ref('');
  const channels = ref<RealNameChannelOption[]>([]);
  const channel = ref('');
  const method = ref('');
  const attemptRef = ref('');
  const submitting = ref(false);
  const error = ref('');
  const form = reactive({ real_name: '', id_number: '' });

  const current = computed(
    () => STATUS_META[status.value] || { text: status.value || '未提交', hint: '', cls: 'idle' }
  );
  const statusClass = computed(() => current.value.cls);
  // 仅「未提交 / 已驳回 / 已失效」可提交：待审核与已通过由后端返回 409，前端先拦一层。
  const editable = computed(() => ['', 'rejected', 'expired'].includes(status.value));
  const methods = computed(
    () => channels.value.find((item) => item.code === channel.value)?.methods || []
  );

  function methodLabel(code: string): string {
    return METHOD_LABELS[code] || code;
  }

  /** 切换渠道时把核验方式重置为该渠道首项，避免提交到渠道不支持的组合。 */
  function selectChannel(code: string) {
    channel.value = code;
    method.value = channels.value.find((item) => item.code === code)?.methods[0] || '';
  }

  async function load() {
    error.value = '';
    try {
      const data = await fetchRealName(role.value);
      status.value = data?.status || '';
      failReason.value = data?.fail_reason || '';
      realName.value = data?.real_name || '';
      idNumberMasked.value = data?.id_number_masked || '';
      attemptRef.value = data?.attempt_ref || '';
      channels.value = data?.channels || [];
      // 保留用户已选渠道；首次进入或被驳回后默认第一项（服务端排序里 manual 在前）。
      if (!channels.value.some((item) => item.code === channel.value)) {
        selectChannel(channels.value[0]?.code || 'manual');
      } else if (!methods.value.includes(method.value)) {
        method.value = methods.value[0] || '';
      }
    } catch {
      status.value = '';
      error.value = '实名信息加载失败';
    }
  }

  /** 15 位纯数字或 18 位（前 17 位数字 + 数字/X），与服务端 validIDNumber 同口径。 */
  function validIDNumber(value: string): boolean {
    return /^(\d{15}|\d{17}[\dXx])$/.test(value);
  }

  async function submit() {
    const realNameInput = form.real_name.trim();
    const idNumber = form.id_number.trim();
    if (!realNameInput) {
      uni.showToast({ title: '请填写真实姓名', icon: 'none' });
      return;
    }
    if (!validIDNumber(idNumber)) {
      uni.showToast({ title: '请填写正确的身份证号', icon: 'none' });
      return;
    }
    if (!editable.value) {
      uni.showToast({ title: '当前状态不可重复提交', icon: 'none' });
      return;
    }
    if (!channel.value || !method.value) {
      uni.showToast({ title: '请选择认证渠道', icon: 'none' });
      return;
    }
    submitting.value = true;
    try {
      const result = await submitRealName(role.value, {
        real_name: realNameInput,
        id_number: idNumber,
        channel: channel.value,
        method: method.value,
      });
      form.real_name = '';
      form.id_number = '';
      if (result?.redirect_url && /^https?:\/\//i.test(result.redirect_url)) {
        uni.navigateTo({
          url: `/pages/webview/index?url=${encodeURIComponent(result.redirect_url)}`,
        });
      } else if (result?.qr_content) {
        uni.showModal({
          title: '请完成核验',
          content: `二维码内容：${result.qr_content}`,
          showCancel: false,
        });
      } else {
        uni.showToast({ title: '已提交，等待审核', icon: 'none' });
      }
      await load();
      await options.onSubmitted?.();
    } catch {
      // request 层已提示具体错误（待审核 / 已通过重复提交为 409）。
    } finally {
      submitting.value = false;
    }
  }

  async function refresh() {
    submitting.value = true;
    try {
      await load();
    } finally {
      submitting.value = false;
    }
  }

  return {
    status,
    failReason,
    realName,
    idNumberMasked,
    channels,
    channel,
    method,
    attemptRef,
    submitting,
    error,
    form,
    current,
    statusClass,
    editable,
    methods,
    methodLabel,
    selectChannel,
    load,
    validIDNumber,
    submit,
    refresh,
  };
}
