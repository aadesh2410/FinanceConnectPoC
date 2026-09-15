import { SchemaInferenceProvider } from './provider'
import { MockSchemaInferenceProvider } from './mock-provider'
import { ClaudeSchemaInferenceProvider } from './claude-provider'
import { HeuristicSchemaInferenceProvider } from './heuristic-provider'

export function getSchemaInferenceProvider(): SchemaInferenceProvider {
  const mode = process.env.AI_MODE ?? 'heuristic'
  if (mode === 'claude') {
    return new ClaudeSchemaInferenceProvider()
  }
  if (mode === 'mock') {
    return new MockSchemaInferenceProvider()
  }
  return new HeuristicSchemaInferenceProvider()
}
