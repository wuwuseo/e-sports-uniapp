// 账号 / 手机号双 tab 登录（客户 / 陪玩共用）：后端仅提供账号密码登录（无短信验证码接口），
// 手机号登录把手机号作为账号提交同一接口，因此要求账号已预留该手机号。

import { reactive, ref } from 'vue';
import { login } from '../api/esports';
import { setToken, USER_LOGIN_PATH } from '../api/request';

export interface UseAccountLoginOptions {
  /** token 已写入后调用，由页面决定后续跳转与端特有的身份校验。 */
  onAuthenticated: (token: string) => Promise<void> | void;
}

/** 兼容常见字段名：access_token / token / accessToken。 */
function extractToken(data: Record<string, unknown>): string {
  const candidates = ['access_token', 'token', 'accessToken'];
  for (const key of candidates) {
    const value = data?.[key];
    if (typeof value === 'string' && value) return value;
  }
  return '';
}

export function useAccountLogin(options: UseAccountLoginOptions) {
  const loginPath = USER_LOGIN_PATH;
  const loading = ref(false);
  const error = ref('');
  const mode = ref<'account' | 'phone'>('account');
  const form = reactive({ account: '', phone: '', password: '' });

  function switchMode(next: 'account' | 'phone') {
    mode.value = next;
  }

  async function submit() {
    const account = mode.value === 'account' ? form.account.trim() : form.phone.trim();
    if (!account || !form.password) {
      uni.showToast({ title: '请填写账号与密码', icon: 'none' });
      return;
    }
    if (mode.value === 'phone' && !/^1[3-9]\d{9}$/.test(account)) {
      uni.showToast({ title: '请填写正确的 11 位手机号', icon: 'none' });
      return;
    }
    loading.value = true;
    error.value = '';
    try {
      const data = await login(account, form.password, mode.value === 'phone');
      const token = extractToken(data);
      if (!token) {
        uni.showToast({ title: '登录响应缺少 token 字段', icon: 'none' });
        return;
      }
      setToken(token);
      await options.onAuthenticated(token);
    } catch {
      // request 层已提示具体错误。
    } finally {
      loading.value = false;
    }
  }

  return { loginPath, loading, error, mode, form, switchMode, submit };
}
