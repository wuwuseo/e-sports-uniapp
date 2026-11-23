import { defineConfig } from "vite";
import uni from "@dcloudio/vite-plugin-uni";

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [uni()],
  // 共享包以源码加载，新增导出后无需清理旧的预构建副本。
  optimizeDeps: {
    // qrcode 是 CJS（browser 字段指向 lib/browser.js）。共享包以源码方式加载时，
    // 它不会被预构建，dev 下会被当 ESM 直接返回、缺少 default 导出，
    // 导致 import 了 utils/pay 的收银台/扫码页整个组件加载失败。
    include: ["qrcode"],
    esbuildOptions: {
      // pnpm 下 qrcode 是指向 .pnpm 的软链，它自己的依赖 dijkstrajs 只存在于
      // 软链目标的同级 node_modules 里。预构建若保留软链路径会解析不到，
      // 这里改为按真实路径解析。
      preserveSymlinks: false,
    },
    exclude: [
      "@esports/shared",
      "@esports/shared/api/esports",
      "@esports/shared/api/cs",
    ],
  },
  server: {
    // 用户端独占 5174，端口被占用时直接报错而不是漂移（避免误连到其它端）
    port: 5174,
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
