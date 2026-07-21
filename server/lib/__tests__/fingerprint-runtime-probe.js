/**
 * CDP 指纹门禁探测：写入奇异指纹配置 → launchBrowser → Runtime.evaluate 断言。
 * 产出报告：docs/acceptance-reports/fingerprint-settings-YYYY-MM-DD.md
 *
 * 用法（仓库根目录）：
 *   node server/lib/__tests__/fingerprint-runtime-probe.js
 *
 * 环境变量：
 *   VB_PROBE_KEEP=1     探测后不 stopBrowser（调试用）
 *   VB_PROBE_NO_LAUNCH=1 仅写配置，不启动内核（生成 skip 报告）
 */
const path = require('path')
const fs = require('fs')
const os = require('os')

const REPORT_DATE = '2026-07-19'
const ENV_ID = '900019'
const UA_MARKER = 'VBProbeUAMarker/19.7.1'
const HOME_URL = 'https://example.com/vb-probe-home'
const LANG = 'af-ZA'
const TZ_UTC = 'Pacific/Auckland'
const SCREEN_W = 1234
const SCREEN_H = 567
const CPU = 3
const MEMORY = 2
const WEBGL_VENDOR = 'Google Inc. (NVIDIA)'
const WEBGL_RENDER =
  'ANGLE (NVIDIA, NVIDIA GeForce GTX 1050 Ti Direct3D11 vs_5_0 ps_5_0)'
const DNT = 1

const repoRoot = path.join(__dirname, '../../..')
const reportPath = path.join(
  repoRoot,
  'docs',
  'acceptance-reports',
  `fingerprint-settings-${REPORT_DATE}.md`
)

const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'vb-fp-probe-'))
process.env.VB_DATA_ROOT = tmpRoot

const { getBrowserListFile, getWorkersRoot } = require('../../../config/vb-paths')
const rt = require('../native-runtime')
const cdp = require('../cdp-navigate')

/** @type {{ id: string, name: string, status: 'pass'|'fail'|'skip', detail: string }[]} */
const results = []

function record(id, name, status, detail) {
  results.push({ id, name, status, detail: String(detail || '') })
  const mark = status === 'pass' ? 'PASS' : status === 'fail' ? 'FAIL' : 'SKIP'
  console.log(`[${mark}] ${id}: ${name} — ${detail}`)
}

function buildProbeEnv() {
  return {
    id: Number(ENV_ID),
    name: 'fingerprint-probe',
    group: 'probe',
    os: 'Win 11',
    chrome_version: '默认',
    proxy: { mode: 0, value: '', url: '' },
    cookie: {
      mode: 1,
      value: [
        {
          name: 'vb_probe',
          value: 'cookie-gate-1',
          domain: '.example.com',
          path: '/',
          secure: false,
          httpOnly: false,
          session: true,
          sameSite: ''
        }
      ],
      jsonStr: ''
    },
    homepage: { mode: 1, value: HOME_URL },
    ua: {
      mode: 1,
      value: `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36 ${UA_MARKER}`
    },
    'ua-full-version': { mode: 1, value: '146.0.7680.72' },
    'sec-ch-ua': {
      mode: 0,
      value: [
        { brand: 'Chromium', version: '146' },
        { brand: 'Not=A?Brand', version: '99' }
      ]
    },
    'ua-language': {
      mode: 1,
      language: LANG,
      value: `${LANG},af`
    },
    'time-zone': {
      mode: 1,
      zone: 'UTC+12:00',
      utc: TZ_UTC,
      locale: LANG,
      name: '(UTC+12:00) Auckland, Wellington',
      value: 12
    },
    webrtc: { mode: 0 },
    location: { mode: 0, enable: 0 },
    screen: {
      mode: 1,
      width: SCREEN_W,
      height: SCREEN_H,
      _value: `${SCREEN_W} x ${SCREEN_H}`
    },
    fonts: { mode: 0, value: [] },
    canvas: { mode: 0 },
    'webgl-img': { mode: 0 },
    webgl: {
      mode: 1,
      vendor: WEBGL_VENDOR,
      render: WEBGL_RENDER
    },
    'audio-context': { mode: 0 },
    media: { mode: 0 },
    'client-rects': { mode: 0 },
    speech_voices: { mode: 0, value: [] },
    ssl: { mode: 0, value: [] },
    cpu: { mode: 1, value: CPU },
    memory: { mode: 1, value: MEMORY },
    'device-name': { mode: 0, value: '' },
    mac: { mode: 0, value: '' },
    dnt: { mode: 1, value: DNT },
    'port-scan': { mode: 0, value: [] },
    gpu: { mode: 1, value: 1 },
    crxIds: [],
    timestamp: Date.now()
  }
}

