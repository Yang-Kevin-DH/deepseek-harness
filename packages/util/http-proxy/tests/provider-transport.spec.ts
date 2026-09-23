import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { beforeEach, beforeAll, afterAll, describe, expect, it } from 'vitest'
import { fetch as undiciFetch } from 'undici'
import {
  composeProviderProxyUrl,
  createProviderProxyTransport,
  resolveProviderProxyTransport,
  UNSUPPORTED_PROVIDER_PROXY_PROTOCOL_MESSAGE,
  type ProviderProxyTransportEntry,
} from '../src/provider-transport.ts'

/** Absolute-form request target the fake proxy received; a populated entry proves a request was tunnelled. */
let proxied: string[] = []
let proxyAuth: string[]
let proxy: Server
let origin: Server
let proxyUrl: string
let originUrl: string

function listen(server: Server): Promise<AddressInfo> {
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => { resolve(server.address() as AddressInfo) })
  })
}

function close(server: Server): Promise<void> {
  return new Promise((resolve) => { server.close(() => { resolve() }) })
}

beforeAll(async () => {
  proxy = createServer((request, response) => {
    proxied.push(`${request.method} ${request.url}`)
    proxyAuth.push(request.headers['proxy-authorization'] ?? '')
    response.writeHead(200, { 'content-type': 'text/plain' })
    response.end('VIA-PROXY')
  })
  proxy.on('connect', (request, socket) => {
    proxied.push(`CONNECT ${request.url ?? ''}`)
    socket.end()
  })
  origin = createServer((_request, response) => { response.end('DIRECT') })
  const [proxyAddress, originAddress] = await Promise.all([listen(proxy), listen(origin)])
  proxyUrl = `http://127.0.0.1:${String(proxyAddress.port)}`
  originUrl = `http://127.0.0.1:${String(originAddress.port)}/probe`
})

afterAll(async () => {
  await Promise.all([close(proxy), close(origin)])
})

beforeEach(() => {
  proxied = []
  proxyAuth = []
})

describe('composeProviderProxyUrl', () => {
  it('returns undefined when no proxy is configured', () => {
    expect(composeProviderProxyUrl({})).toBeUndefined()
    expect(composeProviderProxyUrl({ proxy: '' })).toBeUndefined()
    expect(composeProviderProxyUrl({ proxy: '  ' })).toBeUndefined()
  })

  it('returns a normalized http URL to the configured address with no credentials', () => {
    const result = composeProviderProxyUrl({ proxy: 'http://host:8080' })!
    const parsed = new URL(result)
    expect(parsed.protocol).toBe('http:')
    expect(parsed.hostname).toBe('host')
    expect(parsed.port).toBe('8080')
    expect(decodeURIComponent(parsed.username)).toBe('')
    expect(decodeURIComponent(parsed.password)).toBe('')
  })

  it('embeds resolved credentials as userinfo', () => {
    const parsed = new URL(composeProviderProxyUrl({ proxy: 'http://host:8080', credentials: 'alice:secret' })!)
    expect(decodeURIComponent(`${parsed.username}:${parsed.password}`)).toBe('alice:secret')
  })

  it('ignores empty credentials', () => {
    const parsed = new URL(composeProviderProxyUrl({ proxy: 'http://host:8080', credentials: '' })!)
    expect(decodeURIComponent(parsed.username)).toBe('')
    expect(decodeURIComponent(parsed.password)).toBe('')
  })

  it('keeps a password that contains a colon', () => {
    const parsed = new URL(composeProviderProxyUrl({ proxy: 'http://host:8080', credentials: 'alice:p:a:s:s' })!)
    expect(decodeURIComponent(`${parsed.username}:${parsed.password}`)).toBe('alice:p:a:s:s')
  })

  it('uses the whole credential as the username when it has no colon', () => {
    const parsed = new URL(composeProviderProxyUrl({ proxy: 'http://host:8080', credentials: 'token' })!)
    expect(decodeURIComponent(parsed.username)).toBe('token')
    expect(decodeURIComponent(parsed.password)).toBe('')
  })

  it('rejects an unsupported scheme with the shared vocabulary', () => {
    expect(() => composeProviderProxyUrl({ proxy: 'socks5://host:1080' }))
      .toThrow(UNSUPPORTED_PROVIDER_PROXY_PROTOCOL_MESSAGE)
    expect(() => composeProviderProxyUrl({ proxy: 'ftp://host:21' }))
      .toThrow(UNSUPPORTED_PROVIDER_PROXY_PROTOCOL_MESSAGE)
  })

  it('rejects a malformed URL', () => {
    expect(() => composeProviderProxyUrl({ proxy: 'not a url' })).toThrow(/not a valid URL/)
  })
})

