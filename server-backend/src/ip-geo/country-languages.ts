/**
 * ISO 3166-1 alpha-2 → Accept-Language style list.
 * MaxMind City has no languages field; unknown countries fall back to en-US,en.
 */
const COUNTRY_LANGUAGES: Record<string, string> = {
  AE: 'ar-AE,ar,en',
  AR: 'es-AR,es,en',
  AT: 'de-AT,de,en',
  AU: 'en-AU,en',
  BE: 'nl-BE,nl,fr-BE,fr,en',
  BG: 'bg-BG,bg,en',
  BR: 'pt-BR,pt,en',
  CA: 'en-CA,en,fr-CA,fr',
  CH: 'de-CH,de,fr-CH,fr,it-CH,it,en',
  CL: 'es-CL,es,en',
  CN: 'zh-CN,zh,en',
  CO: 'es-CO,es,en',
  CZ: 'cs-CZ,cs,en',
  DE: 'de-DE,de,en',
  DK: 'da-DK,da,en',
  EG: 'ar-EG,ar,en',
  ES: 'es-ES,es,en',
  FI: 'fi-FI,fi,en',
  FR: 'fr-FR,fr,en',
  GB: 'en-GB,en',
  GR: 'el-GR,el,en',
  HK: 'zh-HK,zh,en',
  HU: 'hu-HU,hu,en',
  ID: 'id-ID,id,en',
  IE: 'en-IE,en',
  IL: 'he-IL,he,en',
  IN: 'en-IN,en,hi',
  IT: 'it-IT,it,en',
  JP: 'ja-JP,ja,en',
  KR: 'ko-KR,ko,en',
  MX: 'es-MX,es,en',
  MY: 'ms-MY,ms,en',
  NL: 'nl-NL,nl,en',
  NO: 'nb-NO,nb,en',
  NZ: 'en-NZ,en',
  PH: 'en-PH,en,fil',
  PL: 'pl-PL,pl,en',
  PT: 'pt-PT,pt,en',
  RO: 'ro-RO,ro,en',
  RU: 'ru-RU,ru,en',
  SA: 'ar-SA,ar,en',
  SE: 'sv-SE,sv,en',
  SG: 'en-SG,en,zh',
  TH: 'th-TH,th,en',
  TR: 'tr-TR,tr,en',
  TW: 'zh-TW,zh,en',
  UA: 'uk-UA,uk,en',
  US: 'en-US,en',
  VN: 'vi-VN,vi,en',
  ZA: 'en-ZA,en'
}

export const DEFAULT_LANGUAGES = 'en-US,en'

export function languagesForCountry(countryCode: string | undefined | null): string {
  if (!countryCode) return DEFAULT_LANGUAGES
  const key = String(countryCode).trim().toUpperCase()
  return COUNTRY_LANGUAGES[key] || DEFAULT_LANGUAGES
}
