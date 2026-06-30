# Mission 确立：私有化 + UI + 账号资产权限

用户二开目标已明确：私有化交付、定制 UI、建立账号与浏览器环境（资产）的权限体系，并预留将来在 native/自动化通信层叠加业务逻辑的空间。当前开源部分以 `server/`（Vue 管理端）、`worker/`、`automation/` 为主；Chromium 内核不在首阶段范围。

**Implications：** 教学顺序应优先「架构地图 → 跑通 dev → UI 小改 → 权限模型设计 → 替换 mock 登录 → native 桥扩展点」，而非先碰指纹算法或内核。
