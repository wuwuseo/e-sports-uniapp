import { createSSRApp } from "vue";
import App from "./App.vue";
import { configureRequest } from "./api/request";

// 移动客服端：401 去客服登录页；实名拦截同样落回客服登录页（客服端不做自助实名）。
configureRequest({
  loginPath: "/pages/cs/login",
  realnamePath: () => "/pages/cs/login",
});

export function createApp() {
  const app = createSSRApp(App);
  return {
    app,
  };
}
