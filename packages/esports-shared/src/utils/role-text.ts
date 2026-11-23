// 按端的角色话术：同一个枚举值对不同角色是不同称呼，属于产品语义而非漂移。
// 本文件在 check-shared-sync.mjs 的 ALLOW_DIFF 白名单内，允许按端不同；
// 白名单只放文案常量，金额换算等逻辑必须留在 utils/format.ts（受四副本强一致校验保护）。

/** 订单 fulfillment_status = pending_customer_confirm 的展示文案。 */
export const pendingCustomerConfirmText = '待客户确认';
