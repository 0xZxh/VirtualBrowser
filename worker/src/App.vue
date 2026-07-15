<template>
  <section class="container">
    <header>
      <img src="./assets/96.png" alt="Virtual Browser" />
      <h1>Virtual Browser</h1>
    </header>
    <main>
      <div v-if="previewMode" class="preview-banner">
        {{ t.previewBanner }}
      </div>

      <div class="geo" v-show="geo.ip">
        <h3>{{ geo.ip }}</h3>
        <p>
          <span class="item country">
            <span class="muted">{{ t.refOnly }}</span>
            <span>
              <img v-if="geo.country_flag" :src="geo.country_flag" alt="" />
              {{ geo.country_name }}({{ geo.country_code2 }})
            </span>
            {{ geo.city ? '/' : '' }}
            <span>{{ geo.city }}</span>
          </span>
        </p>
        <p>
          <span class="item">
            <span>
              <b>{{ t.timezone }}:</b>
              {{ geo.time_zone && geo.time_zone.name }}
            </span>
            <span>
              <b>{{ t.coords }}:</b>
              {{ geo.longitude }}/{{ geo.latitude }}
            </span>
          </span>
        </p>
        <p>
          <span class="item">
            <span>
              <b>{{ t.fpHash }}:</b>
              {{ visitorId }}
            </span>
          </span>
        </p>
        <p>
          <span class="item platform">
            <span>
              <b>{{ t.platform }}:</b>
              {{ platformLabel }}
            </span>
            <span>
              <b>{{ t.uaHint }}:</b>
              {{ uaSummary }}
            </span>
          </span>
        </p>
      </div>

      <div v-if="!apiLinkIsValid || previewMode" class="api-panel">
        <h2 v-if="!apiLinkIsValid">{{ t.apiMissingTitle }}</h2>
        <p>{{ previewMode ? t.previewApiHint : t.apiMissingBody }}</p>
        <div class="api-row">
          <input
            v-model="apiLinkInput"
            type="url"
            :placeholder="t.apiPlaceholder"
            @keyup.enter="saveApiLink"
          />
          <button type="button" @click="saveApiLink">{{ t.saveApi }}</button>
        </div>
      </div>

      <div class="network-error" v-if="networkErr">
        <h1>{{ t.netTitle }}</h1>
        <p>{{ t.netBody }}</p>
      </div>
      <div v-if="showLimitError" class="LimitError">
        <h2>{{ t.limitTitle }}</h2>
        <p>{{ t.limitBody }}</p>
      </div>
    </main>
  </section>
</template>

<script lang="ts" setup>
import FingerprintJS from '@fingerprintjs/fingerprintjs'
import { onMounted, ref, computed } from 'vue'
import { chromeSend, getGlobalData, setGlobalData, isWorkerPreviewMode } from '@/utils/native.js'
import random from 'random'

type GeoState = {
  ip: string
  country_flag: string
  country_name: string
  country_code2: string
  city: string
  time_zone: { name: string; offset_with_dst?: number }
  longitude: string | number
  latitude: string | number
  languages?: string
}

const DEFAULT_API = 'https://api.ipgeolocation.io/ipgeo?apiKey=free&fields=geo,time_zone,languages'

const geo = ref<GeoState>({
  ip: '',
  country_flag: '',
  country_name: '',
  country_code2: '',
  city: '',
  time_zone: { name: '' },
  longitude: '',
  latitude: ''
})
const visitorId = ref('')
const networkErr = ref(false)
const apiLink = ref('')
const apiLinkInput = ref('')
const showLimitError = ref(false)
const previewMode = isWorkerPreviewMode()

