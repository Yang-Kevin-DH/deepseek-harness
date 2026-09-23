/**
 * Outbound HTTP proxy support for DeepSeek Harness.
 *
 * Node's built-in `fetch` ignores `HTTP_PROXY` and friends, so every harness request would connect
 * directly no matter what the user exported. The launcher resolves one policy from the launch
 * environment and installs it as undici's global dispatcher, which is what `fetch` resolves — so
 * LLM adapters, web search, MCP over HTTP, and telemetry are covered without touching their code.
 *
 * This is a library, not a plugin: transport policy has one answer per process, so there is nothing
 * for a composition to mount, swap, or scope. A per-provider dispatcher (a provider that needs a
 * proxy its other tools must not use) is a separate factory below, not a composition scope.
 *
 * Process-wide policy — install it, ask how to send one request, build a child's environment, and
 * strip the ambient one for a replay. Per-provider transport — build a scoped dispatcher for one
 * LLM provider without touching the global one.
 * @module @deepseek-ai/dsh-http-proxy
 */

export {
  clearedProxyEnv,
  installProxyFromEnvironment,
  proxyEnvironmentForChild,
  proxyRouteFor,
  type ProxyRoute,
} from './install.ts'

export {
  composeProviderProxyUrl,
  createProviderProxyTransport,
  resolveProviderProxyTransport,
  UNSUPPORTED_PROVIDER_PROXY_PROTOCOL_MESSAGE,
  type ProviderProxyConfig,
  type ProviderProxyTransport,
  type ProviderProxyTransportEntry,
} from './provider-transport.ts'
