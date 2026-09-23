# Per-Provider LLM Proxy — UI + Docs + Gates Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the user-facing provider proxy settings (UI "use proxy" checkbox + proxy address + credential env-ref) and the bilingual documentation + full repo gates for the per-provider LLM proxy feature whose core (factory + `llm-deepseek` + `llm-pi-ai` adapters) already landed on branch `feature/per-provider-llm-proxy`.

**Architecture:** The transport core is done: `@deepseek-ai/dsh-http-proxy` exports `createProviderProxyTransport({ proxy, credentials }) → { dispatcher, fetch, env, dispose }`; both LLM adapters resolve `proxy` + `proxyCredentialEnv` per profile, build/cache a scoped `ProxyAgent`, and thread `fetch`/`env` into their requests. This plan adds ONLY the settings UI (so a user selects a provider, ticks "use proxy", and enters the address + credential env-ref) and the docs/gates. No transport or adapter changes.

**Tech Stack:** React + schemastery/z (settings store schema), vitest (client specs), VitePress + bilingual Markdown (docs), the repo's `pnpm run` gates.

**Spec:** The four committed phases on `feature/per-provider-llm-proxy`:
- `772b9e1955` feat(http-proxy): add per-provider proxy transport factory
- `49edf8bad0` feat(http-proxy): expose fetch override on per-provider transport
- `a4f8b876dd` feat(llm-deepseek): route model requests and file uploads through a per-provider proxy
- `d3af973be8` feat(llm-pi-ai): route model requests through a per-route proxy

Read those commits' diffs before starting; they define the exact config field names (`proxy`, `proxyCredentialEnv`), the credential-ref role, and the transport API this UI/docs work surfaces.

## Global Constraints

Copied verbatim from the repo (`AGENTS.md`) and the landed phases; every task implicitly includes these:
- Node `^22.19 || >=24`, ESM only (`"type":"module"`), `strict: true` + `noImplicitAny`. Every package is `@deepseek-ai/dsh-<name>`.
- `exactOptionalPropertyTypes: true`: an optional field typed `T?` is **absent or `T`**, never `undefined`. Omit the property when undefined (spread `...x === undefined ? {} : { x }`), never assign `undefined`. The landed config code does exactly this — match it.
- **Per-package `tsc -p . --noEmit` resolves workspace deps to their BUILT `lib/`** (the package `exports` point to `lib/types/*.d.ts`), NOT `src`. After changing a consumed package's exports, emit its declarations before typechecking dependents: `(cd packages/util/http-proxy && pnpm exec tsc -p . --emitDeclarationOnly --declaration)`. The canonical source-plane gate is `pnpm run typecheck` (builds `lib:host` first). `lib/` is gitignored (build artifact, never commit).
- **Client UI copy is locale-owned** (`verify-client-ui-i18n` rejects hardcoded copy). Route every user-visible string through the typed locale dictionary (`locales.ts`) and `t`; bilingual (en + zh), line-aligned.
- Docs are bilingual and line-aligned (`docs/AGENTS.md`); `pnpm run doc-sync` is the gate. `verify-export-jsdoc` enforces JSDoc on non-obvious exports; `verify-doc-budgets` enforces ceilings.
- `test:coverage` is the CI gate: per-file 100% on `packages/*/*/src`. Tests describe behavior, not correctness.
- A commit per task; pre-commit runs whitespace + vendor-manifest-guard + `oxlint` (staged). `git diff --cached --check` gates trailing-newline.
- The `dsh-http-proxy` factory API (do not change): `createProviderProxyTransport(config: { proxy?: string | undefined; credentials?: string | undefined }): Promise<ProviderProxyTransport | undefined>` where `ProviderProxyTransport = { dispatcher; fetch: typeof globalThis.fetch; env: Readonly<Record<string,string>>; dispose: () => Promise<void> }`. The adapter resolves `proxyCredentialEnv` (a credential-ref = env-var name) to the `user:pass` value from the launch-environment snapshot, then passes `credentials`.

---

## File Structure

### Phase ④ — Provider settings UI (`packages/client/ui-settings-models`)

