import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useNavigate, useLocation } from 'react-router-dom'
import { useSelector, useDispatch } from 'react-redux'
import { tasksActions } from '../store'
import { chatStream, suggestTask, saveTasks, loadConversation, loadDocuments, generateSessionTitle } from '../utils/api'
import { splitIntoBubbles, renderMarkdown } from '../utils/bubbles'
import { PriorityPicker } from '../components/PriorityChip'

// Map GPT-4o's human-readable priority string → integer (used when parsing suggest_task actions)
const PRIORITY_STR_TO_INT = { high: 1, normal: 2, low: 3 }

// ── Constants ─────────────────────────────────────────────────────────── //

const PLACEHOLDERS = [
  "What's on your mind?",
  "What feels overwhelming right now?",
  "What are you working on today?",
  "Need help breaking something down?",
  "Tell me what you're thinking...",
]

// ── Chat session history (localStorage) ───────────────────────────────── //

const SESSIONS_KEY = 'pebble_chat_sessions'

function loadSessions() {
  try { return JSON.parse(localStorage.getItem(SESSIONS_KEY) || '[]') } catch { return [] }
}

const SKIP_TITLE_TEXTS = ['What was I working on?', 'what was i working on?']

// Archive a session with a placeholder title, then async-update it with an AI title.
// Returns the session id so callers can react to state changes.
function archiveSession(messages, onTitleUpdate) {
  const meaningful = messages.filter(
    m => (m.role === 'user' || m.role === 'assistant') &&
         !SKIP_TITLE_TEXTS.includes(m.content?.trim()) &&
         m.content?.trim()
  )
  if (!meaningful.some(m => m.role === 'user')) return null  // nothing worth archiving

  const firstUser = meaningful.find(m => m.role === 'user')
  const placeholderTitle = firstUser ? firstUser.content.slice(0, 58) : 'conversation'

  const sessionId = Math.random().toString(36).slice(2, 10)
  const session = {
    id: sessionId,
    createdAt: new Date().toISOString(),
    title: placeholderTitle,
    msgCount: messages.filter(m => m.role === 'user').length,
    messages: messages.slice(-50),
  }

  const existing = loadSessions()
  localStorage.setItem(SESSIONS_KEY, JSON.stringify([session, ...existing].slice(0, 12)))

  // Async: generate a real AI title and patch it in localStorage + notify caller
  const apiMessages = meaningful.slice(0, 12).map(m => ({ role: m.role, content: m.content }))
  generateSessionTitle(apiMessages).then(aiTitle => {
    if (!aiTitle) return
    try {
      const sessions = loadSessions()
      const idx = sessions.findIndex(s => s.id === sessionId)
      if (idx !== -1) {
        sessions[idx].title = aiTitle
        localStorage.setItem(SESSIONS_KEY, JSON.stringify(sessions))
        onTitleUpdate?.(loadSessions())
      }
    } catch {}
  })

  return sessionId
}

const LOADING_PHRASES = [
  'pebbling...',
  'getting what you need...',
  'be right there...',
  'one moment...',
  'thinking this through...',
  'sitting with that...',
  'on it...',
]

function getLoadingPhrase() {
  return LOADING_PHRASES[Math.floor(Math.random() * LOADING_PHRASES.length)]
}

const QUICK_ACTIONS = [
  {
    label: 'I have a document',
    hint:  'Upload a PDF or Word doc to extract tasks and simplify text',
    route: '/documents',
    bg:    'var(--accent-soft)',
    color: 'var(--color-active)',
    border: 'rgba(42,122,144,0.2)',
  },
  {
    label: 'Break down a goal',
    hint:  'Turn anything overwhelming into small, calm steps',
    route: '/tasks',
    bg:    'rgba(200,148,80,0.1)',
    color: 'var(--color-ai)',
    border: 'rgba(200,148,80,0.2)',
  },
  {
    label: 'Start focus mode',
    hint:  'A gentle, distraction-free timer with check-ins',
    route: '/focus',
    bg:    'var(--accent-2-soft)',
    color: 'var(--color-done)',
    border: 'rgba(80,148,106,0.2)',
  },
]

// Poetic greeting pools — Pebble's voice: lowercase, warm, alive
// Each phrase pairs with the user's name: "morning, Diego." / "still up, Diego."
const HERO_GREETING_POOLS = {
  morning:   ['morning', 'fresh slate', 'a new one', 'early light', 'here we go', 'the quiet start'],
  afternoon: ['afternoon', 'hey', 'midday', 'still here', 'good to see you', 'taking a breath'],
  evening:   ['evening', 'winding down', 'almost there', 'end of things', 'settling in', 'the long day'],
  night:     ['still up', 'late night', 'burning bright', 'the quiet ones', 'here with you', 'night owl'],
}
const HERO_GREETING_SESSION_KEY = 'pebble_hero_greeting'

function getTimeOfDay() {
  const h = new Date().getHours()
  if (h >= 6  && h < 12) return 'morning'
  if (h >= 12 && h < 17) return 'afternoon'
  if (h >= 17 && h < 21) return 'evening'
  return 'night'
}

const genId = () => Math.random().toString(36).slice(2, 10)
const GREETING_DEDUPE_KEY = 'pebble_home_greeting_ts'
const GREETING_DEDUPE_WINDOW_MS = 2500