const isZh = /^zh/i.test(navigator.language || '')
const t = isZh
  ? {
      previewBanner: '浏览器预览模式（Mac 开发）：可调样式与文案；setIpGeo 不会写回内核。',
      refOnly: '（仅供参考）',
      timezone: '时区',
      coords: '坐标',
      fpHash: '指纹哈希',
      platform: '运行平台',
      uaHint: 'UA 摘要',
      apiMissingTitle: 'API 链接未设置',
      apiMissingBody: '请配置 IP 查询 API，或使用下方输入框。',
      previewApiHint: '预览可填任意返回 geo JSON 的 API；保存后刷新页面。',
      apiPlaceholder: 'https://…/ipgeo',
      saveApi: '保存并加载',
      netTitle: '未连接到互联网',
      netBody: '请检查网络或代理设置，或更换 API 链接',
      limitTitle: 'IP 查询 Key 超出限制',
      limitBody: '请检查您的 API Key'
    }
  : {
      previewBanner:
        'Browser preview mode (Mac): style/copy OK; setIpGeo will not write to the kernel.',
      refOnly: '(For reference only)',
      timezone: 'Time Zone',
      coords: 'Coordinates',
      fpHash: 'Fingerprint Hash',
      platform: 'Runtime Platform',
      uaHint: 'UA Summary',
      apiMissingTitle: 'API link not set',
      apiMissingBody: 'Configure an IP lookup API below.',
      previewApiHint: 'Use any geo JSON API for preview; save then reload.',
      apiPlaceholder: 'https://…/ipgeo',
      saveApi: 'Save & load',
      netTitle: 'No internet connection',
      netBody: 'Check network/proxy or change the API link',
      limitTitle: 'IP lookup key limit exceeded',
      limitBody: 'Please check your API key'
    }

const platformLabel = computed(() => {
  const ua = navigator.userAgent || ''
  if (/Windows/i.test(ua)) return 'Windows'
  if (/Mac OS X|Macintosh/i.test(ua)) return 'macOS'
  if (/Linux|X11/i.test(ua)) return 'Linux'
  if (/Android/i.test(ua)) return 'Android'
  return navigator.platform || 'Unknown'
})

const uaSummary = computed(() => {
  const ua = navigator.userAgent || ''
  const m = ua.match(/Chrome\/([\d.]+)/)
  const chrome = m ? `Chrome/${m[1]}` : ''
  return [platformLabel.value, chrome].filter(Boolean).join(' · ')
})

const apiLinkIsValid = computed(() => apiLink.value !== '')

function normalizeGeo(res: Record<string, unknown>): GeoState {
  // 兼容 ipgeolocation / ipapi.co 等常见字段
  const timeZoneRaw = res.time_zone
  const tzObj =
    timeZoneRaw && typeof timeZoneRaw === 'object' ? (timeZoneRaw as Record<string, unknown>) : null
  const tz = tzObj || {
    name: typeof res.timezone === 'string' ? res.timezone : '',
    offset_with_dst: Number(res.utc_offset) || 0
  }
  return {
    ip: String(res.ip || res.query || ''),
    country_flag: String(res.country_flag || res.country_flag_emoji || ''),
    country_name: String(res.country_name || res.country || ''),
    country_code2: String(res.country_code2 || res.country_code || res.countryCode || ''),
    city: String(res.city || ''),
    time_zone: {
      name: String(tz.name || tz.timezone || ''),
      offset_with_dst: Number(tz.offset_with_dst ?? tz.offset ?? 0)
    },
    longitude: (res.longitude ?? res.lon ?? '') as string | number,
    latitude: (res.latitude ?? res.lat ?? '') as string | number,
    languages: String(res.languages || res.language || '')
  }
}

async function loadGeo(link: string) {
  networkErr.value = false
  showLimitError.value = false
  let req = await fetch(link).catch(err => {
    console.log(err)
    networkErr.value = true
  })
  if (!req) return

  const res = await req.json()
  if (
    res.code === -13 ||
    (res.msg && String(res.msg).includes('limit')) ||
    (res.message && String(res.message).includes('limit'))
  ) {
    showLimitError.value = true
    return
  }

  geo.value = normalizeGeo(res)

  const ipGeo = {
    'time-zone': {
      zone: getZone(Number(geo.value.time_zone.offset_with_dst) || 0),
      locale: String(geo.value.languages || '').split(',')[0] || '',
      utc: geo.value.time_zone.name
    },
    location: {
      longitude: parseFloat(String(geo.value.longitude)),
      latitude: parseFloat(String(geo.value.latitude)),
      precision: random.int(10, 5000)
    },
    'ua-language': {
      value: String(geo.value.languages || '').split(',')[0] || ''
    }
  }

  await chromeSend('setIpGeo', ipGeo).catch((err: Error) => {
    console.warn(err)
  })

  const fp = await FingerprintJS.load()
  const result = await fp.get()
  visitorId.value = result.visitorId
}

