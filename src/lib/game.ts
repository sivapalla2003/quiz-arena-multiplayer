
import { createClient } from '@supabase/supabase-js'

export const CATEGORIES = [
  'Artificial Intelligence', 'Generative AI', 'Programming and Coding',
  'Computer Science', 'Science and Technology', 'General Knowledge',
  'Logical Reasoning', 'Mathematics', 'Sports', 'Movies and Entertainment',
] as const

export type Category = typeof CATEGORIES[number]
export type Difficulty = 'Easy' | 'Medium' | 'Hard'
export type Phase = 'lobby' | 'question' | 'reveal' | 'finished'

export interface Player {
  id: string
  nickname: string
  avatar: string
  is_host: boolean
  score: number
  correct_count: number
  answered: boolean
  connected: boolean
}

export interface Question {
  id: string
  prompt: string
  options: string[]
}

export interface RoomState {
  code: string
  category: Category
  difficulty: Difficulty
  phase: Phase
  question_number: number
  total_questions: number
  ends_at: string | null
  players: Player[]
  question: Question | null
  correct_index: number | null
  last_round: {
    correct_index: number
    answers: Record<string, { correct: boolean; points: number }>
  } | null
}

const endpoint = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

export const configured = Boolean(endpoint && anonKey)

export const realtime = configured
  ? createClient(endpoint!, anonKey!)
  : null

function getErrorMessage(error: unknown): string {
  if (typeof error === 'string') {
    return error
  }

  if (error && typeof error === 'object') {
    const value = error as Record<string, unknown>

    if (typeof value.message === 'string') {
      return value.message
    }

    if (typeof value.details === 'string') {
      return value.details
    }

    if (typeof value.hint === 'string') {
      return value.hint
    }

    try {
      return JSON.stringify(error)
    } catch {
      return 'An unexpected server error occurred.'
    }
  }

  return 'Could not reach the game server. Please try again.'
}

export async function action<T>(
  name: string,
  payload: Record<string, unknown> = {},
): Promise<T> {
  if (!configured) {
    throw new Error(
      'Online rooms need Supabase setup. See README.md to connect a project.',
    )
  }

  let response: Response

  try {
    response = await fetch(`${endpoint}/functions/v1/game`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: anonKey,
        Authorization: `Bearer ${anonKey}`,
      },
      body: JSON.stringify({
        action: name,
        ...payload,
      }),
    })
  } catch (error) {
    throw new Error(
      `Could not connect to the game server: ${getErrorMessage(error)}`,
    )
  }

  let result: Record<string, unknown>

  try {
    const data: unknown = await response.json()

    result =
      data && typeof data === 'object'
        ? (data as Record<string, unknown>)
        : { error: data }
  } catch {
    result = {
      error: `The game server returned an unreadable response (HTTP ${response.status}).`,
    }
  }

  if (!response.ok) {
    throw new Error(
      getErrorMessage(
        result.error ??
          `Could not reach the game server (HTTP ${response.status}). Please try again.`,
      ),
    )
  }

  return result as T
}

export function getPlayerToken() {
  let token = sessionStorage.getItem('qa_player_token')

  if (!token) {
    token = crypto.randomUUID()
    sessionStorage.setItem('qa_player_token', token)
  }

  return token
}

export const AVATARS = [
  '🦊', '🐼', '🐸', '🦄', '🐯', '🐙', '🦉', '🐲',
]

export function initials(name: string) {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map(part => part[0]?.toUpperCase())
    .join('')
}
