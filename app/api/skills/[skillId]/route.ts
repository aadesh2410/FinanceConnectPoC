import { NextRequest, NextResponse } from 'next/server'
import { getSkill, saveSkill, deleteSkill } from '@/lib/skills/skill-store'

export const runtime = 'nodejs'

export async function PATCH(req: NextRequest, { params }: { params: { skillId: string } }) {
  const skill = await getSkill(params.skillId)
  if (!skill) {
    return NextResponse.json({ error: 'Skill not found' }, { status: 404 })
  }

  const body = await req.json()
  const updated = { ...skill, ...body, id: skill.id, createdAt: skill.createdAt }
  await saveSkill(updated)
  return NextResponse.json(updated)
}

export async function DELETE(_req: NextRequest, { params }: { params: { skillId: string } }) {
  const skill = await getSkill(params.skillId)
  if (!skill) {
    return NextResponse.json({ error: 'Skill not found' }, { status: 404 })
  }
  await deleteSkill(params.skillId)
  return NextResponse.json({ success: true })
}
