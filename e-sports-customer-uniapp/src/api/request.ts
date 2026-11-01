// 薄转发：请求层统一由共享包提供，各端只负责在 main.ts 注入自己的登录页 / 实名页路径。
export * from '@esports/shared/request';
