import { describe, expect, it } from 'vitest'
import { resolveAdapterOptions } from '../src/config.ts'

describe('resolveAdapterOptions proxy', () => {
  it('omits proxy fields when not configured', () => {
    const resolved = resolveAdapterOptions({ apiKeyEnv: 'DEEPSEEK_API_KEY' })
    expect(resolved.proxy).toBeUndefined()
    expect(resolved.proxyCredentialEnv).toBeUndefined()
  })

  it('carries the proxy address and credential reference', () => {
    const resolved = resolveAdapterOptions({
      apiKeyEnv: 'DEEPSEEK_API_KEY',
      proxy: 'http://proxy.example:8080',
      proxyCredentialEnv: 'MY_PROXY_AUTH',
    })
    expect(resolved.proxy).toBe('http://proxy.example:8080')
    expect(resolved.proxyCredentialEnv).toBeDefined()
  })

  it('rejects an unsupported proxy scheme at resolution', () => {
    expect(() => resolveAdapterOptions({ apiKeyEnv: 'DEEPSEEK_API_KEY', proxy: 'socks5://host:1080' }))
      .toThrow(/http or https/)
  })

  it('accepts an https proxy', () => {
    const resolved = resolveAdapterOptions({ apiKeyEnv: 'DEEPSEEK_API_KEY', proxy: 'https://proxy.example:8080' })
    expect(resolved.proxy).toBe('https://proxy.example:8080')
  })

  it('omits proxy fields when the proxy is absent even with a credential reference', () => {
    const resolved = resolveAdapterOptions({ apiKeyEnv: 'DEEPSEEK_API_KEY', proxyCredentialEnv: 'MY_PROXY_AUTH' })
    expect(resolved.proxy).toBeUndefined()
    expect(resolved.proxyCredentialEnv).toBeUndefined()
  })

  it('treats an empty proxy string as no proxy', () => {
    const resolved = resolveAdapterOptions({ apiKeyEnv: 'DEEPSEEK_API_KEY', proxy: '' })
    expect(resolved.proxy).toBeUndefined()
    expect(resolved.proxyCredentialEnv).toBeUndefined()
  })
})
