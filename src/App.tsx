import { useCallback, useEffect, useState } from 'react'
import { ArrowDown, ArrowLeft, ArrowRight, Check, Clock3, Copy, Crown, Gamepad2, Lightbulb, LockKeyhole, Medal, Play, RotateCcw, ShieldCheck, Sparkles, Trophy, Users, X } from 'lucide-react'
import { action, CATEGORIES, configured, getPlayerToken, realtime, type Category, type Difficulty, type RoomState } from './lib/game'

const letters = ['A', 'B', 'C', 'D']

export default function App() {
  const [mode, setMode] = useState<'home' | 'create' | 'join' | 'room'>('home')
  const [nickname, setNickname] = useState('')
  const [code, setCode] = useState('')
  const [category, setCategory] = useState<Category>('Artificial Intelligence')
  const [difficulty, setDifficulty] = useState<Difficulty>('Medium')
  const [room, setRoom] = useState<RoomState | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [selected, setSelected] = useState<number | null>(null)
  const [copied, setCopied] = useState(false)
  const token = getPlayerToken()

  const refresh = useCallback(async (roomCode: string) => {
    try {
      const response = await action<{ room: RoomState }>('state', { code: roomCode, token })
      setRoom(response.room)
    } catch (e) {
      if (e instanceof Error && !e.message.includes('not found')) setError(e.message)
    }
  }, [token])

  useEffect(() => {
    if (mode !== 'room' || !room) return
    const timer = window.setInterval(() => void refresh(room.code), 1200)
    const channel = realtime?.channel(`room:${room.code}`).on('broadcast', { event: 'changed' }, () => void refresh(room.code)).subscribe()
    return () => { window.clearInterval(timer); if (channel) void realtime?.removeChannel(channel) }
  }, [mode, room?.code, refresh])

  useEffect(() => {
    setSelected(null)
  }, [room?.question_number, room?.phase])

  async function createRoom() {
    if (!nickname.trim()) return setError('Add a nickname to continue.')
    setBusy(true); setError('')
    try {
      const res = await action<{ room: RoomState }>('create', { nickname: nickname.trim(), category, difficulty, token })
      setRoom(res.room); setMode('room')
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not create room.') }
    finally { setBusy(false) }
  }

  async function joinRoom() {
    if (!nickname.trim()) return setError('Add a nickname to continue.')
    if (code.trim().length !== 6) return setError('Enter a six-character room code.')
    setBusy(true); setError('')
    try {
      const res = await action<{ room: RoomState }>('join', { nickname: nickname.trim(), code: code.trim().toUpperCase(), token })
      setRoom(res.room); setMode('room')
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not join room.') }
    finally { setBusy(false) }
  }

  async function gameAction(name: string, payload: Record<string, unknown> = {}) {
    if (!room) return
    setError('')
    try {
      const res = await action<{ room: RoomState }>(name, { code: room.code, token, ...payload })
      setRoom(res.room)
    } catch (e) { setError(e instanceof Error ? e.message : 'That action did not work.') }
  }

  async function copyCode() {
    if (!room) return
    await navigator.clipboard.writeText(room.code)
    setCopied(true); window.setTimeout(() => setCopied(false), 1600)
  }

  async function leaveRoom() {
    if (!room) { setMode('home'); return }
    try { await action('leave', { code: room.code, token }) } catch { /* Navigation should still work if the connection dropped. */ }
    setMode('home'); setRoom(null)
  }

  const me = room?.players.find(p => p.id === token)
  const phase = room?.phase

  if (mode === 'room' && room) {
    return <main className="game-shell">
      <div className="game-top"><button className="back-button" onClick={() => void leaveRoom()}><ArrowLeft size={17} /> Leave room</button><Brand compact /><div className="online-pill"><span className="pulse-dot" /> LIVE ROOM</div></div>
      {phase === 'lobby' && <Lobby room={room} me={me} copied={copied} onCopy={copyCode} onStart={() => void gameAction('start')} error={error} busy={busy} />}
      {phase === 'question' && <QuestionView room={room} selected={selected} onSelect={setSelected} onSubmit={() => selected !== null && void gameAction('answer', { option: selected })} me={me} />}
      {phase === 'reveal' && <RevealView room={room} me={me} onNext={() => void gameAction('next')} error={error} />}
      {phase === 'finished' && <Results room={room} me={me} onAgain={() => void gameAction('rematch')} />}
      {error && <div className="toast-error"><X size={15} /> {error}<button onClick={() => setError('')} aria-label="Dismiss"><X size={14} /></button></div>}
    </main>
  }

  return <main className="home-shell">
    <div className="ambient ambient-one" /><div className="ambient ambient-two" />
    <header className="site-header"><Brand /><nav><a href="#how-it-works">How to play</a><button className="text-button" onClick={() => { setError(''); setMode('join') }}>Join a room <ArrowRight size={15} /></button></nav></header>
    <section className="hero">
      <div className="hero-copy"><div className="eyebrow"><span className="pulse-dot" /> YOUR NEXT GREAT GAME NIGHT STARTS HERE</div><h1>Brains on.<br /><span>Game on.</span></h1><p className="hero-subtitle">The ultimate knowledge battle. Gather your sharpest friends and see who really knows their stuff.</p>
        <div className="hero-actions"><button className="button-primary" onClick={() => { setError(''); setMode('create') }}><Play size={17} fill="currentColor" /> Create a room <ArrowRight size={17} /></button><button className="button-secondary" onClick={() => { setError(''); setMode('join') }}>Join a room <ArrowRight size={16} /></button></div>
        <div className="social-proof"><div className="avatar-stack"><span>🦊</span><span>🐼</span><span>🦄</span><span>🐸</span></div><div><strong>Better with friends</strong><small>2–8 players · No sign-up needed</small></div></div>
      </div>
      <div className="hero-visual"><div className="orbit orbit-a"/><div className="orbit orbit-b"/><div className="hero-glow"/><div className="hero-card"><div className="match-top"><span><span className="live-dot"/> LIVE MATCH</span><span>ROUND 07 / 10</span></div><div className="mini-question">Which planet has the most<br />moons in our solar system?</div><div className="mini-answers"><div className="mini-answer chosen"><i>B</i> Saturn <Check size={13}/></div><div className="mini-answer"><i>C</i> Jupiter</div></div><div className="mini-progress"><div><span>YOUR SCORE</span><b>1,250 <small>pts</small></b></div><div className="mini-rank"><Crown size={14}/><b>#2</b></div></div></div><div className="float-tag tag-score"><Sparkles size={15}/><span>+140 pts</span></div><div className="float-tag tag-fire">🔥 <span>On a roll!</span></div><div className="float-tag tag-timer"><Clock3 size={16}/><span>00:08</span></div></div>
    </section>
    <section className="feature-strip"><div><Users/><span><b>2–8 players</b><small>Bring the whole crew</small></span></div><div><Clock3/><span><b>10 quick rounds</b><small>Every second counts</small></span></div><div><Trophy/><span><b>One champion</b><small>May the best brain win</small></span></div><div><ShieldCheck/><span><b>Free to play</b><small>No accounts, no fuss</small></span></div></section>
    <section className="below-fold" id="how-it-works"><div className="section-heading"><span className="eyebrow">HOW IT WORKS</span><h2>Three steps. <span>One winner.</span></h2></div><div className="steps"><div><b>01</b><h3>Start a room</h3><p>Pick a topic, set the vibe, and invite friends with a simple code.</p></div><div><b>02</b><h3>Beat the clock</h3><p>Race through 10 questions. Quick answers earn bonus points.</p></div><div><b>03</b><h3>Claim the crown</h3><p>Watch the live leaderboard and celebrate your victory.</p></div></div></section>
    <footer><Brand compact /><span>Made for curious minds.</span></footer>
    {(mode === 'create' || mode === 'join') && <div className="modal-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) setMode('home') }}><div className="modal-card"><button className="modal-close" onClick={() => setMode('home')}><X size={19}/></button><div className="modal-icon">{mode === 'create' ? <Gamepad2/> : <ArrowDown/>}</div><span className="eyebrow">{mode === 'create' ? 'HOST A GAME' : 'JOIN YOUR FRIENDS'}</span><h2>{mode === 'create' ? 'Set up your room' : 'Enter the arena'}</h2><p>{mode === 'create' ? 'Pick a category, then share your room code.' : 'Enter your nickname and the six-character code.'}</p>
      <label className="field-label">YOUR NICKNAME<input value={nickname} onChange={e => setNickname(e.target.value.slice(0, 18))} placeholder="e.g. Brainiac42" maxLength={18} /></label>
      {mode === 'create' ? <><label className="field-label">QUIZ CATEGORY<select value={category} onChange={e => setCategory(e.target.value as Category)}>{CATEGORIES.map(item => <option key={item} value={item}>{item}</option>)}</select></label><label className="field-label">DIFFICULTY<div className="difficulty-picker">{(['Easy', 'Medium', 'Hard'] as const).map(level => <button key={level} className={difficulty === level ? 'selected' : ''} onClick={() => setDifficulty(level)}>{level}</button>)}</div></label></> : <label className="field-label">ROOM CODE<input className="code-input" value={code} onChange={e => setCode(e.target.value.replace(/[^a-z0-9]/gi, '').slice(0, 6).toUpperCase())} placeholder="A7K9Q2" maxLength={6} /></label>}
      {!configured && <div className="setup-note"><LockKeyhole size={15}/> Online rooms are not configured yet. Add your Supabase URL and anon key to <code>.env</code>.</div>}{error && <div className="inline-error"><X size={14}/> {error}</div>}
      <button className="button-primary modal-submit" disabled={busy || !configured} onClick={() => void (mode === 'create' ? createRoom() : joinRoom())}>{busy ? 'Connecting…' : mode === 'create' ? 'Create room' : 'Join room'} <ArrowRight size={16}/></button><div className="secure-note"><ShieldCheck size={14}/> No account needed · Your session stays private</div></div></div>}
  </main>
}

function Brand({ compact = false }: { compact?: boolean }) { return <div className={`brand ${compact ? 'compact' : ''}`}><div className="brand-mark"><Gamepad2 size={19}/></div><span>quiz<span className="brand-accent">arena</span></span></div> }

function Lobby({ room, me, copied, onCopy, onStart, error, busy }: { room: RoomState; me?: RoomState['players'][number]; copied: boolean; onCopy: () => void; onStart: () => void; error: string; busy: boolean }) {
  return <section className="room-layout"><div className="room-main"><div className="room-heading"><div><span className="eyebrow"><span className="pulse-dot"/> THE LOBBY IS OPEN</span><h1>Waiting for<br/><span>your crew.</span></h1><p>Share the code with your friends. The more, the merrier.</p></div><div className="room-badge"><span>ROOM CODE</span><button onClick={onCopy} className="room-code">{room.code}{copied ? <Check size={18}/> : <Copy size={17}/>}</button><small>{copied ? 'Copied to clipboard' : 'Click to copy invite code'}</small></div></div><div className="lobby-rule"/><div className="guest-list-title"><div><Users size={17}/><b>Players in the room</b></div><span>{room.players.length} / 8</span></div><div className="player-grid">{room.players.map((p, i) => <div className="player-tile" key={p.id}><div className={`player-avatar color-${i % 6}`}>{p.avatar}</div><div className="player-info"><b>{p.nickname}{p.id === me?.id && <small className="you-pill">YOU</small>}</b><small>{p.is_host ? <><Crown size={12}/> HOST</> : p.connected ? <><span className="connected-dot"/> READY</> : 'RECONNECTING…'}</small></div>{p.is_host && <Crown className="tile-crown" size={16}/>}</div>)}{room.players.length < 8 && <div className="player-tile open-slot"><div className="player-avatar">+</div><div className="player-info"><b>Open seat</b><small>Invite a friend</small></div></div>}</div><div className="lobby-footer"><div className="lobby-hint"><Sparkles size={16}/><span>Waiting for at least one more player to join</span></div>{me?.is_host && <button className="button-primary start-button" disabled={room.players.length < 2 || busy} onClick={onStart}><Play size={16} fill="currentColor"/> Start game <ArrowRight size={16}/></button>}</div>{error && <div className="inline-error"><X size={14}/>{error}</div>}</div><aside className="room-sidebar"><div className="game-settings"><div className="settings-top"><span className="eyebrow">MATCH SETTINGS</span><div className="settings-icon"><Sparkles size={18}/></div></div><div className="setting-row"><span>CATEGORY</span><b>{room.category}</b></div><div className="setting-row"><span>DIFFICULTY</span><b className={`difficulty-text ${room.difficulty.toLowerCase()}`}>{room.difficulty}</b></div><div className="setting-row"><span>QUESTIONS</span><b>10 rounds</b></div><div className="setting-row"><span>ROUND TIMER</span><b>15 seconds</b></div><div className="settings-divider"/><div className="settings-help"><Lightbulb size={16}/><span>Every player gets the same questions. Speed matters—faster correct answers earn more points.</span></div></div><div className="invite-card"><div className="invite-glow"/><Users size={18}/><b>Have a full squad?</b><span>Share your room code and rally the crew.</span></div></aside></section>
}

function QuestionView({ room, selected, onSelect, onSubmit, me }: { room: RoomState; selected: number | null; onSelect: (v: number) => void; onSubmit: () => void; me?: RoomState['players'][number] }) {
  const [now, setNow] = useState(Date.now())
  useEffect(() => { const id = window.setInterval(() => setNow(Date.now()), 100); return () => clearInterval(id) }, [])
  const remaining = Math.max(0, (new Date(room.ends_at ?? '').getTime() - now) / 1000)
  const pct = Math.max(0, remaining / 15)
  const submitted = Boolean(me?.answered)
  return <section className="quiz-layout"><div className="quiz-head"><div><span className="eyebrow"><span className="pulse-dot"/> {room.category.toUpperCase()} · {room.difficulty.toUpperCase()}</span><h1>Question <span>{String(room.question_number).padStart(2, '0')}</span><small> / 10</small></h1></div><div className={`timer ${remaining < 5 ? 'urgent' : ''}`}><svg viewBox="0 0 52 52"><circle className="timer-track" cx="26" cy="26" r="22"/><circle className="timer-value" cx="26" cy="26" r="22" style={{ strokeDashoffset: 138.2 * (1 - pct) }}/></svg><span>{Math.ceil(remaining)}</span></div></div><div className="progress-rail">{Array.from({ length: 10 }, (_, i) => <i key={i} className={i < room.question_number ? 'done' : i === room.question_number - 1 ? 'current' : ''}/>)}</div><div className="question-card"><span className="question-label">YOUR QUESTION</span><h2>{room.question?.prompt ?? 'Loading question…'}</h2><div className="answer-grid">{room.question?.options.map((option, i) => <button disabled={submitted} key={option} onClick={() => onSelect(i)} className={`answer-choice ${selected === i ? 'active' : ''}`}><i>{letters[i]}</i><span>{option}</span>{selected === i && <Check size={17}/>}</button>)}</div><div className="question-bottom"><div className="answered-count"><Users size={16}/><span>{room.players.filter(p => p.answered).length}<small> / {room.players.length} answered</small></span></div>{submitted ? <div className="submitted-note"><Check size={16}/> Answer locked in · waiting for the round to end</div> : <button className="button-primary submit-button" disabled={selected === null} onClick={onSubmit}>Lock in answer <ArrowRight size={16}/></button>}</div></div><div className="scoreboard-strip">{[...room.players].sort((a,b) => b.score - a.score).slice(0, 4).map((p,i) => <div className={`score-chip ${p.id === me?.id ? 'mine' : ''}`} key={p.id}><span>{p.avatar}</span><small>{i === 0 ? <Crown size={12}/> : `#${i+1}`} {p.nickname}</small><b>{p.score.toLocaleString()}</b></div>)}</div></section>
}

function RevealView({ room, me, onNext, error }: { room: RoomState; me?: RoomState['players'][number]; onNext: () => void; error: string }) {
  const info = me && room.last_round?.answers[me.id]
  const host = me?.is_host
  return <section className="reveal-layout"><div className="reveal-banner"><span className="eyebrow">ROUND {String(room.question_number).padStart(2, '0')} COMPLETE</span><div className={`reveal-result ${info?.correct ? 'correct' : 'incorrect'}`}>{info?.correct ? <><span className="result-icon"><Check/></span><h1>Brilliant.<span> Nailed it.</span></h1><p>You scored <b>+{info.points} points</b> this round.</p></> : <><span className="result-icon"><X/></span><h1>Not this time.<span> Next one!</span></h1><p>There’s always another round to catch up.</p></>}</div></div><div className="answer-reveal"><span className="question-label">THE CORRECT ANSWER</span><h2><span>{letters[room.last_round?.correct_index ?? 0]}</span> {room.question?.options[room.last_round?.correct_index ?? 0]}</h2><p>{room.question?.prompt}</p></div><div className="round-scores">{[...room.players].sort((a,b)=>b.score-a.score).map((p,i)=><div className="round-score-row" key={p.id}><span className="rank">{i === 0 ? <Crown size={15}/> : `0${i+1}`}</span><span className="score-player">{p.avatar} {p.nickname}{p.id === me?.id && <small>YOU</small>}</span><span className="round-points">{room.last_round?.answers[p.id] ? `+${room.last_round.answers[p.id].points}` : '—'}</span><b>{p.score.toLocaleString()} <small>PTS</small></b></div>)}</div>{error && <div className="inline-error"><X size={14}/>{error}</div>}<div className="reveal-actions">{host ? <button className="button-primary" onClick={onNext}>{room.question_number >= room.total_questions ? 'Final results' : 'Next question'} <ArrowRight size={16}/></button> : <span className="wait-host"><span className="pulse-dot"/> Waiting for the host to continue</span>}</div></section>
}

function Results({ room, me, onAgain }: { room: RoomState; me?: RoomState['players'][number]; onAgain: () => void }) {
  const ranks = [...room.players].sort((a,b)=>b.score-a.score)
  return <section className="results-layout"><div className="results-hero"><span className="eyebrow"><Sparkles size={14}/> MATCH COMPLETE</span><div className="trophy-orb"><Trophy size={48}/><i>✦</i></div><h1>{ranks[0]?.id === me?.id ? 'You are the' : `${ranks[0]?.nickname} is the`}<br/><span>Quiz Arena champion!</span></h1><p>What a battle. Here’s how the arena shook out.</p></div><div className="final-table"><div className="table-heading"><span>FINAL RANKING</span><span>{room.category} · {room.difficulty}</span></div>{ranks.map((p,i)=><div key={p.id} className={`final-row ${i === 0 ? 'winner' : ''}`}><span className="final-rank">{i === 0 ? <Crown size={19}/> : `0${i+1}`}</span><span className="final-avatar">{p.avatar}</span><div className="final-player"><b>{p.nickname}{p.id === me?.id && <small>YOU</small>}</b><span>{p.correct_count} correct answers</span></div><strong>{p.score.toLocaleString()} <small>PTS</small></strong></div>)}</div><div className="results-foot"><span><Medal size={16}/> 10 questions · {room.players.length} players · one unforgettable game</span>{me?.is_host ? <button className="button-primary" onClick={onAgain}><RotateCcw size={16}/> Play again</button> : <span className="wait-host"><span className="pulse-dot"/> Waiting for the host to start a rematch</span>}</div></section>
}