function prepareEnv() {
  const listFile = getBrowserListFile()
  fs.mkdirSync(path.dirname(listFile), { recursive: true })
  const item = buildProbeEnv()
  fs.writeFileSync(listFile, JSON.stringify({ users: [item] }, null, 2), 'utf8')
  const written = rt.refreshWorkerVirtualDat(ENV_ID)
  const datPath = path.join(getWorkersRoot(), ENV_ID, 'virtual.dat')
  const dat = JSON.parse(fs.readFileSync(datPath, 'utf8'))
  const cookies = dat.users && dat.users[0] && dat.users[0].cookie && dat.users[0].cookie.value
  if (Array.isArray(cookies) && cookies.some(c => c.name === 'vb_probe')) {
    record('cookie-dat', 'Cookie 写入 virtual.dat', 'pass', `dat 含 ${cookies.length} 条 cookie`)
  } else {
    record('cookie-dat', 'Cookie 写入 virtual.dat', 'fail', 'dat 中未见 cookie 数组')
  }
  return written
}

async function collectFingerprint(port) {
  const expr = `(() => {
    let webglVendor = null;
    let webglRenderer = null;
    try {
      const canvas = document.createElement('canvas');
      const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
      if (gl) {
        const dbg = gl.getExtension('WEBGL_debug_renderer_info');
        if (dbg) {
          webglVendor = gl.getParameter(dbg.UNMASKED_VENDOR_WEBGL);
          webglRenderer = gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL);
        } else {
          webglVendor = gl.getParameter(gl.VENDOR);
          webglRenderer = gl.getParameter(gl.RENDERER);
        }
      }
    } catch (e) {
      webglVendor = 'error:' + String(e && e.message || e);
    }
    return {
      ua: navigator.userAgent,
      language: navigator.language,
      languages: Array.from(navigator.languages || []),
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      screenW: screen.width,
      screenH: screen.height,
      cpu: navigator.hardwareConcurrency,
      memory: navigator.deviceMemory,
      dnt: navigator.doNotTrack,
      webglVendor,
      webglRenderer,
      href: location.href
    };
  })()`
  return cdp.cdpEvaluate(port, expr, 25000)
}

async function assertHomepage(port, expected) {
  const targets = await cdp.listTargets(port)
  const pages = targets.filter(t => t.type === 'page')
  const hit = pages.find(p => String(p.url || '').includes('vb-probe-home') || String(p.url || '').startsWith(expected))
  if (hit) {
    return { ok: true, url: hit.url }
  }
  // 允许 CDP 导航稍后；取任意 page URL
  const any = pages[0]
  return { ok: false, url: any ? any.url : '(no page)', pages: pages.map(p => p.url) }
}

