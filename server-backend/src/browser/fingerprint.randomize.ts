import { randomBytes, randomUUID } from 'crypto'

const CPU_OPTIONS = [2, 4, 6, 8, 12]
const MEMORY_OPTIONS = [2, 4, 8, 16, 32, 64]

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]
}

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min
}

function genRandomComputerName(): string {
  return 'DESKTOP-' + randomUUID().split('-')[0].toUpperCase()
}

function genRandomMacAddr(): string {
  const bytes = [...randomBytes(6)]
  bytes[0] = (bytes[0] & 0xfc) | 0x02
  return bytes.map(b => b.toString(16).padStart(2, '0')).join('-').toUpperCase()
}

function getRandomCpuCore(): number {
  return pick(CPU_OPTIONS)
}

function getRandomMemorySize(minCpuCore: number): number {
  let start = MEMORY_OPTIONS.findIndex(size => size >= minCpuCore)
  if (start < 0) start = MEMORY_OPTIONS.length - 1
  return MEMORY_OPTIONS[start + Math.floor(Math.random() * (MEMORY_OPTIONS.length - start))]
}

function noiseChannel(): number {
  return (Math.random() - 0.5) * 20
}

/** 就地随机化指纹相关字段，保留 name/group/proxy/homepage/cookie 等业务字段 */
export function randomizeFingerprintFields(
  item: Record<string, unknown>
): Record<string, unknown> {
  const cpu = getRandomCpuCore()
  const memory = getRandomMemorySize(cpu)
  const chromeVersion = String(item.chrome_version || '默认')
  const major =
    chromeVersion === '默认' || !/^\d+/.test(chromeVersion)
      ? '146'
      : String(chromeVersion).split('.')[0]
  const arch = Math.random() < 0.5 ? 'WOW64' : 'Win64; x64'
  const ua = `Mozilla/5.0 (Windows NT 10.0; ${arch}) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${major}.0.0.0 Safari/537.36`

  const next: Record<string, unknown> = {
    ...item,
    cpu: { mode: 1, value: cpu },
    memory: { mode: 1, value: memory },
    'device-name': { mode: 1, value: genRandomComputerName() },
    mac: { mode: 1, value: genRandomMacAddr() },
    ua: { mode: 1, value: ua },
    'ua-full-version': {
      mode: 1,
      value: `${major}.0.${randomInt(1000, 9999)}.${randomInt(10, 99)}`
    },
    'sec-ch-ua': {
      mode: 0,
      value: [
        { brand: 'Chromium', version: major },
        { brand: 'Not=A?Brand', version: '99' }
      ]
    },
    canvas: {
      mode: 1,
      r: noiseChannel(),
      g: noiseChannel(),
      b: noiseChannel(),
      a: noiseChannel()
    },
    'webgl-img': {
      mode: 1,
      r: noiseChannel(),
      g: noiseChannel(),
      b: noiseChannel(),
      a: noiseChannel()
    },
    'client-rects': {
      mode: 1,
      width: (Math.random() - 0.5) * 2,
      height: (Math.random() - 0.5) * 2
    },
    'audio-context': {
      mode: 1,
      channel: Math.random() * 1e-7,
      analyer: Math.random() * 0.1
    },
    media: { mode: 1 },
    dnt: { mode: 1, value: Math.random() < 0.5 ? 0 : 1 },
    timestamp: Date.now()
  }

  return next
}
