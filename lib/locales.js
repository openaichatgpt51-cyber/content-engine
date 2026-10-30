// Country and language choices for brands. Nothing about a specific market is
// baked into the workflow any more: the dashboard sends the brand's country,
// language and timezone with every generation request and n8n uses them.
//
// `hl` is Google's interface-language code, used to localise web research.
// Languages Google does not offer (hl: null) still work for writing; only the
// research localisation is skipped for them.

export const LANGUAGES = [
  { code: 'en', name: 'English',              hl: 'en' },
  { code: 'fr', name: 'French',               hl: 'fr' },
  { code: 'pt', name: 'Portuguese',           hl: 'pt' },
  { code: 'es', name: 'Spanish',              hl: 'es' },
  { code: 'de', name: 'German',               hl: 'de' },
  { code: 'it', name: 'Italian',              hl: 'it' },
  { code: 'nl', name: 'Dutch',                hl: 'nl' },
  { code: 'pl', name: 'Polish',               hl: 'pl' },
  { code: 'tr', name: 'Turkish',              hl: 'tr' },
  { code: 'ar', name: 'Arabic',               hl: 'ar' },
  { code: 'sw', name: 'Swahili',              hl: 'sw' },
  { code: 'ha', name: 'Hausa',                hl: 'ha' },
  { code: 'yo', name: 'Yoruba',               hl: 'yo' },
  { code: 'ig', name: 'Igbo',                 hl: 'ig' },
  { code: 'pcm', name: 'Nigerian Pidgin',     hl: null },
  { code: 'zu', name: 'Zulu',                 hl: 'zu' },
  { code: 'af', name: 'Afrikaans',            hl: 'af' },
  { code: 'hi', name: 'Hindi',                hl: 'hi' },
  { code: 'id', name: 'Indonesian',           hl: 'id' },
  { code: 'ja', name: 'Japanese',             hl: 'ja' },
  { code: 'ko', name: 'Korean',               hl: 'ko' },
  { code: 'zh', name: 'Chinese (Simplified)', hl: 'zh-CN' },
]

