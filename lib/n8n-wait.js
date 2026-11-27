// n8n cloud's proxy answers 502/504/524 after ~100s even though the workflow
// keeps running. For those, wait for the post to show up instead of failing.
export const PROXY_TIMEOUT_STATUSES = [502, 504, 524]

export async function waitForPost({ status, postExists, tries = 18, delayMs = 10000, sleep = ms => new Promise(r => setTimeout(r, ms)) }) {
  if (!PROXY_TIMEOUT_STATUSES.includes(status)) return false
  for (let i = 0; i < tries; i++) {
    if (await postExists()) return true
    if (i < tries - 1) await sleep(delayMs)
  }
  return false
}

export function buildSuggestPrompt({ n, platform, profile, guidance, existing }) {
  const themes = (typeof existing === 'string' ? existing : '').split('\n').map(t => t.trim()).filter(Boolean).slice(0, 10)
  return `You are a content strategist. Suggest ${n} distinct social media post topics for ${platform}.

Company: ${profile.company_description}
Target audience: ${profile.target_audience}
${profile.tone ? `Tone: ${profile.tone}` : ''}
${profile.topics_to_avoid ? `Avoid: ${profile.topics_to_avoid}` : ''}

Platform guidance: ${guidance}

First decide from the audience whether this is B2C (consumers, patients, the public) or B2B. For B2C write topics in plain language aimed at those people, never at executives, and make each topic imply a concrete call to action for them (e.g. book a check-up, try a habit this week, visit the clinic).
${themes.length ? `The user has already chosen these topics; stay on the same theme and do not drift to other subjects:\n- ${themes.join('\n- ')}\n` : 'Base the topics on subjects currently relevant and seasonal for this audience and field.'}
Each topic should be a single specific, concrete idea — not vague ("share a business tip") but specific ("the pricing mistake we made in year one and what it cost us"). No two topics should overlap in angle.

Return ONLY a JSON array of ${n} strings, no markdown, no explanation: ["topic 1", "topic 2", ...]`
}
