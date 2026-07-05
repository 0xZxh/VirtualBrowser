# Mission: VirtualBrowser 私有化二开

## Why

把 VirtualBrowser 改造成可私有化交付的产品：换肤换品牌、接入真实账号与权限、按租户/角色管控浏览器环境与资产，并为将来在指纹浏览器通信层叠加业务逻辑打好基础。完成后你能独立维护一套面向客户或内部团队的指纹浏览器控制台，而不是只会用官方安装包。

## Success looks like

- 能在本地跑通 `server/` 开发环境，并理解 UI 如何经 `chrome.send` 控制浏览器环境
- 完成一次可见的 UI 私有化改动（Logo、主题色、文案/菜单）
- 设计并实现账号 + 角色 + 浏览器环境（资产）的权限模型，替换当前 mock 登录
- 能说清「前端权限层 → 业务 API → native 桥」三层各自改什么、不改什么
- 为后续在 `native.js` / 自动化层加业务钩子列出可扩展点

## Constraints

- 以当前开源仓库（`server/`、`worker/`、`automation/`）为主战场；Chromium 内核与安装包内 native 代码暂不作为首攻方向
- Windows 环境优先（项目与 VirtualBrowser 安装包均面向 Windows）
- 边做边学：每完成一小步就落地到仓库，不先堆理论

## Out of scope

- 修改 Chromium 源码或自编译浏览器内核
- Mac / Linux / Android 客户端适配
- 商业化计费、License 加密（除非后续 Mission 修订）
- 可配置 Permission 表（细粒度权限码）— **标准可交付用固定三角色**；完整 RBAC 后台为后续版本
