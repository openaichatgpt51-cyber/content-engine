# Known Break Patterns

The adversarial QA agent reads this file at the start of every run and
checks the PR diff against every pattern below before doing anything
else. Each entry describes a *class* of bug, not just one instance, so
the same mistake gets caught in new code.

## How to add an entry

Add an entry whenever a bug is found, whether by the agent, a human,
or a user. Every entry must have a regression test. Don't mark a bug
resolved until the test exists and passes in CI.

Copy this template to the bottom of the "Logged bugs" section:

```
### KBP-XXX: <short pattern name>
- **Date found:** YYYY-MM-DD
- **Severity:** critical | high | medium | low
- **Pattern:** What the mistake looks like in code, in one or two sentences.
- **Root cause:** Why it happened.
- **How to detect in a diff:** What the agent should look for.
- **Regression test:** path/to/test-file and test name
- **Fix reference:** PR or commit link
```

## Seed patterns (common classes, not yet observed in this codebase)

These are starting checks based on common failure classes. Replace or
remove any that don't apply to your stack, and add real entries below
as bugs are found.

### KBP-S01: Tenant or org filter omitted from a query
- **Severity:** critical
- **Pattern:** A database query, API handler, or workflow step reads or writes data without scoping to the caller's tenant/org ID, risking cross-tenant data exposure.
- **How to detect in a diff:** New or changed queries, RPC calls, or storage access with no tenant/org condition; code that bypasses row-level security (service-role clients, admin keys) in user-facing paths.
- **Regression test:** One test per new endpoint or query that attempts access as a different tenant and asserts it is denied.

### KBP-S02: Webhook or job processed more than once
- **Severity:** high
- **Pattern:** A webhook handler, queue consumer, or workflow trigger has side effects (posting, charging, sending, inserting) but isn't idempotent, so retries or redelivery duplicate the effect.
- **How to detect in a diff:** Handlers with side effects and no idempotency key, dedupe check, or status guard.
- **Regression test:** Send the same event twice and assert the side effect happens once.

### KBP-S03: Status set before the operation it describes succeeds
- **Severity:** high
- **Pattern:** A record's status is updated (for example to in-progress or completed) before the downstream call finishes, and the failure path never resets or fails it, leaving records stuck.
- **How to detect in a diff:** A status write followed by an external call with no error handling that updates the status on failure or timeout.
- **Regression test:** Force the downstream call to fail or time out and assert the record ends in a failed or retryable state.

### KBP-S04: Unhandled third-party failure
- **Severity:** medium
- **Pattern:** Calls to external APIs (auth, AI, media, email) have no timeout, retry policy, or user-facing error state.
- **How to detect in a diff:** New external calls without timeout and error handling; UI that spins forever or shows a raw error.
- **Regression test:** Mock the dependency as down, slow, and returning malformed data, and assert graceful degradation.

### KBP-S05: Secret or key exposed to the client
- **Severity:** critical
- **Pattern:** An API key, service credential, or server-only environment variable is referenced in client-side code or logged.
- **How to detect in a diff:** Server secrets used in browser bundles, public-prefixed env vars holding secrets, keys in logs or error messages.
- **Regression test:** A build-time or test-time check that client bundles and logs contain no secret values.

### KBP-S06: Missing authorization check on a new route
- **Severity:** critical
- **Pattern:** A new endpoint or action checks that the user is logged in but not that they have the role or ownership needed.
- **How to detect in a diff:** New routes or handlers with no role/permission check; approval or admin actions callable by lower roles.
- **Regression test:** Call the route as each role (including unauthenticated) and assert only permitted roles succeed.

## Logged bugs

### KBP-001: Request count not validated before a limit comparison
- **Date found:** 2026-10-19
- **Severity:** high
- **Pattern:** A usage or quota check compares a caller-supplied number against a limit without validating that it is a positive whole number. NaN, undefined, null, and negative values make the comparison pass, so the request is allowed even when the plan is exhausted.
- **Root cause:** `requestedCount > remaining` evaluates to false for NaN and undefined, and for negative numbers. The function treated "not over the limit" as "allowed".
- **How to detect in a diff:** Any limit, quota, pricing, or billing check that uses a number from a request body, query string, or database row with no `Number.isInteger` or range check first. Also check new callers of `checkUsageLimit`.
- **Regression test:** `lib/__tests__/regressions.test.js`, describe block "KBP-001: checkUsageLimit must reject invalid requestedCount"
- **Fix reference:** `checkUsageLimit` now returns `allowed: false` with code `INVALID_REQUEST`. API routes must handle that new code. (Add PR link once merged.)

### KBP-002: Collision-aware scheduler crashes when no day name is valid
- **Date found:** 2026-10-19
- **Severity:** medium
- **Pattern:** A search with a fallback can still end with no result, and the code then reads a property on that empty result. Two near-identical functions handle the empty case differently.
- **Root cause:** Invalid day names such as "Mon" instead of "Monday" produce an empty list of target weekdays. `calculateNextSlot` has a last-resort fallback (tomorrow at the posting time), but `calculateNextSlotWithCollisionAvoidance` did not, so it called `.toUTC()` on null and threw a TypeError.
- **How to detect in a diff:** Duplicated logic where one variant has a final fallback and the other doesn't. Method calls on a variable that a loop may never assign. Day lists used without checking them against `DAY_MAP`.
- **Regression test:** `lib/__tests__/regressions.test.js`, describe block "KBP-002: collision-aware scheduling must not crash on invalid day names"
- **Fix reference:** Added the same last-resort fallback to the collision-aware function. Also update the "Calculate Next Slot (Campaign)" n8n Code node by hand. (Add PR link once merged.)

### KBP-003: Malformed posting time throws or silently yields a wrong time
- **Date found:** 2026-10-19
- **Severity:** medium
- **Pattern:** A time string from the database is split and converted with no format or range validation before being used to build a date.
- **Root cause:** `time.split(':').map(Number)` turns "9am" into NaN, which makes luxon throw. An out-of-range value like "25:99" does not throw, and silently produces a wrong posting time, which is worse because nothing flags it.
- **How to detect in a diff:** Parsing of user-supplied or stored time, date, or number strings with no format and range check. Any new code reading `posting_time` fields.
- **Regression test:** `lib/__tests__/regressions.test.js`, describe block "KBP-003: malformed posting_time must fall back to the default, not throw"
- **Fix reference:** New `parseTime` helper falls back to the 09:00 default for anything that isn't a valid `H:MM` or `HH:MM` time. Also update both n8n Code nodes by hand. (Add PR link once merged.)

### KBP-004: Equivalent content splits into separate posts
- **Date found:** 2026-10-19
- **Severity:** medium
- **Pattern:** A grouping or deduplication key is built from raw input instead of the normalized values the code later uses for output. Inputs that resolve to the same result get different keys.
- **Root cause:** The signature in `groupPlatformsBySignature` used the raw `tone` and `slideCount`. A missing tone versus "Professional", "professional" versus "Professional", and `slideCount` 99 versus 10 all resolve to the same output but produced separate groups, which means duplicate posts and extra LLM calls.
- **How to detect in a diff:** Grouping, caching, or dedupe keys built from raw request fields while defaults, casing, or clamping are applied later. Any change to how the signature is computed.
- **Regression test:** `lib/__tests__/regressions.test.js`, describe block "KBP-004: groupPlatformsBySignature must not split content that resolves identically"
- **Fix reference:** Signature now uses lowercased tone with the default applied, and the clamped slide count. (Add PR link once merged.)
