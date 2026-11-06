// Server-only. Reads the connected account's public identity (name, handle,
// avatar) from each platform with the access token we already hold, so the
// Review Queue preview can show the real account instead of placeholders.
//
// Returns { display_name, handle, avatar_url } or null if the platform
// refuses (expired token, missing permission, network). Never throws: a
// failed profile lookup must never break connecting an account.
//
// LinkedIn's OpenID userinfo returns name + picture only, with no job title
// or handle, so the LinkedIn preview shows the name but not a headline.

export async function fetchPlatformProfile(platform, accessToken, accountId) {
  try {
    if (platform === 'linkedin') {
      const res = await fetch('https://api.linkedin.com/v2/userinfo', {
        headers: { Authorization: `Bearer ${accessToken}` },
      })
      if (!res.ok) return null
      const p = await res.json()
      const name = p.name || [p.given_name, p.family_name].filter(Boolean).join(' ')
      return { display_name: name || null, handle: null, avatar_url: p.picture || null }
    }

    if (platform === 'instagram') {
      if (!accountId) return null
      const res = await fetch(
        `https://graph.facebook.com/v21.0/${accountId}?fields=username,name,profile_picture_url&access_token=${encodeURIComponent(accessToken)}`
      )
      if (!res.ok) return null
      const p = await res.json()
      if (!p.username) return null
      return { display_name: p.name || p.username, handle: p.username, avatar_url: p.profile_picture_url || null }
    }

    if (platform === 'twitter') {
      const res = await fetch(
        'https://api.twitter.com/2/users/me?user.fields=profile_image_url,username,name',
        { headers: { Authorization: `Bearer ${accessToken}` } }
      )
      if (!res.ok) return null
      const d = (await res.json()).data
      if (!d?.username) return null
      return {
        display_name: d.name || d.username,
        handle: d.username,
        // X returns a 48px "_normal" image; the larger variant is the same file path.
        avatar_url: d.profile_image_url ? d.profile_image_url.replace('_normal', '_400x400') : null,
      }
    }
  } catch (err) {
    console.error(`Profile lookup failed for ${platform}:`, err?.message)
  }
  return null
}

// Best-effort write of a looked-up profile onto the platform_accounts row.
// Separate from the connect upsert on purpose: if the profile columns have
// not been migrated yet, connecting still works.
export async function saveProfile(client, { brandId, platform, profile }) {
  if (!profile) return
  const { error } = await client
    .from('platform_accounts')
    .update({ ...profile, profile_synced_at: new Date().toISOString() })
    .eq('brand_id', brandId)
    .eq('platform', platform)
  if (error) console.error(`Saving ${platform} profile failed:`, error.message)
}
