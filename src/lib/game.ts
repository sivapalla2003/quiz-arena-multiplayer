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
  last_round: { correct_index: number; answers: Record<string, { correct: boolean; points: number }> } | null
}

const endpoint = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

export const configured = Boolean(endpoint && anonKey)
export const realtime = configured ? createClient(endpoint!, anonKey!) : null

export async function action<T>(name: string, payload: Record<string, unknown> = {}): Promise<T> {
  if (!configured) throw new Error('Online rooms need Supabase setup. See README.md to connect a project.')
  const response = await fetch(`${endpoint}/functions/v1/game`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: anonKey, Authorization: `Bearer ${anonKey}` },
    body: JSON.stringify({ action: name, ...payload }),
  })
  const result = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(result.error || 'Could not reach the game server. Please try again.')
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

export const AVATARS = ['🦊', '🐼', '🐸', '🦄', '🐯', '🐙', '🦉', '🐲']

export function initials(name: string) {
  return name.trim().split(/\s+/).slice(0, 2).map(part => part[0]?.toUpperCase()).join('')
}

