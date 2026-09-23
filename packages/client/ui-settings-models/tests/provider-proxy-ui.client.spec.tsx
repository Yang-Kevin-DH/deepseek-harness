// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import Schema from '@deepseek-ai/schemastery'
import type { SettingsNamespaceView } from '@deepseek-ai/dsh-api-remotes/client'
import type { JsonValue } from '@deepseek-ai/dsh-util-values'
import { ProviderEditor } from '../src/client/ProviderEditor.tsx'
import { CustomProviderCard } from '../src/client/CustomProviderCard.tsx'
import * as storeModule from '../src/client/store.ts'
import { settingsSchema } from './settings-schema.client.ts'
import { en } from '../src/client/locales.ts'

afterEach(cleanup)

const t = (key: keyof typeof en) => en[key]

const PiAiConfig = Schema.object({
  providers: Schema.dict(Schema.object({
    apiKeyEnv: Schema.string().role('credential-ref'),
    api: Schema.union(['openai-completions', 'openai-responses', 'anthropic-messages']),
    baseURL: Schema.string(),
    proxy: Schema.string(),
    proxyCredentialEnv: Schema.string().role('credential-ref'),
  })),
})

function piAiNamespace(providers: Record<string, JsonValue>): SettingsNamespaceView {
  return {
    ns: 'llm-pi-ai',
    schema: JSON.parse(JSON.stringify(PiAiConfig.toJSON())) as JsonValue,
    value: { providers },
    base: { providers: {} },
    user: { providers },
    autoGenerate: true, applies: 'live',
    secrets: [],
    revision: 1,
  }
}

describe('ProviderEditor proxy fields', () => {
  it('renders proxy toggle, URL input when enabled, and proxyCredentialEnv input', () => {
    const ns = piAiNamespace({ openai: { baseURL: 'https://api.openai.com/v1' } })
    const operations = {
      storeCredential: vi.fn(),
      removeCredential: vi.fn(),
      writeSettings: vi.fn(),
      discoverModels: vi.fn().mockResolvedValue({ ok: true, value: [] }),
      describeCredential: vi.fn().mockResolvedValue({ configured: false, writable: true }),
    }

    render(
      <ProviderEditor
        provider="openai"
        displayName="OpenAI"
        namespace={ns}
        schema={settingsSchema}
        settingsPath={['providers', 'openai']}
        operations={operations}
        t={t}
        readOnly={false}
        onClose={() => {}}
      />,
    )

    // Expand customized details section
    const summary = screen.getByText(en.customized)
    fireEvent.click(summary)

    // The proxy toggle checkbox should be rendered
    const toggle = screen.getByLabelText(en.useProxy) as HTMLInputElement
    expect(toggle.checked).toBe(false)

    // When toggle is off, proxy URL input is hidden
    expect(screen.queryByLabelText(en.proxyUrl)).toBeNull()

    // Toggling "use proxy" on displays the proxy URL and proxyCredentialEnv inputs
    fireEvent.click(toggle)
    expect(toggle.checked).toBe(true)

    const proxyInput = screen.getByLabelText(en.proxyUrl) as HTMLInputElement
    const credInput = screen.getByLabelText(en.proxyCredentialEnv) as HTMLInputElement
    expect(proxyInput).toBeDefined()
    expect(credInput).toBeDefined()
  })

  it('surfaces invalid non-http/https proxy URL rejection', async () => {
    const ns = piAiNamespace({ openai: { baseURL: 'https://api.openai.com/v1' } })
    const operations = {
      storeCredential: vi.fn().mockResolvedValue(undefined),
      removeCredential: vi.fn(),
      writeSettings: vi.fn().mockResolvedValue({ kind: 'written', view: ns }),
      discoverModels: vi.fn().mockResolvedValue({ ok: true, value: [] }),
      describeCredential: vi.fn().mockResolvedValue({ configured: false, writable: true }),
    }

    render(
      <ProviderEditor
        provider="openai"
        displayName="OpenAI"
        namespace={ns}
        schema={settingsSchema}
        settingsPath={['providers', 'openai']}
        operations={operations}
        t={t}
        readOnly={false}
        onClose={() => {}}
      />,
    )

    // Open details
    fireEvent.click(screen.getByText(en.customized))

    // Toggle proxy on
    fireEvent.click(screen.getByLabelText(en.useProxy))

    // Enter non-http URL (e.g. socks5://localhost:1080)
    const proxyInput = screen.getByLabelText(en.proxyUrl)
    fireEvent.change(proxyInput, { target: { value: 'socks5://localhost:1080' } })

    // Submit form
    fireEvent.click(screen.getByText(en.apply))

    // Validation failure message should be surfaced
    expect(await screen.findByText(/proxy must use http or https/i)).toBeDefined()
    expect(operations.writeSettings).not.toHaveBeenCalled()
  })

  it('edits proxy fields through the change handlers and applies successfully', async () => {
    const ns = piAiNamespace({ openai: { baseURL: 'https://api.openai.com/v1', proxy: 'http://initial-proxy:8080', proxyCredentialEnv: 'INITIAL_ENV' } })
    const onClose = vi.fn()
    const operations = {
      storeCredential: vi.fn().mockResolvedValue(undefined),
      removeCredential: vi.fn(),
      writeSettings: vi.fn().mockResolvedValue({ kind: 'written', view: ns }),
      discoverModels: vi.fn().mockResolvedValue({ ok: true, value: [] }),
      describeCredential: vi.fn().mockResolvedValue({ configured: false, writable: true }),
    }

    render(
      <ProviderEditor
        provider="openai"
        displayName="OpenAI"
        namespace={ns}
        schema={settingsSchema}
        settingsPath={['providers', 'openai']}
        operations={operations}
        t={t}
        readOnly={false}
        onClose={onClose}
      />,
    )

    fireEvent.click(screen.getByText(en.customized))

    const proxyInput = screen.getByLabelText(en.proxyUrl) as HTMLInputElement
    const credInput = screen.getByLabelText(en.proxyCredentialEnv) as HTMLInputElement
    expect(proxyInput.value).toBe('http://initial-proxy:8080')
    expect(credInput.value).toBe('INITIAL_ENV')

    // Test clearing to empty string (triggers undefined branch)
    fireEvent.change(proxyInput, { target: { value: '' } })
    expect(proxyInput.value).toBe('')

    fireEvent.change(credInput, { target: { value: '' } })
    expect(credInput.value).toBe('')

    // Test setting non-empty string values
    fireEvent.change(proxyInput, { target: { value: 'http://proxy.example:8080' } })
    fireEvent.change(credInput, { target: { value: 'MY_PROXY_AUTH' } })

    // Apply runs proxy validation on valid URL and triggers writeSettings
    fireEvent.click(screen.getByText(en.apply))

    await vi.waitFor(() => {
      expect(operations.writeSettings).toHaveBeenCalled()
      expect(onClose).toHaveBeenCalledWith(true)
    })
  })

  it('surfaces non-Error proxy validation failure message', async () => {
    const ns = piAiNamespace({ openai: { baseURL: 'https://api.openai.com/v1' } })
    const operations = {
      storeCredential: vi.fn(),
      removeCredential: vi.fn(),
      writeSettings: vi.fn(),
      discoverModels: vi.fn().mockResolvedValue({ ok: true, value: [] }),
      describeCredential: vi.fn().mockResolvedValue({ configured: false, writable: true }),
    }

    const spy = vi.spyOn(storeModule, 'validateProxyUrl').mockImplementationOnce(() => {
      throw 'string proxy failure'
    })

    render(
      <ProviderEditor
        provider="openai"
        displayName="OpenAI"
        namespace={ns}
        schema={settingsSchema}
        settingsPath={['providers', 'openai']}
        operations={operations}
        t={t}
        readOnly={false}
        onClose={() => {}}
      />,
    )

    fireEvent.click(screen.getByText(en.customized))
    fireEvent.click(screen.getByLabelText(en.useProxy))
    fireEvent.change(screen.getByLabelText(en.proxyUrl), { target: { value: 'http://proxy.example:8080' } })

    fireEvent.click(screen.getByText(en.apply))

    expect(await screen.findByText('string proxy failure')).toBeDefined()
    spy.mockRestore()
  })
})

