# VirtualBrowser 私有化二开 Resources

## Knowledge

- [VirtualBrowser README（本仓库）](./README.md)
  项目定位、指纹能力列表、自动化入口。Use for: 理解产品边界与开源部分范围。
- [vue-element-admin — Permission](https://panjiachen.github.io/vue-element-admin-site/guide/essentials/permission.html)
  路由级 + 按钮级 RBAC 的标准实现（`permission.js`、`v-permission`）。Use for: 账号权限体系二开的主参考；server 即基于此模板。
- [vue-element-admin — Router and Nav](https://panjiachen.github.io/vue-element-admin-site/guide/essentials/router-and-nav.html)
  `constantRoutes` / `asyncRoutes` 与 sidebar 生成规则。Use for: 改菜单、加管理页、按角色隐藏模块。
- [Playwright — BrowserContext](https://playwright.dev/docs/api/class-browsercontext)
  持久化上下文与 `launchPersistentContext`。Use for: `automation/` 与 worker 目录联调、未来业务脚本层。
- [Chromium WebUI — chrome.send 模式](https://chromium.googlesource.com/chromium/src/+/refs/heads/main/docs/webui/webui_explainer.md)
  WebUI 页面如何通过 Mojo/JS 与 C++ 通信。Use for: 理解 `server/src/api/native.js` 为何用 `chrome.send`（概念层，非逐行对照）。

## Wisdom (Communities)

- [VirtualBrowser GitHub Issues](https://github.com/Virtual-Browser/VirtualBrowser/issues)
  官方开源反馈渠道。Use for: 兼容性、二开踩坑、与上游对齐行为。
- [vue-element-admin GitHub Discussions](https://github.com/PanJiaChen/vue-element-admin/discussions)
  管理端模板社区。Use for: 权限、动态路由、后端对接模式。

## Gaps

- VirtualBrowser **私有化部署官方文档**（如何将 build 产物打进安装包）— 需从 Releases / 社区或逆向现有安装结构补齐
- **浏览器环境多租户隔离** 与后端 API 的推荐架构 — 需在本 Mission 推进中自行设计并记录为 learning record
- `chrome.send` 可用方法完整列表 — 需对照运行中 VirtualBrowser 或安装包内 WebUI 绑定
