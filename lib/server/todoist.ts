// apps/resurface/lib/server/todoist.ts


import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const TODOIST_BASE_URL = 'https://api.todoist.com/api/v1/'

type TodoistTask = {
  id: string
  content: string
  description: string
  created_at?: string
  /** v1 API uses added_at instead of created_at */
  added_at?: string
}

type TodoistProject = {
  id: string
  /** v1 API uses inbox_project instead of is_inbox_project */
  inbox_project?: boolean
}

type PaginatedResponse<T> = {
  results: T[]
  next_cursor: string | null
}

function getTodoistToken() {
  if (process.env.TODOIST_TOKEN && process.env.TODOIST_TOKEN.trim()) {
    return process.env.TODOIST_TOKEN.trim()
  }

  const tokenPath = path.join(os.homedir(), '.config', 'todoist', 'token')
  try {
    const token = fs.readFileSync(tokenPath, 'utf8').trim()
    if (token) {
      return token
    }
  } catch {
    // Fall through and throw explicit error.
  }

  throw new Error(
    'Missing Todoist token. Set TODOIST_TOKEN or create ~/.config/todoist/token.'
  )
}

async function todoistRequest<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const token = getTodoistToken()
  const url = new URL(endpoint, TODOIST_BASE_URL).toString()

  const response = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(options.headers ?? {}),
    },
    cache: 'no-store',
  })

  if (!response.ok) {
    const body = await response.text().catch(() => '')
    throw new Error(
      `Todoist API error ${response.status}: ${body || response.statusText}`
    )
  }

  if (response.status === 204) {
    return undefined as T
  }

  return (await response.json()) as T
}

async function getInboxProjectId() {
  const res =
    await todoistRequest<PaginatedResponse<TodoistProject>>('projects')
  const inbox = res.results.find((project) => project.inbox_project)
  if (!inbox?.id) {
    throw new Error('Todoist Inbox project not found')
  }
  return inbox.id
}

export async function listInboxTasks(limit = 50): Promise<TodoistTask[]> {
  const inboxProjectId = await getInboxProjectId()
  const endpoint = `tasks?project_id=${encodeURIComponent(inboxProjectId)}`
  const res = await todoistRequest<PaginatedResponse<TodoistTask>>(endpoint)
  // Normalise added_at → created_at for downstream consumers
  const tasks = res.results.map((t) => ({
    ...t,
    created_at: t.created_at ?? t.added_at,
  }))
  return tasks.slice(0, Math.max(1, limit))
}

export async function closeTodoistTask(taskId: string) {
  await todoistRequest<undefined>(`tasks/${encodeURIComponent(taskId)}/close`, {
    method: 'POST',
  })
}
