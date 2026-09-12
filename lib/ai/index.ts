import { SchemaInferenceProvider } from './provider'
import { MockSchemaInferenceProvider } from './mock-provider'
import { ClaudeSchemaInferenceProvider } from './claude-provider'

export function getSchemaInferenceProvider(): SchemaInferenceProvider {
  const mode = process.env.AI_MODE ?? 'mock'
  if (mode === 'claude') {
    return new ClaudeSchemaInferenceProvider()
  }
  return new MockSchemaInferenceProvider()
}
