# 模块 01 — UI 私有化（品牌与主题）

> **状态：** 🟢 基本完成  
> **交付基线：** [DELIVERY_STANDARD.md](../DELIVERY_STANDARD.md)  
> **最后更新：** 2026-07-04

## 1. 目标与边界

**负责：**

- 产品名、Logo、Favicon、登录页文案脱离 Virtual Browser 原厂痕迹
- Element UI 主题色、侧边栏深色风格
- 多语言文案中与品牌相关的键（`lang/zh.js`、`lang/en.js`）

**不负责：**

- 业务功能页面逻辑（环境列表、CRX 等）
- 后端 API 与权限（见 [02](02-auth-login.md)、[03](03-rbac-permissions.md)）

---

## 2. 架构与数据流

```
settings.js (title)
    ├── Sidebar/Logo.vue
    ├── utils/get-page-title.js → 浏览器标签
    └── lang/*.js (login.title 等)

variables.scss + element-variables.scss
    └── layout / login / 全局组件主色
```

**品牌一处修改：** 改 [`server/src/settings.js`](../../server/src/settings.js) 的 `title`，Logo 与页面标题自动同步。

---

## 3. 关键文件索引

| 路径 | 职责 |
|------|------|
| [`server/src/settings.js`](../../server/src/settings.js) | 产品名唯一配置源 |
| [`server/src/lang/zh.js`](../../server/src/lang/zh.js) | 中文文案 |
| [`server/src/lang/en.js`](../../server/src/lang/en.js) | 英文文案 |
| [`server/src/layout/components/Sidebar/Logo.vue`](../../server/src/layout/components/Sidebar/Logo.vue) | 侧边栏 FP 徽标 + 标题 |
| [`server/src/views/login/index.vue`](../../server/src/views/login/index.vue) | 登录页品牌区与表单 |
| [`server/src/styles/variables.scss`](../../server/src/styles/variables.scss) | 侧边栏 slate 配色 |
| [`server/src/styles/element-variables.scss`](../../server/src/styles/element-variables.scss) | 主色 `#0ea5e9` |
| [`server/public/favicon.svg`](../../server/public/favicon.svg) | 标签页图标 |
| [`server/public/index.html`](../../server/public/index.html) | favicon 引用 |

---

## 4. 已完成清单

- [x] **1.1** 品牌替换 — 产品名「指纹浏览器控制台」— `settings.js`、`lang/zh.js`、`lang/en.js`
- [x] **1.1** Logo — FP 渐变徽标替代原厂 64.png — `Sidebar/Logo.vue`
- [x] **1.1** 登录页 — 品牌区 + 深色渐变；移除第三方登录与 demo 账号提示 — `login/index.vue`
- [x] **1.2** 主题 — 主色 `#0ea5e9`；侧边栏 `#0f172a` / 激活 `#38bdf8` — `variables.scss`、`element-variables.scss`
- [x] **1.2** Favicon — `favicon.svg` + `index.html` 引用
- [x] **1.2** 构建验证 — `npm run build` 通过

---

## 5. 待办清单（细粒度）

| ID | 任务 | 验收标准 | 优先级 | 依赖模块 |
|----|------|----------|--------|----------|
| 1.3 | staging/prod 环境变量与文档对齐 | `.env.staging` / `.env.production` 注释说明 API 基址；与 [06-deployment](06-deployment.md) 一致 | P4 | [06](06-deployment.md) |
| 1.4 | 英文文案完整审查 | `lang/en.js` 与 `zh.js` 键一一对应，无 Virtual Browser 残留 | P3 | — |
| 1.5 | 客户交付品牌包说明 | 本文档或 06 中列出：改 `settings.title`、替换 `favicon.svg`、可选 Logo 组件步骤 | P3 | — |
| 1.6 | 登录页默认密码提示 | 与 [02-auth-login](02-auth-login.md) 测试账号文档一致，生产构建去掉默认密码 | P3 | [02](02-auth-login.md) |

---

## 6. 手动验证步骤

```powershell
cd D:\bytesio\VirtualBrowser\server
npm run dev
# 打开 http://localhost:9527
```

验收点：

1. 登录页：FP 徽标 +「指纹浏览器控制台」+ 副标题；无 demo 第三方登录
2. 登录后侧边栏：FP + 产品名，深 slate 背景
3. 按钮/链接主色为天蓝 `#0ea5e9`（非 Element 默认 `#409EFF`）
4. 浏览器标签 favicon 为 FP 渐变

---

## 7. 关联模块

- **下游：** [02-auth-login](02-auth-login.md)（登录页文案与错误提示）
- **下游：** [06-deployment](06-deployment.md)（生产静态资源中的品牌资源）
