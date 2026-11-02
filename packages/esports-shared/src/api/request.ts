// 统一请求层：拼接基础地址、注入登录态（Authorization: Bearer <token>）、
// 解包服务端 `{code, message, data}` 包裹（成功 `code === 1`）、集中处理 401 与错误提示。

const TOKEN_KEY = 'esports_token';

export const API_BASE = import.meta.env.VITE_API_BASE || '';

/** 各端在 main.ts 启动时注入自己的登录页与实名页路径。 */
export interface RequestRuntimeConfig {
  loginPath?: string;
  realnamePath?: (scope?: string) => string;
}

// 默认值保持原混合端行为：401 去通用登录页，实名按 scope 分流到陪玩 / 客户实名页。
const runtimeConfig: Required<RequestRuntimeConfig> = {
  loginPath: '/pages/login/index',
  realnamePath: (scope?: string) =>
    scope === 'withdrawal'
      ? '/pages/player/identity?role=player'
      : '/pages/player/identity?role=customer',
};

export function configureRequest(config: RequestRuntimeConfig): void {
  if (config.loginPath) runtimeConfig.loginPath = config.loginPath;
  if (config.realnamePath) runtimeConfig.realnamePath = config.realnamePath;
}

/** 装修配置保存附件表同款 public/... 存储路径；展示时按公开目录规则补成可访问地址。 */
export function pageImageUrl(url: string): string {
  const value = (url || '').trim();
  // 附件表 path（public/...）→ 静态公开地址 /uploads/...；旧 /uploads 与 https 保持原样。
  const resolved = value.startsWith('public/')
    ? `/uploads/${value.slice('public/'.length)}`
    : value;
  if (
    !resolved.startsWith('/api/v1/attachments/') &&
    !resolved.startsWith('/uploads/')
  ) {
    return resolved;
  }
  const origin = API_BASE.replace(/\/+$/, '').replace(/\/api\/v1\/esports$/, '');
  return origin ? `${origin}${resolved}` : resolved;
}
export const USER_LOGIN_PATH =
  import.meta.env.VITE_USER_LOGIN_PATH || '/api/v1/public/login';

export interface ApiResponse<T> {
  code: number;
  message?: string;
  data: T;
  /** 业务错误码：如 realname_required（未实名被拦截），与 HTTP 状态码分开表达。 */
  error_code?: string;
  /** 拦截范围：order 下单 / recharge 充值 / withdrawal 提现，供前端定位到对应主体的实名页。 */
  scope?: string;
}

export interface RequestOptions {
  url: string;
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  data?: Record<string, unknown>;
  /** 是否携带登录态，默认 true；公开接口（商品、装修配置）传 false。 */
  auth?: boolean;
  /** 是否由本层统一 toast 错误，默认 true。 */
  toast?: boolean;
}

export function getToken(): string {
  return (uni.getStorageSync(TOKEN_KEY) as string) || '';
}

export function setToken(token: string) {
  uni.setStorageSync(TOKEN_KEY, token);
}

export function clearToken() {
  uni.removeStorageSync(TOKEN_KEY);
}

/**
 * 业务接口（/page、/players 等）拼完整 API 基址；
 * 登录 / 附件等以 /api/ 开头的绝对路径只拼 origin，避免重复 /api/v1/esports。
 */
export function requestURL(url: string): string {
  const base = API_BASE.replace(/\/+$/, '');
  if (url.startsWith('/api/')) {
    return `${base.replace(/\/api\/v1\/esports$/, '')}${url}`;
  }
  return `${base}${url}`;
}

export function request<T>(options: RequestOptions): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const header: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    const token = getToken();
    if (options.auth !== false && token) {
      header.Authorization = `Bearer ${token}`;
    }
    uni.request({
      url: requestURL(options.url),
      method: options.method || 'GET',
      data: options.data,
      header,
      success: (res) => {
        const body = res.data as ApiResponse<T> | undefined;
        const status = res.statusCode;
        if (status === 401) {
          clearToken();
          uni.reLaunch({ url: runtimeConfig.loginPath });
          reject(new Error('登录已过期，请重新登录'));
          return;
        }
        if (status < 200 || status >= 300 || !body || body.code !== 1) {
          const message = body?.message || `请求失败（${status}）`;
          // 未实名拦截：不弹 toast，改用弹窗直接引导到本端配置的实名页。
          if (body?.error_code === 'realname_required') {
            uni.showModal({
              title: '需要实名认证',
              content: message,
              confirmText: '去认证',
              success: (res) => {
                if (res.confirm) {
                  uni.navigateTo({ url: runtimeConfig.realnamePath(body.scope) });
                }
              },
            });
            reject(new Error(message));
            return;
          }
          if (options.toast !== false) {
            uni.showToast({ title: message, icon: 'none' });
          }
          reject(new Error(message));
          return;
        }
        resolve(body.data);
      },
      fail: (err) => {
        const message = err.errMsg || '网络异常，请稍后重试';
        if (options.toast !== false) {
          uni.showToast({ title: message, icon: 'none' });
        }
        reject(new Error(message));
      },
    });
  });
}
