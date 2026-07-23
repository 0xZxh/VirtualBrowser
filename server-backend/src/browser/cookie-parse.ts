/** Cookie header / JSON array parsing (mirrors server/lib/cookie-normalize.js). */

export const DEFAULT_COOKIE_DOMAIN = '.jddj.com'

export function sanitizeCookieDomain(domain: unknown): string {
  let d = String(domain == null ? '' : domain).trim()
  if (!d) return d
  d = d.replace(/^https?:\/\//i, '')
  const slash = d.indexOf('/')
  if (slash >= 0) d = d.slice(0, slash)
  const q = d.indexOf('?')
  if (q >= 0) d = d.slice(0, q)
  if (d.startsWith('*.')) d = `.${d.slice(2)}`
  return d
}

/** https://store.jddj.com/ → .jddj.com */
export function domainFromHomepage(url: unknown): string {
  const fallback = DEFAULT_COOKIE_DOMAIN
  if (url == null || String(url).trim() === '') return fallback
  try {
    let raw = String(url).trim()
    if (!/^https?:\/\//i.test(raw)) raw = `https://${raw}`
    const host = new URL(raw).hostname
    if (!host) return fallback
    const parts = host.split('.').filter(Boolean)
    if (parts.length >= 2) return `.${parts.slice(-2).join('.')}`
    return host.startsWith('.') ? host : `.${host}`
  } catch {
    return fallback
  }
}

export type ParsedCookie = {
  name: string
  value: string
  domain: string
  path: string
  sameSite: string
  session: boolean
  secure: boolean
  httpOnly: boolean
  [key: string]: unknown
}

export function parseCookieHeader(
  str: unknown,
  options?: { domain?: string }
): ParsedCookie[] | null {
  const text = String(str == null ? '' : str).trim()
  if (!text) return null
  if (text.startsWith('[') || text.startsWith('{')) return null
  const domain =
    options && options.domain != null && String(options.domain).trim()
      ? sanitizeCookieDomain(options.domain)
      : DEFAULT_COOKIE_DOMAIN
  const parts = text.split(';')
  const list: ParsedCookie[] = []
  for (const partRaw of parts) {
    const part = partRaw.trim()
    if (!part) continue
    const eq = part.indexOf('=')
    if (eq <= 0) continue
    const name = part.slice(0, eq).trim()
    const value = part.slice(eq + 1)
    if (!name) continue
    list.push({
      name,
      value,
      domain,
      path: '/',
      sameSite: '',
      session: false,
      secure: false,
      httpOnly: false
    })
  }
  return list.length ? list : null
}

export function parseCookieInput(
  raw: unknown,
  options?: { domain?: string; homepage?: string }
): Array<Record<string, unknown>> | null {
  if (Array.isArray(raw)) {
    return raw.length ? (raw as Array<Record<string, unknown>>) : null
  }
  if (raw == null) return null
  if (typeof raw !== 'string') return null
  const text = raw.trim()
  if (!text) return null

  const domain =
    options && options.domain != null && String(options.domain).trim()
      ? sanitizeCookieDomain(options.domain)
      : options && options.homepage
        ? domainFromHomepage(options.homepage)
        : DEFAULT_COOKIE_DOMAIN

  try {
    const parsed = JSON.parse(text) as unknown
    if (Array.isArray(parsed)) {
      return parsed.length ? (parsed as Array<Record<string, unknown>>) : null
    }
  } catch {
    // not JSON
  }

  return parseCookieHeader(text, { domain })
}
