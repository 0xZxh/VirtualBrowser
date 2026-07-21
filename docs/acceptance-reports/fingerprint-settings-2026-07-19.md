# 指纹设置生效门禁 — Agent-Settings — 2026-07-19

## 范围

- **任务 ID：** fingerprint-probe / fix-settings-gaps
- **认领表：** 见 [`AGENT_COORDINATION.md`](../AGENT_COORDINATION.md)
- **脚本：** `server/lib/__tests__/fingerprint-runtime-probe.js`
- **数据根：** `C:/Users/AAA/AppData/Local/Temp/vb-fp-probe-z9Qlkc`（临时 VB_DATA_ROOT）
- **变更文件：**
  - `server/src/views/browser/index.vue`（cookie jsonStr↔value、GetAPIProxy await）
  - `server/lib/native-runtime.js`（checkProxy TCP/HTTP）
  - `server/lib/cdp-navigate.js`（导出 cdpEvaluate）
  - `server/lib/__tests__/fingerprint-runtime-probe.js`

## 门禁结论

**✅ 门禁通过**（非 skip 项全绿）

## 验证记录

| ID | 项 | 结果 | 明细 |
|----|----|------|------|
| cookie-dat | Cookie 写入 virtual.dat | ✅ pass | dat 含 1 条 cookie |
| launch | launchBrowser | ✅ pass | debuggingPort=19200 startupUrl=https://example.com/vb-probe-home |
| homepage | 主页 URL | ✅ pass | https://example.com/vb-probe-home |
| ua | UA | ✅ pass | Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36 VBProbeUAMarker/19.7.1 |
| language | 语言 | ✅ pass | af-ZA / ["af-ZA","af","zh-CN","zh"] |
| timezone | 时区 | ✅ pass | Pacific/Auckland |
| screen | 屏幕 | ✅ pass | 1234x567 |
| cpu | CPU | ✅ pass | 3 |
| memory | 内存 | ✅ pass | 2 |
| webgl | WebGL | ✅ pass | Google Inc. (NVIDIA) \| ANGLE (NVIDIA, NVIDIA GeForce GTX 1050 Ti Direct3D11 vs_5_0 ps_5_0) |
| dnt | DNT | ✅ pass | 1 |
| proxy-egress | 代理出口 IP | ⏭ skip | 本轮环境未配置代理 |
| cookie-cdp | Cookie CDP 注入 | ✅ pass | {"name":"vb_probe","value":"cookie-gate-1","domain":".example.com","path":"/","expires":-1,"size":21,"httpOnly":false,"secure":false,"session":true,"priority":"Medium","sourceScheme":"Secure","sourcePort":443} |
| adv-canvas | Canvas 噪声（高级） | ⏭ skip | 本轮不阻塞门禁；未做像素差分 |
| adv-webrtc | WebRTC（高级） | ⏭ skip | 本轮不阻塞门禁 |

## 探测配置（奇异值）

```json
{
  "uaMarker": "VBProbeUAMarker/19.7.1",
  "language": "af-ZA",
  "timeZone": "Pacific/Auckland",
  "screen": [
    1234,
    567
  ],
  "cpu": 3,
  "memory": 2,
  "webgl": {
    "vendor": "Google Inc. (NVIDIA)",
    "render": "ANGLE (NVIDIA, NVIDIA GeForce GTX 1050 Ti Direct3D11 vs_5_0 ps_5_0)"
  },
  "dnt": 1,
  "homepage": "https://example.com/vb-probe-home"
}
```

## CDP 原始采样

```json
{
  "ua": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36 VBProbeUAMarker/19.7.1",
  "language": "af-ZA",
  "languages": [
    "af-ZA",
    "af",
    "zh-CN",
    "zh"
  ],
  "timeZone": "Pacific/Auckland",
  "screenW": 1234,
  "screenH": 567,
  "cpu": 3,
  "memory": 2,
  "dnt": "1",
  "webglVendor": "Google Inc. (NVIDIA)",
  "webglRenderer": "ANGLE (NVIDIA, NVIDIA GeForce GTX 1050 Ti Direct3D11 vs_5_0 ps_5_0)",
  "href": "https://example.com/vb-probe-home"
}
```

## 主页目标

```json
{
  "ok": true,
  "url": "https://example.com/vb-probe-home"
}
```

## 命令

```powershell
node server/lib/__tests__/fingerprint-runtime-probe.js
```

## 与文档差异 / 未达标说明

- 未探测通过的项**不得宣传为已生效**；「能保存」≠「指纹窗生效」。
- Cookie CDP `Network.getCookies`：若内核未注入则标 fail/skip，dat 落盘单独计分。
- 代理出口 IP：本轮未配置代理 → skip。
- 高级项（Canvas 噪声、WebRTC 等）本轮仅记录，不阻塞基础门禁。

## 用户验收勾选

对照管理端基础/高级表单：改一项 → 保存 → 启动 → 本脚本复核。
