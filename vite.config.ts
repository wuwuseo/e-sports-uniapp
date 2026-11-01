import { defineConfig } from "vite";
import uni from "@dcloudio/vite-plugin-uni";

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [uni()],
  server: {
    // 客服端固定 5176，端口被占用时直接报错而不是悄悄换端口
    port: 5176,
    strictPort: true,
    proxy: {
      // H5 开发期走同源代理，避免后端无 CORS 时浏览器跨域拦截
      "/api": {
        target: "http://127.0.0.1:9501",
        changeOrigin: true,
      },
      "/uploads": {
        target: "http://127.0.0.1:9501",
        changeOrigin: true,
      },
    },
  },
});
