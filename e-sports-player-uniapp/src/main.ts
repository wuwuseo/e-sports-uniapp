import { createSSRApp } from "vue";
import App from "./App.vue";
import { configureRequest } from "./api/request";

// 陪玩端运行时配置：401 回本端登录页，未实名统一跳到本端陪玩实名页
configureRequest({
  loginPath: "/pages/login/index",
  realnamePath: () => "/pages/player/identity",
});

export function createApp() {
  const app = createSSRApp(App);
  return {
    app,
  };
}
