import { NextRequest, NextResponse } from 'next/server'
import { v4 as uuidv4 } from 'uuid'
import { getSkills, saveSkill } from '@/lib/skills/skill-store'
import { Skill, SkillCategory } from '@/lib/skills/types'

export const runtime = 'nodejs'

export async function GET() {
  const skills = await getSkills()
  return NextResponse.json(skills)
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  const { name, category, rule, examples, source } = body as {
    name: string
    category: SkillCategory
    rule: string
    examples?: string[]
    source?: Skill['source']
  }

  if (!name || !category || !rule) {
    return NextResponse.json({ error: 'name, category, and rule are required' }, { status: 400 })
  }

  const skill: Skill = {
    id: uuidv4(),
    name,
    category,
    rule,
    examples,
    createdAt: new Date().toISOString(),
    source: source ?? 'MANUAL',
    usageCount: 0,
    enabled: true,
  }

  await saveSkill(skill)
  return NextResponse.json(skill, { status: 201 })
}
