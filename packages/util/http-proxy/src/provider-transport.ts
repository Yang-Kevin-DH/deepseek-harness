/**
 * Per-provider outbound HTTP proxy transport: a scoped dispatcher for one LLM
 * provider's requests, independent of the process-wide policy in
 * {@link ./install.ts#installGlobalProxy}.
 *
 * The process-wide policy proxies every origin or none; a provider that needs
 * a proxy its other tools must not use (web search stays direct) gets its own
 * dispatcher here and threads it as a per-request `dispatcher` (undici `fetch`)
 * plus a provider-scoped `env` (SDK transports that read `HTTPS_PROXY`).
 * Nothing here installs or reads the global dispatcher, so a request whose
 * provider carries no proxy falls back to it as before.
 *
 * This module is transport-only: the caller resolves any credential reference
 * (mirroring `apiKeyEnv`) and passes the value as {@link ProviderProxyConfig.credentials}.
 *
 * @module @deepseek-ai/dsh-http-proxy/provider-transport
 */

import type { Dispatcher } from 'undici'

/** The proxy a provider profile carries: an address and optional resolved credentials. */
export interface ProviderProxyConfig {
  /**
   * Proxy address, e.g. `http://host:port`. Carries no credentials: the address
   * is non-secret and travels in configuration; credentials come from
   * {@link ProviderProxyConfig.credentials}.
   */
  readonly proxy?: string | undefined
  /**
   * Resolved proxy credentials as `user:pass`. The caller resolves these from
   * its credential reference (env-var name) the way it resolves `apiKeyEnv`,
   * so the secret never travels in configuration.
   */
  readonly credentials?: string | undefined
}

/** One provider's scoped proxy transport. {@link ProviderProxyTransport.dispose} releases the dispatcher. */
export interface ProviderProxyTransport {
  /** undici dispatcher that tunnels through the proxy. */
  readonly dispatcher: Dispatcher
  /**
   * `fetch` override that routes through {@link ProviderProxyTransport.dispatcher}, for
   * adapters and SDKs that accept a custom `fetch` (undici's `fetch` accepts a per-request
   * `dispatcher`). Typed as `typeof globalThis.fetch` so it slots into both.
   */
  readonly fetch: typeof globalThis.fetch
  /**
   * Provider-scoped env carrying the full proxy URL, for SDK transports that
   * resolve `HTTPS_PROXY` themselves (these take precedence over `process.env`).
   */
  readonly env: Readonly<Record<string, string>>
  /** Release the dispatcher; safe to call once. */
  readonly dispose: () => Promise<void>
}

/** One cache entry: the composed URL (cache key contents) and its live transport. */
export interface ProviderProxyTransportEntry {
  /** Composed proxy URL (with credentials) this entry was built for. */
  readonly url: string
  /** The live transport; dispose before replacing. */
  readonly transport: ProviderProxyTransport
}

/**
 * Resolve a provider's scoped proxy transport from a profile that names its
 * credential by reference, caching by `key` so an unchanged proxy reuses one
 * dispatcher and a changed one disposes the old before building the new.
 *
 * Generic over the credential-reference type so this stays decoupled from the
 * credentials seam: the caller resolves the reference (mirroring `apiKeyEnv`)
 * through `resolveCredential`.
 *
 * @param config - the profile's proxy address and credential reference.
 * @param resolveCredential - resolves the credential reference to a `user:pass`
 *   value; receives `undefined` when the profile names no credential.
 * @param cache - the caller-owned transport cache (keyed by `key`).
 * @param key - cache key for this provider/route.
 * @returns the transport, or `undefined` when no proxy is configured.
 * @throws when `proxy` is present but unsupported (see {@link composeProviderProxyUrl}).
 */
