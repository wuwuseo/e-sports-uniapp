import { createSSRApp } from "vue";
import App from "./App.vue";
import { configureRequest } from "./api/request";
import { clearAdminToken, getAdminToken } from "./api/cs";
import { configureRealtime } from "./api/realtime";

// 移动客服端：401 去客服登录页；实名拦截同样落回客服登录页（客服端不做自助实名）。
configureRequest({
  loginPath: "/pages/cs/login",
  realnamePath: () => "/pages/cs/login",
});

// 客服端实时通知：ticket 走 admin 端点，登录态用独立的 admin token 存储。
configureRealtime({
  ticketPath: "/api/v1/admin/auth/realtime/ticket",
  getToken: getAdminToken,
  onUnauthorized: () => {
    clearAdminToken();
    uni.reLaunch({ url: "/pages/cs/login" });
  },
});

export function createApp() {
  const app = createSSRApp(App);
  return {
    app,
  };
}
