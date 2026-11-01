# 实名认证 Spec

## Why

项目现有实名能力只有陪玩侧「姓名 + 身份证脱敏 + 管理员人工审核」，客户侧没有实名，且无法对接微信、支付宝等官方核验渠道。业务需要在下单、充值、提现前强制实名，并提供多渠道核验与人工兜底。

完整设计见 `docs/superpowers/specs/2026-10-27-realname-verification-design.md`。

## What Changes

- 新增统一实名档案表 `EsportsRealNameVerification`（客户 / 陪玩两种主体，一主体一条）
- 新增核验流水表 `EsportsRealNameAttempt`（审计留痕，不存证件号）
- 新增四种认证渠道 provider：`wechat`、`alipay`、`third_party`（通用 HTTP + HMAC）、`manual`（人工审核）
- 新增客户下单前、客户充值前、客户 / 陪玩提现前的实名守卫，配置默认关闭
- **BREAKING** 陪玩实名独立实体替换为通用实名能力（旧接口保留为兼容别名）；旧陪玩 `verified` 记录一次性幂等迁移
- 新增用户端通用实名页（客户 / 陪玩共用）、管理端「实名认证」菜单页
- 新增实名相关配置键、权限码、双语言包与单元测试

## Impact

- Affected specs: 实名认证、客户下单、客户充值、提现、陪玩接单资格
- Affected code:
  - `go-admin/internal/apps/esports/schema/`（新增 schema、旧 schema 标注废弃）
  - `go-admin/internal/apps/esports/realname*.go`（新增模块）
  - `go-admin/internal/apps/esports/app.go`（路由、权限码、配置声明）
  - `go-admin/internal/apps/esports/player_identity.go`、`handlers.go`、`withdrawal.go`、`recharge_intent.go`（接入守卫）
  - `e-sports-uniapp/src/pages/`（通用实名页与入口）
  - `go-admin-web/src/apps/esports/`（实名认证菜单页、陪玩详情页改造）

## ADDED Requirements

### Requirement: 统一实名档案

系统 SHALL 为客户与陪玩提供统一的实名档案，一主体一条，证件号只保存脱敏值（保留前 6 后 4），原号不落库、不写日志。

#### Scenario: 首次提交

- **WHEN** 主体提交真实姓名、身份证号、渠道与方式
- **THEN** 系统生成一条 `pending` 档案与一条核验流水，且只持久化脱敏证件号

#### Scenario: 已实名重复提交

- **WHEN** 已处于 `verified` 的主体再次提交
- **THEN** 系统返回冲突错误，不新增记录，不重复调用渠道

### Requirement: 多渠道核验

系统 SHALL 支持 `wechat`、`alipay`、`third_party`、`manual` 四种渠道，以及 `two_factor`、`face` 两种核验方式。未配置或关闭的渠道不得在用户端展示；`manual` 始终可用。

#### Scenario: 同步二要素核验

- **WHEN** 主体选择二要素方式并提交
- **THEN** 系统同步调用渠道，通过则档案置 `verified`，失败则置 `rejected` 并记录原因

#### Scenario: 人脸核身

- **WHEN** 主体选择人脸方式
- **THEN** 系统返回跳转地址或二维码并保持 `pending`；渠道回调验签通过或轮询查询通过后置 `verified`

#### Scenario: 渠道异常

- **WHEN** 渠道调用超时或返回异常
- **THEN** 系统返回「实名核验服务暂不可用，请稍后重试或选择人工审核」，不得静默通过

#### Scenario: 人工审核

- **WHEN** 主体选择人工渠道提交
- **THEN** 档案为 `pending`，管理员通过后置 `verified`，驳回后置 `rejected` 并可重新提交

### Requirement: 核验有效期

系统 SHALL 对 `pending` 的人脸 / 异步核验设置有效期（默认 30 分钟），超时置 `expired` 并把对应流水置 `abandoned`。

### Requirement: 业务实名守卫

系统 SHALL 在客户下单前、客户充值前、提现前按配置校验实名状态；管理端代下单与代充不校验。

#### Scenario: 开关关闭

- **WHEN** 对应配置项为 `false`（默认）
- **THEN** 守卫直接放行，不影响存量业务

#### Scenario: 开关开启且未实名

- **WHEN** 配置开启且主体未实名
- **THEN** 业务请求被 403 拒绝，`code=403`、`message="请先完成实名认证"`，并追加 `error_code:"realname_required"` 与 `scope`（保留框架 `code=HTTP 状态码` 口径）

#### Scenario: 管理端代操作

- **WHEN** 管理员为客户端下单或充值
- **THEN** 不触发实名守卫

### Requirement: 管理端实名管理

系统 SHALL 提供实名列表、详情、人工审核与管理端代提接口，列表按主体类型与状态筛选，并补充主体名称（查不到回落 `#ID`，无数据显示 `-`）。

### Requirement: 存量迁移

系统 SHALL 在功能集初始化时执行幂等迁移，把旧 `esports_player_identity` 中 `verified` 记录迁入统一档案（`channel=manual`、`method=manual`），旧表保留只读、不再写入。

## MODIFIED Requirements

### Requirement: 陪玩接单资格

陪玩资格置为 `qualified` 前的实名校验 SHALL 改为读取统一实名档案，行为与现状一致（未实名禁止置为 `qualified`）。

### Requirement: 陪玩实名接口

原 `/user/player/identity`、`/admin/players/:id/identity` 接口 SHALL 保留为兼容别名（内部转发统一实现、权限码不变），并新增通用实名接口 `/user/player/realname*`、`/admin/realnames*` 供前端改造后使用。

## REMOVED Requirements

### Requirement: 陪玩实名独立实体

**Reason**: 客户与陪玩使用两套实名逻辑会导致状态机、审核页与查询双源，长期维护成本翻倍。
**Migration**: 旧 `verified` 记录幂等迁入统一档案；旧 ent schema 保留但标注废弃，新代码禁止引用。
