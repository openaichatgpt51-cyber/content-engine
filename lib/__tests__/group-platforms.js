/**
 * Groups per-platform content specs by identical signature (topic, tone,
 * format) into "generation groups" — platforms sharing identical content
 * become one post; a platform with genuinely different content becomes
 * its own separate post. This is the core logic behind /api/generate
 * supporting per-platform topics without requiring n8n to run multiple
 * LLM calls per post.
 *
 * @param {object} content - { LinkedIn: {topic, tone, is_carousel, slide_count, is_video}, Instagram: {...}, ... }
 * @returns {Array<{ topic, tone, is_carousel, slide_count, is_video, platforms: string[] }>}
 */
const clampSlides = v => Math.max(2, Math.min(10, Number(v) || 5))

export function groupPlatformsBySignature(content) {
  if (!content || typeof content !== 'object') return []

  const platformKeys = Object.keys(content)
  const bySignature = new Map()

  for (const key of platformKeys) {
    const c = content[key]
    if (!c?.topic?.trim()) continue

    const sig = JSON.stringify({
      topic: c.topic.trim(),
      tone: String(c.tone ?? '').trim().toLowerCase() || 'professional',
      is_carousel: !!c.is_carousel,
      slide_count: c.is_carousel ? clampSlides(c.slideCount ?? c.slide_count) : null,
      is_video: !!c.is_video,
    })

    if (!bySignature.has(sig)) bySignature.set(sig, { content: c, platforms: [] })
    bySignature.get(sig).platforms.push(key)
  }

  return [...bySignature.values()].map(g => ({
    topic: g.content.topic.trim(),
    tone: g.content.tone || 'Professional',
    is_carousel: !!g.content.is_carousel,
    slide_count: g.content.is_carousel
      ? clampSlides(g.content.slideCount ?? g.content.slide_count)
      : null,
    is_video: !!g.content.is_video,
    platforms: g.platforms,
  }))
}
