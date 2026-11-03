import { defineConfig } from "vite";
import uni from "@dcloudio/vite-plugin-uni";

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [uni()],
  // 共享包是工作区源码包，排除预构建才能让改动即时生效（否则读到 node_modules/.vite 里的旧副本）
  optimizeDeps: {
    exclude: [
      "@esports/shared",
      "@esports/shared/api/esports",
      "@esports/shared/api/cs",
    ],
  },
  server: {
    // 客服端固定 5176，端口被占用时直接报错而不是悄悄换端口
    port: 5176,
    strictPort: true,
    proxy: {
      // H5 开发期走同源代理，避免后端无 CORS 时浏览器跨域拦截
      "/api": {
        target: "http://127.0.0.1:9501",
        changeOrigin: true,
        // 实时通知走 WebSocket：代理必须升级协议，否则 H5 建连失败。
        ws: true,
      },
      "/uploads": {
        target: "http://127.0.0.1:9501",
        changeOrigin: true,
      },
    },
  },
});
