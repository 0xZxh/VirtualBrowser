import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common'
import * as fs from 'fs'
import * as path from 'path'
import * as maxmind from 'maxmind'
import type { CityResponse, Reader } from 'maxmind'
import { DEFAULT_LANGUAGES, languagesForCountry } from './country-languages'

export interface IpGeoResponse {
  ip: string
  country_name: string
  country_code2: string
  country_flag?: string
  city: string
  longitude: number
  latitude: number
  languages: string
  time_zone: {
    name: string
    offset_with_dst: number
  }
}

@Injectable()
export class IpGeoService implements OnModuleDestroy {
  private readonly logger = new Logger(IpGeoService.name)
  private reader: Reader<CityResponse> | null = null
  private openPromise: Promise<void> | null = null
  private readonly mmdbPath: string

  constructor() {
    const configured = process.env.GEOIP_MMDB_PATH?.trim()
    if (configured) {
      this.mmdbPath = path.isAbsolute(configured)
        ? configured
        : path.resolve(process.cwd(), configured)
    } else {
      const dataDir = process.env.DATA_DIR || path.join(process.cwd(), 'data')
      this.mmdbPath = path.join(dataDir, 'geoip', 'GeoLite2-City.mmdb')
    }
  }

  onModuleDestroy() {
    this.reader = null
    this.openPromise = null
  }

  /** Prefer X-Forwarded-For first hop, then Express req.ip / socket. */
  extractClientIp(req: {
    headers?: Record<string, string | string[] | undefined>
    ip?: string
    socket?: { remoteAddress?: string }
  }): string {
    const xff = req.headers?.['x-forwarded-for']
    if (xff) {
      const raw = Array.isArray(xff) ? xff[0] : String(xff)
      const first = raw.split(',')[0]?.trim()
      if (first) return stripIpv6Mapped(first)
    }
    if (req.ip) return stripIpv6Mapped(String(req.ip))
    if (req.socket?.remoteAddress) return stripIpv6Mapped(req.socket.remoteAddress)
    return ''
  }

  async lookup(ip: string): Promise<IpGeoResponse> {
    const cleaned = stripIpv6Mapped((ip || '').trim())
    if (!cleaned || isPrivateOrInvalidIp(cleaned)) {
      return this.fallbackResponse(cleaned || '')
    }

    await this.ensureReader()
    if (!this.reader) {
      return this.fallbackResponse(cleaned)
    }

    let city: CityResponse | null = null
    try {
      city = this.reader.get(cleaned)
    } catch (err) {
      this.logger.warn(`GeoIP lookup failed for ${cleaned}: ${(err as Error).message}`)
      return this.fallbackResponse(cleaned)
    }

    if (!city) {
      return this.fallbackResponse(cleaned)
    }

    const countryCode = city.country?.iso_code || city.registered_country?.iso_code || ''
    const countryName =
      city.country?.names?.en || city.registered_country?.names?.en || ''
    const cityName = city.city?.names?.en || ''
    const loc = city.location
    const tzName = loc?.time_zone || 'Etc/UTC'
    const latitude = typeof loc?.latitude === 'number' ? loc.latitude : 0
    const longitude = typeof loc?.longitude === 'number' ? loc.longitude : 0

    return {
      ip: cleaned,
      country_name: countryName,
      country_code2: countryCode,
      country_flag: countryCodeToFlag(countryCode),
      city: cityName,
      longitude,
      latitude,
      languages: languagesForCountry(countryCode),
      time_zone: {
        name: tzName,
        offset_with_dst: timezoneOffsetHours(tzName)
      }
    }
  }

  private fallbackResponse(ip: string): IpGeoResponse {
    return {
      ip,
      country_name: '',
      country_code2: '',
      country_flag: '',
      city: '',
      longitude: 0,
      latitude: 0,
      languages: DEFAULT_LANGUAGES,
      time_zone: {
        name: 'Etc/UTC',
        offset_with_dst: 0
      }
    }
  }

  private async ensureReader(): Promise<void> {
    if (this.reader) return
    if (this.openPromise) {
      await this.openPromise
      return
    }

    this.openPromise = (async () => {
      if (!fs.existsSync(this.mmdbPath)) {
        this.logger.warn(
          `GeoLite2 MMDB missing at ${this.mmdbPath}; IP geo will return defaults. Run: npm run geoip:update`
        )
        return
      }
      try {
        this.reader = await maxmind.open<CityResponse>(this.mmdbPath)
        this.logger.log(`GeoLite2 MMDB loaded: ${this.mmdbPath}`)
      } catch (err) {
        this.logger.error(
          `Failed to open GeoLite2 MMDB at ${this.mmdbPath}: ${(err as Error).message}`
        )
        this.reader = null
      }
    })()

    try {
      await this.openPromise
    } finally {
      if (!this.reader) {
        this.openPromise = null
      }
    }
  }
}

function stripIpv6Mapped(ip: string): string {
  const s = String(ip || '').trim()
  if (s.startsWith('::ffff:')) return s.slice(7)
  return s
}

function isPrivateOrInvalidIp(ip: string): boolean {
  if (!ip) return true

  // IPv4
  const v4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(ip)
  if (v4) {
    const a = Number(v4[1])
    const b = Number(v4[2])
    const c = Number(v4[3])
    const d = Number(v4[4])
    if ([a, b, c, d].some((n) => n > 255)) return true
    if (a === 10) return true
    if (a === 127) return true
    if (a === 0) return true
    if (a === 169 && b === 254) return true
    if (a === 192 && b === 168) return true
    if (a === 172 && b >= 16 && b <= 31) return true
    if (a === 100 && b >= 64 && b <= 127) return true // CGNAT
    if (a >= 224) return true // multicast / reserved
    return false
  }

  // IPv6 local / private-ish
  const lower = ip.toLowerCase()
  if (lower === '::1' || lower === '::') return true
  if (lower.startsWith('fc') || lower.startsWith('fd')) return true // ULA
  if (lower.startsWith('fe80:')) return true // link-local
  // crude: if it looks like IPv6, treat as public enough to look up
  if (ip.includes(':')) return false

  return true
}

function timezoneOffsetHours(timeZone: string): number {
  if (!timeZone) return 0
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone,
      timeZoneName: 'longOffset'
    }).formatToParts(new Date())
    const tzName = parts.find((p) => p.type === 'timeZoneName')?.value || ''
    // GMT, GMT+8, GMT+08:00, GMT-5:30
    const m = /GMT([+-])(\d{1,2})(?::(\d{2}))?/.exec(tzName)
    if (!m) return 0
    const sign = m[1] === '-' ? -1 : 1
    const hours = Number(m[2])
    const mins = Number(m[3] || 0)
    const total = sign * (hours + mins / 60)
    // Prefer integer when whole hours (matches existing sample / getZone usage)
    return Number.isInteger(total) ? total : Math.round(total * 100) / 100
  } catch {
    return 0
  }
}

function countryCodeToFlag(code: string): string {
  if (!/^[A-Za-z]{2}$/.test(code)) return ''
  const cc = code.toUpperCase()
  return String.fromCodePoint(...[...cc].map((c) => 127397 + c.charCodeAt(0)))
}
