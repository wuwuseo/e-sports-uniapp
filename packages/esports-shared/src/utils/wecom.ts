// 企微侧边栏 JS-SDK 适配层。
//
// 真实企微侧边栏走两条路径（均有优雅降级）：
//   1. 真实 JS-SDK：在 uni-app H5 环境注入企业微信 JS-SDK 脚本，用服务端签发的
//      POST /admin/wecom/js-config 结果调用 wx.config，随后 wx.invoke('getCurExternalContact')
//      读取当前外部联系人 external_userid（corpId 来自 js-config 返回的 app_id）。
//   2. 宿主注入 adapter：宿主页面在挂载本 H5 前通过 window.__WECOM_ADAPTER__ 或
//      injectWecomHost(adapter) 注入适配器（历史兼容路径）。
// 两条路径均失败时由页面落到手动输入 / 复制剪贴板降级，不臆造企微方法、不硬编码密钥。

/** 企微侧边栏能拿到的当前客户上下文（企业主体 + 外部联系人标识）。 */
export interface WecomContactContext {
  corp_id: string;
  external_id: string;
  display_name?: string;
  phone?: string;
}

/** 服务端 POST /admin/wecom/js-config 返回的 JS-SDK 签名。 */
export interface WecomJsConfig {
  app_id: string;
  agent_id: string;
  timestamp: string;
  nonce_str: string;
  signature: string;
}

/** wx.invoke 返回结构（企微各接口均在 err_msg 里给结果码）。 */
interface WxInvokeResult {
  err_msg?: string;
  err_code?: number;
  [key: string]: unknown;
}

/** 企业微信 JS-SDK 全局对象（仅声明本侧边栏用到的能力）。 */
interface WecomWxSdk {
  config(cfg: Record<string, unknown>): void;
  ready(cb: () => void): void;
  error(cb: (err: { errMsg?: string }) => void): void;
  agentConfig?(cfg: Record<string, unknown>): void;
  invoke(
    name: string,
    params: Record<string, unknown>,
    cb: (res: WxInvokeResult) => void
  ): void;
}

declare global {
  interface Window {
    wx?: WecomWxSdk;
    __WECOM_ADAPTER__?: WecomHostAdapter;
  }
}

/**
 * 宿主注入的适配器接口。真实实现由宿主负责：在 getContext / getCurExternalContact 内部
 * 完成企业微信 JS-SDK 的注册与调用（如获取当前外部联系人），再把结果映射为
 * { corp_id, external_id }。本模块只消费该接口，不感知企微底层签名细节。
 */
export interface WecomHostAdapter {
  /** 获取当前侧边栏上下文（企业主体 + 外部联系人）。 */
  getContext?: () => Promise<WecomContactContext | null> | WecomContactContext | null;
  /** 别名：获取当前外部联系人。 */
  getCurExternalContact?: () => Promise<WecomContactContext | null> | WecomContactContext | null;
  /** 向当前客户发送消息；返回是否发送成功。 */
  sendMessage?: (content: string) => Promise<boolean> | boolean;
}

const WECOM_JS_SDK_URL = 'https://open.work.weixin.qq.com/wwopen/js/jwxwork-1.0.0.js';

let hostAdapter: WecomHostAdapter | null = null;
let sdkScriptPromise: Promise<boolean> | null = null;

/** 显式注入宿主适配器（供宿主页面或本 H5 内部调用）。 */
export function injectWecomHost(adapter: WecomHostAdapter | null): void {
  hostAdapter = adapter;
}

/** 是否有宿主注入（用于 UI 判断是否走自动识别 / 发送通道）。 */
export function isWecomHost(): boolean {
  return resolveAdapter() !== null;
}

function resolveAdapter(): WecomHostAdapter | null {
  if (hostAdapter) return hostAdapter;
  if (typeof window !== 'undefined') {
    const global = window.__WECOM_ADAPTER__;
    if (global) return global;
  }
  return null;
}

/** 取企微 JS-SDK 全局对象；非 H5 / 未加载脚本时返回 null。 */
function getWx(): WecomWxSdk | null {
  if (typeof window === 'undefined') return null;
  return window.wx || null;
}

/** 是否处于真实企微宿主（已加载 JS-SDK 全局对象）。 */
export function hasWecomJsSdk(): boolean {
  return getWx() !== null;
}

