import { supabaseAdmin } from './supabase-admin'
import { countryByCode, languageByCode } from './locales'

// Server-side: gathers the brand's country, language and timezone so they can
// be sent to n8n with a generation request. Missing values come back as empty
// strings, which n8n treats as "no preference" — nothing is assumed.
// Reading country/language is wrapped so the routes keep working before the
// database migration that adds those columns has been run.
export async function loadLocaleContext(userId) {
  let country = '', language = '', timezone = ''

  try {
    const { data } = await supabaseAdmin
      .from('brand_profiles').select('country, language').eq('client_id', userId).maybeSingle()
    country  = data?.country  || ''
    language = data?.language || ''
  } catch { /* columns not added yet */ }

  try {
    const { data } = await supabaseAdmin
      .from('onboarding').select('timezone').eq('client_id', userId).maybeSingle()
    timezone = data?.timezone || ''
  } catch { /* no onboarding row */ }

  return {
    country,
    country_name:  countryByCode(country)?.name   || '',
    language,
    language_name: languageByCode(language)?.name || '',
    language_hl:   languageByCode(language)?.hl   || '',
    timezone,
  }
}