// code = ISO 3166-1 alpha-2. `timezone` and `language` are only suggestions
// used to pre-fill the other fields; users can change both.
export const COUNTRIES = [
  { code: 'NG', name: 'Nigeria',              timezone: 'Africa/Lagos',          language: 'en' },
  { code: 'GH', name: 'Ghana',                timezone: 'Africa/Accra',          language: 'en' },
  { code: 'KE', name: 'Kenya',                timezone: 'Africa/Nairobi',        language: 'en' },
  { code: 'ZA', name: 'South Africa',         timezone: 'Africa/Johannesburg',   language: 'en' },
  { code: 'EG', name: 'Egypt',                timezone: 'Africa/Cairo',          language: 'ar' },
  { code: 'MA', name: 'Morocco',              timezone: 'Africa/Casablanca',     language: 'fr' },
  { code: 'TZ', name: 'Tanzania',             timezone: 'Africa/Dar_es_Salaam',  language: 'sw' },
  { code: 'UG', name: 'Uganda',               timezone: 'Africa/Kampala',        language: 'en' },
  { code: 'RW', name: 'Rwanda',               timezone: 'Africa/Kigali',         language: 'en' },
  { code: 'SN', name: 'Senegal',              timezone: 'Africa/Dakar',          language: 'fr' },
  { code: 'CI', name: "Côte d'Ivoire",        timezone: 'Africa/Abidjan',        language: 'fr' },
  { code: 'CM', name: 'Cameroon',             timezone: 'Africa/Douala',         language: 'fr' },
  { code: 'ET', name: 'Ethiopia',             timezone: 'Africa/Addis_Ababa',    language: 'en' },
  { code: 'GB', name: 'United Kingdom',       timezone: 'Europe/London',         language: 'en' },
  { code: 'IE', name: 'Ireland',              timezone: 'Europe/Dublin',         language: 'en' },
  { code: 'FR', name: 'France',               timezone: 'Europe/Paris',          language: 'fr' },
  { code: 'DE', name: 'Germany',              timezone: 'Europe/Berlin',         language: 'de' },
  { code: 'ES', name: 'Spain',                timezone: 'Europe/Madrid',         language: 'es' },
  { code: 'PT', name: 'Portugal',             timezone: 'Europe/Lisbon',         language: 'pt' },
  { code: 'IT', name: 'Italy',                timezone: 'Europe/Rome',           language: 'it' },
  { code: 'NL', name: 'Netherlands',          timezone: 'Europe/Amsterdam',      language: 'nl' },
  { code: 'PL', name: 'Poland',               timezone: 'Europe/Warsaw',         language: 'pl' },
  { code: 'TR', name: 'Türkiye',              timezone: 'Europe/Istanbul',       language: 'tr' },
  { code: 'AE', name: 'United Arab Emirates', timezone: 'Asia/Dubai',            language: 'en' },
  { code: 'SA', name: 'Saudi Arabia',         timezone: 'Asia/Riyadh',           language: 'ar' },
  { code: 'QA', name: 'Qatar',                timezone: 'Asia/Qatar',            language: 'en' },
  { code: 'IN', name: 'India',                timezone: 'Asia/Kolkata',          language: 'en' },
  { code: 'PK', name: 'Pakistan',             timezone: 'Asia/Karachi',          language: 'en' },
  { code: 'BD', name: 'Bangladesh',           timezone: 'Asia/Dhaka',            language: 'en' },
  { code: 'SG', name: 'Singapore',            timezone: 'Asia/Singapore',        language: 'en' },
  { code: 'MY', name: 'Malaysia',             timezone: 'Asia/Kuala_Lumpur',     language: 'en' },
  { code: 'ID', name: 'Indonesia',            timezone: 'Asia/Jakarta',          language: 'id' },
  { code: 'PH', name: 'Philippines',          timezone: 'Asia/Manila',           language: 'en' },
  { code: 'JP', name: 'Japan',                timezone: 'Asia/Tokyo',            language: 'ja' },
  { code: 'KR', name: 'South Korea',          timezone: 'Asia/Seoul',            language: 'ko' },
  { code: 'CN', name: 'China',                timezone: 'Asia/Shanghai',         language: 'zh' },
  { code: 'AU', name: 'Australia',            timezone: 'Australia/Sydney',      language: 'en' },
  { code: 'NZ', name: 'New Zealand',          timezone: 'Pacific/Auckland',      language: 'en' },
  { code: 'CA', name: 'Canada',               timezone: 'America/Toronto',       language: 'en' },
  { code: 'US', name: 'United States',        timezone: 'America/New_York',      language: 'en' },
  { code: 'MX', name: 'Mexico',               timezone: 'America/Mexico_City',   language: 'es' },
  { code: 'BR', name: 'Brazil',               timezone: 'America/Sao_Paulo',     language: 'pt' },
  { code: 'AR', name: 'Argentina',            timezone: 'America/Argentina/Buenos_Aires', language: 'es' },
  { code: 'CO', name: 'Colombia',             timezone: 'America/Bogota',        language: 'es' },
  { code: 'CL', name: 'Chile',                timezone: 'America/Santiago',      language: 'es' },
]

export const countryByCode  = code => COUNTRIES.find(c => c.code === code) || null
export const languageByCode = code => LANGUAGES.find(l => l.code === code) || null

// The user's own timezone, from their browser. Falls back to UTC.
export function detectTimeZone() {
  try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC' } catch { return 'UTC' }
}

// Every timezone the browser knows, sorted so server and client render the same
// list. Includes `extra` (e.g. a saved value) even if it is not in the list.
export function timeZoneOptions(extra) {
  let zones = []
  try { zones = Intl.supportedValuesOf('timeZone') } catch { /* older browsers */ }
  if (!zones.length) zones = COUNTRIES.map(c => c.timezone)
  const set = new Set(['UTC', ...zones])
  if (extra) set.add(extra)
  return [...set].sort((a, b) => a.localeCompare(b))
}
