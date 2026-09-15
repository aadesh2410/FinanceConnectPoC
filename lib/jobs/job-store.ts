import { Job } from '@/lib/schema/types'

// In-memory fallback for local dev without Redis — attached to global so Next.js hot reloads don't clear it
const g = global as typeof global & { __jobMemStore?: Map<string, Job> }
if (!g.__jobMemStore) g.__jobMemStore = new Map<string, Job>()
const memStore = g.__jobMemStore

async function getRedis() {
  const url = process.env.UPSTASH_REDIS_REST_URL
  const token = process.env.UPSTASH_REDIS_REST_TOKEN
  if (!url || !token) return null
  const { Redis } = await import('@upstash/redis')
  return new Redis({ url, token })
}

export async function saveJob(job: Job): Promise<void> {
  const redis = await getRedis()
  if (redis) {
    await redis.set(`job:${job.jobId}`, JSON.stringify(job), { ex: 86400 })
    if (job.workbookHash) {
      await redis.set(`workbook-hash:${job.workbookHash}`, job.jobId, { ex: 86400 })
    }
  } else {
    memStore.set(job.jobId, job)
  }
}

export async function getJob(jobId: string): Promise<Job | null> {
  const redis = await getRedis()
  if (redis) {
    const raw = await redis.get<string>(`job:${jobId}`)
    if (!raw) return null
    return typeof raw === 'string' ? JSON.parse(raw) : raw as Job
  }
  return memStore.get(jobId) ?? null
}

export async function updateJob(jobId: string, updates: Partial<Job>): Promise<Job | null> {
  const job = await getJob(jobId)
  if (!job) return null
  const updated = { ...job, ...updates }
  await saveJob(updated)
  return updated
}

export async function findJobByHash(hash: string): Promise<Job | null> {
  const redis = await getRedis()
  if (redis) {
    const jobId = await redis.get<string>(`workbook-hash:${hash}`)
    if (!jobId) return null
    return getJob(jobId)
  }
  for (const job of Array.from(memStore.values())) {
    if (job.workbookHash === hash) return job
  }
  return null
}