describe('CustomProviderCard proxy fields', () => {
  it('renders proxy toggle and surfaces proxy URL validation in custom card', () => {
    const operations = {
      storeCredential: vi.fn(),
      removeCredential: vi.fn(),
      writeSettings: vi.fn(),
      discoverModels: vi.fn().mockResolvedValue({ ok: true, value: [] }),
      describeCredential: vi.fn().mockResolvedValue({ configured: false, writable: true }),
    }

    render(
      <CustomProviderCard
        taken={[]}
        protocols={['openai-completions']}
        revision={1}
        operations={operations}
        t={t}
        readOnly={false}
        onClose={() => {}}
      />,
    )

    const toggle = screen.getByLabelText(en.useProxy) as HTMLInputElement
    expect(toggle.checked).toBe(false)

    fireEvent.click(toggle)
    expect(toggle.checked).toBe(true)

    const proxyInput = screen.getByLabelText(en.proxyUrl) as HTMLInputElement
    expect(proxyInput).toBeDefined()
  })

  it('edits proxy fields through the change handlers and toggling off resets values', () => {
    const operations = {
      storeCredential: vi.fn(),
      removeCredential: vi.fn(),
      writeSettings: vi.fn(),
      discoverModels: vi.fn().mockResolvedValue({ ok: true, value: [] }),
      describeCredential: vi.fn().mockResolvedValue({ configured: false, writable: true }),
    }

    render(
      <CustomProviderCard
        taken={[]}
        protocols={['openai-completions']}
        revision={1}
        operations={operations}
        t={t}
        readOnly={false}
        onClose={() => {}}
      />,
    )

    const toggle = screen.getByLabelText(en.useProxy) as HTMLInputElement
    fireEvent.click(toggle)
    fireEvent.change(screen.getByLabelText(en.proxyUrl), { target: { value: 'http://proxy.example:8080' } })
    fireEvent.change(screen.getByLabelText(en.proxyCredentialEnv), { target: { value: 'MY_PROXY_AUTH' } })

    expect((screen.getByLabelText(en.proxyUrl) as HTMLInputElement).value).toBe('http://proxy.example:8080')
    expect((screen.getByLabelText(en.proxyCredentialEnv) as HTMLInputElement).value).toBe('MY_PROXY_AUTH')

    // Toggling off resets proxy and proxyCredentialEnv to empty strings (lines 291-293)
    fireEvent.click(toggle)
    expect(screen.queryByLabelText(en.proxyUrl)).toBeNull()

    // Toggle back on to verify values were reset
    fireEvent.click(toggle)
    expect((screen.getByLabelText(en.proxyUrl) as HTMLInputElement).value).toBe('')
    expect((screen.getByLabelText(en.proxyCredentialEnv) as HTMLInputElement).value).toBe('')
  })

  it('creates custom provider with proxy configured via createOnce', async () => {
    const operations = {
      storeCredential: vi.fn().mockResolvedValue(undefined),
      removeCredential: vi.fn(),
      writeSettings: vi.fn().mockResolvedValue({ kind: 'written', view: {} }),
      discoverModels: vi.fn().mockResolvedValue({ ok: true, value: [] }),
      describeCredential: vi.fn().mockResolvedValue({ configured: false, writable: true }),
    }
    const onClose = vi.fn()

    render(
      <CustomProviderCard
        taken={[]}
        protocols={['openai-completions']}
        revision={1}
        operations={operations}
        t={t}
        readOnly={false}
        onClose={onClose}
      />,
    )

    fireEvent.change(screen.getByLabelText(en.customRoute), { target: { value: 'acme-gateway' } })
    fireEvent.change(screen.getByLabelText(en.customDisplayName), { target: { value: 'Acme Gateway' } })
    fireEvent.change(screen.getByLabelText(en.baseUrl), { target: { value: 'https://gateway.acme.example/v1' } })
    fireEvent.click(screen.getByText(en.addModel))
    const modelInput = await screen.findByLabelText(`${en.modelId} 1`)
    fireEvent.change(modelInput, { target: { value: 'acme-large' } })

    fireEvent.click(screen.getByLabelText(en.useProxy))
    fireEvent.change(screen.getByLabelText(en.proxyUrl), { target: { value: 'http://proxy.example:8080' } })
    fireEvent.change(screen.getByLabelText(en.proxyCredentialEnv), { target: { value: 'MY_PROXY_AUTH' } })

    const createButton = screen.getByText(en.create)
    await vi.waitFor(() => {
      expect((createButton as HTMLButtonElement).disabled).toBe(false)
    })

    fireEvent.click(createButton)

    await vi.waitFor(() => {
      expect(operations.writeSettings).toHaveBeenCalledWith(
        'llm-pi-ai',
        [{
          op: 'set',
          path: ['providers', 'acme-gateway'],
          value: expect.objectContaining({
            proxy: 'http://proxy.example:8080',
            proxyCredentialEnv: 'MY_PROXY_AUTH',
          }),
        }],
        1,
      )
      expect(onClose).toHaveBeenCalledWith(true)
    })
  })

  it('surfaces proxy validation failure on createOnce in CustomProviderCard', async () => {
    const operations = {
      storeCredential: vi.fn(),
      removeCredential: vi.fn(),
      writeSettings: vi.fn(),
      discoverModels: vi.fn().mockResolvedValue({ ok: true, value: [] }),
      describeCredential: vi.fn().mockResolvedValue({ configured: false, writable: true }),
    }

    render(
      <CustomProviderCard
        taken={[]}
        protocols={['openai-completions']}
        revision={1}
        operations={operations}
        t={t}
        readOnly={false}
        onClose={() => {}}
      />,
    )

    fireEvent.change(screen.getByLabelText(en.customRoute), { target: { value: 'acme-gateway' } })
    fireEvent.change(screen.getByLabelText(en.customDisplayName), { target: { value: 'Acme Gateway' } })
    fireEvent.change(screen.getByLabelText(en.baseUrl), { target: { value: 'https://gateway.acme.example/v1' } })
    fireEvent.click(screen.getByText(en.addModel))
    const modelInput = await screen.findByLabelText(`${en.modelId} 1`)
    fireEvent.change(modelInput, { target: { value: 'acme-large' } })

    fireEvent.click(screen.getByLabelText(en.useProxy))
    fireEvent.change(screen.getByLabelText(en.proxyUrl), { target: { value: 'socks5://localhost:1080' } })

    const createButton = screen.getByText(en.create)
    await vi.waitFor(() => {
      expect((createButton as HTMLButtonElement).disabled).toBe(false)
    })

    fireEvent.click(createButton)

    expect(await screen.findByText(/proxy must use http or https/i)).toBeDefined()
    expect(operations.writeSettings).not.toHaveBeenCalled()
  })
})
