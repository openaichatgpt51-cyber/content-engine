import crypto from 'crypto'
import { NextResponse } from 'next/server'

const DEFAULT_REDIRECT = '/dashboard/settings'
const COOKIE_PREFIX = 'oauth_state_'
const MAX_AGE = 600

// Only same-site, in-app paths. Blocks open redirects such as
// "//evil.com", "/\evil.com" or "https://evil.com".
export function safeRedirect(path) {
  if (typeof path !== 'string') return DEFAULT_REDIRECT
  if (!/^\/(dashboard|onboarding)(\/|\?|$)/.test(path)) return DEFAULT_REDIRECT
  if (path.includes('\\') || path.includes('//') || /[\r\n]/.test(path)) return DEFAULT_REDIRECT
  return path
}

// state = "<random nonce>.<base64url redirect>"; the nonce is also stored in an
// httpOnly cookie, so a callback only works for the browser that started it.
export function createState(redirect) {
  const nonce = crypto.randomBytes(24).toString('base64url')
  const state = `${nonce}.${Buffer.from(safeRedirect(redirect)).toString('base64url')}`
  return { nonce, state }
}

export function setStateCookie(response, platform, nonce) {
  response.cookies.set(COOKIE_PREFIX + platform, nonce, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: MAX_AGE,
    path: '/',
  })
}

// Returns { ok, redirect }. The caller clears the cookie once it is done.
export function readState(request, platform) {
  const raw = new URL(request.url).searchParams.get('state') || ''
  const cookie = request.cookies.get(COOKIE_PREFIX + platform)?.value || ''
  const [nonce, encoded] = raw.split('.')
  let ok = false
  let redirect = DEFAULT_REDIRECT
  if (nonce && encoded && cookie && nonce.length === cookie.length) {
    ok = crypto.timingSafeEqual(Buffer.from(nonce), Buffer.from(cookie))
    if (ok) {
      try { redirect = safeRedirect(Buffer.from(encoded, 'base64url').toString()) } catch { redirect = DEFAULT_REDIRECT }
    }
  }
  return { ok, redirect }
}

export function clearStateCookie(response, platform) {
  response.cookies.delete(COOKIE_PREFIX + platform)
  return response
}

export function stateFailure(request, platform) {
  const res = NextResponse.redirect(new URL(`${DEFAULT_REDIRECT}?error=${platform}_state`, request.url))
  return clearStateCookie(res, platform)
}
