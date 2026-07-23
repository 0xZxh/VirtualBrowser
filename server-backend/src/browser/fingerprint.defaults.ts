import { BrowserEnvironmentItem } from '../environments/environment.types'
import { randomizeFingerprintFields } from './fingerprint.randomize'
import { domainFromHomepage, parseCookieInput } from './cookie-parse'

export const DEFAULT_HOMEPAGE = 'https://store.jddj.com/'

/**
 * Minimal defaults for remote/H5 create when client only sends name/group/cookie/homepage.
 */
export function buildDefaultEnvironmentItem(
  partial: Partial<BrowserEnvironmentItem> = {}
): BrowserEnvironmentItem {
  const base: Record<string, unknown> = {
    name: '',
    group: '默认分组',
    os: 'Win 11',
    chrome_version: '默认',
    proxy: {
      mode: 0,
      value: '',
      protocol: 'HTTP',
      host: '',
      port: '',
      user: '',
      pass: '',
      API: ''
    },
    cookie: {
      mode: 0,
      value: '',
      jsonStr: ''
    },
    homepage: {
      mode: 1,
      value: DEFAULT_HOMEPAGE
    },
    webrtc: { mode: 0 },
    location: { mode: 2, enable: 1, precision: 1000 },
    screen: { mode: 0, width: 1920, height: 1080, _value: '1920 x 1080' },
    fonts: { mode: 1, value: [] },
    webgl: { mode: 1, vendor: 'Google Inc. (Intel)' },
    ssl: { mode: 0, value: [] },
    gpu: { mode: 1, value: 1 },
    'port-scan': { mode: 1, value: [] },
    'ua-language': { mode: 2, language: 'zh-CN', value: 'zh-CN,zh' },
    'time-zone': {
      mode: 2,
      zone: 'UTC+8:00',
      utc: 'Asia/Shanghai',
      locale: 'zh-CN',
      name: '(UTC+08:00) Beijing',
      value: 8
    },
    ...partial
  }

  const randomized = randomizeFingerprintFields(base)

  // Preserve explicit business fields from partial after randomize
  if (partial.name != null) randomized.name = partial.name
  if (partial.group != null) randomized.group = partial.group
  if (partial.homepage != null) {
    randomized.homepage = partial.homepage
  } else if (
    !randomized.homepage ||
    typeof randomized.homepage !== 'object' ||
    !(randomized.homepage as { value?: string }).value
  ) {
    randomized.homepage = { mode: 1, value: DEFAULT_HOMEPAGE }
  } else {
    const hp = randomized.homepage as { mode?: number; value?: string }
    if (hp.mode === 0 || !hp.value) {
      randomized.homepage = { mode: 1, value: DEFAULT_HOMEPAGE }
    }
  }

  const homepageValue =
    (randomized.homepage as { value?: string } | undefined)?.value ||
    DEFAULT_HOMEPAGE

  if (partial.cookie != null) {
    randomized.cookie = normalizeCookieInput(partial.cookie, homepageValue)
  }

  if (partial.proxy != null) randomized.proxy = partial.proxy
  if (partial.os != null) randomized.os = partial.os
  if (partial.chrome_version != null) randomized.chrome_version = partial.chrome_version

  return randomized as BrowserEnvironmentItem
}

function normalizeCookieInput(
  cookie: unknown,
  homepage?: string
): {
  mode: number
  value: unknown
  jsonStr: string
} {
  if (!cookie || typeof cookie !== 'object') {
    return { mode: 0, value: '', jsonStr: '' }
  }
  const c = cookie as Record<string, unknown>
  let value = c.value
  let jsonStr = c.jsonStr != null ? String(c.jsonStr) : ''
  let mode = Number(c.mode)
  const domain = domainFromHomepage(homepage || DEFAULT_HOMEPAGE)

  const fillDefaults = (list: Array<Record<string, unknown>>) =>
    list.map(item => {
      if (!item || typeof item !== 'object') return item
      const out = { ...item }
      if (out.domain == null || out.domain === '') out.domain = domain
      if (out.path == null || out.path === '') out.path = '/'
      return out
    })

  if ((!Array.isArray(value) || !value.length) && jsonStr.trim()) {
    const parsed = parseCookieInput(jsonStr, { domain, homepage })
    if (parsed && parsed.length) {
      value = fillDefaults(parsed)
      mode = 1
      jsonStr = JSON.stringify(value, null, 2)
    }
  } else if (Array.isArray(value) && value.length) {
    mode = 1
    value = fillDefaults(value as Array<Record<string, unknown>>)
    if (!jsonStr.trim()) {
      jsonStr = JSON.stringify(value, null, 2)
    }
  } else if (typeof value === 'string' && value.trim()) {
    const parsed = parseCookieInput(value, { domain, homepage })
    if (parsed && parsed.length) {
      value = fillDefaults(parsed)
      mode = 1
      jsonStr = JSON.stringify(value, null, 2)
    }
  }

  if (!Number.isFinite(mode)) {
    mode = Array.isArray(value) && value.length ? 1 : 0
  }

  return { mode, value: value ?? '', jsonStr }
}

/** Merge client partial with defaults; fill missing fingerprint keys only. */
export function withEnvironmentDefaults(
  item: Partial<BrowserEnvironmentItem> | null | undefined
): BrowserEnvironmentItem {
  const src = item && typeof item === 'object' ? item : {}
  const needsDefaults =
    src.os == null ||
    src.ua == null ||
    src.proxy == null ||
    src.homepage == null ||
    (src.homepage &&
      typeof src.homepage === 'object' &&
      (!(src.homepage as { value?: string }).value ||
        Number((src.homepage as { mode?: number }).mode) === 0))

  if (!needsDefaults && src.cpu != null && src.mac != null) {
    // Still ensure homepage default if empty string mode
    const hp = src.homepage as { mode?: number; value?: string } | undefined
    if (!hp || hp.mode === 0 || !hp.value) {
      return {
        ...(src as BrowserEnvironmentItem),
        homepage: { mode: 1, value: DEFAULT_HOMEPAGE }
      }
    }
    if (src.cookie != null) {
      return {
        ...(src as BrowserEnvironmentItem),
        cookie: normalizeCookieInput(src.cookie, hp.value)
      }
    }
    return src as BrowserEnvironmentItem
  }

  return buildDefaultEnvironmentItem(src)
}
