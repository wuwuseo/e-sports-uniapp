# Checklist

- [x] 新增 2 张表、扩 2 张表按 spec 落地，唯一索引齐全（签约账户组合唯一、batch_no、idem_key、provider_order_no）
- [x] `payout_provider` 默认 `manual`，未配置云账户时预览/提交返回明确错误且管理端按钮禁用
- [x] 云账户公私钥 PEM 单独成键，任何接口与日志不回显密钥与完整卡号
- [x] 陪玩未签约收款账户时，代发渠道提现申请被拒绝并提示先签约
- [x] 批量提交前 Σnet_cents 与批次 total_cents 不一致时整批拒绝
- [x] 同一周同一服务商重复提交只生成一个批次（连点幂等）
- [x] 服务商明确拒绝置 `pay_failed` 且提现单保持 `approved`；超时/读响应失败保持 `pay_requested` 等查单
- [x] 回调重复到达不重复落账；验签失败不修改任何业务状态
- [x] 代发成功在同一事务内把 payout 置 `paid`、提现单置 `paid`，回填服务商单号与到账时间
- [x] 批次部分失败时状态为 `partial`，失败明细可重试且不重复出款
- [x] 定时任务 `esports_sync_payout_batches` 与 `cron_seeds.go` 成对注册，一致性测试通过
- [x] 管理端「批量代发」Tab 有二次确认（笔数 + 总金额），批次明细与手动同步可用
- [x] 陪玩端钱包页收款账户卡片展示状态/脱敏账号，签约与解约可用
- [x] `payout_provider=manual` 时人工打款双人复核链路行为与改动前完全一致
- [x] 审核人不得提交代发批次（职责分离校验生效）
- [x] README 已补充配置项、接口、状态机与上线顺序（先 manual，联调后切 yunzhanghu）
- [x] 后端全量测试与前端类型检查/构建通过
