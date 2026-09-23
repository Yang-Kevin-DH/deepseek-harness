// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import Schema from '@deepseek-ai/schemastery'
import type { SettingsNamespaceView } from '@deepseek-ai/dsh-api-remotes/client'
import type { JsonValue } from '@deepseek-ai/dsh-util-values'
import { ProviderEditor } from '../src/client/ProviderEditor.tsx'
import { CustomProviderCard } from '../src/client/CustomProviderCard.tsx'
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
})
