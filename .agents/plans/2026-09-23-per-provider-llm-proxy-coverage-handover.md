# Per-Provider LLM Proxy — Coverage Handover Checklist

The feature is **functionally complete and merged onto `feature/custom-dev`** (fast-forward from `feature/per-provider-llm-proxy`, HEAD `60dc95babc`). The transport core, both adapters, the settings UI, and the bilingual docs all landed and pass typecheck/lint/publint/client-ui-i18n/translation-pairing. This checklist is the **remaining `test:coverage` (per-file 100%) gap** — edge/wiring branches, not defects.

## Already 100%-covered (do not touch)

- `packages/util/http-proxy/src/provider-transport.ts` — factory + `resolveProviderProxyTransport` helper (20 tests; cache/build/dispose/credential branches; dead branch removed via internal `buildProxyTransport`, no `!`).
- `packages/llm/llm-deepseek/src/config.ts` — proxy validation + field carrying (config.spec).
- Both adapters' `resolveProxyTransport` closure logic — bulk covered via the extracted helper's unit tests.

## Remaining uncovered lines (scoped coverage, `--no-file-parallelism`)

### A. Integration boot-tests (heaviest; covers 6 lines across 4 files)

Boot the plugin with a `proxy` + `proxyCredentialEnv` profile and run one request through a **fake proxy server**, asserting the request was tunnelled. Pattern: `packages/llm/llm-deepseek/tests/loader-composition.spec.ts` (boots `Context` + mock SSE server) and the `mockServer`/`textEvents` helpers — add a separate fake-proxy `http.createServer` that records the tunneled request.

- `packages/llm/llm-deepseek/src/index.ts:92,96` + `packages/llm/llm-deepseek/src/adapter.ts:88` — one deepseek boot-test (proxy set → `resolveProxyTransport` delegation + `requestFetch = proxyTransport?.fetch ?? fetch` threading).
- `packages/llm/llm-pi-ai/src/index.ts:216,220` + `packages/llm/llm-pi-ai/src/adapter.ts:389` — one pi-ai boot-test (proxy set → `resolveProxyTransport` delegation + `streamSimple` `fetch`/`env` injection).

A single request per adapter covers the proxy-set branch; the cache-hit / URL-change / dispose branches are already covered by the helper's unit tests.

### B. UI edge branches (medium)

- `packages/client/ui-settings-models/src/client/ProviderEditor.tsx:272,276` — the `if (useProxy) { validateProxyUrl(proxy) }` path in `apply`. The current test's `fireEvent.click(Apply)` throws an async error before reaching it (the apply flow needs the editor's other preconditions satisfied — inspect `applyOnce`/`apply` at `ProviderEditor.tsx:307,324`). Fix the test's Apply to reach the validate branch (valid proxy → validate succeeds; the existing 2nd test covers the throw).
- `ProviderEditor.tsx:507,520` — the `event.target.value === '' ? undefined : value` empty branch of the proxy URL + credential `onChange`. Fire a change with `value: ''` (the test does for the URL; add it for the credential input too — verify v8 counts the branch).
- `packages/client/ui-settings-models/src/client/CustomProviderCard.tsx:158-171,291-293` — `createOnce`'s `if (useProxy && proxy.trim().length > 0) validateProxyUrl(proxy)` + profile-building. Fill the card's required fields (displayName, baseURL, protocol, key) before `Create`, then toggle proxy + enter a URL + Create, so `createOnce` actually runs.
- `packages/client/ui-settings-models/src/client/store.ts:286-287` — `...proxy === undefined ? {} : { proxy }` path 2 (proxy **defined**) in the provider **list** row-building (`providerRows`), not the editor. Cover by rendering `ModelsSection` with a proxy-configured provider, or a direct `proxyOf(...)` call returning a non-empty string (`proxyOf` reads `schema.getPath(namespace.value, path)?.proxy`).

## Verification (local)

The full `pnpm run test:coverage` is too slow locally (timed out >900s). Use the scoped run with **`--no-file-parallelism`** — it avoids the concurrency-flaky `packages/llm/llm-pi-ai/tests/adapter.spec.ts` "idle watchdog" timing test (passes in isolation, flakes under concurrent package runs):

```sh
pnpm vitest run packages/util/http-proxy packages/llm/llm-deepseek packages/llm/llm-pi-ai packages/client/ui-settings-models --coverage --no-file-parallelism
```

Filter the uncovered-locations report to the changed files (the scoped run reports ~136k uncovered across the whole repo because only 4 packages' tests ran — ignore those; only the files listed above matter).

## Gotchas

- `exactOptionalPropertyTypes: true` — omit-when-undefined (`...x === undefined ? {} : { x }`), never assign `undefined` to an optional field.
- Per-package `tsc -p . --noEmit` resolves workspace deps to **built `lib/`** — emit a changed consumed package's declarations first: `(cd packages/util/http-proxy && pnpm exec tsc -p . --emitDeclarationOnly --declaration)`. `lib/` is gitignored.
- `oxlint` **forbids `!`** (`no-non-null-assertion`) — that's why `buildProxyTransport(url)` was extracted (always-defined) instead.
- Two gates fail **pre-existing, not from this feature**: `verify-tool-catalog` + `verify-default-product-isolation` both `ERR_MODULE_NOT_FOUND: Cannot find package '@deepseek-ai/cordis-plugin-include'` — a vendored-package linking gap (absent from this sandbox's `node_modules`; CI has it linked). Don't try to "fix" these from the feature branch.
- The `adapter.spec.ts` idle-watchdog test is a known concurrency-flaky timing test — do **not** weaken it; just run coverage with `--no-file-parallelism`.

## Branch state

- `feature/custom-dev` — has the feature (FF-merged, HEAD `60dc95babc`).
- `feature/per-provider-llm-proxy` — the feature branch (same HEAD; keep or delete).
- 14 commits: factory (`772b9e1955`, `49edf8bad0`) → deepseek (`a4f8b876dd`) → pi-ai (`d3af973be8`) → plan (`3540e5de21`) → UI (`a9bba7ed09`, `2ac7afd624`) → docs (`6dada25417`) → gate-fixes (`fb68b1fbad`, `cb1b227267`) → helper refactor (`b60aa364b0`) → coverage tests (`72819123e7`, `666c2d456d`, `60dc95babc`).
