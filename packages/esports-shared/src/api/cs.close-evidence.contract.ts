// 结单服务凭证契约检查（编译期回归）：本文件不参与任何页面渲染，只靠类型系统守住两件事：
// 1) `closeOrder` 必须保留第 5 个可选入参（已查看的服务凭证附件 ID），否则 type-check 直接报错；
// 2) `CsOrderCloseFormView.evidence_attachment_ids` 必须仍是 number[]，页面才能渲染逐张确认清单。
// 后端契约见 go-admin：`POST /admin/orders/{id}/close` 的 `viewed_evidence_attachment_ids`
// 必须覆盖 `GET /admin/orders/{id}/close-form` 返回的全部 `evidence_attachment_ids`，缺一即 400。

import type { closeOrder, CsOrderCloseFormView } from './cs';

/** 结单第 5 个入参：已查看的服务凭证附件 ID 列表。 */
type ViewedEvidenceParam = Parameters<typeof closeOrder>[4];

// 传得进去 → 类型仍在；若把该参数删掉，这里会报「不能把 number[] 赋给 undefined」。
const viewedEvidenceSample: ViewedEvidenceParam = [1, 2];
export const CLOSE_ORDER_ACCEPTS_VIEWED_EVIDENCE: boolean = viewedEvidenceSample.length === 2;

/** close-form 视图里的服务凭证附件清单字段。 */
type CloseFormEvidenceIds = CsOrderCloseFormView['evidence_attachment_ids'];

const closeFormEvidenceSample: CloseFormEvidenceIds = [1, 2];
export const CLOSE_FORM_EXPOSES_EVIDENCE_IDS: boolean = Array.isArray(closeFormEvidenceSample);