// Strip ###ACTIONS[...]### markers that leaked through from the token stream.
// Also strips em dashes — GPT-4o sometimes ignores the voice rule even when told not to.
// Also handles incomplete markers (stream cut off before closing ###)
function stripActions(text) {
  if (!text) return ''
  return text
    .replace(/###ACTIONS\[[\s\S]*?\]###/g, '')   // complete marker
    .replace(/\u2014|\u2013/g, ' ')               // em dash (—) and en dash (–) → space
    .replace(/ {2,}/g, ' ')                        // collapse double spaces from the replacement
    .replace(/###ACTIONS\[[\s\S]*/g, '')           // incomplete marker (no closing ###)
    .trim()
}

// Strip markdown formatting so raw **bold** / *italic* / # headers don't show as text
function stripMarkdown(text) {
  if (!text) return ''
  return text
    .replace(/\*\*(.+?)\*\*/g, '$1')   // **bold**
    .replace(/\*(.+?)\*/g,   '$1')     // *italic*
    .replace(/^#+\s+/gm,     '')       // # headers
    .replace(/^[-*]\s+/gm,   '')       // - bullet list markers
}

// ── Sub-components ────────────────────────────────────────────────────── //

const AI_BUBBLE_STYLE = {
  background: 'rgba(200,148,80,0.07)',
  border: '1px solid rgba(200,148,80,0.16)',
  borderRadius: '20px 20px 20px 6px',
  padding: '1rem 1.2rem',
  color: 'var(--text-primary)',
  fontSize: '0.95rem',
  lineHeight: 1.7,
  whiteSpace: 'pre-wrap',
  wordBreak: 'break-word',
  boxShadow: '0 4px 18px rgba(200,148,80,0.08)',
}

function PulseDot({ phrase }) {
  const text = phrase ?? getLoadingPhrase()
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  return (
    <div style={{ display: 'flex', gap: '0.65rem', alignItems: 'flex-start', maxWidth: '85%' }}>
      {/* Pebble dot avatar — static brand identity dot, not an animation */}
      <div
        style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--color-pebble)', flexShrink: 0, marginTop: '1.05rem' }}
      />
      <div style={{
        ...AI_BUBBLE_STYLE,
        display: 'flex',
        alignItems: 'center',
        gap: '0.6rem',
        padding: '0.8rem 1.1rem',
      }}>
        <div style={{ display: 'flex', gap: 5, alignItems: 'flex-end', height: 16 }}>
          {[
            { color: '#50946A', delay: 0 },
            { color: '#E0A060', delay: 0.18 },
            { color: '#9A88B4', delay: 0.36 },
          ].map((dot, i) => (
            <motion.span
              key={i}
              animate={reducedMotion ? {} : { y: [0, -6, 0] }}
              transition={{ duration: 1.1, delay: dot.delay, repeat: Infinity, ease: 'easeInOut', repeatDelay: 0.5 }}
              style={{ display: 'block', width: 6, height: 6, borderRadius: '50%', background: dot.color, flexShrink: 0 }}
            />
          ))}
        </div>
        <span style={{ color: 'var(--text-muted)', fontSize: '0.88rem', fontStyle: 'italic' }}>
          {text}
        </span>
      </div>
    </div>
  )
}

function AiBubble({ content, buttons, navigate, onTaskNavigate, isStreaming = false }) {
  const clean   = stripActions(content)
  // During streaming: single bubble (text is still arriving — don't split mid-stream).
  // After done: split on natural paragraph breaks that GPT-4o put in the response.
  const bubbles = isStreaming ? [clean] : splitIntoBubbles(clean)
  if (!bubbles.length && !buttons?.length) return null

  return (
    <div style={{ display: 'flex', gap: '0.65rem', alignItems: 'flex-start', maxWidth: '85%' }}>
      {/* Pebble dot — shows once, aligned to the first bubble */}
      <motion.div
        animate={{ scale: [0.88, 1.08, 0.88], opacity: [0.7, 1, 0.7] }}
        transition={{ duration: 3.5, repeat: Infinity, ease: 'easeInOut' }}
        style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--color-pebble)', flexShrink: 0, marginTop: '1.05rem' }}
      />
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
        {bubbles.map((chunk, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.32, ease: [0.25, 0.46, 0.45, 0.94], delay: isStreaming ? 0 : i * 0.28 }}
            style={AI_BUBBLE_STYLE}
          >
            {renderMarkdown(chunk)}
          </motion.div>
        ))}
        {buttons && buttons.length > 0 && (
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            {buttons.map((btn, i) => (
              <button
                key={i}
                onClick={() => {
                  if (btn.value === '/tasks' && onTaskNavigate) {
                    onTaskNavigate(clean, btn.value)
                  } else {
                    navigate(btn.value)
                  }
                }}
                className="btn"
                style={{
                  background: 'var(--accent-soft)',
                  color: 'var(--color-active)',
                  border: '1.5px solid rgba(42,122,144,0.2)',
                  fontSize: '0.85rem',
                  padding: '0.4rem 0.9rem',
                }}
              >
                {btn.label}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function UserBubble({ content, userName }) {
  const initial = userName ? userName.charAt(0).toUpperCase() : 'Y'
  return (
    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.65rem', alignItems: 'flex-start' }}>
      <div style={{
        background: 'var(--color-pebble-soft)',
        border: '1px solid color-mix(in srgb, var(--color-pebble) 22%, transparent)',
        borderRadius: '20px 20px 6px 20px',
        padding: '1rem 1.2rem',
        color: 'var(--text-primary)',
        fontSize: '0.95rem',
        lineHeight: 1.7,
        maxWidth: '80%',
        whiteSpace: 'pre-wrap',
        wordBreak: 'break-word',
        boxShadow: '0 2px 14px color-mix(in srgb, var(--color-pebble) 6%, transparent)',
      }}>
        {content}
      </div>
      {/* User initial avatar */}
      <div style={{
        width: 28,
        height: 28,
        borderRadius: '50%',
        background: 'var(--color-pebble-soft)',
        border: '1px solid color-mix(in srgb, var(--color-pebble) 25%, transparent)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: '0.72rem',
        fontWeight: 600,
        color: 'var(--color-pebble)',
        flexShrink: 0,
        marginTop: '0.3rem',
        letterSpacing: '0.02em',
      }}>
        {initial}
      </div>
    </div>
  )
}

// ── TaskPreviewCard ────────────────────────────────────────────────────── //
// Rendered inline in the chat as a soft sticky-note the user can edit before saving.

function TaskPreviewCard({ task, onConfirm, onRevise }) {
  const [title,           setTitle]           = useState(task.title || '')
  const [description,     setDescription]     = useState(task.description || '')
  const [durationMinutes, setDurationMinutes] = useState(task.duration_minutes || 20)
  // Normalize priority — backend suggest_task returns string ("high"/"normal"/"low"),
  // task-choice card stores integer after PRIORITY_STR_TO_INT conversion. Handle both.
  const [priority, setPriority] = useState(() => {
    const p = task.priority
    if (typeof p === 'number') return p
    return PRIORITY_STR_TO_INT[p] ?? 2
  })
  const [saving,          setSaving]          = useState(false)

  const DURATIONS = [5, 10, 15, 20, 30, 45, 60, 90, 120]

  const handleConfirm = async () => {
    if (!title.trim() || saving) return
    setSaving(true)
    await onConfirm({ title: title.trim(), description, duration_minutes: durationMinutes, priority, due_date: task.due_date, due_label: task.due_label })
  }

  return (
    <div style={{ display: 'flex', gap: '0.65rem', alignItems: 'flex-start', maxWidth: '85%' }}>
      {/* Pebble dot avatar */}
      <motion.div
        animate={{ scale: [0.88, 1.08, 0.88], opacity: [0.7, 1, 0.7] }}
        transition={{ duration: 3.5, repeat: Infinity, ease: 'easeInOut' }}
        style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--color-pebble)', flexShrink: 0, marginTop: '1.2rem' }}
      />
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -4 }}
        transition={{ duration: 0.3, ease: [0.4, 0, 0.2, 1] }}
        style={{
          background: 'var(--bg-card)',
          border: '1px solid var(--border)',
          borderLeft: '3px solid var(--color-pebble)',
          borderRadius: '4px 14px 14px 4px',
          padding: '1rem 1.2rem 0.95rem',
          width: '100%',
        }}
      >
        {/* Eyebrow */}
        <div style={{
          fontSize: '0.68rem', fontWeight: 600, letterSpacing: '0.08em',
          color: 'var(--color-pebble)', textTransform: 'uppercase',
          marginBottom: '0.6rem', opacity: 0.9,
        }}>
          task idea · tap to edit
        </div>

        {/* Editable title */}
        <input
          value={title}
          onChange={e => setTitle(e.target.value)}
          placeholder="task title..."
          disabled={saving}
          style={{
            width: '100%', border: 'none', borderBottom: '1px solid transparent',
            background: 'transparent', outline: 'none',
            fontFamily: '"DM Serif Display", Georgia, serif',
            fontSize: '1.05rem', fontWeight: 400,
            color: 'var(--text-primary)',
            padding: '0 0 2px', marginBottom: '0.45rem',
            transition: 'border-color 0.2s ease',
          }}
          onFocus={e => { e.target.style.borderBottomColor = 'var(--color-pebble)' }}
          onBlur={e => { e.target.style.borderBottomColor = 'transparent' }}
        />

        {/* Editable description */}
        <textarea
          value={description}
          onChange={e => setDescription(e.target.value)}
          placeholder="add context from the conversation..."
          rows={2}
          disabled={saving}
          style={{
            width: '100%', border: 'none', background: 'transparent',
            outline: 'none', resize: 'none',
            fontSize: '0.875rem', color: 'var(--text-secondary)',
            lineHeight: 1.65, fontFamily: 'inherit',
            padding: 0,
          }}
        />

        {/* Duration + due row */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem', marginTop: '0.55rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
            {/* Clock icon */}
            <svg width="11" height="11" viewBox="0 0 12 12" fill="none" style={{ opacity: 0.45 }}>
              <circle cx="6" cy="6" r="5" stroke="var(--text-muted)" strokeWidth="1.3"/>
              <path d="M6 3.5V6L7.5 7.5" stroke="var(--text-muted)" strokeWidth="1.3" strokeLinecap="round"/>
            </svg>
            <select
              value={durationMinutes}
              onChange={e => setDurationMinutes(Number(e.target.value))}
              disabled={saving}
              style={{
                border: 'none', background: 'transparent',
                fontSize: '0.8rem', color: 'var(--text-muted)',
                cursor: 'pointer', outline: 'none',
              }}
            >
              {DURATIONS.map(m => (
                <option key={m} value={m}>{m < 60 ? `~${m} min` : `~${m / 60} hr`}</option>
              ))}
            </select>
          </div>
          {task.due_label && (
            <span style={{ fontSize: '0.78rem', color: 'var(--color-queued)', fontWeight: 500 }}>
              due {task.due_label}
            </span>
          )}
        </div>

        {/* Priority picker — user can override GPT's suggestion before saving */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.55rem' }}>
          <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>priority</span>
          <PriorityPicker priority={priority} onChange={setPriority} />
        </div>

        {/* Action buttons */}
        <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.9rem' }}>
          <button
            onClick={handleConfirm}
            disabled={saving || !title.trim()}
            style={{
              background: 'var(--color-pebble)', color: '#fff',
              border: 'none', borderRadius: 8,
              padding: '0.42rem 1rem', fontSize: '0.85rem', fontWeight: 500,
              cursor: saving || !title.trim() ? 'default' : 'pointer',
              opacity: saving || !title.trim() ? 0.65 : 1,
              transition: 'all 0.2s ease', minHeight: 36,
            }}
          >
            {saving ? 'saving...' : 'looks good'}
          </button>
          <button
            onClick={onRevise}
            disabled={saving}
            style={{
              background: 'none', color: 'var(--text-muted)',
              border: '1px solid var(--border)', borderRadius: 8,
              padding: '0.42rem 0.9rem', fontSize: '0.85rem',
              cursor: saving ? 'default' : 'pointer',
              opacity: saving ? 0.4 : 1,
              transition: 'all 0.2s ease', minHeight: 36,
            }}
          >
            not quite
          </button>
        </div>
      </motion.div>
    </div>
  )
}

// ── TaskChoiceCard ────────────────────────────────────────────────────── //
// Shown before TaskPreviewCard — Pebble asks: add to tasks, or focus now?

function TaskChoiceCard({ task, onAddToTasks, onFocusNow, onDismiss }) {
  return (
    <div style={{ display: 'flex', gap: '0.65rem', alignItems: 'flex-start', maxWidth: '85%' }}>
      <motion.div
        animate={{ scale: [0.88, 1.08, 0.88], opacity: [0.7, 1, 0.7] }}
        transition={{ duration: 3.5, repeat: Infinity, ease: 'easeInOut' }}
        style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--color-pebble)', flexShrink: 0, marginTop: '1.2rem' }}
      />
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -4 }}
        transition={{ duration: 0.3, ease: [0.4, 0, 0.2, 1] }}
        style={{
          background: 'var(--bg-card)',
          border: '1px solid var(--border)',
          borderLeft: '3px solid var(--color-pebble)',
          borderRadius: '4px 14px 14px 4px',
          padding: '1rem 1.2rem 0.95rem',
          width: '100%',
        }}
      >
        <div style={{
          fontSize: '0.68rem', fontWeight: 600, letterSpacing: '0.08em',
          color: 'var(--color-pebble)', textTransform: 'uppercase',
          marginBottom: '0.55rem', opacity: 0.9,
        }}>
          captured
        </div>

        <div style={{
          fontFamily: '"DM Serif Display", Georgia, serif',
          fontSize: '1.05rem', fontWeight: 400,
          color: 'var(--text-primary)',
          marginBottom: '0.3rem',
          lineHeight: 1.35,
        }}>
          {task.title}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', marginBottom: '0.95rem' }}>
          <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>~{task.duration_minutes} min</span>
          {task.due_label && (
            <span style={{ fontSize: '0.78rem', color: 'var(--color-queued)', fontWeight: 500 }}>
              due {task.due_label}
            </span>
          )}
        </div>

        <div style={{ fontSize: '0.88rem', color: 'var(--text-muted)', marginBottom: '1rem', lineHeight: 1.5 }}>
          want to add this to your list, or jump straight in with a timer?
        </div>

        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          <button
            onClick={onAddToTasks}
            style={{
              background: 'var(--color-pebble)', color: '#fff',
              border: 'none', borderRadius: 8,
              padding: '0.42rem 1rem', fontSize: '0.85rem', fontWeight: 500,
              cursor: 'pointer', transition: 'all 0.2s ease', minHeight: 36,
            }}
          >
            add to my tasks
          </button>
          <button
            onClick={onFocusNow}
            style={{
              background: 'var(--accent-soft)', color: 'var(--color-active)',
              border: '1.5px solid rgba(42,122,144,0.22)', borderRadius: 8,
              padding: '0.42rem 1rem', fontSize: '0.85rem',
              cursor: 'pointer', transition: 'all 0.2s ease', minHeight: 36,
            }}
          >
            focus on it now
          </button>
          <button
            onClick={onDismiss}
            style={{
              background: 'none', color: 'var(--text-muted)',
              border: '1px solid var(--border)', borderRadius: 8,
              padding: '0.42rem 0.9rem', fontSize: '0.85rem',
              cursor: 'pointer', transition: 'all 0.2s ease', minHeight: 36,
            }}
          >
            not quite
          </button>
        </div>
      </motion.div>
    </div>
  )
}

// ── MergePreviewCard ───────────────────────────────────────────────────── //
// Shown inline in chat when Pebble detects a merge_tasks action.
// User can edit the merged task name / priority before confirming.

function MergePreviewCard({ mergeData, onConfirm, onDismiss }) {
  const [taskName, setTaskName] = useState(mergeData.merged_name || '')
  const [duration, setDuration] = useState(mergeData.duration_minutes || 30)
  const [priority, setPriority] = useState(mergeData.priority ?? 2)

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -4 }}
      style={{
        background: 'var(--bg-card)',
        border: '1px solid var(--border)',
        borderLeft: '3px solid var(--color-active)',
        borderRadius: 12,
        padding: '14px 16px',
        margin: '8px 0',
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
      }}
    >
      <div style={{ fontSize: 11, color: 'var(--color-ai)', fontWeight: 500, letterSpacing: '0.03em' }}>
        merged task
      </div>
      <input
        value={taskName}
        onChange={e => setTaskName(e.target.value)}
        style={{
          background: 'transparent',
          border: 'none',
          borderBottom: '1px solid var(--border)',
          color: 'var(--text-primary)',
          fontSize: 14,
          fontWeight: 500,
          padding: '4px 0',
          outline: 'none',
          width: '100%',
        }}
        placeholder="task name"
      />
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>priority</span>
        <PriorityPicker priority={priority} onChange={setPriority} />
        <span style={{ fontSize: 11, color: 'var(--text-muted)', marginLeft: 8 }}>
          ~{duration} min total
        </span>
      </div>
      <div style={{ fontSize: 11, color: 'var(--text-muted)', fontStyle: 'italic' }}>
        combines: {(mergeData.source_task_names || []).join(' + ')}
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <button
          onClick={() => onConfirm({ task_name: taskName, duration_minutes: duration, priority, motivation_nudge: mergeData.merged_description || '' })}
          style={{
            background: 'var(--color-active)',
            color: 'white',
            border: 'none',
            borderRadius: 8,
            padding: '8px 18px',
            minHeight: 40,
            fontSize: 13,
            cursor: 'pointer',
            fontWeight: 500,
            transition: 'opacity 0.2s ease',
          }}
          onMouseEnter={e => { e.currentTarget.style.opacity = '0.85' }}
          onMouseLeave={e => { e.currentTarget.style.opacity = '1' }}
        >
          merge
        </button>
        <button
          onClick={onDismiss}
          style={{
            background: 'transparent',
            color: 'var(--text-muted)',
            border: '1px solid var(--border)',
            borderRadius: 8,
            padding: '8px 16px',
            minHeight: 40,
            fontSize: 13,
            cursor: 'pointer',
            transition: 'background 0.2s ease',
          }}
          onMouseEnter={e => { e.currentTarget.style.background = 'var(--accent-soft)' }}
          onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
        >
          keep separate
        </button>
      </div>
    </motion.div>
  )
}