- **Investigate first** (no edit): `packages/client/ui-settings-models/src/client/store.ts` — the settings store + the schemastery schema for a provider profile the UI edits (the stored shape under settings namespaces `llm-pi-ai` / `llm-deepseek`). Confirm where `apiKeyEnv` / `baseURL` are declared in that schema and how the UI reads/writes them. Also read `ProviderEditor.tsx`, `CustomProviderCard.tsx`, `ModelsSection.tsx`, `locales.ts`.
- Modify: `store.ts` — add `proxy: z.string()` and `proxyCredentialEnv: z.string().role('credential-ref')` to the provider-profile schema (mirror `apiKeyEnv`). Validate http/https scheme at write (fail loud), matching the adapter's resolution check.
- Modify: `ProviderEditor.tsx` (and `CustomProviderCard.tsx` if hand-declared routes are edited there) — render a "use proxy" toggle, a proxy-address text input, and a credential env-ref input (same pattern as the `apiKeyEnv` field). All copy via `t` + `locales.ts`.
- Modify: `locales.ts` — add bilingual (en + zh) strings for the proxy toggle, address label, credential env-ref label, and any help text.
- Test: a client spec under `packages/client/ui-settings-models/tests/` (or the package's existing test location) asserting the fields render, round-trip through the store, and that a non-http/https address is rejected by the schema.

### Phase ⑤a — Bilingual docs + README + JSDoc

- Modify: `docs/config-catalog.md` and `docs/config-catalog.zh.md` — add `proxy` and `proxyCredentialEnv` field rows under the `@deepseek-ai/dsh-llm-deepseek` and `@deepseek-ai/dsh-llm-pi-ai` provider-config sections (mirror the existing `apiKeyEnv`/`baseURL` rows; bilingual line-aligned).
- Modify: `packages/llm/llm-deepseek/README.md` (+ `.zh.md` if present) and `packages/llm/llm-pi-ai/README.md` (+ `.zh.md`) — add a short "Per-provider proxy" subsection with a YAML example (`proxy: http://host:port`, `proxyCredentialEnv: MY_PROXY_AUTH`).
- Verify JSDoc: the `proxy`/`proxyCredentialEnv` fields added in ②③ already carry JSDoc on the TS interfaces; `verify-export-jsdoc` should pass. Add JSDoc anywhere a new public export appears.

### Phase ⑤b — Full repo gates

- Run (fix, do not disable): `pnpm run typecheck`, `pnpm run lint`, `pnpm run test:coverage` (per-file 100% on changed `src`), `pnpm run doc-sync`, `pnpm run hygiene`. Report PASS/FAIL per gate with the command output. Iterate via TDD until green.

---

## Task 1: Map the provider-settings UI subsystem (investigation only, no commit)

**Files:** Read only — `packages/client/ui-settings-models/src/client/store.ts`, `ProviderEditor.tsx`, `CustomProviderCard.tsx`, `ModelsSection.tsx`, `locales.ts`; and `packages/llm/llm-pi-ai/src/config.ts` (the `PiAiProviderProfile` `proxy`/`proxyCredentialEnv` fields added in `d3af973be8`) + `packages/llm/llm-deepseek/src/config.ts` (added in `a4f8b876dd`).

**Interfaces:** Produces (written into the next task's prompt, not a file): the exact schema field name + location for `apiKeyEnv` in the settings store, the component that renders it, and the locale key pattern.

- [ ] **Step 1:** Read the files above. Identify (a) the schemastery schema that declares the stored provider profile (where `apiKeyEnv`/`baseURL` live in the UI store), (b) the component + prop path that renders the `apiKeyEnv` input, (c) the `locales.ts` entry pattern for a labeled field.
- [ ] **Step 2:** Confirm the stored profile schema is the source the UI edits, and that writing `proxy`/`proxyCredentialEnv` there flows into the adapter config the adapter resolves (trace: UI store → settings section `llm-pi-ai`/`llm-deepseek` → adapter `profiles()`/`resolveAdapterOptions`). Note any mismatch (the adapter reads plugin config, the UI writes user-settings — confirm they're the same section or how they merge).

## Task 2: Add `proxy` + `proxyCredentialEnv` to the settings store schema (TDD)

**Files:** Modify `packages/client/ui-settings-models/src/client/store.ts`; Test: `packages/client/ui-settings-models/tests/` (new or existing schema spec).

**Interfaces:** Consumes the field names from Task 1. Produces a schema accepting `proxy?: string` + `proxyCredentialEnv?: string (credential-ref)`, rejecting a non-http/https `proxy` at write.

- [ ] **Step 1: Write the failing test** — a schema spec asserting (a) `proxy: 'http://h:8080'` + `proxyCredentialEnv: 'X'` round-trips, (b) `proxy: 'socks5://h'` is rejected by the schema's write validation.
- [ ] **Step 2: Run it to verify it fails.** `pnpm vitest run <spec>`.
- [ ] **Step 3: Implement** — add the two fields to the schemastery schema, with a write-time http/https check for `proxy` (match the adapter's resolution message vocabulary: "must use http or https").
- [ ] **Step 4: Run test to verify it passes.**
- [ ] **Step 5: Commit** — `feat(ui-settings-models): add proxy + proxyCredentialEnv to provider profile schema`.

## Task 3: Render the proxy fields in the provider editor (TDD)

**Files:** Modify `ProviderEditor.tsx` (and `CustomProviderCard.tsx` if hand-declared routes are edited there); `locales.ts`; Test: a client spec.

**Interfaces:** Consumes Task 2's schema. Produces UI controls (toggle + address input + credential env-ref input) bound to the stored profile, all copy via `t`/`locales.ts`.

- [ ] **Step 1: Write the failing client spec** — render the editor with a profile, assert the proxy toggle + address input + credential env-ref input are present; assert toggling "use proxy" shows/hides the address input; assert a non-http/https address shows the schema's rejection.
- [ ] **Step 2: Run it to verify it fails.**
- [ ] **Step 3: Implement** — add the controls mirroring the `apiKeyEnv` field's wiring; add bilingual `locales.ts` entries.
- [ ] **Step 4: Run `pnpm vitest run packages/client/ui-settings-models` + `(cd packages/client/ui-settings-models && pnpm exec tsc -p . --noEmit)` + `pnpm exec oxlint <files>`; fix `verify-client-ui-i18n` if it flags hardcoded copy.
- [ ] **Step 5: Commit** — `feat(ui-settings-models): render per-provider proxy fields in the provider editor`.

## Task 4: Bilingual config-catalog + README docs

**Files:** Modify `docs/config-catalog.md`, `docs/config-catalog.zh.md`, `packages/llm/llm-deepseek/README{,.zh}.md`, `packages/llm/llm-pi-ai/README{,.zh}.md`.

- [ ] **Step 1:** In `docs/config-catalog.md` + `.zh.md`, add `proxy` and `proxyCredentialEnv` rows under the `@deepseek-ai/dsh-llm-deepseek` and `@deepseek-ai/dsh-llm-pi-ai` provider-config sections, bilingual line-aligned, mirroring the `apiKeyEnv`/`baseURL` rows.
- [ ] **Step 2:** In each package README (+`.zh`), add a "Per-provider proxy" subsection with a YAML example.
- [ ] **Step 3:** Run `pnpm run doc-sync` (and `pnpm run test:docs` for a quick check); fix dead-link/budget issues.
- [ ] **Step 4: Commit** — `docs(llm): document per-provider proxy + proxyCredentialEnv`.

## Task 5: Full repo gates

**Files:** None (verification + fixes only).

- [ ] **Step 1:** `pnpm run typecheck` — fix type errors (remember: emit a changed package's declarations before typechecking dependents, or rely on `pnpm run typecheck`'s `build:lib:host`).
- [ ] **Step 2:** `pnpm run lint` — fix oxlint findings.
- [ ] **Step 3:** `pnpm run test:coverage` — per-file 100% on changed `src`; add/extend tests for uncovered branches (e.g. the proxy toggle's show/hide branch, the schema's scheme-rejection branch).
- [ ] **Step 4:** `pnpm run doc-sync` + `pnpm run hygiene`.
- [ ] **Step 5:** If all green, no commit needed (gates pass on the prior commits); if fixes were made, commit — `chore: satisfy gates for per-provider proxy`.
- [ ] **Step 6:** Report PASS/FAIL per gate with output; note the `adapter.spec.ts` idle-watchdog test is a known concurrency-flaky timing test (passes in isolation) — flag if it flakes, do not "fix" it by weakening the watchdog.

## Self-Review

- **Spec coverage:** ④ UI (Task 1–3), ⑤a docs (Task 4), ⑤b gates (Task 5). The transport/adapter core is out of scope (already landed).
- **Placeholders:** none — each step names exact files, fields, commands. Task 1's output is fed into Task 2/3 prompts because the exact schema location is discovered by reading (the investigator has repo access).
- **Type consistency:** `proxy: string`, `proxyCredentialEnv: CredentialRef` (credential-ref role), `createProviderProxyTransport({ proxy, credentials })` — names match the landed ②③ code.
