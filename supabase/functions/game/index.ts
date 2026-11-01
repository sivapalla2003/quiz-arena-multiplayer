import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { ...cors, 'Content-Type': 'application/json' },
})
const categories = [
  'Artificial Intelligence','Generative AI','Programming and Coding','Computer Science',
  'Science and Technology','General Knowledge','Logical Reasoning','Mathematics','Sports','Movies and Entertainment',
]
const avatars = ['🦊','🐼','🐸','🦄','🐯','🐙','🦉','🐲']

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ error: 'Use POST for game actions.' }, 405)
  const url = Deno.env.get('SUPABASE_URL')
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!url || !key) return json({ error: 'The game server is missing its Supabase configuration.' }, 503)
  const db = createClient(url, key, { auth: { persistSession: false } })

  try {
    const body = await req.json()
    const action = String(body.action ?? '')
    const token = uuid(body.token)
    if (!token) return json({ error: 'Your player session is invalid. Refresh and try again.' }, 400)

    if (action === 'create') {
      const nickname = validName(body.nickname)
      const category = String(body.category ?? '')
      const difficulty = String(body.difficulty ?? '')
      if (!nickname) return json({ error: 'Nickname must be 1–18 characters.' }, 400)
      if (!categories.includes(category)) return json({ error: 'Choose a valid quiz category.' }, 400)
      if (!['Easy','Medium','Hard'].includes(difficulty)) return json({ error: 'Choose a valid difficulty.' }, 400)
      await releasePlayerToken(db, token)
      await db.from('quiz_rooms').delete().lt('created_at', new Date(Date.now() - 86400000).toISOString())
      let room: { id: string; code: string } | null = null
      for (let attempt = 0; attempt < 4 && !room; attempt++) {
        const code = roomCode()
        const created = await db.from('quiz_rooms').insert({ code, category, difficulty }).select('id,code').single()
        if (!created.error) room = created.data
        else if (created.error.code !== '23505') throw created.error
      }
      if (!room) return json({ error: 'Could not reserve a room code. Please try again.' }, 503)
      const player = await addPlayer(db, room.id, token, nickname, true)
      if (player.error) throw player.error
      const state = await roomState(db, room.code, token)
      await broadcast(db, room.code)
      return json({ room: state })
    }

    const code = String(body.code ?? '').trim().toUpperCase()
    if (!/^[A-Z0-9]{6}$/.test(code)) return json({ error: 'Enter a valid six-character room code.' }, 400)
    const foundRoom = await db.from('quiz_rooms').select('*').eq('code', code).maybeSingle()
    if (foundRoom.error) throw foundRoom.error
    if (!foundRoom.data) return json({ error: 'Room not found. Check the code and try again.' }, 404)
    const room = foundRoom.data
    const existing = await db.from('quiz_players').select('id,room_id,is_host').eq('id', token).maybeSingle()
    if (existing.data && existing.data.room_id !== room.id) {
      await releasePlayerToken(db, token)
    }

    if (action === 'join') {
      const nickname = validName(body.nickname)
      if (!nickname) return json({ error: 'Nickname must be 1–18 characters.' }, 400)
      const isReturning = existing.data?.room_id === room.id
      if (!isReturning && room.phase !== 'lobby') return json({ error: 'This game is already in progress.' }, 409)
      const players = await db.from('quiz_players').select('id').eq('room_id', room.id)
      if (players.error) throw players.error
      if (!isReturning && (players.data.length >= 8 || players.data.length < 1)) return json({ error: 'This room is full or no longer available.' }, 409)
      const player = await addPlayer(db, room.id, token, nickname, false)
      if (player.error) throw player.error
      const state = await roomState(db, code, token)
      await broadcast(db, code)
      return json({ room: state })
    }

    const playerCheck = await db.from('quiz_players').select('*').eq('id', token).eq('room_id', room.id).maybeSingle()
    if (playerCheck.error) throw playerCheck.error
    if (!playerCheck.data) return json({ error: 'You are no longer in this room. Rejoin from the room code.' }, 403)
    await db.from('quiz_players').update({ last_seen: new Date().toISOString() }).eq('id', token)

    if (action === 'leave') {
      const peers = await db.from('quiz_players').select('id').eq('room_id', room.id).neq('id', token).order('joined_at')
      if (playerCheck.data.is_host && peers.data?.[0]) await db.from('quiz_players').update({ is_host: true }).eq('id', peers.data[0].id)
      if (room.phase === 'lobby' || room.phase === 'finished') {
        await db.from('quiz_players').delete().eq('id', token)
        if (!peers.data?.length) await db.from('quiz_rooms').delete().eq('id', room.id)
      } else await db.from('quiz_players').update({ last_seen: new Date(Date.now() - 20000).toISOString() }).eq('id', token)
      await broadcast(db, code)
      return json({ ok: true })
    } else if (action === 'state') {
      if (room.phase === 'question' && room.ends_at && Date.parse(room.ends_at) <= Date.now()) {
        const closed = await db.rpc('finalize_quiz_round', { p_room: room.id })
        if (closed.error) throw closed.error
        await broadcast(db, code)
      }
    } else if (action === 'start' || action === 'rematch') {
      if (!playerCheck.data.is_host) return json({ error: 'Only the host can do that.' }, 403)
      if (action === 'start' && room.phase !== 'lobby') return json({ error: 'This game has already started.' }, 409)
      if (action === 'rematch' && room.phase !== 'finished') return json({ error: 'Finish this match before starting a rematch.' }, 409)
      const bank = await db.from('quiz_questions').select('id,difficulty').eq('category', room.category).eq('enabled', true)
      if (bank.error) throw bank.error
      const preferred = bank.data.filter(q => q.difficulty === room.difficulty).sort(() => Math.random() - .5)
      const other = bank.data.filter(q => q.difficulty !== room.difficulty).sort(() => Math.random() - .5)
      const order = [...preferred, ...other].slice(0, 10).map(q => q.id)
      if (order.length < 10) return json({ error: 'This category needs at least 10 questions. Add more questions to the Supabase question bank.' }, 503)
      const result = await db.rpc(action === 'start' ? 'start_quiz' : 'rematch_quiz', { p_room: room.id, p_order: order })
      if (result.error) throw result.error
      await broadcast(db, code)
    } else if (action === 'answer') {
      const option = Number(body.option)
      if (!Number.isInteger(option) || option < 0 || option > 3) return json({ error: 'Choose one of the four answers.' }, 400)
      const result = await db.rpc('submit_quiz_answer', { p_room: room.id, p_player: token, p_option: option })
      if (result.error) throw result.error
      await broadcast(db, code)
    } else if (action === 'next') {
      if (!playerCheck.data.is_host) return json({ error: 'Only the host can advance the match.' }, 403)
      const result = await db.rpc('advance_quiz', { p_room: room.id })
      if (result.error) throw result.error
      await broadcast(db, code)
    } else return json({ error: 'Unknown game action.' }, 400)

    const state = await roomState(db, code, token)
    return json({ room: state })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unexpected game server error.'
    return json({ error: publicError(message) }, 400)
  }
})