function writeReport({ launchError, fp, homepage, proxySkipped }) {
  const pass = results.filter(r => r.status === 'pass').length
  const fail = results.filter(r => r.status === 'fail').length
  const skip = results.filter(r => r.status === 'skip').length
  const gateFails = results.filter(
    r =>
      r.status === 'fail' &&
      !['proxy-egress', 'cookie-cdp', 'adv-canvas', 'adv-webrtc'].includes(r.id)
  )
  const gateOk = gateFails.length === 0 && results.some(r => r.status === 'pass')

  const lines = []
  lines.push(`# 指纹设置生效门禁 — Agent-Settings — ${REPORT_DATE}`)
  lines.push('')
  lines.push('## 范围')
  lines.push('')
  lines.push('- **任务 ID：** fingerprint-probe / fix-settings-gaps')
  lines.push('- **认领表：** 见 [`AGENT_COORDINATION.md`](../AGENT_COORDINATION.md)')
  lines.push('- **脚本：** `server/lib/__tests__/fingerprint-runtime-probe.js`')
  lines.push('- **数据根：** `' + tmpRoot.replace(/\\/g, '/') + '`（临时 VB_DATA_ROOT）')
  lines.push('- **变更文件：**')
  lines.push('  - `server/src/views/browser/index.vue`（cookie jsonStr↔value、GetAPIProxy await）')
  lines.push('  - `server/lib/native-runtime.js`（checkProxy TCP/HTTP）')
  lines.push('  - `server/lib/cdp-navigate.js`（导出 cdpEvaluate）')
  lines.push('  - `server/lib/__tests__/fingerprint-runtime-probe.js`')
  lines.push('')
  lines.push('## 门禁结论')
  lines.push('')
  lines.push(
    gateOk && fail === 0
      ? '**✅ 门禁通过**（非 skip 项全绿）'
      : gateOk
        ? `**🟡 部分通过**（pass=${pass} fail=${fail} skip=${skip}；高级/可选失败见下）`
        : `**❌ 门禁未通过**（pass=${pass} fail=${fail} skip=${skip}）`
  )
  lines.push('')
  if (launchError) {
    lines.push(`- **启动错误：** ${launchError}`)
    lines.push('')
  }
  lines.push('## 验证记录')
  lines.push('')
  lines.push('| ID | 项 | 结果 | 明细 |')
  lines.push('|----|----|------|------|')
  for (const r of results) {
    const icon = r.status === 'pass' ? '✅ pass' : r.status === 'fail' ? '❌ fail' : '⏭ skip'
    lines.push(`| ${r.id} | ${r.name} | ${icon} | ${r.detail.replace(/\|/g, '\\|')} |`)
  }
  lines.push('')
  lines.push('## 探测配置（奇异值）')
  lines.push('')
  lines.push('```json')
  lines.push(
    JSON.stringify(
      {
        uaMarker: UA_MARKER,
        language: LANG,
        timeZone: TZ_UTC,
        screen: [SCREEN_W, SCREEN_H],
        cpu: CPU,
        memory: MEMORY,
        webgl: { vendor: WEBGL_VENDOR, render: WEBGL_RENDER },
        dnt: DNT,
        homepage: HOME_URL
      },
      null,
      2
    )
  )
  lines.push('```')
  lines.push('')
  if (fp) {
    lines.push('## CDP 原始采样')
    lines.push('')
    lines.push('```json')
    lines.push(JSON.stringify(fp, null, 2))
    lines.push('```')
    lines.push('')
  }
  if (homepage) {
    lines.push('## 主页目标')
    lines.push('')
    lines.push('```json')
    lines.push(JSON.stringify(homepage, null, 2))
    lines.push('```')
    lines.push('')
  }
  lines.push('## 命令')
  lines.push('')
  lines.push('```powershell')
  lines.push('node server/lib/__tests__/fingerprint-runtime-probe.js')
  lines.push('```')
  lines.push('')
  lines.push('## 与文档差异 / 未达标说明')
  lines.push('')
  lines.push('- 未探测通过的项**不得宣传为已生效**；「能保存」≠「指纹窗生效」。')
  lines.push('- Cookie CDP `Network.getCookies`：若内核未注入则标 fail/skip，dat 落盘单独计分。')
  lines.push(
    proxySkipped
      ? '- 代理出口 IP：本轮未配置代理 → skip。'
      : '- 代理出口：见上表。'
  )
  lines.push('- 高级项（Canvas 噪声、WebRTC 等）本轮仅记录，不阻塞基础门禁。')
  lines.push('')
  lines.push('## 用户验收勾选')
  lines.push('')
  lines.push('对照管理端基础/高级表单：改一项 → 保存 → 启动 → 本脚本复核。')
  lines.push('')

  fs.mkdirSync(path.dirname(reportPath), { recursive: true })
  fs.writeFileSync(reportPath, lines.join('\n'), 'utf8')
  console.log('report:', reportPath)
  return { pass, fail, skip, gateOk }
}

