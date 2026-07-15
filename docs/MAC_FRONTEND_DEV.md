# Mac 前端开发（不跑实机装包）

> 适用：只有 Mac，优先把 **server 管理端** 与 **worker 环境主页** 做扎实。  
> 指纹内核 `VirtualBrowser.exe` / Setup 安装包 → 延后到 Windows 再验。

## 能做什么 / 不能做什么

| 能力 | Mac 上 |
|------|--------|
| 管理端 UI（登录、列表、创建/编辑环境、分组、CRX 页） | ✅ |
| 指纹配置写入 `~/Library/Application Support/VirtualBrowser/` | ✅ |
| `launchBrowser` 启动真实内核 | ❌（明确报错，不阻塞其它功能） |
| worker 主页样式 / 文案 / 指纹哈希预览 | ✅（普通浏览器） |
| 打 Setup.exe / 实机装包 | ❌（Windows） |

## 一键启动

开两个终端：

```bash
# 终端 1 — 后端（登录 / 权限 / 环境元数据）
cd server-backend
cp -n .env.example .env   # 首次
npm install
npm run start:dev         # http://127.0.0.1:3001

# 终端 2 — 管理端 Vue2
cd server
npm install
npm run dev               # http://localhost:9527
```

测试账号（SQLite 本地）：`admin` / `admin123`

worker 预览（第三终端，可选）：

```bash
cd worker
npm install
npm run serve             # 默认 http://localhost:8080（占用时会自动 +1）
```

预览模式下可改 IP API：页面内输入框，或 `?apiLink=https://...`

当前已本地跑通时通常为：

| 服务 | URL |
|------|-----|
| 管理端 | http://localhost:9527 |
| 后端 | http://localhost:3001 |
| worker 预览 | http://localhost:8080 或 8081 |
| 账号 | `admin` / `admin123` |

## 数据目录（Mac）

由 `config/vb-paths.js` 解析：

```
~/Library/Application Support/VirtualBrowser/
  User Data/browser-list.json
  Workers/{id}/virtual.dat
  Extensions/
  ProfileSnapshots/
```

覆盖：`export VB_DATA_ROOT=/tmp/vb-data`

## 验收清单（Mac 阶段）

- [ ] `localhost:9527` 能登录
- [ ] 能创建 / 编辑环境（含 macOS/Linux UA 选项）
- [ ] 点「启动」看到友好提示（非 Windows），列表不被冲崩
- [ ] `worker` `npm run serve` 打开后有预览横幅，可看指纹哈希
- [ ] （可选）改 Logo / 主题 / 文案后热更新正常

## 下一步（有 Windows 再做）

1. 放入 `Chrome-bin/.../VirtualBrowser.exe`
2. E2E-2：Setup 实机装包
3. 生产 HTTPS + 重打安装包