async function addPlayer(db: ReturnType<typeof createClient>, roomId: string, token: string, nickname: string, host: boolean) {
  const previous = await db.from('quiz_players').select('avatar,is_host').eq('id', token).eq('room_id', roomId).maybeSingle()
  if (previous.data) return db.from('quiz_players').update({ nickname, last_seen: new Date().toISOString() }).eq('id', token).eq('room_id', roomId)
  const count = await db.from('quiz_players').select('id', { count: 'exact', head: true }).eq('room_id', roomId)
  return db.from('quiz_players').insert({ id: token, room_id: roomId, nickname, avatar: avatars[(count.count ?? 0) % avatars.length], is_host: host })
}

async function releasePlayerToken(db: ReturnType<typeof createClient>, token: string) {
  const previous = await db.from('quiz_players').select('id,room_id,is_host').eq('id', token).maybeSingle()
  if (!previous.data) return
  if (previous.data.is_host) {
    const nextHost = await db.from('quiz_players').select('id').eq('room_id', previous.data.room_id).neq('id', token).order('joined_at').limit(1).maybeSingle()
    if (nextHost.data) await db.from('quiz_players').update({ is_host: true }).eq('id', nextHost.data.id)
    else await db.from('quiz_rooms').delete().eq('id', previous.data.room_id)
  }
  await db.from('quiz_players').delete().eq('id', token)
}

async function roomState(db: ReturnType<typeof createClient>, code: string, token: string) {
  const result = await db.from('quiz_rooms').select('*').eq('code', code).single()
  if (result.error) throw result.error
  const r = result.data
  const playersResult = await db.from('quiz_players').select('id,nickname,avatar,is_host,score,correct_count,last_seen').eq('room_id', r.id).order('joined_at')
  if (playersResult.error) throw playersResult.error
  const answersResult = r.question_number > 0
    ? await db.from('quiz_answers').select('player_id,is_correct,points').eq('room_id', r.id).eq('question_number', r.question_number)
    : { data: [], error: null }
  if (answersResult.error) throw answersResult.error
  let question = null
  let correctIndex = null
  if (r.current_question_id) {
    const q = await db.from('quiz_questions').select('id,prompt,options,answer_index').eq('id', r.current_question_id).single()
    if (q.error) throw q.error
    question = { id: q.data.id, prompt: q.data.prompt, options: q.data.options }
    if (r.phase === 'reveal' || r.phase === 'finished') correctIndex = q.data.answer_index
  }
  const answers = answersResult.data ?? []
  return {
    code: r.code,
    category: r.category,
    difficulty: r.difficulty,
    phase: r.phase,
    question_number: r.question_number,
    total_questions: r.total_questions,
    ends_at: r.ends_at,
    players: playersResult.data.map(p => ({
      id: p.id, nickname: p.nickname, avatar: p.avatar, is_host: p.is_host,
      score: p.score, correct_count: p.correct_count,
      answered: answers.some(a => a.player_id === p.id),
      connected: Date.now() - Date.parse(p.last_seen) < 15000,
    })),
    question,
    correct_index: correctIndex,
    last_round: r.last_round,
  }
}

async function broadcast(db: ReturnType<typeof createClient>, code: string) {
  try {
    const channel = db.channel(`room:${code}`, { config: { broadcast: { self: true } } })
    await channel.send({ type: 'broadcast', event: 'changed', payload: { at: Date.now() } })
    await db.removeChannel(channel)
  } catch { /* The UI also checks authoritative state on a short interval. */ }
}

function roomCode() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  const bytes = crypto.getRandomValues(new Uint8Array(6))
  return Array.from(bytes, b => alphabet[b % alphabet.length]).join('')
}
function uuid(value: unknown): string | null {
  const text = String(value ?? '')
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(text) ? text : null
}
function validName(value: unknown): string | null {
  const name = String(value ?? '').trim().replace(/[<>\u0000-\u001f]/g, '')
  return name.length >= 1 && name.length <= 18 ? name : null
}
function publicError(message: string) {
  if (/already answered|already started|not waiting|not ready|has closed|not finished|2 to 8|needs 10 questions|only the host|no longer in this room/i.test(message)) return message
  return 'The game server could not complete that action. Please refresh the room and try again.'
}
