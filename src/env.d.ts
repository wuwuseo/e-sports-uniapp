/// <reference types="vite/client" />

declare module '*.vue' {
  import { DefineComponent } from 'vue'
  // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/ban-types
  const component: DefineComponent<{}, {}, any>
  export default component
}

interface ImportMetaEnv {
  /** 服务端基础地址，如 https://api.example.com（不含 /api/v1/esports） */
  readonly VITE_API_BASE?: string
  /** 客户登录接口路径（由宿主 CMF 提供），默认 /api/v1/user/login */
  readonly VITE_USER_LOGIN_PATH?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
