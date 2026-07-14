# packaging — VirtualBrowser 客户端安装包

产出 `VirtualBrowser-Setup-{version}.exe`（NSIS），捆绑：

| 组件 | 来源 |
|------|------|
| 管理 UI | `server/dist/server/` |
| Electron 壳 | `desktop-shell/` |
| 指纹内核 | `Chrome-bin/VirtualBrowser/146.x/` |
| 客户端配置 | `config/client.json`（构建时由模板生成） |
| native-runtime | `server/lib/` + 运行时 npm 子集（`server/node_modules/adm-zip` 等） |

## 快速开始

```powershell
cd D:\bytesio\VirtualBrowser\packaging\scripts
.\build-client.ps1 -CloudApiBase "https://your-api.example.com"
```

可选参数：

| 参数 | 说明 | 默认 |
|------|------|------|
| `-CloudApiBase` | 云端 HTTPS API 根地址（写入 `VUE_APP_BASE_API`） | 模板内占位符 |
| `-ProductVersion` | 安装包版本号 | `0.1.0` |
| `-SkipUiBuild` | 跳过 `server` 前端构建 | false |
| `-SkipNsis` | 仅 staging，不调用 makensis | false |

## 目录

```
packaging/
├── config/client.json.template   # 构建时复制为 repo/config/client.json
├── nsis/installer.nsi            # NSIS 安装脚本
├── scripts/build-client.ps1      # 主编排脚本
└── staging/                      # 构建输出（gitignore 建议忽略）
```

## 依赖

- Node.js 18+、`npm`
- [NSIS 3](https://nsis.sourceforge.io/)（`makensis` 在 PATH 中）— 仅完整安装包需要
- Windows（客户端交付目标平台）

## 安装行为

- 默认安装到 `%LOCALAPPDATA%\Programs\VirtualBrowser`
- 创建桌面与开始菜单快捷方式
- **卸载保留** `%LOCALAPPDATA%\VirtualBrowser\` 用户数据（见 `installer.nsi`）

## 验证

1. `build-client.ps1` 退出码 0
2. `packaging/staging/` 含 `VirtualBrowser.exe`、`dist/server/`、`Chrome-bin/`、`config/client.json`
3. 若已安装 NSIS：`packaging/output/VirtualBrowser-Setup-*.exe` 存在
