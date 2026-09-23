import { describe, expect, it } from 'vitest'
import { settingsSchema } from './settings-schema.client.ts'
import {
  ProviderProfileSchema, validateProxyUrl, proxyOf, proxyCredentialEnvOf,
} from '../src/client/store.ts'

describe('provider profile schema & proxy validation', () => {
  it('defines ProviderProfileSchema with proxy and proxyCredentialEnv mirroring apiKeyEnv', () => {
    const value = {
      apiKeyEnv: 'DEEPSEEK_API_KEY',
      proxy: 'http://proxy.example.com:8080',
      proxyCredentialEnv: 'PROXY_AUTH',
    }
    const validated = ProviderProfileSchema(value)
    expect(validated).toEqual(value)
  })

  it('validates http/https proxy URLs and rejects socks5 or non-http/https schemes', () => {
    expect(() => { validateProxyUrl('http://proxy.example.com:8080') }).not.toThrow()
    expect(() => { validateProxyUrl('https://proxy.example.com:8443') }).not.toThrow()
    expect(() => { validateProxyUrl('socks5://proxy.example.com:1080') }).toThrow(/must use http or https/)
    expect(() => { validateProxyUrl('ftp://proxy.example.com') }).toThrow(/must use http or https/)
    expect(() => { validateProxyUrl('invalid-url') }).toThrow(/must use http or https/)
    expect(() => { validateProxyUrl('  ') }).not.toThrow()
  })

  it('reads proxy and proxyCredentialEnv from namespace value via proxyOf and proxyCredentialEnvOf', () => {
    const ns = {
      ns: 'llm-pi-ai',
      schema: {},
      value: {
        providers: {
          custom: {
            proxy: 'http://custom-proxy:8080',
            proxyCredentialEnv: 'CUSTOM_PROXY_CRED',
          },
        },
      },
      autoGenerate: true,
      applies: 'live' as const,
      secrets: [],
      revision: 0,
    }

    expect(proxyOf(ns, ['providers', 'custom'], settingsSchema)).toBe('http://custom-proxy:8080')
    expect(proxyCredentialEnvOf(ns, ['providers', 'custom'], settingsSchema)).toBe('CUSTOM_PROXY_CRED')
    expect(proxyOf(undefined, ['providers', 'custom'], settingsSchema)).toBeUndefined()
    expect(proxyCredentialEnvOf(undefined, ['providers', 'custom'], settingsSchema)).toBeUndefined()
  })
})