export async function resolveProviderProxyTransport<TRef>(
  config: { readonly proxy?: string | undefined; readonly proxyCredentialEnv?: TRef | undefined },
  resolveCredential: (ref: TRef | undefined) => string | undefined,
  cache: Map<string, ProviderProxyTransportEntry>,
  key: string,
): Promise<ProviderProxyTransport | undefined> {
  const credentials = resolveCredential(config.proxyCredentialEnv)
  const url = composeProviderProxyUrl({ proxy: config.proxy, credentials })
  if (url === undefined) {
    const stale = cache.get(key)
    if (stale !== undefined) { await stale.transport.dispose(); cache.delete(key) }
    return undefined
  }
  const cached = cache.get(key)
  if (cached?.url === url) return cached.transport
  if (cached !== undefined) await cached.transport.dispose()
  const transport = await createProviderProxyTransport({ proxy: config.proxy, credentials })
  if (transport === undefined) { cache.delete(key); return undefined }
  cache.set(key, { url, transport })
  return transport
}

/** Unsupported proxy scheme diagnostic, matching the process-wide policy's vocabulary. */
export const UNSUPPORTED_PROVIDER_PROXY_PROTOCOL_MESSAGE
  = 'Unsupported proxy protocol. SOCKS and PAC proxy URLs are not supported; use an HTTP or HTTPS proxy URL.'

/**
 * Compose the full proxy URL — with {@link ProviderProxyConfig.credentials}
 * embedded when supplied — from a provider profile.
 *
 * @param config - the provider profile's proxy fields.
 * @returns the full proxy URL (`http://[user:pass@]host:port`), or `undefined`
 *   when no proxy is configured.
 * @throws when `proxy` is present but not an `http:`/`https:` URL.
 */
export function composeProviderProxyUrl(config: ProviderProxyConfig): string | undefined {
  const address = config.proxy?.trim()
  if (address === undefined || address === '') return undefined
  let parsed: URL
  try {
    parsed = new URL(address)
  } catch (cause) {
    throw new Error(`provider proxy URL is not a valid URL: ${JSON.stringify(address)}`, { cause })
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error(`${UNSUPPORTED_PROVIDER_PROXY_PROTOCOL_MESSAGE} (got ${parsed.protocol})`)
  }
  const credentials = config.credentials
  if (credentials !== undefined && credentials !== '') {
    const separator = credentials.indexOf(':')
    parsed.username = separator === -1 ? credentials : credentials.slice(0, separator)
    parsed.password = separator === -1 ? '' : credentials.slice(separator + 1)
  }
  return parsed.href
}

/**
 * Build a provider's scoped proxy transport: an undici `ProxyAgent` over the
 * composed URL, the provider-scoped env, a `fetch` bound to the dispatcher, and
 * a disposer. The caller threads the dispatcher/fetch into its own requests
 * and passes the env to SDKs that read proxy variables; nothing here changes
 * the global dispatcher.
 *
 * @param config - the provider profile's proxy fields.
 * @returns the transport, or `undefined` when no proxy is configured.
 * @throws when `proxy` is present but unsupported (see {@link composeProviderProxyUrl}).
 */
export async function createProviderProxyTransport(
  config: ProviderProxyConfig,
): Promise<ProviderProxyTransport | undefined> {
  const url = composeProviderProxyUrl(config)
  if (url === undefined) return undefined
  const { ProxyAgent, fetch: undiciFetch } = await import('undici')
  const dispatcher: Dispatcher = new ProxyAgent(url)
  const fetch = ((
    input: Parameters<typeof globalThis.fetch>[0],
    init?: Parameters<typeof globalThis.fetch>[1],
  ) => undiciFetch(
    input as Parameters<typeof undiciFetch>[0],
    { ...(init ?? {}) as Parameters<typeof undiciFetch>[1], dispatcher },
  )) as typeof globalThis.fetch
  return {
    dispatcher,
    fetch,
    env: { HTTPS_PROXY: url, HTTP_PROXY: url, NO_PROXY: '' },
    dispose: () => dispatcher.close().then(() => undefined),
  }
}
