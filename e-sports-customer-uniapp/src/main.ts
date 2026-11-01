import { createSSRApp } from "vue";
import App from "./App.vue";
import { configureRequest } from "./api/request";

// 本端为纯客户侧：401 去登录页，未实名拦截直接跳本端实名页（不再按 scope 分流到陪玩页）。
configureRequest({
  loginPath: "/pages/login/index",
  realnamePath: () => "/pages/identity/index",
});

// #ifdef H5
// 兼容把服务端兑换接口 /page/preview/<code> 当成页面地址直接打开：
// H5 只有 hash 路由，非 hash 路径会落到首页且不带 preview 参数，随后被登录守卫拦截。
const previewPath = /^\/page\/preview\/([^/?#]+)\/?$/.exec(
  (globalThis as { location?: Location }).location?.pathname || ""
);
const browserLocation = (globalThis as { location?: Location }).location;
if (previewPath) {
  browserLocation?.replace(
    `${browserLocation.origin}/#/?preview=${encodeURIComponent(previewPath[1])}`
  );
} else {
  // 聚合收款扫码链接兼容：/pay/<token> 与 /?pay=<token> 统一重写到公开扫码页，
  // 保证未登录扫码用户直接进入 hash 路由，不被登录守卫拦截。
  const payPath = /^\/pay\/([^/?#]+)\/?$/.exec(
    browserLocation?.pathname || ""
  );
  const payQuery = new URLSearchParams(browserLocation?.search || "").get("pay");
  const payToken = (payPath?.[1] || payQuery || "").trim();
  if (browserLocation && payToken) {
    browserLocation.replace(
      `${browserLocation.origin}/#/pages/pay/scan?token=${encodeURIComponent(payToken)}`
    );
  }
}
// #endif
export function createApp() {
  const app = createSSRApp(App);
  return {
    app,
  };
}
