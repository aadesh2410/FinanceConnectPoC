import { SchemaInferenceProvider } from './provider'
import { MockSchemaInferenceProvider } from './mock-provider'

export function getSchemaInferenceProvider(): SchemaInferenceProvider {
  const mode = process.env.AI_MODE ?? 'mock'
  if (mode === 'claude') {
    // Future: return new ClaudeSchemaInferenceProvider()
    return new MockSchemaInferenceProvider()
  }
  return new MockSchemaInferenceProvider()
}