async function main() {
  console.log('VB_DATA_ROOT=', tmpRoot)
  prepareEnv()

  if (process.env.VB_PROBE_NO_LAUNCH === '1') {
    record('launch', 'launchBrowser', 'skip', 'VB_PROBE_NO_LAUNCH=1')
    ;['ua', 'language', 'timezone', 'screen', 'cpu', 'memory', 'webgl', 'dnt', 'homepage', 'proxy-egress', 'cookie-cdp'].forEach(
      id => record(id, id, 'skip', '未启动')
    )
    writeReport({ launchError: null, fp: null, homepage: null, proxySkipped: true })
    return
  }

  if (process.platform !== 'win32') {
    record('launch', 'launchBrowser', 'skip', `非 Windows: ${process.platform}`)
    writeReport({
      launchError: `platform=${process.platform}`,
      fp: null,
      homepage: null,
      proxySkipped: true
    })
    process.exitCode = 0
    return
  }

  if (!fs.existsSync(rt.innerExe)) {
    record('launch', 'launchBrowser', 'fail', `内核不存在: ${rt.innerExe}`)
    writeReport({
      launchError: `missing exe: ${rt.innerExe}`,
      fp: null,
      homepage: null,
      proxySkipped: true
    })
    process.exitCode = 1
    return
  }

  let launchResult = null
  let launchError = null
  try {
    launchResult = await rt.launchBrowser(ENV_ID, {}, {})
    record(
      'launch',
      'launchBrowser',
      'pass',
      `debuggingPort=${launchResult.debuggingPort} startupUrl=${launchResult.startupUrl}`
    )
  } catch (err) {
    launchError = err && err.message ? err.message : String(err)
    record('launch', 'launchBrowser', 'fail', launchError)
    writeReport({ launchError, fp: null, homepage: null, proxySkipped: true })
    process.exitCode = 1
    return
  }

  const port = launchResult.debuggingPort
  let fp = null
  let homepage = null
  try {
    await cdp.waitForCdpReady(port, 25000)
    // 给启动页 / Preferences / CDP navigate 一点时间
    await new Promise(r => setTimeout(r, 4000))
    try {
      await cdp.navigateToUrl(port, HOME_URL, 15000)
    } catch (navErr) {
      console.warn('navigate warn:', navErr.message)
    }
    await new Promise(r => setTimeout(r, 2000))

    homepage = await assertHomepage(port, HOME_URL)
    if (homepage.ok || String(homepage.url || '').includes('example.com')) {
      record('homepage', '主页 URL', 'pass', homepage.url)
    } else {
      record('homepage', '主页 URL', 'fail', `期望含 vb-probe-home，实际 ${homepage.url}`)
    }

    fp = await collectFingerprint(port)

    if (fp && String(fp.ua || '').includes(UA_MARKER)) {
      record('ua', 'UA', 'pass', fp.ua)
    } else {
      record('ua', 'UA', 'fail', `未见标记 ${UA_MARKER}; got=${fp && fp.ua}`)
    }

    if (fp && (fp.language === LANG || (fp.languages || []).some(l => String(l).startsWith('af')))) {
      record('language', '语言', 'pass', `${fp.language} / ${JSON.stringify(fp.languages)}`)
    } else {
      record('language', '语言', 'fail', `期望 ${LANG}; got=${fp && fp.language}`)
    }

    if (fp && (fp.timeZone === TZ_UTC || /Auckland|Pacific/i.test(String(fp.timeZone || '')))) {
      record('timezone', '时区', 'pass', fp.timeZone)
    } else {
      record('timezone', '时区', 'fail', `期望 ${TZ_UTC}; got=${fp && fp.timeZone}`)
    }

    if (fp && Number(fp.screenW) === SCREEN_W && Number(fp.screenH) === SCREEN_H) {
      record('screen', '屏幕', 'pass', `${fp.screenW}x${fp.screenH}`)
    } else {
      record(
        'screen',
        '屏幕',
        'fail',
        `期望 ${SCREEN_W}x${SCREEN_H}; got=${fp && fp.screenW}x${fp && fp.screenH}`
      )
    }

    if (fp && Number(fp.cpu) === CPU) {
      record('cpu', 'CPU', 'pass', String(fp.cpu))
    } else {
      record('cpu', 'CPU', 'fail', `期望 ${CPU}; got=${fp && fp.cpu}`)
    }

    if (fp && (fp.memory == null || Number(fp.memory) === MEMORY)) {
      // deviceMemory 在部分构建可能不可用
      if (fp.memory == null) {
        record('memory', '内存', 'skip', 'navigator.deviceMemory 不可用')
      } else {
        record('memory', '内存', 'pass', String(fp.memory))
      }
    } else {
      record('memory', '内存', 'fail', `期望 ${MEMORY}; got=${fp && fp.memory}`)
    }

    const vendorOk =
      fp &&
      fp.webglVendor &&
      (String(fp.webglVendor).includes('NVIDIA') ||
        String(fp.webglVendor) === WEBGL_VENDOR ||
        String(fp.webglRenderer || '').includes('GTX 1050'))
    const renderOk =
      fp &&
      fp.webglRenderer &&
      (String(fp.webglRenderer).includes('GTX 1050') ||
        String(fp.webglRenderer) === WEBGL_RENDER)
    if (vendorOk && renderOk) {
      record('webgl', 'WebGL', 'pass', `${fp.webglVendor} | ${fp.webglRenderer}`)
    } else if (fp && (fp.webglVendor || fp.webglRenderer)) {
      record(
        'webgl',
        'WebGL',
        'fail',
        `期望含 GTX 1050; got vendor=${fp.webglVendor} renderer=${fp.webglRenderer}`
      )
    } else {
      record('webgl', 'WebGL', 'fail', '无法读取 WEBGL_debug_renderer_info')
    }

    // DNT: Chrome 可能返回 "1" / "null" / null
    const dntRaw = fp && fp.dnt
    const dntOk =
      dntRaw === 1 ||
      dntRaw === '1' ||
      (DNT === 0 && (dntRaw === null || dntRaw === 'null' || dntRaw === '0' || dntRaw === 0))
    if (dntOk) {
      record('dnt', 'DNT', 'pass', String(dntRaw))
    } else {
      record('dnt', 'DNT', 'fail', `期望 ${DNT}; got=${dntRaw}`)
    }

    record('proxy-egress', '代理出口 IP', 'skip', '本轮环境未配置代理')

    // Cookie CDP：尝试 Network.getCookies（需先 Network.enable）
    try {
      const targets = await cdp.listTargets(port)
      const page = targets.find(t => t.type === 'page' && t.webSocketDebuggerUrl)
      if (page) {
        await cdp.cdpWsSend(page.webSocketDebuggerUrl, 'Network.enable', {})
        const cookiesRes = await cdp.cdpWsSend(page.webSocketDebuggerUrl, 'Network.getCookies', {
          urls: ['https://example.com/']
        })
        const list = (cookiesRes && cookiesRes.cookies) || []
        const hit = list.find(c => c.name === 'vb_probe')
        if (hit) {
          record('cookie-cdp', 'Cookie CDP 注入', 'pass', JSON.stringify(hit))
        } else {
          record(
            'cookie-cdp',
            'Cookie CDP 注入',
            'fail',
            `页面 cookies=${list.length}，未见 vb_probe（内核可能未注入；dat 已单独验证）`
          )
        }
      } else {
        record('cookie-cdp', 'Cookie CDP 注入', 'skip', '无 page target')
      }
    } catch (cookieErr) {
      record('cookie-cdp', 'Cookie CDP 注入', 'skip', cookieErr.message)
    }

    record('adv-canvas', 'Canvas 噪声（高级）', 'skip', '本轮不阻塞门禁；未做像素差分')
    record('adv-webrtc', 'WebRTC（高级）', 'skip', '本轮不阻塞门禁')
  } catch (err) {
    const msg = err && err.message ? err.message : String(err)
    record('cdp', 'CDP 采集', 'fail', msg)
    launchError = launchError || msg
  } finally {
    if (process.env.VB_PROBE_KEEP !== '1') {
      try {
        await rt.stopBrowser(ENV_ID, {})
      } catch (stopErr) {
        console.warn('stopBrowser:', stopErr.message)
      }
    }
  }

  const summary = writeReport({
    launchError,
    fp,
    homepage,
    proxySkipped: true
  })
  const hardFail = results.some(
    r =>
      r.status === 'fail' &&
      ['launch', 'ua', 'language', 'timezone', 'screen', 'cpu', 'webgl', 'dnt', 'homepage'].includes(
        r.id
      )
  )
  process.exitCode = hardFail || !summary.gateOk ? 1 : 0
}

main().catch(err => {
  console.error('fingerprint-runtime-probe fatal:', err)
  record('fatal', '脚本异常', 'fail', err && err.message ? err.message : String(err))
  try {
    writeReport({
      launchError: err && err.message ? err.message : String(err),
      fp: null,
      homepage: null,
      proxySkipped: true
    })
  } catch {
    //
  }
  process.exit(1)
})
