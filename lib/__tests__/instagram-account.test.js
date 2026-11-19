import { test, expect } from 'vitest'
import { findInstagramAccount } from '../instagram-account.js'

const reply = (body, ok = true, status = 200) => async () => ({ ok, status, json: async () => body })

test('returns the Instagram account of the first Page that has one', async () => {
  const f = reply({ data: [{ id: 'p1', name: 'No IG' }, { id: 'p2', name: 'ContentEngine', instagram_business_account: { id: '1789', username: 'contentengine' } }] })
  const r = await findInstagramAccount('tok', f)
  expect(r).toMatchObject({ igAccountId: '1789', username: 'contentengine', pageId: 'p2', linkedCount: 1 })
})
test('returns null when no Page has an Instagram account', async () => {
  expect(await findInstagramAccount('tok', reply({ data: [{ id: 'p1', name: 'A' }] }))).toBeNull()
  expect(await findInstagramAccount('tok', reply({ data: [] }))).toBeNull()
})
test('never falls back to the Facebook user id', async () => {
  const r = await findInstagramAccount('tok', reply({ id: 'USER123', data: [] }))
  expect(r).toBeNull()
})
test('throws on a Graph error', async () => {
  await expect(findInstagramAccount('tok', reply({ error: { message: 'Invalid OAuth token' } }, false, 400))).rejects.toThrow(/Invalid OAuth token/)
})
test('counts several linked Pages', async () => {
  const f = reply({ data: [{ id: 'a', instagram_business_account: { id: '1' } }, { id: 'b', instagram_business_account: { id: '2' } }] })
  expect((await findInstagramAccount('tok', f)).linkedCount).toBe(2)
})