/**
 * 注入企业微信 JS-SDK 脚本（幂等）。加载成功返回 true；非 H5 / 加载失败返回 false，
 * 调用方据此降级。真实 corpId/agentId 接入前仅加载脚本，不触发任何接口。
 */
export function loadWecomJsSdk(): Promise<boolean> {
  if (typeof window === 'undefined') return Promise.resolve(false);
  if (window.wx) return Promise.resolve(true);
  if (sdkScriptPromise) return sdkScriptPromise;
  sdkScriptPromise = new Promise<boolean>((resolve) => {
    const script = document.createElement('script');
    script.src = WECOM_JS_SDK_URL;
    script.async = true;
    script.onload = () => resolve(!!window.wx);
    script.onerror = () => resolve(false);
    document.head.appendChild(script);
  });
  return sdkScriptPromise;
}

/**
 * 用服务端签发的 js-config 结果调用 wx.config 并等待 ready。
 * jsApiList 按侧边栏能力传入（['getCurExternalContact'] 等）。成功 / 失败均以 boolean 返回，
 * 失败不抛出，由调用方降级。
 */
export function configWecomJsSdk(config: WecomJsConfig, jsApiList: string[]): Promise<boolean> {
  const wx = getWx();
  if (!wx) return Promise.resolve(false);
  return new Promise<boolean>((resolve) => {
    let settled = false;
    const done = (ok: boolean) => {
      if (settled) return;
      settled = true;
      resolve(ok);
    };
    wx.ready(() => done(true));
    wx.error((err) => {
      console.warn('[wecom] wx.config 失败', err?.errMsg);
      done(false);
    });
    wx.config({
      corpid: config.app_id,
      agentid: config.agent_id,
      timestamp: config.timestamp,
      nonceStr: config.nonce_str,
      signature: config.signature,
      jsApiList,
    });
  });
}

/**
 * 读取当前外部联系人 external_userid（客户联系侧边栏，待密钥联调）。
 * 仅在真实 JS-SDK config 成功后可调用；无宿主 / 未 config 返回 null。
 */
export function getCurExternalUserid(): Promise<string | null> {
  const wx = getWx();
  if (!wx) return Promise.resolve(null);
  return new Promise<string | null>((resolve) => {
    try {
      wx.invoke('getCurExternalContact', {}, (res) => {
        if (res && res.err_msg === 'getCurExternalContact:ok' &&
          typeof res.userId === 'string' && res.userId) {
          resolve(res.userId);
        } else {
          resolve(null);
        }
      });
    } catch {
      resolve(null);
    }
  });
}

/**
 * 向当前客户会话发送话术（客户联系侧边栏，待密钥联调）。
 * 企微无标准「发送到会话」回调时该方法返回 false，由调用方降级复制。
 */
export function sendToCurrentChat(content: string): Promise<boolean> {
  const wx = getWx();
  if (!wx) return Promise.resolve(false);
  return new Promise<boolean>((resolve) => {
    try {
      wx.invoke(
        'sendChatMessage',
        { msgtype: 'text', text: { content } },
        (res) => resolve(!!res && (res.err_msg || '').indexOf(':ok') >= 0)
      );
    } catch {
      resolve(false);
    }
  });
}

/** 通过宿主 adapter 获取当前客户上下文；无宿主 / 无上下文返回 null（落到手动输入）。 */
export async function getExternalContact(): Promise<WecomContactContext | null> {
  const adapter = resolveAdapter();
  if (!adapter) return null;
  const getter = adapter.getContext || adapter.getCurExternalContact;
  if (!getter) return null;
  try {
    const result = await getter.call(adapter);
    return result && result.corp_id && result.external_id ? result : null;
  } catch {
    return null;
  }
}

/** 发送消息给当前客户：优先宿主 adapter，其次真实 JS-SDK；均不可用返回 false 由调用方复制。 */
export async function sendMessage(content: string): Promise<boolean> {
  const adapter = resolveAdapter();
  if (adapter && adapter.sendMessage) {
    try {
      return (await adapter.sendMessage(content)) !== false;
    } catch {
      // 落到 JS-SDK 或复制。
    }
  }
  return sendToCurrentChat(content);
}
