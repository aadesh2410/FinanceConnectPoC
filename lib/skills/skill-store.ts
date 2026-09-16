import { Skill } from './types'
import { v4 as uuidv4 } from 'uuid'

const g = global as typeof global & { __skillMemStore?: Map<string, Skill>; __skillMemSeeded?: boolean }
if (!g.__skillMemStore) g.__skillMemStore = new Map<string, Skill>()
const memStore = g.__skillMemStore

async function getRedis() {
  const url = process.env.UPSTASH_REDIS_REST_URL
  const token = process.env.UPSTASH_REDIS_REST_TOKEN
  if (!url || !token) return null
  const { Redis } = await import('@upstash/redis')
  return new Redis({ url, token })
}

const SEED_SKILLS: Omit<Skill, 'id' | 'createdAt'>[] = [
  {
    name: 'Year columns to YEAR INTEGER',
    category: 'PERIOD_FORMAT',
    rule: '4-digit year column headers (2020–2029) → single YEAR column of type INTEGER. Do not create one column per year.',
    examples: ['2022, 2023, 2024, 2025 headers → YEAR INTEGER column'],
    source: 'MANUAL',
    usageCount: 0,
    enabled: true,
  },
  {
    name: 'YYYY Qn headers to YEAR + QUARTER',
    category: 'PERIOD_FORMAT',
    rule: "Column headers matching 'YYYY Qn' (e.g. 2026 Q1, 2026 Q2) → two columns: YEAR INTEGER and QUARTER VARCHAR.",
    examples: ['2026 Q1, 2026 Q2, 2026 Q3 headers → YEAR INTEGER + QUARTER VARCHAR'],
    source: 'MANUAL',
    usageCount: 0,
    enabled: true,
  },
  {
    name: 'Pivot section header rows',
    category: 'STRUCTURE_RULE',
    rule: 'In pivot/crosstab sheets, rows where all value columns are blank or the row label spans the full width are section headers — exclude them from data rows.',
    examples: ['Row with "Market Risk" spanning all columns → section header, skip it'],
    source: 'MANUAL',
    usageCount: 0,
    enabled: true,
  },
  {
    name: 'Total rows flag',
    category: 'STRUCTURE_RULE',
    rule: "Rows labelled 'Total', 'Sub-Total', 'Grand Total', or any variant are subtotal rows — include them with IS_TOTAL_ROW = true.",
    examples: ['Row with label "Grand Total" → include with IS_TOTAL_ROW = true'],
    source: 'MANUAL',
    usageCount: 0,
    enabled: true,
  },
]

async function seedIfEmpty(): Promise<void> {
  const redis = await getRedis()
  if (redis) {
    const indexRaw = await redis.get<string>('skill-index')
    const ids: string[] = indexRaw ? (typeof indexRaw === 'string' ? JSON.parse(indexRaw) : (indexRaw as string[])) : []
    if (ids.length === 0) {
      const now = new Date().toISOString()
      const seeded: Skill[] = SEED_SKILLS.map((s) => ({ ...s, id: uuidv4(), createdAt: now }))
      for (const skill of seeded) {
        await redis.set(`skill:${skill.id}`, JSON.stringify(skill))
      }
      await redis.set('skill-index', JSON.stringify(seeded.map((s) => s.id)))
    }
  } else {
    if (!g.__skillMemSeeded && memStore.size === 0) {
      g.__skillMemSeeded = true
      const now = new Date().toISOString()
      for (const s of SEED_SKILLS) {
        const skill: Skill = { ...s, id: uuidv4(), createdAt: now }
        memStore.set(skill.id, skill)
      }
    }
  }
}

export async function getSkills(): Promise<Skill[]> {
  await seedIfEmpty()
  const redis = await getRedis()
  if (redis) {
    const indexRaw = await redis.get<string>('skill-index')
    const ids: string[] = indexRaw ? (typeof indexRaw === 'string' ? JSON.parse(indexRaw) : (indexRaw as string[])) : []
    const skills = await Promise.all(ids.map((id) => getSkill(id)))
    return skills.filter((s): s is Skill => s !== null)
  }
  return Array.from(memStore.values())
}

export async function getSkill(id: string): Promise<Skill | null> {
  const redis = await getRedis()
  if (redis) {
    const raw = await redis.get<string>(`skill:${id}`)
    if (!raw) return null
    return typeof raw === 'string' ? JSON.parse(raw) : (raw as Skill)
  }
  return memStore.get(id) ?? null
}

export async function saveSkill(skill: Skill): Promise<void> {
  const redis = await getRedis()
  if (redis) {
    await redis.set(`skill:${skill.id}`, JSON.stringify(skill))
    const indexRaw = await redis.get<string>('skill-index')
    const ids: string[] = indexRaw ? (typeof indexRaw === 'string' ? JSON.parse(indexRaw) : (indexRaw as string[])) : []
    if (!ids.includes(skill.id)) {
      ids.push(skill.id)
      await redis.set('skill-index', JSON.stringify(ids))
    }
  } else {
    memStore.set(skill.id, skill)
  }
}

export async function deleteSkill(id: string): Promise<void> {
  const redis = await getRedis()
  if (redis) {
    await redis.del(`skill:${id}`)
    const indexRaw = await redis.get<string>('skill-index')
    const ids: string[] = indexRaw ? (typeof indexRaw === 'string' ? JSON.parse(indexRaw) : (indexRaw as string[])) : []
    const updated = ids.filter((i) => i !== id)
    await redis.set('skill-index', JSON.stringify(updated))
  } else {
    memStore.delete(id)
  }
}

export async function incrementUsage(id: string): Promise<void> {
  const skill = await getSkill(id)
  if (!skill) return
  await saveSkill({ ...skill, usageCount: skill.usageCount + 1 })
}