describe('createProviderProxyTransport', () => {
  it('returns undefined when no proxy is configured', async () => {
    expect(await createProviderProxyTransport({})).toBeUndefined()
  })

  it('tunnels a request through the proxy dispatcher', async () => {
    const transport = await createProviderProxyTransport({ proxy: proxyUrl })
    expect(transport).not.toBeUndefined()
    const response = await undiciFetch(originUrl, { dispatcher: transport!.dispatcher })
    expect(await response.text()).toBe('VIA-PROXY')
    expect(proxied).toContain(`GET ${originUrl}`)
  })

  it('routes a request through the proxy via the fetch override', async () => {
    const transport = await createProviderProxyTransport({ proxy: proxyUrl })
    const response = await transport!.fetch(originUrl)
    expect(await response.text()).toBe('VIA-PROXY')
    expect(proxied).toContain(`GET ${originUrl}`)
  })

  it('sends Proxy-Authorization when credentials are supplied', async () => {
    const transport = await createProviderProxyTransport({ proxy: proxyUrl, credentials: 'alice:secret' })
    await undiciFetch(originUrl, { dispatcher: transport!.dispatcher })
    const [authorization] = proxyAuth
    expect(authorization).toBeDefined()
    expect(authorization!).toMatch(/^Basic /)
    expect(Buffer.from(authorization!.slice(6), 'base64').toString()).toBe('alice:secret')
  })

  it('carries the proxy URL in the provider-scoped env', async () => {
    const transport = await createProviderProxyTransport({ proxy: proxyUrl })
    const expected = new URL(proxyUrl)
    expect(transport!.env.HTTPS_PROXY).toBeDefined()
    const https = new URL(transport!.env.HTTPS_PROXY!)
    expect(https.protocol).toBe('http:')
    expect(https.hostname).toBe(expected.hostname)
    expect(https.port).toBe(expected.port)
    expect(transport!.env.HTTP_PROXY).toBe(transport!.env.HTTPS_PROXY)
    expect(transport!.env.NO_PROXY).toBe('')
  })

  it('disposes the dispatcher without throwing', async () => {
    const transport = await createProviderProxyTransport({ proxy: proxyUrl })
    await expect(transport!.dispose()).resolves.toBeUndefined()
  })
})

describe('resolveProviderProxyTransport', () => {
  it('returns undefined and leaves the cache empty when no proxy is configured', async () => {
    const cache = new Map<string, ProviderProxyTransportEntry>()
    expect(await resolveProviderProxyTransport({}, () => undefined, cache, 'k')).toBeUndefined()
    expect(cache.size).toBe(0)
  })

  it('builds, caches, and reuses a transport for an unchanged proxy', async () => {
    const cache = new Map<string, ProviderProxyTransportEntry>()
    const first = await resolveProviderProxyTransport({ proxy: proxyUrl }, () => undefined, cache, 'k')
    const second = await resolveProviderProxyTransport({ proxy: proxyUrl }, () => undefined, cache, 'k')
    expect(first).not.toBeUndefined()
    expect(second).toBe(first)
    expect(cache.size).toBe(1)
  })

  it('resolves the credential reference and tunnels with it', async () => {
    const cache = new Map<string, ProviderProxyTransportEntry>()
    const resolveCredential = (ref: string | undefined) => ref === 'AUTH' ? 'alice:secret' : undefined
    const transport = await resolveProviderProxyTransport({ proxy: proxyUrl, proxyCredentialEnv: 'AUTH' }, resolveCredential, cache, 'k')
    await undiciFetch(originUrl, { dispatcher: transport!.dispatcher })
    expect(proxied).toContain(`GET ${originUrl}`)
    const [authorization] = proxyAuth
    expect(Buffer.from(authorization!.slice(6), 'base64').toString()).toBe('alice:secret')
  })

  it('disposes and drops a cached transport when the proxy is removed', async () => {
    const cache = new Map<string, ProviderProxyTransportEntry>()
    await resolveProviderProxyTransport({ proxy: proxyUrl }, () => undefined, cache, 'k')
    expect(cache.size).toBe(1)
    expect(await resolveProviderProxyTransport({}, () => undefined, cache, 'k')).toBeUndefined()
    expect(cache.size).toBe(0)
  })

  it('disposes the old transport and rebuilds when the URL changes', async () => {
    const cache = new Map<string, ProviderProxyTransportEntry>()
    const first = await resolveProviderProxyTransport({ proxy: proxyUrl }, () => 'a:b', cache, 'k')
    const second = await resolveProviderProxyTransport({ proxy: proxyUrl }, () => 'c:d', cache, 'k')
    expect(second).not.toBe(first)
    expect(cache.size).toBe(1)
  })

  it('rejects an unsupported scheme', async () => {
    const cache = new Map<string, ProviderProxyTransportEntry>()
    await expect(resolveProviderProxyTransport({ proxy: 'socks5://host:1080' }, () => undefined, cache, 'k'))
      .rejects.toThrow(UNSUPPORTED_PROVIDER_PROXY_PROTOCOL_MESSAGE)
  })
})