async function saveApiLink() {
  const link = (apiLinkInput.value || '').trim()
  if (!link) return
  apiLink.value = link
  await setGlobalData({ apiLink: link })
  await loadGeo(link)
}

onMounted(async () => {
  const params = new URLSearchParams(location.search)
  const qLink = params.get('apiLink')
  const store = await getGlobalData()
  const stored = qLink || store.apiLink || (previewMode ? DEFAULT_API : '')
  if (stored) {
    apiLink.value = stored
    apiLinkInput.value = stored
    if (qLink) {
      await setGlobalData({ apiLink: qLink })
    }
    await loadGeo(stored)
  } else {
    apiLinkInput.value = DEFAULT_API
  }
})

const getZone = (offset: number) => {
  const sign = offset > 0 ? '+' : '-'
  const hours = Math.floor(Math.abs(offset))
  const decimal = Math.abs(offset) - hours
  const minutes = Math.round(decimal * 60)
  const paddedMinutes = minutes < 10 ? '0' + minutes : minutes.toString()
  return `UTC${sign}${hours}:${paddedMinutes}`
}
</script>

<style lang="scss">
.container {
  width: min(1000px, 100%);
  margin: auto;
  padding: 0 16px;
  box-sizing: border-box;

  header {
    display: flex;
    align-items: center;
    justify-content: center;
    flex-wrap: wrap;

    & > * {
      margin: 10px 10px 15px;
    }
  }

  main {
    border: 1px solid #dcdfe6;
    border-radius: 4px;
    padding: 15px 30px 20px;

    @media (max-width: 640px) {
      padding: 12px 14px 16px;
    }

    .preview-banner {
      margin-bottom: 14px;
      padding: 10px 12px;
      border-radius: 6px;
      background: #f0f9ff;
      color: #0369a1;
      font-size: 14px;
      line-height: 1.5;
    }

    .api-panel {
      max-width: 640px;
      margin: 16px auto 8px;
      text-align: center;

      h2 {
        margin: 0 0 8px;
        font-size: 18px;
        font-weight: 600;
      }

      p {
        color: #606266;
        margin: 0 0 12px;
      }

      .api-row {
        display: flex;
        gap: 8px;
        flex-wrap: wrap;
        justify-content: center;

        input {
          flex: 1 1 280px;
          min-width: 0;
          height: 36px;
          padding: 0 10px;
          border: 1px solid #dcdfe6;
          border-radius: 4px;
        }

        button {
          height: 36px;
          padding: 0 14px;
          border: none;
          border-radius: 4px;
          background: #0ea5e9;
          color: #fff;
          cursor: pointer;
        }
      }
    }

    .geo {
      text-align: center;

      h3 {
        font-size: clamp(24px, 5vw, 36px);
        margin: 5px;
        word-break: break-all;
      }
      .item {
        display: inline-block;
        border: 1px dashed rgba(128, 128, 128, 0.4);
        border-radius: 6px;
        line-height: 30px;
        padding: 5px 10px;
        margin: 4px 0;
        max-width: 100%;
        box-sizing: border-box;

        span {
          margin: 0 5px;
        }

        .muted {
          font-weight: normal;
          color: #909399;
        }

        &.country {
          color: #2c9100;
          font-weight: bold;

          img {
            height: 31px;
            vertical-align: top;
          }
        }

        &.platform {
          color: #303133;
          font-weight: normal;
        }
      }
    }

    .LimitError,
    .network-error {
      max-width: 420px;
      margin: 24px auto;
      text-align: center;

      h1,
      h2 {
        color: rgb(32, 33, 36);
        font-weight: 500;
      }
      p {
        color: rgb(95, 99, 104);
      }
    }
  }
}
</style>