// ── Home page ─────────────────────────────────────────────────────────── //

export default function Home() {
  const navigate    = useNavigate()
  const location    = useLocation()
  const dispatch    = useDispatch()
  const prefs       = useSelector(s => s.prefs)
  const taskGroups  = useSelector(s => s.tasks.groups)

  // heroMode — true whenever the user navigates to Home, false once they send a message
  // location.key changes on every navigation, so this resets correctly each visit
  const [heroMode, setHeroMode] = useState(true)
  useEffect(() => { setHeroMode(true) }, [location.key])

  // Chat state — local only (no Redux slice needed for chat messages)
  // Lazy initializer loads from localStorage so chat survives page refresh
  const [messages,        setMessages]        = useState(() => {
    try {
      const saved = localStorage.getItem('pebble_chat_messages')
      return saved ? JSON.parse(saved) : []
    } catch { return [] }
  })
  const [streamingContent, setStreamingContent] = useState('')
  const [pendingButtons,  setPendingButtons]  = useState([])
  const [isStreaming,     setIsStreaming]      = useState(false)
  const [input,           setInput]           = useState('')
  const [placeholderIdx,  setPlaceholderIdx]  = useState(0)
  const [hoveredAction,   setHoveredAction]   = useState(null)
  // Hero greeting — streams from API into its own state, never touches messages
  const [heroText,        setHeroText]        = useState('')
  const [heroLoading,     setHeroLoading]     = useState(false)
  // Stable loading phrase per session so it doesn't flicker on re-renders
  const heroLoadingPhrase = useRef(getLoadingPhrase())

  // Merge preview — set when Pebble emits a merge_tasks action
  const [mergePending, setMergePending] = useState(null) // { merged_name, merged_description, source_task_names, priority, duration_minutes }

  // Chat session history + cross-page recents
  const [showHistory, setShowHistory] = useState(false)
  const [sessions,    setSessions]    = useState(() => loadSessions())
  const [recentDocs,  setRecentDocs]  = useState([])

  const messagesEndRef = useRef(null)
  const inputRef       = useRef(null)
  const historyRef     = useRef(null)
  const streamIdRef    = useRef(0)

  // Close session history dropdown on outside click
  useEffect(() => {
    if (!showHistory) return
    function handler(e) {
      if (historyRef.current && !historyRef.current.contains(e.target)) setShowHistory(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [showHistory])

  // Fetch recent documents whenever dropdown opens
  useEffect(() => {
    if (!showHistory) return
    loadDocuments()
      .then(data => setRecentDocs((data.documents || []).slice(0, 4)))
      .catch(() => setRecentDocs([]))
  }, [showHistory])

  // Rotate placeholder text every 15 seconds (slow enough to not be distracting)
  useEffect(() => {
    const timer = setInterval(
      () => setPlaceholderIdx(i => (i + 1) % PLACEHOLDERS.length),
      15000,
    )
    return () => clearInterval(timer)
  }, [])

  // Scroll to bottom whenever messages or streaming content updates
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, streamingContent])

  // ── Core streaming function ──────────────────────────────────────────── //

  const sendMessage = useCallback(async (userText, isGreeting = false, currentMsgs) => {
    // Assign a unique ID to this stream invocation. Any callback that fires after
    // a newer stream has started will see a mismatched ID and bail out, preventing
    // duplicate messages from two concurrent streams.
    const myId = ++streamIdRef.current

    setIsStreaming(true)
    setStreamingContent('')
    setPendingButtons([])

    let accumulated = ''
    let accButtons  = []
    let replaced    = false

    // Build conversation history — everything BEFORE the current message.
    // currentMsgs includes the new user message as last item; exclude it since
    // the backend also appends `message` to gpt_messages (would duplicate it).
    const history = (currentMsgs || [])
      .slice(0, -1)
      .slice(-20)
      .map(m => ({ role: m.role, content: m.content }))

    await chatStream(
      {
        message:              userText,
        is_greeting:          isGreeting,
        current_page:         'home',
        conversation_history: history,
      },
      {
        onToken: token => {
          if (streamIdRef.current !== myId) return
          accumulated += token
          setStreamingContent(accumulated)
        },
        onActions: buttons => {
          if (streamIdRef.current !== myId) return
          accButtons = buttons
          setPendingButtons(buttons)
        },
        onReplace: content => {
          if (streamIdRef.current !== myId) return
          replaced = true
          setStreamingContent('')
          setMessages(prev => [...prev, { id: genId(), role: 'assistant', content: stripActions(content), buttons: [] }])
        },
        onDone: () => {
          if (streamIdRef.current !== myId) return
          if (!replaced && accumulated) {
            // Separate special action types from regular navigation buttons
            const taskSuggestion = accButtons.find(b => b.type === 'suggest_task')
            const mergeAction    = accButtons.find(b => b.type === 'merge_tasks')
            const regularButtons = accButtons.filter(b => b.type !== 'suggest_task' && b.type !== 'merge_tasks')

            const aiMsg = {
              id:      genId(),
              role:    'assistant',
              content: stripActions(accumulated),
              buttons: regularButtons,
            }

            if (taskSuggestion) {
              // Show choice card first — user picks "add to tasks" or "focus now"
              const choiceId = genId()
              setMessages(prev => [...prev, aiMsg, {
                id:   choiceId,
                role: 'task-choice',
                task: {
                  title:            taskSuggestion.title || '',
                  description:      taskSuggestion.description || '',
                  duration_minutes: taskSuggestion.duration_minutes || 25,
                  priority:         PRIORITY_STR_TO_INT[taskSuggestion.priority] ?? 2,  // convert "high"/"normal"/"low" → 1/2/3
                  due_date:         taskSuggestion.due_date  || null,
                  due_label:        taskSuggestion.due_label || null,
                },
              }])
            } else if (mergeAction) {
              // Show merge preview card — user confirms or dismisses
              setMessages(prev => [...prev, aiMsg])
              setMergePending({
                merged_name:       mergeAction.merged_name || '',
                merged_description: mergeAction.merged_description || '',
                source_task_names: mergeAction.source_task_names || [],
                priority:          mergeAction.priority ?? 2,
                duration_minutes:  mergeAction.duration_minutes || 30,
              })
            } else {
              setMessages(prev => [...prev, aiMsg])
            }
          }
          setStreamingContent('')
          setPendingButtons([])
          setIsStreaming(false)
        },
        onError: msg => {
          if (streamIdRef.current !== myId) return
          setMessages(prev => [...prev, {
            id:      genId(),
            role:    'assistant',
            content: msg || 'Something went quiet — please try again.',
            buttons: [],
          }])
          setStreamingContent('')
          setIsStreaming(false)
        },
      },
    )
  }, [])

  // Greeting stream — goes to heroText only, never into messages.
  // This keeps Pebble alive and contextual on every visit without polluting chat history.
  const fetchGreeting = useCallback(async (conversationHistory = []) => {
    setHeroLoading(true)
    setHeroText('')

    let accumulated = ''
    await chatStream(
      {
        message:              '',
        is_greeting:          true,
        current_page:         'home',
        conversation_history: conversationHistory.slice(-20).map(m => ({ role: m.role, content: m.content })),
      },
      {
        onToken: token => {
          accumulated += token
          setHeroText(stripActions(accumulated))
          setHeroLoading(false)
        },
        onReplace: content => {
          setHeroText(stripActions(content))
          setHeroLoading(false)
        },
        onDone: () => {
          setHeroText(stripActions(accumulated))
          setHeroLoading(false)
        },
        onError: () => {
          setHeroText('where do you want to start?')
          setHeroLoading(false)
        },
      },
    )
  }, [])

  // Persist chat to localStorage whenever messages change (skip empty to avoid wiping on mount)
  useEffect(() => {
    if (messages.length === 0) return
    try {
      localStorage.setItem('pebble_chat_messages', JSON.stringify(messages.slice(-50)))
    } catch {}
  }, [messages])

  // On mount: load real conversation history from Cosmos, then always fetch
  // a live greeting that streams into heroText — never into messages.
  // This way: returning users get their full history in chat, new users start fresh,
  // and Pebble is always alive and contextual in the hero regardless.
  useEffect(() => {
    let cancelled = false

    async function init() {
      let cosmosMessages = []

      // Load full conversation history from Cosmos (source of truth)
      try {
        const data = await loadConversation()
        if (!cancelled && data?.messages?.length > 0) {
          const raw = data.messages.map(m => ({
            id:      genId(),
            role:    m.role,
            content: m.content,
            buttons: [],
          }))
          // Deduplicate consecutive assistant messages (can appear from prior SSE bugs)
          cosmosMessages = raw.filter((msg, i) =>
            !(msg.role === 'assistant' && i > 0 && raw[i - 1].role === 'assistant')
          )
          setMessages(cosmosMessages)
          try {
            localStorage.setItem('pebble_chat_messages', JSON.stringify(cosmosMessages.slice(-50)))
          } catch {}
        }
      } catch { /* Cosmos unavailable — localStorage state stays */ }

      if (cancelled) return

      // Always fetch greeting — Pebble should be alive on every visit.
      // Pass conversation history so Pebble knows what the user was working on.
      // Dedupe prevents double-call in React Strict Mode.
      const now = Date.now()
      const lastTs = Number(sessionStorage.getItem(GREETING_DEDUPE_KEY) || 0)
      if (lastTs && now - lastTs < GREETING_DEDUPE_WINDOW_MS) return
      sessionStorage.setItem(GREETING_DEDUPE_KEY, String(now))
      fetchGreeting(cosmosMessages)
    }

    init()
    return () => { cancelled = true }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // ── User actions ──────────────────────────────────────────────────────── //

  const handleSend = () => {
    const text = input.trim()
    if (!text || isStreaming) return

    // Hero screen = new session entry point. Archive whatever was in progress.
    let baseMessages = messages
    if (heroMode && messages.length > 0) {
      archiveSession(messages, setSessions)
      setSessions(loadSessions())
      try { localStorage.removeItem('pebble_chat_messages') } catch {}
      baseMessages = []
    }

    const userMsg = { id: genId(), role: 'user', content: text }
    const next = [...baseMessages, userMsg]
    setMessages(next)
    setHeroMode(false)
    sendMessage(text, false, next)
    setInput('')
  }

  const handleKeyDown = e => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const handleNewChat = useCallback(() => {
    archiveSession(messages, setSessions)
    setSessions(loadSessions())
    setMessages([])
    setHeroMode(true)
    setShowHistory(false)
    try { localStorage.removeItem('pebble_chat_messages') } catch {}
    heroLoadingPhrase.current = getLoadingPhrase()
    fetchGreeting([])
  }, [messages, fetchGreeting])

  const handleDeleteSession = useCallback((e, sessionId) => {
    e.stopPropagation()
    const updated = loadSessions().filter(s => s.id !== sessionId)
    localStorage.setItem(SESSIONS_KEY, JSON.stringify(updated))
    setSessions(updated)
  }, [])

  const handlePreviousWork = () => {
    if (isStreaming) return
    const text    = 'What was I working on?'
    const userMsg = { id: genId(), role: 'user', content: text }
    const next    = [...messages, userMsg]
    setMessages(next)
    setHeroMode(false)
    sendMessage(text, false, next)
  }

  // When chat suggests tasks: call /api/suggest-task with conversation context,
  // then show an editable TaskPreviewCard inline — never silently create tasks.
  const handleTaskNavigate = useCallback(async (_content, _route) => {
    const loadingId = genId()
    setMessages(prev => [...prev, { id: loadingId, role: 'task-preview-loading' }])

    try {
      // Pass last 10 real messages as conversation context
      const history = messages
        .filter(m => m.role === 'user' || m.role === 'assistant')
        .slice(-10)
        .map(m => ({ role: m.role, content: m.content }))

      const suggestion = await suggestTask(history, prefs.granularity || 'normal')

      if (suggestion.flagged) {
        setMessages(prev => prev.filter(m => m.id !== loadingId))
        return
      }

      if (suggestion.needs_clarification) {
        // Pebble asks before guessing
        setMessages(prev => [
          ...prev.filter(m => m.id !== loadingId),
          {
            id: genId(), role: 'assistant',
            content: suggestion.clarification_question || 'what would you like to call this task?',
            buttons: [],
          },
        ])
        return
      }

      // Show editable preview card inline in chat
      const previewId = genId()
      setMessages(prev => [
        ...prev.filter(m => m.id !== loadingId),
        { id: previewId, role: 'task-preview', task: suggestion, _previewId: previewId },
      ])
    } catch {
      setMessages(prev => prev.filter(m => m.id !== loadingId))
    }
  }, [messages, prefs.granularity])

  // Called when user clicks "looks good" on the preview card
  const handleConfirmTask = useCallback(async (editedTask, previewMsgId) => {
    const newGroupId = genId()
    const newTaskId  = genId()

    const newTask = {
      id:               newTaskId,
      task_name:        editedTask.title,
      duration_minutes: editedTask.duration_minutes || 20,
      priority:         editedTask.priority ?? 2,   // user's choice from PriorityPicker (may differ from GPT suggestion)
      motivation_nudge: editedTask.description || '',
      due_date:         editedTask.due_date || null,
      due_label:        editedTask.due_label || null,
      done: false, paused: false, timerStarted: null, nudgeText: null,
    }

    // Remove preview from chat
    setMessages(prev => prev.filter(m => m.id !== previewMsgId))

    // Add to Redux immediately (UI stays responsive)
    dispatch(tasksActions.addGroup({ id: newGroupId, name: editedTask.title, source: 'ai', tasks: [newTask] }))

    // Persist to Cosmos — use current taskGroups + the new group
    // (Redux dispatch is synchronous so taskGroups won't include the new group yet)
    try {
      const withNew = [
        ...taskGroups,
        { id: newGroupId, name: editedTask.title, source: 'ai', created_at: new Date().toISOString(), tasks: [newTask] },
      ]
      saveTasks(withNew).catch(() => {}) // fire-and-forget
    } catch {}

    // Navigate to Tasks with highlight state so the new task gets a brief pulse
    navigate('/tasks', { state: { highlightGroupId: newGroupId } })
  }, [dispatch, taskGroups, navigate])

  // Called when user clicks "not quite" — dismiss preview, Pebble asks what to change
  const handleReviseTask = useCallback((previewMsgId) => {
    setMessages(prev => [
      ...prev.filter(m => m.id !== previewMsgId),
      { id: genId(), role: 'assistant', content: "no worries. what didn't feel right?", buttons: [] },
    ])
    setTimeout(() => inputRef.current?.focus(), 80)
  }, [])

  // "add to my tasks" on the choice card — swap it out for the editable preview card
  const handleChooseAddTask = useCallback((choiceMsgId, task) => {
    const previewId = genId()
    setMessages(prev => [
      ...prev.filter(m => m.id !== choiceMsgId),
      { id: previewId, role: 'task-preview', task },
    ])
  }, [])

  // "focus on it now" — create the task in Redux, set focus, navigate to /focus
  const handleChooseFocus = useCallback(async (choiceMsgId, task) => {
    const newGroupId = genId()
    const newTaskId  = genId()

    const newTask = {
      id:               newTaskId,
      task_name:        task.title,
      duration_minutes: task.duration_minutes || 25,
      priority:         task.priority ?? 2,
      motivation_nudge: task.description || '',
      due_date:         task.due_date  || null,
      due_label:        task.due_label || null,
      done: false, paused: false, timerStarted: null, nudgeText: null,
    }

    setMessages(prev => prev.filter(m => m.id !== choiceMsgId))
    dispatch(tasksActions.addGroup({ id: newGroupId, name: task.title, source: 'ai', tasks: [newTask] }))
    dispatch(tasksActions.setFocusGroup(newGroupId))
    dispatch(tasksActions.setFocusTask(newTaskId))

    try {
      const withNew = [
        ...taskGroups,
        { id: newGroupId, name: task.title, source: 'ai', created_at: new Date().toISOString(), tasks: [newTask] },
      ]
      saveTasks(withNew).catch(() => {})
    } catch {}

    navigate('/focus')
  }, [dispatch, taskGroups, navigate])

  // "not quite" on the choice card — same dismiss flow as revise
  const handleDismissChoice = useCallback((choiceMsgId) => {
    setMessages(prev => [
      ...prev.filter(m => m.id !== choiceMsgId),
      { id: genId(), role: 'assistant', content: "no worries. what didn't feel right?", buttons: [] },
    ])
    setTimeout(() => inputRef.current?.focus(), 80)
  }, [])

  // Merge preview confirm — dispatches mergeTasks reducer then navigates to /tasks
  const handleConfirmMerge = useCallback((mergedTask) => {
    if (!mergePending) return
    dispatch(tasksActions.mergeTasks({
      sourceTaskNames: mergePending.source_task_names,
      mergedTask,
    }))
    setMergePending(null)
    // Brief delay so Redux state settles before navigating
    setTimeout(() => navigate('/tasks'), 400)
  }, [mergePending, dispatch, navigate])

  // Stable poetic greeting — cached in sessionStorage, invalidates when hour or name changes
  const heroGreeting = useMemo(() => {
    const hour = new Date().getHours()
    const firstName = (prefs.name && prefs.name !== 'there')
      ? prefs.name.split(' ')[0]
      : null
    try {
      const cached = JSON.parse(sessionStorage.getItem(HERO_GREETING_SESSION_KEY) || 'null')
      // Reuse only if same hour AND same name — catches stale caches from old code
      if (cached?.text && cached?.hour === hour && cached?.name === (firstName ?? '')) return cached.text
    } catch {}

    const tod    = getTimeOfDay()
    const pool   = HERO_GREETING_POOLS[tod]
    const phrase = pool[Math.floor(Math.random() * pool.length)]
    const text   = firstName ? `${phrase}, ${firstName}` : phrase

    try { sessionStorage.setItem(HERO_GREETING_SESSION_KEY, JSON.stringify({ text, hour, name: firstName ?? '' })) } catch {}
    return text
  }, [prefs.name])


  // ── Render ────────────────────────────────────────────────────────────── //

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0, transition: { duration: 0.45, ease: [0.4, 0, 0.2, 1] } }}
      exit={{ opacity: 0, y: -12, transition: { duration: 0.4, ease: [0.4, 0, 0.2, 1] } }}
      style={{
        display:       'flex',
        flexDirection: 'column',
        height:        '100%',
        minHeight:     0,
        overflow:      'hidden',
      }}
    >

      <AnimatePresence mode="wait">

        {/* ── HERO VIEW — shown on every fresh navigation to Home ───────── */}
        {heroMode && (
          <motion.div
            key="hero"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1, transition: { duration: 0.45 } }}
            exit={{ opacity: 0, y: -8, transition: { duration: 0.3 } }}
            style={{
              flex:           1,
              overflowY:      'auto',
              display:        'flex',
              flexDirection:  'column',
              alignItems:     'center',
              justifyContent: 'center',
              padding:        '2rem 1.5rem 1rem',
              gap:            '2rem',
              minHeight:      0,
            }}
          >
            {/* Poetic greeting — DM Serif Display */}
            <motion.h1
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0, transition: { duration: 0.55, delay: 0.1, ease: [0.4, 0, 0.2, 1] } }}
              style={{
                fontFamily:    '"DM Serif Display", Georgia, serif',
                fontSize:      'clamp(2rem, 5vw, 3rem)',
                fontWeight:    400,
                color:         'var(--text-primary)',
                letterSpacing: '-0.01em',
                lineHeight:    1.15,
                textAlign:     'center',
                margin:        0,
              }}
            >
              {heroGreeting}
              <motion.span
                aria-hidden="true"
                animate={{ scale: [0.85, 1.18, 0.85], opacity: [0.6, 1, 0.6] }}
                transition={{ duration: 3.2, repeat: Infinity, ease: 'easeInOut' }}
                style={{
                  display:      'inline-block',
                  width:        10,
                  height:       10,
                  borderRadius: '50%',
                  background:   'var(--color-pebble)',
                  marginLeft:   6,
                  marginBottom: 4,
                  verticalAlign: 'baseline',
                }}
              />
            </motion.h1>

            {/* Pebble's live greeting — streams from API into heroText, never into messages */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1, transition: { duration: 0.5, delay: 0.22 } }}
              style={{
                maxWidth:       480,
                width:          '100%',
                textAlign:      'center',
                minHeight:      '3.5rem',
                display:        'flex',
                alignItems:     'center',
                justifyContent: 'center',
              }}
            >
              {heroLoading && !heroText
                ? (
                  <div style={{ display: 'flex', gap: '0.55rem', alignItems: 'center', justifyContent: 'center' }}>
                    <div style={{ display: 'flex', gap: 5, alignItems: 'flex-end', height: 16 }}>
                      {[
                        { color: '#50946A', delay: 0 },
                        { color: '#E0A060', delay: 0.18 },
                        { color: '#9A88B4', delay: 0.36 },
                      ].map((dot, i) => (
                        <motion.span
                          key={i}
                          animate={{ y: [0, -6, 0] }}
                          transition={{ duration: 1.1, delay: dot.delay, repeat: Infinity, ease: 'easeInOut', repeatDelay: 0.5 }}
                          style={{ display: 'block', width: 6, height: 6, borderRadius: '50%', background: dot.color, flexShrink: 0 }}
                        />
                      ))}
                    </div>
                    <span style={{ color: 'var(--text-muted)', fontSize: '0.88rem', fontStyle: 'italic' }}>
                      {heroLoadingPhrase.current}
                    </span>
                  </div>
                )
                : (
                  <p style={{
                    margin:     0,
                    color:      'var(--text-secondary)',
                    fontSize:   '1rem',
                    lineHeight: 1.75,
                    whiteSpace: 'pre-wrap',
                    wordBreak:  'break-word',
                  }}>
                    {heroText}
                  </p>
                )
              }
            </motion.div>

            {/* Quick action pills */}
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0, transition: { duration: 0.4, delay: 0.32 } }}
              style={{
                display:        'flex',
                gap:            '0.5rem',
                flexWrap:       'wrap',
                justifyContent: 'center',
              }}
            >
              {QUICK_ACTIONS.map(action => (
                <div key={action.route} style={{ position: 'relative' }}>
                  <button
                    className="btn"
                    onClick={() => navigate(action.route)}
                    onMouseEnter={() => setHoveredAction(action.route)}
                    onMouseLeave={() => setHoveredAction(null)}
                    style={{
                      background: action.bg,
                      color:      action.color,
                      border:     `1.5px solid ${action.border}`,
                      fontSize:   '0.85rem',
                      transition: 'all 0.25s ease',
                    }}
                  >
                    {action.label}
                  </button>

                  <AnimatePresence>
                    {hoveredAction === action.route && (
                      <motion.div
                        initial={{ opacity: 0, y: 4 }}
                        animate={{ opacity: 1, y: 0, transition: { duration: 0.18 } }}
                        exit={{ opacity: 0, transition: { duration: 0.12 } }}
                        style={{
                          position:      'absolute',
                          top:           'calc(100% + 7px)',
                          left:          '50%',
                          transform:     'translateX(-50%)',
                          background:    'var(--surface)',
                          border:        '1px solid var(--border)',
                          borderRadius:  8,
                          padding:       '0.4rem 0.8rem',
                          fontSize:      '0.8rem',
                          color:         'var(--text-secondary)',
                          whiteSpace:    'nowrap',
                          zIndex:        20,
                          boxShadow:     '0 4px 16px rgba(0,0,0,0.08)',
                          pointerEvents: 'none',
                        }}
                      >
                        {action.hint}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              ))}
            </motion.div>

            {/* "pick up where you left off" — categorised dropdown */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1, transition: { duration: 0.4, delay: 0.42 } }}
              style={{ position: 'relative' }}
              ref={historyRef}
            >
              <button
                onClick={() => { if (!isStreaming) setShowHistory(h => !h) }}
                disabled={isStreaming}
                style={{
                  display: 'flex', alignItems: 'center', gap: '0.4rem',
                  background: showHistory ? 'var(--accent-soft)' : 'none',
                  border: '1px solid',
                  borderColor: showHistory ? 'rgba(154,136,180,0.4)' : 'rgba(154,136,180,0.25)',
                  borderRadius: 99,
                  cursor: isStreaming ? 'default' : 'pointer',
                  color: 'var(--color-paused)',
                  fontSize: '0.82rem',
                  fontWeight: 500,
                  padding: '0.45rem 1rem',
                  opacity: isStreaming ? 0.45 : 1,
                  transition: 'all 0.22s ease',
                }}
                onMouseEnter={e => { if (!isStreaming) { e.currentTarget.style.background = 'var(--accent-soft)'; e.currentTarget.style.borderColor = 'rgba(154,136,180,0.4)' } }}
                onMouseLeave={e => { if (!showHistory) { e.currentTarget.style.background = 'none'; e.currentTarget.style.borderColor = 'rgba(154,136,180,0.25)' } }}
              >
                pick up where you left off
                <svg width="10" height="10" viewBox="0 0 10 10" fill="none" style={{ opacity: 0.7, transform: showHistory ? 'rotate(180deg)' : 'none', transition: 'transform 0.22s ease' }}>
                  <path d="M2 3.5L5 6.5L8 3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </button>

              {/* ── Categorised recents dropdown ─────────────────────── */}
              <AnimatePresence>
                {showHistory && (
                  <motion.div
                    initial={{ opacity: 0, y: 8, scale: 0.97 }}
                    animate={{ opacity: 1, y: 0, scale: 1, transition: { duration: 0.22, ease: [0.25, 0, 0.2, 1] } }}
                    exit={{ opacity: 0, y: 6, scale: 0.97, transition: { duration: 0.15 } }}
                    style={{
                      position: 'absolute', top: 'calc(100% + 10px)',
                      left: '50%', transform: 'translateX(-50%)',
                      background: 'var(--bg-card)',
                      border: '1px solid var(--border)',
                      borderRadius: 16,
                      boxShadow: '0 16px 48px rgba(0,0,0,0.12), 0 2px 8px rgba(0,0,0,0.06)',
                      width: 'min(400px, 90vw)',
                      maxHeight: '340px',
                      overflowY: 'auto',
                      overscrollBehavior: 'contain',
                      zIndex: 30,
                    }}
                  >
                    {/* ── Chats section ─────────────────────────────── */}
                    {sessions.length > 0 && (
                      <>
                        <div style={{
                          padding: '0.7rem 1rem 0.35rem',
                          fontSize: '0.68rem', fontWeight: 600, letterSpacing: '0.08em',
                          color: 'var(--text-muted)', textTransform: 'uppercase',
                          display: 'flex', alignItems: 'center', gap: '0.5rem',
                        }}>
                          <div style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--color-active)', opacity: 0.8 }} />
                          chats
                        </div>
                        {sessions.map((s, i) => (
                          <div
                            key={s.id}
                            style={{
                              display: 'flex', alignItems: 'stretch',
                              borderTop: i === 0 ? 'none' : '1px solid var(--border)',
                              position: 'relative',
                            }}
                          >
                            <button
                              onClick={() => {
                                setMessages(s.messages)
                                setHeroMode(false)
                                setShowHistory(false)
                                try { localStorage.setItem('pebble_chat_messages', JSON.stringify(s.messages)) } catch {}
                              }}
                              style={{
                                flex: 1, display: 'flex', alignItems: 'flex-start', gap: '0.65rem',
                                padding: '0.65rem 0.6rem 0.65rem 1rem', background: 'none', border: 'none',
                                cursor: 'pointer', textAlign: 'left', transition: 'background 0.15s ease', minWidth: 0,
                              }}
                              onMouseEnter={e => { e.currentTarget.style.background = 'var(--accent-soft)' }}
                              onMouseLeave={e => { e.currentTarget.style.background = 'none' }}
                            >
                              <div style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--color-active)', flexShrink: 0, marginTop: '0.38rem', opacity: 0.6 }} />
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ fontSize: '0.84rem', fontWeight: 500, color: 'var(--text-primary)', lineHeight: 1.35, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                  {s.title.length > 44 ? s.title.slice(0, 42) + '…' : s.title}
                                </div>
                                <div style={{ fontSize: '0.71rem', color: 'var(--text-muted)', marginTop: '0.1rem' }}>
                                  {new Date(s.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                                  {' · '}{s.msgCount} message{s.msgCount !== 1 ? 's' : ''}
                                </div>
                              </div>
                            </button>
                            {/* Delete X button */}
                            <button
                              onClick={e => handleDeleteSession(e, s.id)}
                              title="delete this chat"
                              style={{
                                flexShrink: 0, width: 32, background: 'none', border: 'none',
                                cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                                color: 'var(--text-muted)', opacity: 0.45, transition: 'opacity 0.15s ease',
                                paddingRight: '0.5rem',
                              }}
                              onMouseEnter={e => { e.currentTarget.style.opacity = '1'; e.currentTarget.style.color = 'var(--color-ai)' }}
                              onMouseLeave={e => { e.currentTarget.style.opacity = '0.45'; e.currentTarget.style.color = 'var(--text-muted)' }}
                            >
                              <svg width="11" height="11" viewBox="0 0 12 12" fill="none">
                                <path d="M2 2L10 10M10 2L2 10" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
                              </svg>
                            </button>
                          </div>
                        ))}
                      </>
                    )}

                    {/* ── Tasks section ─────────────────────────────── */}
                    {taskGroups.length > 0 && (
                      <>
                        <div style={{
                          padding: sessions.length > 0 ? '0.8rem 1rem 0.35rem' : '0.7rem 1rem 0.35rem',
                          fontSize: '0.68rem', fontWeight: 600, letterSpacing: '0.08em',
                          color: 'var(--text-muted)', textTransform: 'uppercase',
                          display: 'flex', alignItems: 'center', gap: '0.5rem',
                          borderTop: sessions.length > 0 ? '1px solid var(--border)' : 'none',
                        }}>
                          <div style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--color-queued)', opacity: 0.8 }} />
                          tasks
                        </div>
                        {[...taskGroups].slice(-4).reverse().map((g, i) => (
                          <button key={g.id}
                            onClick={() => { setShowHistory(false); navigate('/tasks') }}
                            style={{
                              width: '100%', display: 'flex', alignItems: 'flex-start', gap: '0.65rem',
                              padding: '0.65rem 1rem', background: 'none', border: 'none',
                              borderTop: i === 0 ? 'none' : '1px solid var(--border)',
                              cursor: 'pointer', textAlign: 'left', transition: 'background 0.15s ease',
                            }}
                            onMouseEnter={e => { e.currentTarget.style.background = 'var(--accent-soft)' }}
                            onMouseLeave={e => { e.currentTarget.style.background = 'none' }}
                          >
                            <div style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--color-queued)', flexShrink: 0, marginTop: '0.38rem', opacity: 0.6 }} />
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontSize: '0.84rem', fontWeight: 500, color: 'var(--text-primary)', lineHeight: 1.35, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {g.name || 'untitled group'}
                              </div>
                              <div style={{ fontSize: '0.71rem', color: 'var(--text-muted)', marginTop: '0.1rem' }}>
                                {g.tasks.length} task{g.tasks.length !== 1 ? 's' : ''}
                                {g.tasks.filter(t => t.done).length > 0 && ` · ${g.tasks.filter(t => t.done).length} done`}
                              </div>
                            </div>
                          </button>
                        ))}
                      </>
                    )}

                    {/* ── Documents section ─────────────────────────── */}
                    {recentDocs.length > 0 && (
                      <>
                        <div style={{
                          padding: (sessions.length > 0 || taskGroups.length > 0) ? '0.8rem 1rem 0.35rem' : '0.7rem 1rem 0.35rem',
                          fontSize: '0.68rem', fontWeight: 600, letterSpacing: '0.08em',
                          color: 'var(--text-muted)', textTransform: 'uppercase',
                          display: 'flex', alignItems: 'center', gap: '0.5rem',
                          borderTop: (sessions.length > 0 || taskGroups.length > 0) ? '1px solid var(--border)' : 'none',
                        }}>
                          <div style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--color-ai)', opacity: 0.8 }} />
                          documents
                        </div>
                        {recentDocs.map((d, i) => (
                          <button key={d.id || i}
                            onClick={() => { setShowHistory(false); navigate('/documents') }}
                            style={{
                              width: '100%', display: 'flex', alignItems: 'flex-start', gap: '0.65rem',
                              padding: '0.65rem 1rem', background: 'none', border: 'none',
                              borderTop: i === 0 ? 'none' : '1px solid var(--border)',
                              cursor: 'pointer', textAlign: 'left', transition: 'background 0.15s ease',
                            }}
                            onMouseEnter={e => { e.currentTarget.style.background = 'var(--accent-soft)' }}
                            onMouseLeave={e => { e.currentTarget.style.background = 'none' }}
                          >
                            <div style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--color-ai)', flexShrink: 0, marginTop: '0.38rem', opacity: 0.6 }} />
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontSize: '0.84rem', fontWeight: 500, color: 'var(--text-primary)', lineHeight: 1.35, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {d.file_name || d.name || 'untitled document'}
                              </div>
                              {d.uploaded_at && (
                                <div style={{ fontSize: '0.71rem', color: 'var(--text-muted)', marginTop: '0.1rem' }}>
                                  {new Date(d.uploaded_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                                </div>
                              )}
                            </div>
                          </button>
                        ))}
                      </>
                    )}

                    {/* ── Empty state ───────────────────────────────── */}
                    {sessions.length === 0 && taskGroups.length === 0 && recentDocs.length === 0 && (
                      <div style={{ padding: '1.2rem 1rem', textAlign: 'center' }}>
                        <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', lineHeight: 1.6 }}>
                          nothing yet.
                        </div>
                        <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', opacity: 0.7, marginTop: '0.2rem' }}>
                          start a chat, add tasks, or upload a doc.
                        </div>
                      </div>
                    )}

                    {/* ── Ask Pebble footer ─────────────────────────── */}
                    <button
                      onClick={() => { setShowHistory(false); handlePreviousWork() }}
                      style={{
                        width: '100%', padding: '0.65rem 1rem', background: 'none', border: 'none',
                        cursor: 'pointer', fontSize: '0.78rem', color: 'var(--text-muted)',
                        textAlign: 'center', transition: 'background 0.15s ease',
                        borderTop: '1px solid var(--border)',
                      }}
                      onMouseEnter={e => { e.currentTarget.style.background = 'var(--accent-soft)' }}
                      onMouseLeave={e => { e.currentTarget.style.background = 'none' }}
                    >
                      ask pebble instead →
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          </motion.div>
        )}

        {/* ── CHAT VIEW — after user sends a message ────────────────────── */}
        {!heroMode && (
          <motion.div
            key="chat"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0, transition: { duration: 0.4, ease: [0.4, 0, 0.2, 1] } }}
            exit={{ opacity: 0, transition: { duration: 0.25 } }}
            style={{
              flex:          1,
              overflowY:     'auto',
              padding:       '1.5rem 1rem 0.5rem',
              display:       'flex',
              flexDirection: 'column',
              minHeight:     0,
            }}
          >
            <div
              style={{
                maxWidth:      640,
                width:         '100%',
                margin:        '0 auto',
                display:       'flex',
                flexDirection: 'column',
                gap:           '1rem',
              }}
            >
              {/* New chat button — sits at the top of the message list */}
              <div style={{ display: 'flex', justifyContent: 'flex-end', paddingBottom: '0.25rem' }}>
                <button
                  onClick={handleNewChat}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '0.35rem',
                    background: 'var(--color-pebble-soft)',
                    border: '1px solid color-mix(in srgb, var(--color-pebble) 28%, transparent)',
                    borderRadius: 99, cursor: 'pointer',
                    color: 'var(--color-pebble)', fontSize: '0.82rem', fontWeight: 500,
                    padding: '0.45rem 1.1rem', minHeight: 36,
                    transition: 'all 0.2s ease',
                  }}
                  onMouseEnter={e => {
                    e.currentTarget.style.background = 'color-mix(in srgb, var(--color-pebble) 18%, transparent)'
                    e.currentTarget.style.borderColor = 'color-mix(in srgb, var(--color-pebble) 50%, transparent)'
                  }}
                  onMouseLeave={e => {
                    e.currentTarget.style.background = 'var(--color-pebble-soft)'
                    e.currentTarget.style.borderColor = 'color-mix(in srgb, var(--color-pebble) 28%, transparent)'
                  }}
                >
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                    <path d="M6 2V10M2 6H10" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
                  </svg>
                  new chat
                </button>
              </div>

              {messages.map(msg => (
                <motion.div
                  key={msg.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0, transition: { duration: 0.38, ease: [0.4, 0, 0.2, 1] } }}
                >
                  {msg.role === 'task-preview-loading' ? (
                    <PulseDot phrase="thinking of the right task..." />
                  ) : msg.role === 'task-choice' ? (
                    <TaskChoiceCard
                      task={msg.task}
                      onAddToTasks={() => handleChooseAddTask(msg.id, msg.task)}
                      onFocusNow={() => handleChooseFocus(msg.id, msg.task)}
                      onDismiss={() => handleDismissChoice(msg.id)}
                    />
                  ) : msg.role === 'task-preview' ? (
                    <TaskPreviewCard
                      task={msg.task}
                      onConfirm={editedTask => handleConfirmTask(editedTask, msg.id)}
                      onRevise={() => handleReviseTask(msg.id)}
                    />
                  ) : msg.role === 'assistant' ? (
                    <AiBubble content={msg.content} buttons={msg.buttons} navigate={navigate} onTaskNavigate={handleTaskNavigate} />
                  ) : (
                    <UserBubble content={msg.content} userName={prefs.name} />
                  )}
                </motion.div>
              ))}

              {/* In-progress streaming bubble */}
              <AnimatePresence>
                {isStreaming && (
                  <motion.div
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0, transition: { duration: 0.3 } }}
                    exit={{ opacity: 0, transition: { duration: 0.2 } }}
                  >
                    {streamingContent
                      ? <AiBubble content={streamingContent} buttons={pendingButtons} navigate={navigate} onTaskNavigate={handleTaskNavigate} isStreaming />
                      : <PulseDot />
                    }
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Merge preview card — shown when Pebble detects a merge_tasks action */}
              <AnimatePresence>
                {mergePending && (
                  <MergePreviewCard
                    mergeData={mergePending}
                    onConfirm={handleConfirmMerge}
                    onDismiss={() => setMergePending(null)}
                  />
                )}
              </AnimatePresence>

              <div ref={messagesEndRef} />
            </div>
          </motion.div>
        )}

      </AnimatePresence>

      {/* ── Input area — always visible ───────────────────────────────────── */}
      <div style={{ padding: '0.75rem 1rem 1.25rem', flexShrink: 0 }}>
        <div
          style={{
            maxWidth:   640,
            margin:     '0 auto',
            display:    'flex',
            gap:        '0.75rem',
            alignItems: 'flex-end',
          }}
        >
          <textarea
            ref={inputRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={PLACEHOLDERS[placeholderIdx]}
            rows={2}
            disabled={isStreaming}
            data-walkthrough="chat-input"
            style={{
              flex:         1,
              resize:       'none',
              borderRadius: 12,
              opacity:      isStreaming ? 0.55 : 1,
              transition:   'opacity 0.25s ease',
            }}
            aria-label="Message Pebble"
          />
          <button
            className="btn btn-primary"
            onClick={handleSend}
            disabled={!input.trim() || isStreaming}
            style={{ flexShrink: 0 }}
            aria-label="Send message"
          >
            Send
          </button>
        </div>
      </div>


    </motion.div>
  )
}
