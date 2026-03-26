import { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence, Reorder } from 'framer-motion'
import { useDispatch, useSelector } from 'react-redux'
import { useNavigate, useLocation } from 'react-router-dom'
import { tasksActions } from '../store'
import { decompose, loadTasks, saveTasks, chatStream, fetchTaskDescription, fetchSmartPlan, toBackendGroups } from '../utils/api'
import { DndContext, closestCenter, PointerSensor, useSensor, useSensors, useDroppable } from '@dnd-kit/core'
import {
  SortableContext, verticalListSortingStrategy, useSortable,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { splitIntoBubbles, renderMarkdown } from '../utils/bubbles'
import { PriorityPicker } from '../components/PriorityChip'

// ── Helpers ───────────────────────────────────────────────────────────────── //

const COMPLETION_MESSAGES = [
  "you finished everything here. that's real progress.",
  "all done with this one. you showed up and that matters.",
  "this group is complete. one less thing to carry.",
  "done. every task you finish is a thing you did, not just a thing you planned.",
  "you got through all of it. take a breath.",
  "that's everything in this group. nicely done.",
  "all clear here. that took something.",
]


const TITLE_CASE_LOWER = new Set(['a', 'an', 'the', 'and', 'but', 'or', 'nor', 'for', 'so', 'yet', 'at', 'by', 'in', 'of', 'on', 'to', 'up', 'via', 'with'])
function toTitleCase(str) {
  if (!str) return str
  return str.trim().split(/\s+/).map((word, i) => {
    const lower = word.toLowerCase()
    return (i === 0 || !TITLE_CASE_LOWER.has(lower))
      ? lower.charAt(0).toUpperCase() + lower.slice(1)
      : lower
  }).join(' ')
}

function sumMinutes(tasks) {
  return tasks.filter(t => !t.done && !t.paused).reduce((s, t) => s + (t.duration_minutes || 0), 0)
}

// ── Pebble-voice group subtitle helpers ──────────────────────────────────── //
// These live here so they can be referenced by the personality system.
// isPermanent = true for the "My Tasks" group (uses "tasks" not "steps").

export function groupTaskPhrase(done, total, isPermanent = false) {
  if (total === 0) return ''
  const remaining = total - done

  // All done
  if (done >= total) return 'all done'

  // Last one standing
  if (remaining === 1) return 'just 1 left'

  // In progress
  if (done > 0) {
    // More done than left and few remaining → feels like the end is near
    if (remaining <= 3 && done >= remaining) return 'almost there'
    // Small enough to count without feeling overwhelming
    if (remaining <= 9) return `${done} down, ${remaining} to go`
    // Large remaining — soften it, don't show the full number
    return `${done} done, more to go`
  }

  // Nothing started yet
  if (isPermanent || total === 1) {
    return total === 1 ? '1 task' : `${total} tasks`
  }
  if (total === 2) return 'a couple steps'
  if (total <= 5) return 'a few steps'
  if (total <= 10) return `${total} steps`
  return 'quite a few steps'   // 11+ — don't show the raw number, it can overwhelm
}

export function groupTimePhrase(minutes, inProgress = false) {
  if (!minutes || minutes <= 0) return null
  let phrase
  if (minutes < 15)       phrase = 'a quick one'
  else if (minutes < 30)  phrase = 'a short session'
  else if (minutes < 60)  phrase = 'a sit-down'
  else if (minutes < 120) phrase = 'a longer stretch'
  else                    phrase = 'a few sessions'
  return inProgress ? `${phrase} left` : phrase
}

// Compute a friendly due label from an ISO date string
function getDueLabel(isoDate) {
  if (!isoDate) return null
  const date = new Date(isoDate)
  const today = new Date()
  const todayMs = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate())
  const dueMs   = Date.UTC(date.getFullYear(),  date.getMonth(),  date.getDate())
  const days = Math.round((dueMs - todayMs) / 86_400_000)
  if (days === 0)  return 'today'
  if (days === 1)  return 'tomorrow'
  if (days === -1) return 'yesterday'
  if (days > 1 && days < 7) return date.toLocaleDateString('en-US', { weekday: 'long' })
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

// ── Animation variants ────────────────────────────────────────────────────── //

const pageVariants = {
  initial: { opacity: 0, y: 20 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.65, ease: [0.25, 0.46, 0.45, 0.94] } },
  exit:    { opacity: 0, y: -8,  transition: { duration: 0.45, ease: [0.25, 0.46, 0.45, 0.94] } },
}

const stagger = {
  initial: {},
  animate: { transition: { staggerChildren: 0.12 } },
}

const item = {
  initial: { opacity: 0, y: 10 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.5, ease: [0.25, 0.46, 0.45, 0.94] } },
}

// ── SortableTaskItem — whole row is the drag surface ─────────────────────── //

function SortableTaskItem({ id, groupId, children }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id, data: { type: 'task', groupId } })
  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      className="task-row-wrapper"
      style={{
        transform: CSS.Transform.toString(transform),
        transition: transition || 'transform 200ms cubic-bezier(0.25, 1, 0.5, 1)',
        zIndex: isDragging ? 50 : undefined,
        position: 'relative',
        boxShadow: isDragging ? '0 8px 24px rgba(0,0,0,0.1)' : undefined,
        borderRadius: isDragging ? 10 : undefined,
        background: isDragging ? 'var(--bg-card)' : undefined,
        opacity: isDragging ? 0.88 : 1,
        cursor: isDragging ? 'grabbing' : 'grab',
        touchAction: 'none',
      }}
    >
      {children({ isDragging })}
    </div>
  )
}

// ── SortableGroupItem — drag handle for whole group card reordering ─────── //

function SortableGroupItem({ id, children }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id, data: { type: 'group' } })
  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition: transition || 'transform 200ms cubic-bezier(0.25, 1, 0.5, 1)',
        zIndex: isDragging ? 20 : undefined,
        opacity: isDragging ? 0.85 : 1,
      }}
      {...attributes}
      {...listeners}
    >
      {children}
    </div>
  )
}

// ── DroppableGroupWrapper — makes a non-sortable group card a valid drop target ── //

function DroppableGroupWrapper({ id, children }) {
  const { setNodeRef } = useDroppable({ id, data: { type: 'group' } })
  return <div ref={setNodeRef}>{children}</div>
}

// ── TaskCircle ────────────────────────────────────────────────────────────── //

function TaskCircle({ done, active, onClick, size = 20 }) {
  return (
    <motion.button
      onClick={e => { e.stopPropagation(); if (!done) onClick() }}
      aria-label={done ? 'Task complete' : 'Mark complete'}
      whileHover={done ? {} : { scale: 1.12 }}
      whileTap={done ? {} : { scale: 0.9 }}
      style={{
        width: size, height: size, borderRadius: '50%', flexShrink: 0,
        border: `2px solid ${done ? 'var(--color-done)' : active ? 'var(--color-active)' : 'var(--color-inactive)'}`,
        background: done ? 'var(--color-done)' : 'transparent',
        cursor: done ? 'default' : 'pointer',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        transition: 'all 0.3s ease', padding: 0,
      }}
    >
      <AnimatePresence>
        {done && (
          <motion.svg
            key="check"
            initial={{ opacity: 0, scale: 0.4 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
            width={size * 0.5} height={size * 0.5} viewBox="0 0 10 10" fill="none"
          >
            <motion.path
              d="M1.5 5L4 7.5L8.5 2.5"
              stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"
              initial={{ pathLength: 0 }}
              animate={{ pathLength: 1 }}
              transition={{ duration: 0.3, ease: 'easeOut' }}
            />
          </motion.svg>
        )}
      </AnimatePresence>
    </motion.button>
  )
}

// ── ColorSwatches ─────────────────────────────────────────────────────────── //
// Reusable 4-swatch row for group color picking.

function ColorSwatches({ value, onChange, size = 16, disabledKeys = [] }) {
  return (
    <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
      {GROUP_COLOR_KEYS.map(key => {
        const isActive   = value === key
        const isDisabled = disabledKeys.includes(key)
        const clr = GROUP_COLORS[key]
        return (
          <button
            key={key}
            onClick={e => { e.stopPropagation(); if (!isDisabled) onChange(key) }}
            aria-label={`${key} color${isDisabled ? ' (already used)' : ''}`}
            disabled={isDisabled}
            style={{
              width: size, height: size, borderRadius: '50%',
              background: clr.css,
              border: isActive ? `2px solid var(--text-primary)` : '2px solid transparent',
              outline: isActive ? `2px solid ${clr.css}` : 'none',
              outlineOffset: 2,
              cursor: isDisabled ? 'not-allowed' : 'pointer', padding: 0, flexShrink: 0,
              opacity: isDisabled ? 0.3 : 1,
              transition: 'transform 0.15s ease, outline 0.15s ease, opacity 0.15s ease',
            }}
            onMouseEnter={e => { if (!isActive && !isDisabled) e.currentTarget.style.transform = 'scale(1.25)' }}
            onMouseLeave={e => { e.currentTarget.style.transform = 'scale(1)' }}
          />
        )
      })}
    </div>
  )
}

// ── MoreMenu ──────────────────────────────────────────────────────────────── //

function MoreMenu({ onClose, onEdit, onPause, onDelete, taskId, currentGroupId, triggerRef }) {
  const dispatch  = useDispatch()
  const groups    = useSelector(s => s.tasks.groups)
  const menuRef   = useRef(null)
  const [movingOpen, setMovingOpen] = useState(false)

  const otherGroups = groups
    .filter(g => g.id !== currentGroupId)
    .filter((g, i, arr) => arr.findIndex(x => x.name === g.name) === i)

  useEffect(() => {
    function handleClick(e) {
      if (triggerRef?.current && triggerRef.current.contains(e.target)) return
      if (menuRef.current && !menuRef.current.contains(e.target)) onClose()
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [onClose, triggerRef])

  const menuItems = [
    { id: 'edit',   dot: 'var(--color-upcoming)', label: 'edit task',  desc: 'change text or time estimate' },
    { id: 'move',   dot: 'var(--color-paused)',   label: 'move to...', desc: 'send to another group'        },
    { id: 'pause',  dot: 'var(--color-paused)',   label: 'pause',      desc: 'set aside without deleting'  },
    { id: 'delete', dot: 'var(--color-inactive)', label: 'delete',     desc: 'remove permanently', divider: true },
  ]

  function menuRow(mi) {
    return (
      <button
        key={mi.id}
        onClick={() => {
          if (mi.id === 'edit')   { onEdit(); onClose() }
          else if (mi.id === 'pause')  { onPause(); onClose() }
          else if (mi.id === 'delete') { onDelete(); onClose() }
          else if (mi.id === 'move')   { setMovingOpen(o => !o) }
        }}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', gap: '0.7rem',
          padding: '0.55rem 0.25rem', background: 'none', border: 'none',
          cursor: 'pointer', textAlign: 'left', borderRadius: 6,
          transition: 'background 0.15s ease',
        }}
        onMouseEnter={e => { e.currentTarget.style.background = 'var(--accent-soft)' }}
        onMouseLeave={e => { e.currentTarget.style.background = 'none' }}
      >
        <div style={{ width: 7, height: 7, borderRadius: '50%', background: mi.dot, flexShrink: 0 }} />
        <span style={{ fontSize: '0.85rem', fontWeight: 500, color: 'var(--text-primary)' }}>{mi.label}</span>
        <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginLeft: 'auto' }}>{mi.desc}</span>
      </button>
    )
  }

  return (
    <motion.div
      ref={menuRef}
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: 'auto' }}
      exit={{ opacity: 0, height: 0 }}
      transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
      style={{ overflow: 'hidden', borderTop: '1px solid var(--border)', marginTop: '0.65rem', paddingTop: '0.2rem' }}
    >
      {menuItems.map(mi => (
        <div key={mi.id}>
          {mi.divider && <div style={{ height: 1, background: 'var(--border)', margin: '0.25rem 0' }} />}
          {menuRow(mi)}
          {/* Move-to group list — inline, no modal */}
          {mi.id === 'move' && movingOpen && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.18 }}
              style={{ overflow: 'hidden', paddingLeft: '1.1rem', paddingBottom: '0.2rem' }}
            >
              {otherGroups.length === 0 ? (
                <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', padding: '0.3rem 0' }}>no other groups yet.</p>
              ) : otherGroups.map(g => (
                <button
                  key={g.id}
                  onClick={() => {
                    dispatch(tasksActions.moveTaskToGroup({ taskId, fromGroupId: currentGroupId, toGroupId: g.id }))
                    onClose()
                  }}
                  style={{
                    width: '100%', display: 'flex', alignItems: 'center', gap: '0.55rem',
                    padding: '0.4rem 0.25rem', background: 'none', border: 'none',
                    cursor: 'pointer', borderRadius: 5, transition: 'background 0.15s ease',
                  }}
                  onMouseEnter={e => e.currentTarget.style.background = 'var(--accent-soft)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'none'}
                >
                  <div style={{ width: 7, height: 7, borderRadius: '50%', background: GROUP_COLORS[g.groupColor || 'sage'].css, flexShrink: 0 }} />
                  <span style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>{g.name}</span>
                </button>
              ))}
            </motion.div>
          )}
        </div>
      ))}
    </motion.div>
  )
}

// ── CompletedTaskRow ──────────────────────────────────────────────────────── //

function CompletedTaskRow({ task }) {
  return (
    <motion.div
      layout
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, height: 0 }}
      transition={{ duration: 0.25 }}
      style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', padding: '0.5rem 0' }}
    >
      <TaskCircle done active={false} onClick={() => {}} size={18} />
      <span style={{ flex: 1, fontSize: '0.85rem', color: 'var(--text-muted)', textDecoration: 'line-through', opacity: 0.55 }}>
        {task.task_name}
      </span>
      <span style={{ fontSize: '0.72rem', color: 'var(--color-done)', fontWeight: 500 }}>done</span>
    </motion.div>
  )
}

// ── DueDateChip ───────────────────────────────────────────────────────────── //
// sky blue = 2+ days away | soft orange = today | lilac = overdue. Never red.

function DueDateChip({ due_date, due_label }) {
  if (!due_date) return null
  const today = new Date()
  const todayMs = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate())
  const d       = new Date(due_date)
  const dueMs   = Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())
  const days    = Math.round((dueMs - todayMs) / 86_400_000)

  const cfg = days < 0
    ? { color: 'var(--color-paused)',   bg: 'rgba(154,136,180,0.1)',  border: 'rgba(154,136,180,0.22)' }
    : days === 0
    ? { color: 'var(--color-ai)',       bg: 'rgba(224,160,96,0.12)',  border: 'rgba(224,160,96,0.3)'   }
    : { color: 'var(--color-upcoming)', bg: 'rgba(106,150,184,0.09)', border: 'rgba(106,150,184,0.2)'  }

  const label = due_label || getDueLabel(due_date) || d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })

  return (
    <span style={{
      fontSize: '0.68rem', padding: '2px 7px', borderRadius: 99,
      background: cfg.bg, border: `1px solid ${cfg.border}`, color: cfg.color,
      fontWeight: 500, flexShrink: 0, letterSpacing: '0.01em', lineHeight: 1.8,
      userSelect: 'none',
    }}>
      {label}
    </span>
  )
}

// ── TaskRow — unified expand-in-place task component ─────────────────────── //
// Replaces the old ActiveTaskCard + UpcomingTaskRow split.
// All non-completed tasks render in their list position.
// Clicking expands to reveal details + action buttons; clicking again collapses.

// ── OptInPills — the three ghost pill buttons shown in expanded task view ──── //
// ── Group color system ─────────────────────────────────────────────────────── //
// Four user-selectable colors for group left-border accents.
// Keyed by name so they survive serialization (stored in Redux / Cosmos).
const GROUP_COLORS = {
  sage:  { css: 'var(--color-active)',   soft: 'rgba(111,169,158,0.1)',  hex: '#6FA99E' },
  sky:   { css: 'var(--color-upcoming)', soft: 'rgba(106,150,184,0.1)',  hex: '#6A96B8' },
  lilac: { css: 'var(--color-paused)',   soft: 'rgba(154,136,180,0.1)',  hex: '#9A88B4' },
  amber: { css: 'var(--color-ai)',        soft: 'rgba(224,160,96,0.1)',   hex: '#E0A060' },
}
const GROUP_COLOR_KEYS = ['sage', 'sky', 'lilac', 'amber']

// ── Opt-in pill colors ────────────────────────────────────────────────────── //
// Three pills get the three non-chosen pebble colors.
// More vivid: solid border + always-on tinted background.
const _ALL_PILL_COLORS = [
  { key: 'sage',  color: 'var(--color-active)',   border: 'rgba(111,169,158,0.6)',  bg: 'rgba(111,169,158,0.1)'  },
  { key: 'sky',   color: 'var(--color-upcoming)', border: 'rgba(106,150,184,0.6)',  bg: 'rgba(106,150,184,0.1)'  },
  { key: 'lilac', color: 'var(--color-paused)',   border: 'rgba(154,136,180,0.6)',  bg: 'rgba(154,136,180,0.1)'  },
  { key: 'amber', color: 'var(--color-ai)',        border: 'rgba(224,160,96,0.6)',   bg: 'rgba(224,160,96,0.1)'   },
]

function OptInPills({ task, groupId }) {
  const dispatch = useDispatch()
  const prefs    = useSelector(s => s.prefs)
  const [activeField, setActiveField] = useState(null) // 'date' | 'time' | 'priority'
  const [dateVal, setDateVal]         = useState(task.due_date ? task.due_date.slice(0, 10) : '')
  const [timeVal, setTimeVal]         = useState(String(task.duration_minutes || ''))

  // Keep local fields in sync with external task updates (e.g. chat actions)
  useEffect(() => {
    if (activeField !== 'date') setDateVal(task.due_date ? task.due_date.slice(0, 10) : '')
  }, [task.due_date]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (activeField !== 'time') setTimeVal(String(task.duration_minutes || ''))
  }, [task.duration_minutes]) // eslint-disable-line react-hooks/exhaustive-deps

  function commitDate() {
    const iso = dateVal ? dateVal + 'T00:00:00Z' : null
    dispatch(tasksActions.updateTask({ groupId, taskId: task.id, due_date: iso, due_label: iso ? getDueLabel(iso) : null }))
    setActiveField(null)
  }
  function clearDate() {
    dispatch(tasksActions.updateTask({ groupId, taskId: task.id, due_date: null, due_label: null }))
    setDateVal('')
  }
  function commitTime() {
    const mins = parseInt(timeVal, 10)
    if (!isNaN(mins) && mins > 0) {
      dispatch(tasksActions.updateTask({ groupId, taskId: task.id, duration_minutes: mins, userSetTime: true }))
    }
    setActiveField(null)
  }
  function clearTime() {
    dispatch(tasksActions.updateTask({ groupId, taskId: task.id, userSetTime: false }))
    setTimeVal(String(task.duration_minutes || ''))
  }

  // The 3 pill colors = the 4 pebble colors minus whichever the user picked
  const chosen = prefs.pebbleColor || 'sage'
  const [dateClr, timeClr, priorityClr] = _ALL_PILL_COLORS.filter(c => c.key !== chosen)

  function pillBase(clr) {
    return {
      display: 'inline-flex', alignItems: 'center', gap: '0.28rem',
      fontSize: '0.72rem', color: clr.color, cursor: 'pointer',
      padding: '0.22rem 0.6rem', borderRadius: 99,
      border: `1px solid ${clr.border}`,
      background: clr.bg, fontFamily: 'inherit', fontWeight: 500,
      transition: 'border-color 0.18s ease, background 0.18s ease, transform 0.15s ease',
      letterSpacing: '0.01em', flexShrink: 0,
    }
  }

  return (
    <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', marginTop: '0.65rem' }}>

      {/* ── Date pill ── */}
      {!task.due_date ? (
        activeField === 'date' ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
            <input
              autoFocus
              type="date"
              value={dateVal}
              onChange={e => setDateVal(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') commitDate(); if (e.key === 'Escape') setActiveField(null) }}
              onClick={e => e.stopPropagation()}
              style={{ fontSize: '0.75rem', padding: '0.2rem 0.4rem', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text-primary)' }}
            />
            <button className="btn btn-primary" style={{ fontSize: '0.72rem', padding: '0.2rem 0.55rem' }} onClick={e => { e.stopPropagation(); commitDate() }}>set</button>
          </div>
        ) : (
          <button
            style={pillBase(dateClr)}
            onMouseEnter={e => { e.currentTarget.style.transform = 'scale(1.04)'; e.currentTarget.style.borderColor = dateClr.color }}
            onMouseLeave={e => { e.currentTarget.style.transform = 'scale(1)'; e.currentTarget.style.borderColor = dateClr.border }}
            onClick={e => { e.stopPropagation(); setActiveField('date') }}
          >
            <svg width="10" height="10" viewBox="0 0 12 12" fill="none" aria-hidden="true">
              <rect x="1" y="2" width="10" height="9" rx="1.5" stroke="currentColor" strokeWidth="1.2"/>
              <path d="M4 1v2M8 1v2M1 5h10" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
            </svg>
            add date
          </button>
        )
      ) : (
        // Date is set — clicking the chip clears it
        <button
          onClick={e => { e.stopPropagation(); clearDate() }}
          title="click to remove date"
          style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', opacity: 1, transition: 'opacity 0.18s ease' }}
          onMouseEnter={e => { e.currentTarget.style.opacity = '0.6' }}
          onMouseLeave={e => { e.currentTarget.style.opacity = '1' }}
        >
          <DueDateChip due_date={task.due_date} due_label={task.due_label} />
        </button>
      )}

      {/* ── Time pill ── */}
      {!task.userSetTime ? (
        activeField === 'time' ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
            <input
              autoFocus
              type="number"
              value={timeVal}
              onChange={e => setTimeVal(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') commitTime(); if (e.key === 'Escape') setActiveField(null) }}
              onClick={e => e.stopPropagation()}
              min={1} placeholder={String(task.duration_minutes || '')}
              style={{ width: 56, fontSize: '0.75rem', padding: '0.2rem 0.4rem', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text-primary)' }}
            />
            <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>min</span>
            <button className="btn btn-primary" style={{ fontSize: '0.72rem', padding: '0.2rem 0.55rem' }} onClick={e => { e.stopPropagation(); commitTime() }}>set</button>
          </div>
        ) : (
          <button
            style={pillBase(timeClr)}
            onMouseEnter={e => { e.currentTarget.style.transform = 'scale(1.04)'; e.currentTarget.style.borderColor = timeClr.color }}
            onMouseLeave={e => { e.currentTarget.style.transform = 'scale(1)'; e.currentTarget.style.borderColor = timeClr.border }}
            onClick={e => { e.stopPropagation(); setTimeVal(String(task.duration_minutes || '')); setActiveField('time') }}
          >
            <svg width="10" height="10" viewBox="0 0 12 12" fill="none" aria-hidden="true">
              <circle cx="6" cy="6" r="4.5" stroke="currentColor" strokeWidth="1.2"/>
              <path d="M6 3.5V6l1.5 1.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
            </svg>
            add time
          </button>
        )
      ) : (
        // Time is set — clicking the chip clears it
        <button
          onClick={e => { e.stopPropagation(); clearTime() }}
          title="click to remove time"
          style={{ fontSize: '0.72rem', color: timeClr.color, padding: '0.22rem 0.6rem', borderRadius: 99, border: `1px solid ${timeClr.border}`, background: timeClr.bg, cursor: 'pointer', fontFamily: 'inherit', transition: 'opacity 0.18s ease' }}
          onMouseEnter={e => { e.currentTarget.style.opacity = '0.6' }}
          onMouseLeave={e => { e.currentTarget.style.opacity = '1' }}
        >
          ~{task.duration_minutes} min
        </button>
      )}

      {/* ── Priority pill ── */}
      {task.priority == null ? (
        activeField === 'priority' ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
            <PriorityPicker
              priority={task.priority}
              onChange={p => { dispatch(tasksActions.updateTask({ groupId, taskId: task.id, priority: p })); setActiveField(null) }}
            />
          </div>
        ) : (
          <button
            style={pillBase(priorityClr)}
            onMouseEnter={e => { e.currentTarget.style.transform = 'scale(1.04)'; e.currentTarget.style.borderColor = priorityClr.color }}
            onMouseLeave={e => { e.currentTarget.style.transform = 'scale(1)'; e.currentTarget.style.borderColor = priorityClr.border }}
            onClick={e => { e.stopPropagation(); setActiveField('priority') }}
          >
            <svg width="10" height="10" viewBox="0 0 12 12" fill="none" aria-hidden="true">
              <path d="M2 2h8v6l-4-2-4 2V2z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round"/>
              <path d="M6 9v1.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
            </svg>
            add priority
          </button>
        )
      ) : (
        // Priority is set — click chip to clear it (same pattern as time)
        <button
          onClick={e => { e.stopPropagation(); dispatch(tasksActions.updateTask({ groupId, taskId: task.id, priority: null })); setActiveField(null) }}
          title="click to remove priority"
          style={{
            fontSize: '0.72rem', padding: '1px 7px', height: 18, lineHeight: 1,
            borderRadius: 99, cursor: 'pointer', fontWeight: 500,
            letterSpacing: '0.02em', display: 'inline-flex', alignItems: 'center',
            userSelect: 'none', flexShrink: 0, fontFamily: 'inherit',
            background: task.priority === 1 ? 'rgba(224,160,96,0.12)' : task.priority === 2 ? 'rgba(106,150,184,0.09)' : 'rgba(180,170,154,0.10)',
            border: task.priority === 1 ? '1px solid rgba(224,160,96,0.3)' : task.priority === 2 ? '1px solid rgba(106,150,184,0.2)' : '1px solid rgba(180,170,154,0.22)',
            color: task.priority === 1 ? 'var(--color-ai)' : task.priority === 2 ? 'var(--color-upcoming)' : 'var(--color-inactive)',
            transition: 'opacity 0.15s ease',
          }}
          onMouseEnter={e => { e.currentTarget.style.opacity = '0.6' }}
          onMouseLeave={e => { e.currentTarget.style.opacity = '1' }}
        >
          {task.priority === 1 ? 'high' : task.priority === 2 ? 'med' : 'low'}
        </button>
      )}

    </div>
  )
}

function TaskRow({ task, groupId, isExpanded, onToggleExpand, onComplete, onDelete, onOpenBreakdown, dimmed, isDragging }) {
  const dispatch = useDispatch()
  const navigate = useNavigate()
  const [moreOpen, setMoreOpen] = useState(false)
  const moreBtnRef = useRef(null)
  const [editing, setEditing]   = useState(false)
  const [editName, setEditName] = useState(task.task_name)

  // Keep edit name in sync if updated externally
  useEffect(() => {
    if (!editing) setEditName(task.task_name)
  }, [task.task_name, editing])

  async function saveEdit() {
    const name = editName.trim()
    if (!name) return
    const nameChanged = name !== task.task_name
    // Save the new name immediately (clear old nudge so it doesn't show stale text)
    dispatch(tasksActions.updateTask({
      groupId, taskId: task.id,
      task_name: name,
      ...(nameChanged ? { motivation_nudge: '' } : {}),
    }))
    setEditing(false)

    // Regenerate description via AI when the task name changes
    if (nameChanged) {
      try {
        const res = await fetchTaskDescription(name)
        if (res.description) dispatch(tasksActions.updateTask({ groupId, taskId: task.id, motivation_nudge: res.description }))
      } catch { /* silently fail — empty nudge is fine */ }
    }
  }

  // Chips shown on collapsed row — only when user explicitly set them
  const showDateChip     = !!task.due_date
  const showTimeChip     = !!task.userSetTime
  const showPriorityChip = task.priority != null

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: dimmed ? 0.3 : 1, y: 0 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.25 }}
      style={{
        borderRadius: 14,
        background: isExpanded ? 'var(--accent-soft)' : 'transparent',
        boxShadow: isExpanded ? 'inset 0 0 0 1px var(--border)' : 'none',
        transition: 'background 0.25s ease, box-shadow 0.25s ease',
        overflow: 'hidden',
      }}
    >
      {/* Collapsed row */}
      <div
        role="button"
        tabIndex={editing ? -1 : 0}
        aria-expanded={isExpanded}
        onKeyDown={e => { if (!editing && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); onToggleExpand() } }}
        style={{
          display: 'flex', gap: '0.55rem', alignItems: 'center',
          padding: isExpanded ? '0.65rem 0.75rem 0.45rem' : '0.5rem 0.5rem 0.5rem 0',
          minHeight: 44,
          cursor: editing ? 'default' : isDragging ? 'grabbing' : 'pointer',
          transition: 'padding 0.25s ease',
          outline: 'none',
        }}
        onClick={e => {
          if (editing) return
          if (e.target.closest('button') || e.target.tagName === 'INPUT') return
          onToggleExpand()
        }}
      >
        <TaskCircle done={false} active={isExpanded} onClick={() => { onComplete() }} size={isExpanded ? 20 : 18} />

        <div style={{ flex: 1, minWidth: 0 }}>
          {editing ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              <input
                autoFocus
                value={editName}
                onChange={e => setEditName(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') saveEdit(); if (e.key === 'Escape') setEditing(false) }}
                onClick={e => e.stopPropagation()}
                style={{ fontSize: '0.88rem', padding: '0.3rem 0.5rem', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text-primary)', flex: 1 }}
              />
              <button className="btn btn-primary" style={{ fontSize: '0.78rem', padding: '0.25rem 0.7rem' }} onClick={e => { e.stopPropagation(); saveEdit() }}>save</button>
              <button className="btn btn-ghost"   style={{ fontSize: '0.78rem', padding: '0.25rem 0.7rem' }} onClick={e => { e.stopPropagation(); setEditing(false) }}>cancel</button>
            </div>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap' }}>
              <span style={{
                fontSize: isExpanded ? '0.9rem' : '0.85rem',
                fontWeight: isExpanded ? 600 : 400,
                color: isExpanded ? 'var(--text-primary)' : 'var(--text-secondary)',
                lineHeight: 1.4,
                transition: 'font-size 0.2s ease, font-weight 0.2s ease',
              }}>
                {task.task_name}
              </span>
              {/* Opt-in chips — click to clear */}
              {showDateChip && (
                <button onClick={e => { e.stopPropagation(); dispatch(tasksActions.updateTask({ groupId, taskId: task.id, due_date: null, due_label: null })) }} title="click to remove date"
                  style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', transition: 'opacity 0.18s ease' }}
                  onMouseEnter={e => e.currentTarget.style.opacity = '0.55'} onMouseLeave={e => e.currentTarget.style.opacity = '1'}>
                  <DueDateChip due_date={task.due_date} due_label={task.due_label} />
                </button>
              )}
              {showTimeChip && (
                <button onClick={e => { e.stopPropagation(); dispatch(tasksActions.updateTask({ groupId, taskId: task.id, userSetTime: false })) }} title="click to remove time"
                  style={{ fontSize: '0.7rem', color: 'var(--text-muted)', padding: '1px 6px', borderRadius: 99, border: '1px solid var(--border)', background: 'none', cursor: 'pointer', fontFamily: 'inherit', transition: 'opacity 0.18s ease' }}
                  onMouseEnter={e => e.currentTarget.style.opacity = '0.55'} onMouseLeave={e => e.currentTarget.style.opacity = '1'}>
                  ~{task.duration_minutes} min
                </button>
              )}
              {showPriorityChip && (
                <button
                  onClick={e => { e.stopPropagation(); dispatch(tasksActions.updateTask({ groupId, taskId: task.id, priority: 2 })) }}
                  title="click to remove priority"
                  style={{
                    fontSize: '0.72rem', padding: '1px 7px', height: 18, lineHeight: 1,
                    borderRadius: 99, cursor: 'pointer', fontWeight: 500,
                    letterSpacing: '0.02em', display: 'inline-flex', alignItems: 'center',
                    userSelect: 'none', flexShrink: 0, fontFamily: 'inherit',
                    background: task.priority === 1 ? 'rgba(224,160,96,0.12)' : 'rgba(180,170,154,0.10)',
                    border: task.priority === 1 ? '1px solid rgba(224,160,96,0.3)' : '1px solid rgba(180,170,154,0.22)',
                    color: task.priority === 1 ? 'var(--color-ai)' : 'var(--color-inactive)',
                    transition: 'opacity 0.15s ease',
                  }}
                  onMouseEnter={e => { e.currentTarget.style.opacity = '0.6' }}
                  onMouseLeave={e => { e.currentTarget.style.opacity = '1' }}
                >
                  {task.priority === 1 ? 'high' : 'low'}
                </button>
              )}
            </div>
          )}
        </div>

        {/* Expand chevron */}
        {!editing && (
          <motion.span
            animate={{ rotate: isExpanded ? 90 : 0 }}
            transition={{ duration: 0.2 }}
            style={{ color: 'var(--text-muted)', fontSize: '0.82rem', flexShrink: 0, lineHeight: 1, paddingRight: 2 }}
          >
            ›
          </motion.span>
        )}
      </div>

      {/* Expandable details */}
      <AnimatePresence initial={false}>
        {isExpanded && !editing && (
          <motion.div
            key="expanded"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1, transition: { height: { duration: 0.3, ease: [0.4,0,0.2,1] }, opacity: { duration: 0.2, delay: 0.1 } } }}
            exit={{ height: 0, opacity: 0, transition: { height: { duration: 0.25, ease: [0.4,0,0.2,1] }, opacity: { duration: 0.15 } } }}
            style={{ overflow: 'hidden' }}
          >
            <div style={{ padding: '0 0.75rem 0.85rem', paddingLeft: '2.2rem' }}>

              {/* Description / motivation nudge */}
              {task.motivation_nudge && (
                <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '0.6rem', lineHeight: 1.55 }}>
                  {task.motivation_nudge}
                </div>
              )}

              {/* AI nudge */}
              {task.nudgeText && (
                <div style={{
                  marginBottom: '0.65rem',
                  background: 'rgba(200,148,80,0.09)', border: '1px solid rgba(200,148,80,0.18)',
                  borderRadius: 8, padding: '0.5rem 0.75rem',
                  fontSize: '0.8rem', color: 'var(--color-ai)', lineHeight: 1.5,
                }}>
                  {task.nudgeText}
                </div>
              )}

              {/* Action buttons */}
              <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', alignItems: 'center' }}>
                <button
                  className="btn btn-ghost"
                  style={{
                    fontSize: '0.78rem', padding: '0.28rem 0.75rem',
                    color: 'var(--color-active)',
                    borderColor: 'color-mix(in srgb, var(--color-active) 45%, transparent)',
                  }}
                  onClick={e => { e.stopPropagation(); onOpenBreakdown?.({ task, groupId }) }}
                >
                  break down
                </button>
                <button
                  className="btn btn-ghost"
                  style={{ fontSize: '0.78rem', padding: '0.28rem 0.75rem' }}
                  onClick={e => {
                    e.stopPropagation()
                    dispatch(tasksActions.setFocusGroup(groupId))
                    dispatch(tasksActions.setFocusTask(task.id))
                    navigate('/focus')
                  }}
                >
                  focus on this
                </button>
                <button
                  ref={moreBtnRef}
                  className="btn btn-ghost"
                  style={{ fontSize: '0.78rem', padding: '0.28rem 0.65rem' }}
                  onClick={e => { e.stopPropagation(); setMoreOpen(o => !o) }}
                  aria-expanded={moreOpen}
                >
                  more ···
                </button>
              </div>

              {/* Opt-in detail pills */}
              <OptInPills task={task} groupId={groupId} />

              {/* More menu */}
              <AnimatePresence>
                {moreOpen && (
                  <MoreMenu
                    onClose={() => setMoreOpen(false)}
                    onEdit={() => { setEditing(true) }}
                    onPause={() => dispatch(tasksActions.pauseTask({ groupId, taskId: task.id }))}
                    onDelete={onDelete}
                    taskId={task.id}
                    currentGroupId={groupId}
                    triggerRef={moreBtnRef}
                  />
                )}
              </AnimatePresence>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}

// ── InlineAddTask — dead-simple type+enter task creation inside a group ─── //

function InlineAddTask({ groupId }) {
  const dispatch = useDispatch()
  const [val, setVal] = useState('')
  const inputRef = useRef(null)

  async function submit() {
    const name = val.trim()
    if (!name) return
    const taskId = Math.random().toString(36).slice(2, 10)
    dispatch(tasksActions.addTaskToGroup({ groupId, task_name: name, id: taskId }))
    setVal('')
    inputRef.current?.focus()
    // Async: generate AI description — fires and forgets, updates task when ready
    try {
      const res = await fetchTaskDescription(name)
      if (res.description) dispatch(tasksActions.updateTask({ groupId, taskId, motivation_nudge: res.description }))
    } catch { /* silently fail — empty nudge is fine */ }
  }

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: '0.5rem',
      padding: '0.45rem 0.6rem 0.45rem 0.75rem',
      marginTop: '0.35rem',
    }}>
      <input
        ref={inputRef}
        className="no-ring"
        value={val}
        onChange={e => setVal(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter') submit() }}
        placeholder="add a task..."
        style={{
          flex: 1, background: 'none', border: 'none', outline: 'none',
          fontSize: '0.82rem', color: 'var(--text-primary)',
          fontFamily: 'inherit', padding: 0,
        }}
      />
      {val.trim() && (
        <button
          onClick={submit}
          style={{
            background: 'none', border: 'none', cursor: 'pointer',
            fontSize: '0.72rem', color: 'var(--color-active)',
            fontFamily: 'inherit', padding: '0.15rem 0.4rem',
            borderRadius: 6, transition: 'opacity 0.15s ease',
          }}
          onMouseEnter={e => { e.currentTarget.style.opacity = '0.7' }}
          onMouseLeave={e => { e.currentTarget.style.opacity = '1' }}
        >
          add
        </button>
      )}
    </div>
  )
}

// ── TaskGroupCard ─────────────────────────────────────────────────────────── //

function TaskGroupCard({ group, isOpen, onToggle, timeFilter, timeFilterActive, onOpenBreakdown, showCompleted, isPermanent, isDropTarget, onDeleteGroup }) {
  const dispatch = useDispatch()
  const navigate = useNavigate()

  const [confirmDelete, setConfirmDelete] = useState(false)
  const [confirmClearAll, setConfirmClearAll] = useState(false)
  const [nameEdit, setNameEdit]   = useState(false)
  const [nameVal,  setNameVal]    = useState(group.name)
  const nameInputRef              = useRef(null)
  const completionMsgRef          = useRef(
    COMPLETION_MESSAGES[Math.floor(Math.random() * COMPLETION_MESSAGES.length)]
  )

  // Keep nameVal in sync if the group name changes externally
  useEffect(() => {
    if (!nameEdit) setNameVal(group.name)
  }, [group.name, nameEdit])

  // Which task is currently expanded (shows details + action buttons)
  const [expandedTaskId, setExpandedTaskId] = useState(null)

  const pendingTasks   = group.tasks.filter(t => !t.done && !t.paused)
  const completedTasks = group.tasks.filter(t => t.done)
  const totalUnpaused  = group.tasks.filter(t => !t.paused).length
  const doneCount      = group.tasks.filter(t => t.done && !t.paused).length
  const timeLeft       = sumMinutes(group.tasks)
  const allDone        = totalUnpaused > 0 && doneCount >= totalUnpaused

  // Earliest incomplete task with a past due date (drives overdue chip on header)
  const groupOverdueDate = (() => {
    const now = new Date()
    const todayMs = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())
    const ms = group.tasks
      .filter(t => !t.done && !t.paused && t.due_date)
      .map(t => { const d = new Date(t.due_date); return Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) })
      .filter(m => m < todayMs)
    return ms.length > 0 ? new Date(Math.min(...ms)) : null
  })()

  // Auto-expand first pending task when the group opens
  useEffect(() => {
    if (isOpen && !expandedTaskId && pendingTasks.length > 0) {
      setExpandedTaskId(pendingTasks[0].id)
    }
    if (!isOpen) setExpandedTaskId(null)
  }, [isOpen]) // eslint-disable-line react-hooks/exhaustive-deps

  function handleToggleExpand(taskId) {
    setExpandedTaskId(cur => cur === taskId ? null : taskId)
  }

  function handleComplete(taskId) {
    dispatch(tasksActions.completeTask({ groupId: group.id, taskId }))
    if (expandedTaskId === taskId) {
      // Auto-advance to next pending task
      const nextTask = pendingTasks.find(t => t.id !== taskId)
      setExpandedTaskId(nextTask?.id ?? null)
    }
  }

  const leftBorderColor = GROUP_COLORS[group.groupColor || 'sage'].css

  const [colorPickerOpen, setColorPickerOpen] = useState(false)
  const colorPickerRef = useRef(null)

  // Close color picker on outside-click
  useEffect(() => {
    if (!colorPickerOpen) return
    function handleOutside(e) {
      if (colorPickerRef.current && !colorPickerRef.current.contains(e.target)) {
        setColorPickerOpen(false)
      }
    }
    document.addEventListener('mousedown', handleOutside)
    return () => document.removeEventListener('mousedown', handleOutside)
  }, [colorPickerOpen])

  return (
    <motion.div
      layout
      style={{
        background: isDropTarget ? 'color-mix(in srgb, var(--color-pebble) 6%, var(--bg-card))' : 'var(--bg-card)',
        border: isDropTarget ? '1px solid color-mix(in srgb, var(--color-pebble) 40%, transparent)' : '1px solid var(--border)',
        borderLeft: `3px solid ${isDropTarget ? 'var(--color-pebble)' : leftBorderColor}`,
        borderRadius: 12,
        transition: 'background 0.18s ease, border-color 0.18s ease',
      }}
    >
      {/* Header — toggle area + delete button */}
      <div style={{ display: 'flex', alignItems: 'stretch' }}>
        {/* Main toggle area — div instead of button so <input> inside is valid HTML */}
        <div
          role="button"
          tabIndex={0}
          aria-expanded={isOpen}
          onClick={onToggle}
          onKeyDown={e => (e.key === 'Enter' || e.key === ' ') && onToggle()}
          onMouseEnter={e => { if (!nameEdit) e.currentTarget.style.background = 'var(--accent-soft)' }}
          onMouseLeave={e => { e.currentTarget.style.background = 'none' }}
          style={{
            flex: 1, display: 'flex', alignItems: 'center', gap: '0.75rem',
            padding: '0.85rem 1.1rem', background: 'none', border: 'none',
            cursor: nameEdit ? 'default' : 'pointer', textAlign: 'left',
            transition: 'background 0.18s ease', minWidth: 0, outline: 'none',
            borderRadius: '11px 0 0 0',
          }}
        >
          <div style={{ flex: 1, minWidth: 0 }}>
            {/* Group name — click to edit (disabled for My Tasks) */}
            {!isPermanent && nameEdit ? (
              <input
                ref={nameInputRef}
                value={nameVal}
                onChange={e => setNameVal(e.target.value)}
                onClick={e => e.stopPropagation()}
                onBlur={() => {
                  const trimmed = toTitleCase(nameVal.trim())
                  if (trimmed && trimmed !== group.name) {
                    dispatch(tasksActions.updateGroupName({ groupId: group.id, name: trimmed }))
                  } else {
                    setNameVal(group.name)
                  }
                  setNameEdit(false)
                }}
                onKeyDown={e => {
                  e.stopPropagation()
                  if (e.key === 'Enter') {
                    const trimmed = toTitleCase(nameVal.trim())
                    if (trimmed && trimmed !== group.name) {
                      dispatch(tasksActions.updateGroupName({ groupId: group.id, name: trimmed }))
                    }
                    setNameEdit(false)
                  }
                  if (e.key === 'Escape') { setNameVal(group.name); setNameEdit(false) }
                }}
                autoFocus
                style={{
                  fontSize: '0.88rem', fontWeight: 600, color: 'var(--text-primary)',
                  background: 'transparent', border: 'none', outline: 'none',
                  borderBottom: '1.5px solid var(--color-pebble)',
                  padding: '0 0 2px', width: '100%', fontFamily: 'inherit',
                  marginBottom: '0.1rem',
                }}
              />
            ) : (
              <div
                onClick={e => { if (isPermanent) return; e.stopPropagation(); setNameEdit(true); setNameVal(group.name) }}
                title={isPermanent ? undefined : 'click to rename'}
                style={{
                  fontSize: '0.88rem', fontWeight: 600, color: 'var(--text-primary)',
                  marginBottom: '0.1rem', cursor: isPermanent ? 'default' : 'text',
                }}
              >
                {group.name}
              </div>
            )}
            <div style={{ fontSize: '0.76rem', color: 'var(--text-muted)' }}>
              {(() => {
                const taskPhrase = groupTaskPhrase(doneCount, totalUnpaused, isPermanent)
                const timePhrase = groupTimePhrase(timeLeft, doneCount > 0 && !allDone)
                return [taskPhrase, timePhrase].filter(Boolean).join(' · ') || null
              })()}
            </div>
            {groupOverdueDate && (
              <span style={{
                display: 'inline-block', marginTop: '0.3rem',
                fontSize: '0.68rem', padding: '2px 7px', borderRadius: 99,
                background: 'var(--color-pebble-soft)',
                border: '1px solid color-mix(in srgb, var(--color-pebble) 35%, transparent)',
                color: 'var(--color-pebble)',
                fontWeight: 500, letterSpacing: '0.01em', lineHeight: 1.8,
                userSelect: 'none',
              }}>
                overdue — was {groupOverdueDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
              </span>
            )}
          </div>

          {/* Color dot — click to change color (hidden for My Tasks) */}
          {!isPermanent && (
            <div ref={colorPickerRef} style={{ position: 'relative', flexShrink: 0 }} onClick={e => e.stopPropagation()}>
              <button
                onClick={() => setColorPickerOpen(o => !o)}
                aria-label={`group color: ${group.groupColor || 'sage'}`}
                style={{
                  width: 10, height: 10, borderRadius: '50%', background: leftBorderColor,
                  border: 'none', cursor: 'pointer', padding: 0, flexShrink: 0,
                  transition: 'transform 0.18s ease',
                }}
                onMouseEnter={e => { e.currentTarget.style.transform = 'scale(1.4)' }}
                onMouseLeave={e => { e.currentTarget.style.transform = 'scale(1)' }}
              />
              <AnimatePresence>
                {colorPickerOpen && (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.9, y: -4 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.9, y: -4 }}
                    transition={{ duration: 0.15 }}
                    style={{
                      position: 'absolute', top: '1.5rem', right: 0,
                      background: 'var(--bg-card)', border: '1px solid var(--border)',
                      borderRadius: 10, padding: '0.5rem 0.65rem',
                      boxShadow: '0 4px 16px rgba(0,0,0,0.1)', zIndex: 100,
                    }}
                  >
                    <ColorSwatches
                      value={group.groupColor || 'sage'}
                      onChange={color => {
                        dispatch(tasksActions.setGroupColor({ groupId: group.id, color }))
                        setColorPickerOpen(false)
                      }}
                    />
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          )}

          {/* Chevron */}
          <motion.span
            animate={{ rotate: isOpen ? 90 : 0 }}
            transition={{ duration: 0.22 }}
            style={{ color: 'var(--text-muted)', fontSize: '0.82rem', flexShrink: 0, lineHeight: 1 }}
          >
            ›
          </motion.span>
        </div>

        {/* Clear completed button — shown when completed tasks exist */}
        {completedTasks.length > 0 && (
          <button
            onClick={e => { e.stopPropagation(); dispatch(tasksActions.clearCompletedTasks(group.id)) }}
            aria-label="Clear completed tasks"
            title="clear completed"
            style={{
              background: 'none', border: 'none', borderLeft: '1px solid var(--border)',
              cursor: 'pointer', padding: '0 0.75rem', color: 'var(--text-muted)',
              flexShrink: 0, transition: 'background 0.18s ease, color 0.18s ease',
              fontSize: '0.72rem', fontFamily: 'inherit',
              borderRadius: isPermanent ? '0 11px 0 0' : 0,
            }}
            onMouseEnter={e => { e.currentTarget.style.background = 'rgba(90,138,128,0.08)'; e.currentTarget.style.color = 'var(--color-done)' }}
            onMouseLeave={e => { e.currentTarget.style.background = 'none'; e.currentTarget.style.color = 'var(--text-muted)' }}
          >
            clear done
          </button>
        )}

        {/* Clear all button — only for My Tasks (permanent group) */}
        {isPermanent && group.tasks.filter(t => !t.done).length > 0 && (
          <button
            onClick={e => { e.stopPropagation(); setConfirmClearAll(true) }}
            aria-label="Clear all tasks"
            title="clear all"
            style={{
              background: 'none', border: 'none', borderLeft: '1px solid var(--border)',
              cursor: 'pointer', padding: '0 0.85rem', color: 'var(--text-muted)',
              flexShrink: 0, transition: 'background 0.18s ease, color 0.18s ease',
              borderRadius: '0 11px 0 0', display: 'flex', alignItems: 'center', gap: 3,
            }}
            onMouseEnter={e => { e.currentTarget.style.background = 'rgba(200,148,80,0.08)'; e.currentTarget.style.color = 'var(--color-ai)' }}
            onMouseLeave={e => { e.currentTarget.style.background = 'none'; e.currentTarget.style.color = 'var(--text-muted)' }}
          >
            <span style={{ width: 4, height: 4, borderRadius: '50%', background: 'currentColor', display: 'inline-block' }} />
            <span style={{ width: 4, height: 4, borderRadius: '50%', background: 'currentColor', display: 'inline-block' }} />
            <span style={{ width: 4, height: 4, borderRadius: '50%', background: 'currentColor', display: 'inline-block' }} />
          </button>
        )}

        {/* Trash button — hidden for My Tasks */}
        {!isPermanent && <button
          onClick={e => { e.stopPropagation(); setConfirmDelete(true) }}
          aria-label="Delete group"
          style={{
            background: 'none', border: 'none', borderLeft: '1px solid var(--border)',
            cursor: 'pointer', padding: '0 0.85rem', color: 'var(--text-muted)',
            flexShrink: 0, transition: 'background 0.18s ease, color 0.18s ease',
            borderRadius: '0 11px 0 0',
          }}
          onMouseEnter={e => { e.currentTarget.style.background = 'rgba(200,148,80,0.08)'; e.currentTarget.style.color = 'var(--color-ai)' }}
          onMouseLeave={e => { e.currentTarget.style.background = 'none'; e.currentTarget.style.color = 'var(--text-muted)' }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <polyline points="3 6 5 6 21 6" />
            <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
            <path d="M10 11v6M14 11v6" />
            <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
          </svg>
        </button>}
      </div>

      {/* Delete confirmation strip */}
      <AnimatePresence>
        {confirmDelete && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.22, ease: [0.4, 0, 0.2, 1] }}
            style={{ overflow: 'hidden', borderTop: '1px solid rgba(200,148,80,0.2)' }}
          >
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '0.65rem 1.1rem', background: 'rgba(200,148,80,0.06)', gap: '0.75rem',
            }}>
              <span style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
                delete <strong style={{ color: 'var(--text-primary)', fontWeight: 600 }}>"{group.name}"</strong>? tasks will move to "my tasks".
              </span>
              <div style={{ display: 'flex', gap: '0.4rem', flexShrink: 0 }}>
                <button
                  onClick={() => dispatch(tasksActions.deleteGroup(group.id))}
                  style={{
                    fontSize: '0.78rem', padding: '4px 14px', borderRadius: 7,
                    border: '1px solid var(--color-ai)', background: 'transparent',
                    color: 'var(--color-ai)', cursor: 'pointer', fontWeight: 500,
                    transition: 'background 0.15s ease',
                  }}
                  onMouseEnter={e => { e.currentTarget.style.background = 'rgba(200,148,80,0.12)' }}
                  onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
                >
                  yes, delete
                </button>
                <button
                  onClick={() => setConfirmDelete(false)}
                  style={{
                    fontSize: '0.78rem', padding: '4px 12px', borderRadius: 7,
                    border: '1px solid var(--border)', background: 'transparent',
                    color: 'var(--text-muted)', cursor: 'pointer',
                    transition: 'background 0.15s ease',
                  }}
                  onMouseEnter={e => { e.currentTarget.style.background = 'var(--accent-soft)' }}
                  onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
                >
                  cancel
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Clear-all confirmation strip — My Tasks only */}
      <AnimatePresence>
        {confirmClearAll && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.22, ease: [0.4, 0, 0.2, 1] }}
            style={{ overflow: 'hidden', borderTop: '1px solid rgba(200,148,80,0.2)' }}
          >
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '0.65rem 1.1rem', background: 'rgba(200,148,80,0.06)', gap: '0.75rem',
            }}>
              <span style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
                clear all tasks from <strong style={{ color: 'var(--text-primary)', fontWeight: 600 }}>my tasks</strong>? this can't be undone.
              </span>
              <div style={{ display: 'flex', gap: '0.4rem', flexShrink: 0 }}>
                <button
                  onClick={() => { dispatch(tasksActions.clearAllTasks(group.id)); setConfirmClearAll(false) }}
                  style={{
                    fontSize: '0.78rem', padding: '4px 14px', borderRadius: 7,
                    border: '1px solid var(--color-ai)', background: 'transparent',
                    color: 'var(--color-ai)', cursor: 'pointer', fontWeight: 500,
                    transition: 'background 0.15s ease',
                  }}
                  onMouseEnter={e => { e.currentTarget.style.background = 'rgba(200,148,80,0.12)' }}
                  onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
                >
                  yes, clear all
                </button>
                <button
                  onClick={() => setConfirmClearAll(false)}
                  style={{
                    fontSize: '0.78rem', padding: '4px 12px', borderRadius: 7,
                    border: '1px solid var(--border)', background: 'transparent',
                    color: 'var(--text-muted)', cursor: 'pointer',
                    transition: 'background 0.15s ease',
                  }}
                  onMouseEnter={e => { e.currentTarget.style.background = 'var(--accent-soft)' }}
                  onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
                >
                  cancel
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Expandable body */}
      <AnimatePresence initial={false}>
        {isOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3, ease: [0.4, 0, 0.2, 1] }}
            style={{ overflow: 'hidden' }}
          >
            <div style={{ padding: '0 1.1rem 1rem' }}>

              {/* All-done completion summary */}
              {allDone ? (
                <motion.div
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  style={{
                    background: 'rgba(80,148,106,0.08)', border: '1px solid rgba(80,148,106,0.2)',
                    borderRadius: 10, padding: '1rem', textAlign: 'center',
                  }}
                >
                  <div style={{ fontSize: '0.88rem', fontWeight: 600, color: 'var(--color-done)', marginBottom: '0.3rem' }}>
                    {completionMsgRef.current}
                  </div>
                  <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'center', marginTop: '0.75rem' }}>
                    {!isPermanent && onDeleteGroup && (
                      <button className="btn btn-ghost" style={{ fontSize: '0.8rem', padding: '0.3rem 0.85rem' }} onClick={onDeleteGroup}>
                        remove this group
                      </button>
                    )}
                    <button className="btn btn-primary" style={{ fontSize: '0.8rem', padding: '0.3rem 0.85rem' }} onClick={() => navigate('/focus', { state: { startBreak: true } })}>
                      take a break
                    </button>
                  </div>
                </motion.div>
              ) : (
                <>
                  {/* Pending tasks — draggable + expand-in-place */}
                  {pendingTasks.length > 0 && (
                      <SortableContext items={pendingTasks.map(t => t.id)} strategy={verticalListSortingStrategy}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                          {pendingTasks.map(t => {
                            const dimmed = timeFilterActive && Number(timeFilter) > 0 && (t.duration_minutes || 0) > Number(timeFilter)
                            return (
                              <SortableTaskItem key={t.id} id={t.id} groupId={group.id}>
                                {({ isDragging }) => (
                                  <TaskRow
                                    task={t}
                                    groupId={group.id}
                                    isExpanded={!isDragging && expandedTaskId === t.id}
                                    onToggleExpand={() => handleToggleExpand(t.id)}
                                    onComplete={() => handleComplete(t.id)}
                                    onDelete={() => dispatch(tasksActions.deleteTask({ groupId: group.id, taskId: t.id }))}
                                    onOpenBreakdown={onOpenBreakdown}
                                    dimmed={dimmed}
                                    isDragging={isDragging}
                                  />
                                )}
                              </SortableTaskItem>
                            )
                          })}
                        </div>
                      </SortableContext>
                  )}

                  {pendingTasks.length === 0 && completedTasks.length === 0 && (
                    <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', textAlign: 'center', padding: '0.75rem 0' }}>
                      no tasks yet.
                    </p>
                  )}

                  {/* Completed tasks — shown/hidden by toggle */}
                  <AnimatePresence>
                    {showCompleted && completedTasks.length > 0 && (
                      <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.3 }}
                      >
                        {pendingTasks.length > 0 && (
                          <div style={{ height: 1, background: 'var(--border)', margin: '0.5rem 0 0.25rem' }} />
                        )}
                        {completedTasks.map(t => <CompletedTaskRow key={t.id} task={t} />)}
                      </motion.div>
                    )}
                  </AnimatePresence>
                  <InlineAddTask groupId={group.id} />
                </>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}

// ── BreakdownChatPanel ────────────────────────────────────────────────────── //

function BreakdownChatPanel({ task, groupId, onClose, onReplaceTask }) {
  const prefs    = useSelector(s => s.prefs)
  const groups   = useSelector(s => s.tasks.groups)
  const navigate = useNavigate()

  // 'choice' | 'walk' | 'split'
  const [mode,         setMode]         = useState('choice')
  // walk mode
  const [messages,     setMessages]     = useState([])
  const [input,        setInput]        = useState('')
  const [streaming,    setStreaming]     = useState(false)
  const [streamText,   setStreamText]   = useState('')
  // split mode
  const [previewCards, setPreviewCards] = useState([])
  const [splitting,    setSplitting]    = useState(false)
  const [splitErr,     setSplitErr]     = useState(null)

  const bottomRef       = useRef(null)
  const walkSeedSent    = useRef(false)
  const streamingLockRef = useRef(false)
  const genId = () => Math.random().toString(36).slice(2, 10)

  // Other tasks in same group — passed to decompose to avoid duplicates
  const group = groups.find(g => g.id === groupId)
  const existingTaskNames = (group?.tasks || [])
    .filter(t => t.id !== task.id && !t.done)
    .map(t => t.task_name)

  // ── shared chat send ──────────────────────────────────────────────── //
  async function sendChat(text, history = []) {
    if (streamingLockRef.current) return  // block concurrent calls (StrictMode double-invoke guard)
    streamingLockRef.current = true
    setStreaming(true)
    setStreamText('')
    let accumulated = ''
    // finalContent is set by onReplace when backend sends a clean version
    // (actions stripped, em-dashes cleaned). onDone always uses it if set.
    // Single source of truth: only onDone ever calls setMessages.
    let finalContent = null
    let pendingButtons = []
    await chatStream(
      {
        message: text,
        is_greeting: false,
        current_page: 'tasks',
        conversation_history: history.slice(-12).map(m => ({ role: m.role, content: m.content })),
        task_groups: toBackendGroups(groups),
      },
      {
        onToken: t => {
          accumulated += t
          // Strip any ###ACTIONS[...]### marker that may be streaming through
          // so it never flashes in the bubble. Backend replace event will finalize.
          const visible = accumulated.replace(/###ACTIONS\[[\s\S]*?###/g, '').replace(/###ACTIONS[\s\S]*$/, '')
          setStreamText(visible)
        },
        onReplace: content => {
          // Save clean content — do NOT add to messages here.
          // onDone is the single place that adds messages.
          finalContent = content
          accumulated = content
          setStreamText('')
        },
        onActions: buttons => {
          for (const btn of (buttons || [])) {
            if (btn.type === 'route') pendingButtons = [...pendingButtons, btn]
          }
        },
        onDone: () => {
          const content = finalContent ?? accumulated
          if (content) setMessages(prev => [...prev, { id: genId(), role: 'assistant', content, buttons: pendingButtons }])
          setStreamText('')
          streamingLockRef.current = false
          setStreaming(false)
          setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 50)
        },
        onError: msg => {
          setMessages(prev => [...prev, { id: genId(), role: 'assistant', content: msg || 'something went quiet. try again?' }])
          setStreamText('')
          streamingLockRef.current = false
          setStreaming(false)
        },
      },
    )
  }

  // ── walk mode: seed Pebble silently when walk mode is entered ─────── //
  useEffect(() => {
    if (mode !== 'walk' || walkSeedSent.current) return
    walkSeedSent.current = true
    const seed = `I want to work through this task: "${task.task_name}"${task.duration_minutes > 0 ? ` (estimated ${task.duration_minutes} min)` : ''}. can you walk me through how to approach it?`
    sendChat(seed, [])
  }, [mode]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── split mode: auto-decompose on enter ──────────────────────────── //
  useEffect(() => {
    if (mode !== 'split' || splitting || previewCards.length > 0) return
    runSplit()
  }, [mode]) // eslint-disable-line react-hooks/exhaustive-deps

  async function runSplit() {
    setSplitting(true)
    setSplitErr(null)
    try {
      const ctxParts = []
      if (task.motivation_nudge) ctxParts.push(task.motivation_nudge)
      if (existingTaskNames.length > 0) {
        ctxParts.push(`Already in this group — do not duplicate: ${existingTaskNames.join(', ')}`)
      }
      const res = await decompose({
        goal: task.task_name,
        granularity: prefs.granularity || 'normal',
        context: ctxParts.join('. '),
      })
      if (res.flagged) { setSplitErr("couldn't break that down. try rewording it."); setSplitting(false); return }
      const steps = (res.steps || []).slice(0, 5)
      if (steps.length <= 1) {
        setSplitErr("that task is already pretty specific. not much to split.")
        setSplitting(false)
        return
      }
      setPreviewCards(steps.map(s => ({ ...s, _id: genId() })))
      setSplitting(false)
    } catch {
      setSplitErr("something went quiet. try again?")
      setSplitting(false)
    }
  }

  // ── walk mode: send user message ─────────────────────────────────── //
  async function handleSend() {
    const text = input.trim()
    if (!text || streaming) return
    const userMsg = { id: genId(), role: 'user', content: text }
    const next = [...messages, userMsg]
    setMessages(next)
    setInput('')
    await sendChat(text, next)
  }

  // ── shared panel header ───────────────────────────────────────────── //
  const panelHeader = (
    <div style={{ padding: '1rem 1.25rem 0.85rem', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: '1rem', fontWeight: 400, color: 'var(--text-primary)', lineHeight: 1.35 }}>
            {task.task_name}
          </div>
        </div>
        <button
          onClick={onClose}
          aria-label="Close panel"
          style={{
            background: 'none', border: 'none', cursor: 'pointer',
            color: 'var(--text-muted)', fontSize: '1.35rem', lineHeight: 1,
            padding: '0 0.2rem', flexShrink: 0, transition: 'color 0.2s ease',
          }}
          onMouseEnter={e => { e.currentTarget.style.color = 'var(--text-primary)' }}
          onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-muted)' }}
        >
          ×
        </button>
      </div>
    </div>
  )

  // ── CHOICE SCREEN ─────────────────────────────────────────────────── //
  if (mode === 'choice') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
        {panelHeader}
        <div style={{
          flex: 1, display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center',
          padding: '2rem 1.75rem',
        }}>
          <motion.div
            animate={{ scale: [0.88, 1.08, 0.88], opacity: [0.55, 1, 0.55] }}
            transition={{ duration: 3.2, repeat: Infinity, ease: 'easeInOut' }}
            style={{ width: 9, height: 9, borderRadius: '50%', background: 'var(--color-pebble)', marginBottom: '1.5rem' }}
          />
          <p style={{
            fontFamily: 'var(--font-display)', fontSize: '1.05rem', fontWeight: 400,
            color: 'var(--text-primary)', textAlign: 'center',
            lineHeight: 1.4, marginBottom: '0.4rem',
          }}>
            how would you like to approach this?
          </p>
          <p style={{
            fontSize: '0.78rem', color: 'var(--text-muted)',
            textAlign: 'center', lineHeight: 1.55, marginBottom: '2rem',
          }}>
            choose how pebble helps you with this task
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem', width: '100%' }}>
            <button
              className="btn btn-ghost"
              style={{ width: '100%', fontSize: '0.85rem', padding: '0.7rem 1rem', textAlign: 'left' }}
              onClick={() => setMode('walk')}
            >
              <span style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
                <span>walk me through it</span>
                <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 400 }}>chat with pebble, step by step</span>
              </span>
            </button>
            <button
              className="btn btn-primary"
              style={{ width: '100%', fontSize: '0.85rem', padding: '0.7rem 1rem', textAlign: 'left' }}
              onClick={() => setMode('split')}
            >
              <span style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
                <span>split it up</span>
                <span style={{ fontSize: '0.72rem', opacity: 0.7, fontWeight: 400 }}>break into smaller tasks you can check off</span>
              </span>
            </button>
          </div>
        </div>
      </div>
    )
  }

  // ── WALK MODE ─────────────────────────────────────────────────────── //
  if (mode === 'walk') {
    const hasAiReply = messages.some(m => m.role === 'assistant')
    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
        {panelHeader}
        {/* Chat thread */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '1rem 1.25rem', display: 'flex', flexDirection: 'column', gap: '0.7rem' }}>
          {messages.map(msg => (
            <motion.div key={msg.id} initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.28 }}>
              {msg.role === 'assistant' ? (
                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-start' }}>
                  <motion.div
                    animate={{ scale: [0.88, 1.08, 0.88], opacity: [0.7, 1, 0.7] }}
                    transition={{ duration: 3.5, repeat: Infinity, ease: 'easeInOut' }}
                    style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--color-pebble)', flexShrink: 0, marginTop: '0.85rem' }}
                  />
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', maxWidth: '84%' }}>
                    {splitIntoBubbles(msg.content).map((chunk, ci) => (
                      <motion.div
                        key={ci}
                        initial={{ opacity: 0, y: 4 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.28, ease: [0.25, 0.46, 0.45, 0.94], delay: ci * 0.1 }}
                        style={{
                          background: 'rgba(200,148,80,0.07)',
                          border: '1px solid rgba(200,148,80,0.16)',
                          borderRadius: '16px 16px 16px 4px',
                          padding: '0.65rem 0.9rem',
                          fontSize: '0.85rem', color: 'var(--text-primary)',
                          lineHeight: 1.65, wordBreak: 'break-word',
                        }}
                      >
                        {renderMarkdown(chunk)}
                      </motion.div>
                    ))}
                    {msg.buttons?.length > 0 && (
                      <motion.div
                        initial={{ opacity: 0, y: 4 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.3, delay: 0.15 }}
                        style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', paddingTop: '0.1rem' }}
                      >
                        {msg.buttons.map((btn, bi) => (
                          <button
                            key={bi}
                            className="btn btn-primary"
                            style={{ fontSize: '0.78rem', padding: '0.35rem 0.9rem', borderRadius: 99 }}
                            onClick={() => {
                              const dest = btn.value || '/focus'
                              if (dest === '/focus' || dest.startsWith('/focus')) {
                                navigate('/focus', { state: { focusTopic: task.task_name, topicSet: true } })
                              } else {
                                navigate(dest)
                              }
                            }}
                          >
                            {btn.label}
                          </button>
                        ))}
                      </motion.div>
                    )}
                  </div>
                </div>
              ) : (
                <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                  <div style={{
                    maxWidth: '84%',
                    background: 'rgba(42,122,144,0.08)',
                    border: '1px solid rgba(42,122,144,0.16)',
                    borderRadius: '16px 16px 4px 16px',
                    padding: '0.65rem 0.9rem',
                    fontSize: '0.85rem', color: 'var(--text-primary)',
                    lineHeight: 1.65, wordBreak: 'break-word',
                  }}>
                    {msg.content}
                  </div>
                </div>
              )}
            </motion.div>
          ))}
          {/* Streaming bubble */}
          {streaming && (
            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-start' }}>
              <motion.div
                animate={{ scale: [0.88, 1.08, 0.88], opacity: [0.7, 1, 0.7] }}
                transition={{ duration: 3.5, repeat: Infinity, ease: 'easeInOut' }}
                style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--color-pebble)', flexShrink: 0, marginTop: '0.85rem' }}
              />
              <div style={{
                maxWidth: '84%', background: 'rgba(200,148,80,0.07)',
                border: '1px solid rgba(200,148,80,0.16)', borderRadius: '16px 16px 16px 4px',
                padding: '0.65rem 0.9rem', fontSize: '0.85rem', color: 'var(--text-primary)', lineHeight: 1.65,
              }}>
                {streamText ? renderMarkdown(streamText) : (
                  <div style={{ display: 'flex', gap: 5, alignItems: 'flex-end', height: 16 }}>
                    {[
                      { color: '#50946A', delay: 0 },
                      { color: '#E0A060', delay: 0.18 },
                      { color: '#9A88B4', delay: 0.36 },
                    ].map((dot, i) => (
                      <motion.span key={i}
                        animate={{ y: [0, -6, 0] }}
                        transition={{ duration: 1.1, delay: dot.delay, repeat: Infinity, ease: 'easeInOut', repeatDelay: 0.5 }}
                        style={{ display: 'block', width: 6, height: 6, borderRadius: '50%', background: dot.color, flexShrink: 0 }}
                      />
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
          <div ref={bottomRef} />
        </div>
        {/* Input */}
        <div style={{ padding: '0.6rem 1.25rem 1rem', flexShrink: 0, borderTop: '1px solid var(--border)' }}>
          {hasAiReply && !streaming && (
            <div style={{ marginBottom: '0.45rem', textAlign: 'right' }}>
              <button
                onClick={() => { setPreviewCards([]); setSplitErr(null); setMode('split') }}
                style={{
                  fontSize: '0.75rem', color: 'var(--color-active)',
                  background: 'none', border: 'none', cursor: 'pointer',
                  padding: '0.15rem 0.25rem', transition: 'opacity 0.2s ease',
                }}
                onMouseEnter={e => { e.currentTarget.style.opacity = '0.65' }}
                onMouseLeave={e => { e.currentTarget.style.opacity = '1' }}
              >
                split into tasks →
              </button>
            </div>
          )}
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-end' }}>
            <textarea
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() } }}
              placeholder="ask pebble anything..."
              rows={2}
              disabled={streaming}
              style={{ flex: 1, resize: 'none', borderRadius: 10, fontSize: '0.85rem', opacity: streaming ? 0.55 : 1, transition: 'opacity 0.25s ease' }}
            />
            <button
              className="btn btn-primary"
              onClick={handleSend}
              disabled={!input.trim() || streaming}
              style={{ flexShrink: 0, fontSize: '0.82rem', padding: '0.4rem 0.85rem' }}
            >
              send
            </button>
          </div>
        </div>
      </div>
    )
  }

  // ── SPLIT MODE ───────────────────────────────────────────────────── //
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {panelHeader}
      <div style={{ flex: 1, overflowY: 'auto', padding: '1rem 1.25rem', display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
        <AnimatePresence mode="wait">
          {splitting ? (
            <motion.div key="loading"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '0.75rem', padding: '2rem 0' }}
            >
              <div style={{ display: 'flex', gap: 5, alignItems: 'flex-end', height: 16 }}>
                {[
                  { color: '#50946A', delay: 0 },
                  { color: '#E0A060', delay: 0.18 },
                  { color: '#9A88B4', delay: 0.36 },
                ].map((dot, i) => (
                  <motion.span key={i}
                    animate={{ y: [0, -6, 0] }}
                    transition={{ duration: 1.1, delay: dot.delay, repeat: Infinity, ease: 'easeInOut', repeatDelay: 0.5 }}
                    style={{ display: 'block', width: 6, height: 6, borderRadius: '50%', background: dot.color, flexShrink: 0 }}
                  />
                ))}
              </div>
              <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>breaking it down…</span>
            </motion.div>
          ) : splitErr ? (
            <motion.div key="error"
              initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
              style={{ textAlign: 'center', padding: '2rem 0', display: 'flex', flexDirection: 'column', gap: '1rem', alignItems: 'center' }}
            >
              <p style={{ fontSize: '0.84rem', color: 'var(--color-ai)', lineHeight: 1.6 }}>{splitErr}</p>
              <button className="btn btn-ghost" style={{ fontSize: '0.82rem' }} onClick={runSplit}>try again</button>
            </motion.div>
          ) : (
            <motion.div key="cards" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}
            >
              {previewCards.map((card, i) => (
                <motion.div
                  key={card._id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0, transition: { duration: 0.32, delay: i * 0.07 } }}
                  style={{
                    background: 'var(--bg-card)',
                    border: '1px solid var(--border)',
                    borderLeft: '3px solid var(--color-active)',
                    borderRadius: 12,
                    padding: '0.65rem 2.2rem 0.65rem 0.9rem',
                    position: 'relative',
                  }}
                >
                  <input
                    value={card.task_name}
                    onChange={e => setPreviewCards(prev => prev.map(c => c._id === card._id ? { ...c, task_name: e.target.value } : c))}
                    style={{
                      width: '100%', background: 'none', border: 'none', outline: 'none',
                      fontSize: '0.87rem', fontWeight: 500, color: 'var(--text-primary)',
                      lineHeight: 1.5, fontFamily: 'inherit',
                    }}
                  />
                  <button
                    onClick={() => setPreviewCards(prev => prev.filter(c => c._id !== card._id))}
                    aria-label="Remove task"
                    style={{
                      position: 'absolute', top: '0.45rem', right: '0.5rem',
                      background: 'none', border: 'none', cursor: 'pointer',
                      fontSize: '1rem', lineHeight: 1, padding: '0.1rem 0.2rem',
                      color: 'var(--text-muted)', transition: 'color 0.18s ease',
                    }}
                    onMouseEnter={e => { e.currentTarget.style.color = 'var(--color-ai)' }}
                    onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-muted)' }}
                  >
                    ×
                  </button>
                </motion.div>
              ))}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
      {!splitting && !splitErr && previewCards.length > 0 && (
        <div style={{ padding: '0.75rem 1.25rem 1rem', flexShrink: 0, borderTop: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          <button
            className="btn btn-primary"
            style={{ width: '100%', fontSize: '0.84rem' }}
            onClick={() => onReplaceTask(groupId, task.id, previewCards)}
          >
            replace with these
          </button>
          <button
            className="btn btn-ghost"
            style={{ width: '100%', fontSize: '0.84rem' }}
            onClick={() => { setPreviewCards([]); setSplitErr(null); setMode('choice') }}
          >
            nevermind
          </button>
        </div>
      )}
    </div>
  )
}

// ── ClarifyPanel ─────────────────────────────────────────────────────────── //
// Slides in from the LEFT, mirroring BreakdownChatPanel on the right.
// Opens when the user clicks "add". Pebble asks ≤2 clarifying questions,
// then emits build_plan — frontend calls /api/decompose + shows mini task cards.

// Strip ###ACTIONS[...]### markers that leaked through the raw token stream
function stripClarifyActions(text) {
  return text
    .replace(/###ACTIONS\[[\s\S]*?\]###/g, '')
    .replace(/###ACTIONS\[[\s\S]*/g, '')
    .trim()
}

// ── SortablePreviewCard — draggable preview card inside ClarifyPanel ──────── //
function PreviewCard({ step, onChangeName, onDelete }) {
  return (
    <Reorder.Item
      value={step}
      style={{
        background: 'var(--bg-card)',
        border: '1px solid var(--border)',
        borderLeft: '3px solid var(--color-active)',
        borderRadius: 14,
        padding: '0.65rem 0.85rem 0.65rem 0.95rem',
        position: 'relative',
        display: 'flex',
        alignItems: 'center',
        listStyle: 'none',
        cursor: 'grab',
        userSelect: 'none',
      }}
      whileDrag={{
        scale: 1.02,
        boxShadow: '0 8px 24px rgba(0,0,0,0.14)',
        cursor: 'grabbing',
      }}
    >
      {/* Task name — stop drag so typing works */}
      <input
        value={step.task_name}
        onChange={e => onChangeName(e.target.value)}
        onPointerDown={e => e.stopPropagation()}
        style={{
          flex: 1, background: 'none', border: 'none', outline: 'none',
          fontSize: '0.88rem', fontWeight: 500, color: 'var(--text-primary)',
          lineHeight: 1.5, fontFamily: 'inherit', letterSpacing: '0.01em',
          padding: '0 1.6rem 0 0', cursor: 'text',
        }}
      />

      {/* Delete × */}
      <button
        onClick={onDelete}
        onPointerDown={e => e.stopPropagation()}
        aria-label="Remove task"
        style={{
          position: 'absolute', top: '0.4rem', right: '0.45rem',
          background: 'none', border: 'none', cursor: 'pointer', flexShrink: 0,
          fontSize: '1rem', lineHeight: 1, padding: '0.15rem 0.25rem',
          color: 'var(--text-muted)', transition: 'color 0.18s ease', borderRadius: 4,
        }}
        onMouseEnter={e => { e.currentTarget.style.color = 'var(--color-ai)' }}
        onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-muted)' }}
      >
        ×
      </button>
    </Reorder.Item>
  )
}

function ClarifyPanel({ goal, onClose, onConfirm }) {
  const prefs        = useSelector(s => s.prefs)
  const [messages,   setMessages]   = useState([])
  const [input,      setInput]      = useState('')
  const [streaming,  setStreaming]  = useState(false)
  const [streamText, setStreamText] = useState('')
  const [building,   setBuilding]   = useState(false)
  const [preview,    setPreview]    = useState(null)   // { groupName, steps }
  const [editSteps,  setEditSteps]  = useState(null)   // editable copy with stable _id fields
  const [editMode,   setEditMode]   = useState(false)  // true = keep cards + show input
  const [editingName, setEditingName] = useState(false) // true = group name input focused
  const [planError,    setPlanError]    = useState(null)
  const [userReplied,  setUserReplied]  = useState(false)  // true after first user message sent
  const bottomRef          = useRef(null)
  const inputRef           = useRef(null)
  const initialSent        = useRef(false)
  const historyRef         = useRef([])  // parallel to messages, but only role+content for API
  const buildTriggeredRef  = useRef(false)  // prevents double-firing triggerBuildPlan
  const genId              = () => Math.random().toString(36).slice(2, 10)

  async function triggerBuildPlan() {
    if (buildTriggeredRef.current) return  // prevent double-trigger
    buildTriggeredRef.current = true
    setBuilding(true)
    setPlanError(null)
    try {
      const context = historyRef.current
        .map(m => `${m.role === 'user' ? 'User' : 'Pebble'}: ${m.content}`)
        .join('\n')
      const res = await decompose({
        goal,
        granularity:   prefs.granularity   || 'normal',
        reading_level: prefs.readingLevel  || 'standard',
        context:       context             || undefined,
      })
      if (res.flagged) { setPlanError("something went quiet. want to try again?"); setBuilding(false); return }
      const steps = res.steps || []
      if (steps.length === 0) { setPlanError("couldn't break that down. want to try again?"); setBuilding(false); return }
      const groupName = toTitleCase(res.group_name || (goal.length > 36 ? goal.slice(0, 34) + '…' : goal))
      setPreview({ groupName, steps })
      setEditSteps(steps.map(s => ({ ...s, _id: Math.random().toString(36).slice(2, 8) })))  // editable copy with stable drag IDs
    } catch {
      setPlanError('something went quiet. try again?')
    }
    setBuilding(false)
  }

  async function sendToChat(text, hidden = false) {
    if (!hidden) {
      const userMsg = { id: genId(), role: 'user', content: text }
      setMessages(prev => [...prev, userMsg])
      historyRef.current = [...historyRef.current, { role: 'user', content: text }]
      setUserReplied(true)
    }
    setStreaming(true)
    setStreamText('')
    let accumulated = ''
    let finalContent = null  // set by onReplace; onDone is the single place that commits
    await chatStream(
      {
        message:              text,
        is_greeting:          false,
        current_page:         'tasks_clarify',
        conversation_history: historyRef.current.slice(-12),
      },
      {
        onToken: t => { accumulated += t; setStreamText(stripClarifyActions(accumulated)) },
        onReplace: content => {
          // Save clean content — do NOT add to messages here.
          // onDone is the single place that commits the assistant message.
          const clean = stripClarifyActions(content)
          finalContent = clean
          accumulated = clean
          setStreamText('')
        },
        onActions: buttons => {
          for (const btn of (buttons || [])) {
            if (btn.type === 'build_plan') {
              setTimeout(() => triggerBuildPlan(), 150)  // ref prevents double-trigger
            }
          }
        },
        onDone: () => {
          const clean = finalContent ?? stripClarifyActions(accumulated)
          if (clean) {
            setMessages(prev => [...prev, { id: genId(), role: 'assistant', content: clean }])
            historyRef.current = [...historyRef.current, { role: 'assistant', content: clean }]
          }
          setStreamText('')
          setStreaming(false)
          setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 50)
          // Auto-build: if user has replied and Pebble gave a non-question response,
          // always trigger the plan — don't require the user to click the button.
          const hasUserReply = historyRef.current.some(m => m.role === 'user')
          const endsWithQuestion = clean ? /\?\s*$/.test(clean.trim()) : false
          if (hasUserReply && !endsWithQuestion && !buildTriggeredRef.current) {
            setTimeout(() => triggerBuildPlan(), 200)
          }
        },
        onError: msg => {
          setMessages(prev => [...prev, { id: genId(), role: 'assistant', content: msg || 'something went quiet. try again?' }])
          setStreamText('')
          setStreaming(false)
        },
      },
    )
  }

  // On mount: seed Pebble with the goal (hidden — Pebble's response is the first visible message)
  useEffect(() => {
    if (initialSent.current) return
    initialSent.current = true
    sendToChat(`I want to plan: "${goal}"`, true)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function handleSend() {
    const text = input.trim()
    if (!text || streaming || building) return
    setInput('')
    await sendToChat(text)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {/* Header */}
      <div style={{ padding: '1rem 1.25rem 0.85rem', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem' }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: '0.25rem' }}>
              planning
            </div>
            <div style={{
              fontFamily: 'var(--font-display)', fontSize: '0.92rem', fontWeight: 400,
              color: 'var(--text-primary)', lineHeight: 1.35,
              display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
              overflow: 'hidden',
            }}>
              {goal}
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Close planning panel"
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              color: 'var(--text-muted)', fontSize: '1.35rem', lineHeight: 1,
              padding: '0 0.2rem', flexShrink: 0, transition: 'color 0.2s ease',
            }}
            onMouseEnter={e => { e.currentTarget.style.color = 'var(--text-primary)' }}
            onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-muted)' }}
          >
            ×
          </button>
        </div>

        {/* Build now — appears after first reply, hides once plan is built */}
        <AnimatePresence>
          {userReplied && !preview && (
            <motion.div
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.22 }}
              style={{ marginTop: '0.7rem' }}
            >
              <button
                className="btn btn-primary"
                style={{ width: '100%', fontSize: '0.82rem', padding: '0.42rem 1rem', opacity: building ? 0.55 : 1 }}
                onClick={triggerBuildPlan}
                disabled={building}
              >
                {building ? 'building plan...' : "that's enough — build my plan →"}
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Chat thread */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '1rem 1.25rem', display: 'flex', flexDirection: 'column', gap: '0.7rem' }}>
        {messages.map(msg => (
          <motion.div
            key={msg.id}
            initial={{ opacity: 0, y: 5 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.28 }}
            style={{ width: '100%', minWidth: 0 }}
          >
            {msg.role === 'assistant' ? (
              <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-start', width: '100%', minWidth: 0 }}>
                <motion.div
                  animate={{ scale: [0.88, 1.08, 0.88], opacity: [0.7, 1, 0.7] }}
                  transition={{ duration: 3.5, repeat: Infinity, ease: 'easeInOut' }}
                  style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--color-pebble)', flexShrink: 0, marginTop: '0.85rem' }}
                />
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', maxWidth: '84%', minWidth: 0 }}>
                  {splitIntoBubbles(msg.content).map((chunk, ci) => (
                    <motion.div
                      key={ci}
                      initial={{ opacity: 0, y: 4 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.28, ease: [0.25, 0.46, 0.45, 0.94], delay: ci * 0.1 }}
                      style={{
                        background: 'rgba(200,148,80,0.07)',
                        border: '1px solid rgba(200,148,80,0.16)',
                        borderRadius: '16px 16px 16px 4px',
                        padding: '0.65rem 0.9rem',
                        fontSize: '0.85rem', color: 'var(--text-primary)',
                        lineHeight: 1.65, wordBreak: 'break-word',
                      }}
                    >
                      {renderMarkdown(chunk)}
                    </motion.div>
                  ))}
                </div>
              </div>
            ) : (
              <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <div style={{
                  maxWidth: '84%',
                  background: 'rgba(42,122,144,0.08)',
                  border: '1px solid rgba(42,122,144,0.16)',
                  borderRadius: '16px 16px 4px 16px',
                  padding: '0.65rem 0.9rem',
                  fontSize: '0.85rem', color: 'var(--text-primary)',
                  lineHeight: 1.65, wordBreak: 'break-word',
                }}>
                  {msg.content}
                </div>
              </div>
            )}
          </motion.div>
        ))}

        {/* In-flight streaming bubble */}
        {streaming && (
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-start' }}>
            <motion.div
              animate={{ scale: [0.88, 1.08, 0.88], opacity: [0.7, 1, 0.7] }}
              transition={{ duration: 3.5, repeat: Infinity, ease: 'easeInOut' }}
              style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--color-pebble)', flexShrink: 0, marginTop: '0.85rem' }}
            />
            <div style={{
              maxWidth: '84%', background: 'rgba(200,148,80,0.07)',
              border: '1px solid rgba(200,148,80,0.16)', borderRadius: '16px 16px 16px 4px',
              padding: '0.65rem 0.9rem', fontSize: '0.85rem', color: 'var(--text-primary)', lineHeight: 1.65,
            }}>
              {streamText ? renderMarkdown(streamText) : (
                <div style={{ display: 'flex', gap: 5, alignItems: 'flex-end', height: 16 }}>
                  {[
                    { color: '#50946A', delay: 0 },
                    { color: '#E0A060', delay: 0.18 },
                    { color: '#9A88B4', delay: 0.36 },
                  ].map((dot, i) => (
                    <motion.span key={i}
                      animate={{ y: [0, -6, 0] }}
                      transition={{ duration: 1.1, delay: dot.delay, repeat: Infinity, ease: 'easeInOut', repeatDelay: 0.5 }}
                      style={{ display: 'block', width: 6, height: 6, borderRadius: '50%', background: dot.color, flexShrink: 0 }}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Building plan indicator */}
        {building && !preview && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }}
            style={{ display: 'flex', gap: '0.55rem', alignItems: 'center', padding: '0.4rem 0' }}
          >
            <div style={{ display: 'flex', gap: 5, alignItems: 'flex-end', height: 14 }}>
              {[
                { color: '#50946A', delay: 0 },
                { color: '#E0A060', delay: 0.18 },
                { color: '#9A88B4', delay: 0.36 },
              ].map((dot, i) => (
                <motion.span key={i}
                  animate={{ y: [0, -5, 0] }}
                  transition={{ duration: 1.1, delay: dot.delay, repeat: Infinity, ease: 'easeInOut', repeatDelay: 0.5 }}
                  style={{ display: 'block', width: 5, height: 5, borderRadius: '50%', background: dot.color, flexShrink: 0 }}
                />
              ))}
            </div>
            <span style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>building plan...</span>
          </motion.div>
        )}

        {/* Plan error */}
        {planError && (
          <p style={{ fontSize: '0.8rem', color: 'var(--color-ai)', textAlign: 'center', padding: '0.25rem 0' }}>
            {planError}
          </p>
        )}

        {/* Preview task cards */}
        <AnimatePresence>
          {preview && (
            <motion.div
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.3, ease: [0.25, 0.46, 0.45, 0.94] }}
            >
              {/* Group name — click to edit */}
              {editingName ? (
                <input
                  autoFocus
                  value={preview.groupName}
                  onChange={e => setPreview(p => ({ ...p, groupName: e.target.value }))}
                  onBlur={() => setEditingName(false)}
                  onKeyDown={e => { if (e.key === 'Enter') setEditingName(false) }}
                  style={{
                    display: 'block', width: '100%', marginBottom: '0.65rem',
                    background: 'none', border: 'none', borderBottom: '1px solid var(--color-active)',
                    outline: 'none', fontSize: '0.68rem', color: 'var(--text-muted)',
                    letterSpacing: '0.07em', textTransform: 'uppercase', fontWeight: 500,
                    fontFamily: 'inherit', padding: '0 0 0.2rem',
                  }}
                />
              ) : (
                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => setEditingName(true)}
                  onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') setEditingName(true) }}
                  title="click to rename"
                  style={{
                    fontSize: '0.68rem', color: 'var(--text-muted)', marginBottom: '0.65rem',
                    letterSpacing: '0.07em', textTransform: 'uppercase', fontWeight: 500,
                    cursor: 'text', display: 'inline-flex', alignItems: 'center', gap: '0.3rem',
                  }}
                >
                  {preview.groupName}
                  <svg width="9" height="9" viewBox="0 0 12 12" fill="none" aria-hidden="true" style={{ opacity: 0.45, flexShrink: 0 }}>
                    <path d="M8.5 1.5a1.414 1.414 0 0 1 2 2L4 10H2v-2L8.5 1.5Z" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </div>
              )}

              {/* Cards list — drag-to-reorder via Framer Motion Reorder */}
              <Reorder.Group
                axis="y"
                values={editSteps || []}
                onReorder={setEditSteps}
                style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '0.55rem' }}
              >
                {(editSteps || []).map(step => (
                  <PreviewCard
                    key={step._id}
                    step={step}
                    onChangeName={val => setEditSteps(prev => prev.map(s =>
                      s._id === step._id ? { ...s, task_name: val } : s
                    ))}
                    onDelete={() => setEditSteps(prev => prev.filter(s => s._id !== step._id))}
                  />
                ))}
              </Reorder.Group>

              {/* Actions */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem', marginTop: '0.85rem' }}>
                <button
                  className="btn btn-primary"
                  style={{ display: 'block', margin: '0 auto', fontSize: '0.82rem', padding: '0.55rem 1.75rem' }}
                  onClick={() => onConfirm(preview.groupName, editSteps)}
                  disabled={!editSteps?.length}
                >
                  create these tasks
                </button>
                {!editMode && (
                  <button
                    style={{
                      display: 'block', margin: '0 auto',
                      background: 'none', border: 'none', cursor: 'pointer',
                      fontSize: '0.78rem', color: 'var(--color-ai)', fontFamily: 'inherit',
                      padding: '0.25rem 0.5rem', borderRadius: 4,
                      transition: 'opacity 0.18s ease', opacity: 0.8,
                    }}
                    onMouseEnter={e => { e.currentTarget.style.opacity = '1' }}
                    onMouseLeave={e => { e.currentTarget.style.opacity = '0.8' }}
                    onClick={() => { setEditMode(true); setTimeout(() => inputRef.current?.focus(), 50) }}
                  >
                    edit these steps myself
                  </button>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <div ref={bottomRef} />
      </div>

      {/* Input — hidden when preview visible (unless editMode) */}
      {(!preview || editMode) && (
        <div style={{ padding: '0.6rem 1.25rem 1rem', flexShrink: 0, borderTop: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-end' }}>
            <textarea
              ref={inputRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() } }}
              placeholder={editMode ? "describe changes to the steps..." : "reply to pebble..."}
              rows={2}
              disabled={streaming || building}
              style={{ flex: 1, resize: 'none', borderRadius: 10, fontSize: '0.85rem', opacity: (streaming || building) ? 0.55 : 1, transition: 'opacity 0.25s ease' }}
            />
            <button
              className="btn btn-primary"
              onClick={handleSend}
              disabled={!input.trim() || streaming || building}
              style={{ flexShrink: 0, fontSize: '0.82rem', padding: '0.4rem 0.85rem' }}
            >
              send
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ── SmartPlanView — full-page focused plan takeover ───────────────────────── //

const PEBBLE_COLOR_HEX = {
  sage:  '#6FA99E',
  amber: '#C89450',
  lilac: '#9A88B4',
  sky:   '#6A96B8',
}

function SmartPlanView({ minutes, result, loading, onBack, onLetsGo, onTryTime }) {
  const prefs    = useSelector(s => s.prefs)
  const budget   = Number(minutes) || 0
  const isEmpty  = !loading && (!result || result.empty || result.tasks.length === 0)
  const hasError = !loading && result?.error
  const accentColor = PEBBLE_COLOR_HEX[prefs.pebbleColor] || PEBBLE_COLOR_HEX.sage

  const suggestTimes = [15, 30, 45, 60].filter(t => t !== budget).slice(0, 3)

  const cardVariant = {
    initial: { opacity: 0, y: 16 },
    animate: i => ({
      opacity: 1, y: 0,
      transition: { duration: 0.42, ease: [0.25, 0.46, 0.45, 0.94], delay: 0.18 + i * 0.08 },
    }),
  }

  return (
    <motion.div
      key="smart-plan"
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0, transition: { duration: 0.42, ease: [0.25, 0.46, 0.45, 0.94] } }}
      exit={{ opacity: 0, y: -12, transition: { duration: 0.3, ease: [0.25, 0.46, 0.45, 0.94] } }}
      style={{
        maxWidth: 480, margin: '0 auto', width: '100%',
        padding: '3rem 1.5rem 6rem',
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        gap: '1.5rem',
      }}
    >
      {/* Heading */}
      <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
        <h2 style={{
          fontFamily: 'var(--font-display)', fontSize: 'clamp(1.4rem, 4vw, 1.75rem)',
          fontWeight: 400, color: 'var(--text-primary)', margin: 0, letterSpacing: '-0.2px',
          display: 'flex', alignItems: 'baseline', justifyContent: 'center', gap: 5,
        }}>
          Your {budget} minutes
          <span aria-hidden="true" style={{
            width: 7, height: 7, borderRadius: '50%',
            background: 'var(--color-pebble)', display: 'inline-block', flexShrink: 0, marginBottom: 8,
          }} />
        </h2>
        {!loading && (
          <p style={{ fontSize: '0.9rem', color: 'var(--text-muted)', margin: 0, letterSpacing: '0.01em' }}>
            {isEmpty ? 'Nothing quite fits that window.' : "Here's what I'd focus on."}
          </p>
        )}
      </div>

      {/* Loading state */}
      {loading && (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.75rem' }}>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            {[
              { color: '#50946A', delay: 0 },
              { color: '#E0A060', delay: 0.18 },
              { color: '#9A88B4', delay: 0.36 },
            ].map((dot, i) => (
              <motion.div
                key={i}
                animate={{ y: [0, -6, 0] }}
                transition={{ duration: 1.1, delay: dot.delay, repeat: Infinity, ease: 'easeInOut', repeatDelay: 0.5 }}
                style={{ width: 7, height: 7, borderRadius: '50%', background: dot.color, flexShrink: 0 }}
              />
            ))}
          </div>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', margin: 0 }}>
            Figuring out your plan…
          </p>
        </div>
      )}

      {/* Empty / error state */}
      {!loading && isEmpty && (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1.25rem', width: '100%' }}>
          <p style={{
            fontSize: '0.85rem', color: 'var(--text-secondary)', textAlign: 'center',
            margin: 0, maxWidth: 300, lineHeight: 1.65,
          }}>
            {hasError ? 'Something went quiet. Try again?' : 'Nothing quite fits that window. Try a bit more?'}
          </p>
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', justifyContent: 'center' }}>
            {suggestTimes.map(t => (
              <button
                key={t}
                onClick={() => onTryTime(t)}
                style={{
                  padding: '0.45rem 1.1rem', borderRadius: 99, fontSize: '0.82rem', fontWeight: 500,
                  background: 'var(--accent-soft)', border: `1px solid ${accentColor}`,
                  color: accentColor, cursor: 'pointer',
                  transition: 'all 0.2s ease', fontFamily: 'inherit', minHeight: 36,
                }}
                onMouseEnter={e => { e.currentTarget.style.background = accentColor; e.currentTarget.style.color = 'white' }}
                onMouseLeave={e => { e.currentTarget.style.background = 'var(--accent-soft)'; e.currentTarget.style.color = accentColor }}
              >
                Try {t} min
              </button>
            ))}
          </div>
          <button className="btn btn-ghost" onClick={onBack} style={{ minHeight: 44 }}>
            Back to tasks
          </button>
        </div>
      )}

      {/* Task cards + reasoning */}
      {!loading && !isEmpty && result?.tasks && (
        <>
          {/* AI reasoning line */}
          {result.reasoning && (
            <p style={{
              fontSize: '0.88rem', color: accentColor,
              fontStyle: 'italic', margin: 0, textAlign: 'center',
              maxWidth: 380, lineHeight: 1.6,
            }}>
              {result.reasoning}
            </p>
          )}

          {/* Task cards */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', width: '100%' }}>
            {result.tasks.map((t, i) => (
              <motion.div
                key={t.task_id}
                custom={i}
                variants={cardVariant}
                initial="initial"
                animate="animate"
                style={{
                  background: 'var(--bg-card)', border: '1px solid var(--border)',
                  borderRadius: 14, padding: '0.9rem 1.1rem',
                  display: 'flex', alignItems: 'flex-start', gap: '0.85rem',
                }}
              >
                {/* Number circle */}
                <div style={{
                  width: 28, height: 28, borderRadius: '50%', flexShrink: 0,
                  background: `color-mix(in srgb, ${accentColor} 14%, transparent)`,
                  border: `1px solid color-mix(in srgb, ${accentColor} 28%, transparent)`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: '0.78rem', fontWeight: 600, color: accentColor,
                  marginTop: 1,
                }}>
                  {i + 1}
                </div>
                {/* Task info */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem', flex: 1, minWidth: 0 }}>
                  <span style={{ fontSize: '0.95rem', fontWeight: 500, color: 'var(--text-primary)', lineHeight: 1.4 }}>
                    {t.task_name}
                  </span>
                  <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)', lineHeight: 1.4 }}>
                    {t.group_name}
                    {t.group_due_label ? ` · due ${t.group_due_label}` : ''}
                    {' · '}
                    {t.time_label}
                  </span>
                </div>
              </motion.div>
            ))}
          </div>

          {/* CTA buttons */}
          <div style={{ display: 'flex', gap: '0.65rem', flexWrap: 'wrap', justifyContent: 'center' }}>
            <button
              className="btn btn-primary"
              onClick={onLetsGo}
              style={{ padding: '0.7rem 2.2rem', minHeight: 44 }}
            >
              Let's go
            </button>
            <button
              className="btn btn-ghost"
              onClick={onBack}
              style={{ padding: '0.7rem 1.6rem', minHeight: 44 }}
            >
              Back to tasks
            </button>
          </div>
        </>
      )}
    </motion.div>
  )
}

// ── Main Tasks component ──────────────────────────────────────────────────── //

export default function Tasks() {
  const dispatch = useDispatch()
  const location = useLocation()
  const { groups } = useSelector(s => s.tasks)
  const prefs = useSelector(s => s.prefs)

  // Highlight a newly-created group (navigated here from Home task preview confirm)
  const [highlightGroupId, setHighlightGroupId] = useState(
    location.state?.highlightGroupId ?? null
  )
  useEffect(() => {
    if (!highlightGroupId) return
    // Auto-expand the highlighted group
    setExpandedGroupId(highlightGroupId)
    // Clear the highlight after 3s so the glow fades naturally
    const timer = setTimeout(() => setHighlightGroupId(null), 3000)
    return () => clearTimeout(timer)
  }, [highlightGroupId]) // eslint-disable-line react-hooks/exhaustive-deps

  // Track whether initial load from Cosmos is done (prevent saving empty state on mount)
  const [cosmosSynced, setCosmosSynced] = useState(false)

  // Snapshot the Redux groups at mount time (before Cosmos load overwrites them).
  // This preserves any groups dispatched just before navigation — e.g. a document
  // turned into tasks — even if Cosmos hasn't finished writing yet.
  const mountGroupsRef = useRef(groups)

  // Load tasks from Cosmos on mount.
  // Uses setGroups (unconditional base) but merges any mount-time groups that
  // Cosmos doesn't know about yet (race-condition protection for DocumentSession).
  useEffect(() => {
    loadTasks()
      .then(data => {
        const cosmosGroups = data.groups || []
        const cosmosIds = new Set(cosmosGroups.map(g => g.id))
        // Any group that was in Redux at mount but not yet in Cosmos gets preserved.
        const orphans = mountGroupsRef.current.filter(g => !cosmosIds.has(g.id))
        dispatch(tasksActions.setGroups([...cosmosGroups, ...orphans]))
      })
      .catch(() => { /* keep whatever is in Redux */ })
      .finally(() => setCosmosSynced(true))
  }, [dispatch])

  // Keep a ref to the latest groups so the unmount flush always has fresh data
  const latestGroupsRef = useRef(groups)
  useEffect(() => { latestGroupsRef.current = groups }, [groups])
  const cosmosSyncedRef = useRef(cosmosSynced)
  useEffect(() => { cosmosSyncedRef.current = cosmosSynced }, [cosmosSynced])

  // Debounced save — batches rapid edits into one Cosmos write
  useEffect(() => {
    if (!cosmosSynced) return
    const timer = setTimeout(() => {
      saveTasks(groups).catch(() => { /* silent */ })
    }, 600)
    return () => clearTimeout(timer)
  }, [groups, cosmosSynced])

  // Flush-on-unmount — ensures the latest state is saved before navigating away,
  // preventing the hero greeting from reading stale Cosmos data
  useEffect(() => {
    return () => {
      if (cosmosSyncedRef.current) {
        saveTasks(latestGroupsRef.current).catch(() => {})
      }
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Accordion
  const [expandedGroupId, setExpandedGroupId] = useState(null)

  // Ensure "My Tasks" permanent group always exists — deferred until after Cosmos
  // has loaded so it never races with loadTasks and triggers a spurious empty save.
  useEffect(() => {
    if (!cosmosSynced) return
    if (!groups.some(g => g.name === 'My Tasks' && g.source === 'manual')) {
      dispatch(tasksActions.addGroup({ name: 'My Tasks', source: 'manual', groupColor: 'sage' }))
    }
  }, [cosmosSynced]) // eslint-disable-line react-hooks/exhaustive-deps

  // New group inline form
  const [newGroupOpen,  setNewGroupOpen]  = useState(false)
  const [newGroupName,  setNewGroupName]  = useState('')
  const [newGroupColor, setNewGroupColor] = useState('sky')
  const newGroupInputRef = useRef(null)
  const newGroupFormRef  = useRef(null)

  // Close new group form on outside-click
  useEffect(() => {
    if (!newGroupOpen) return
    function handleOutside(e) {
      if (newGroupFormRef.current && !newGroupFormRef.current.contains(e.target)) {
        setNewGroupOpen(false)
        setNewGroupName('')
      }
    }
    document.addEventListener('mousedown', handleOutside)
    return () => document.removeEventListener('mousedown', handleOutside)
  }, [newGroupOpen])

  function handleCreateGroup() {
    const name = toTitleCase(newGroupName.trim())
    if (!name) return
    const newId = Math.random().toString(36).slice(2, 10)
    dispatch(tasksActions.addGroup({ id: newId, name, source: 'manual', groupColor: newGroupColor }))
    setExpandedGroupId(newId)
    setNewGroupOpen(false)
    setNewGroupName('')
    setNewGroupColor('sky')
    scrollToBottom()
  }

  // Category filter tabs
  const categories = useSelector(s => s.tasks.categories)
  const [activeCategoryColor, setActiveCategoryColor] = useState(null)  // null = "all"

  // Inline category creation form
  const [catFormOpen,  setCatFormOpen]  = useState(false)
  const [catFormName,  setCatFormName]  = useState('')
  const [catFormColor, setCatFormColor] = useState('sky')
  const catFormRef     = useRef(null)
  const catNameInputRef = useRef(null)

  useEffect(() => {
    if (!catFormOpen) return
    function handleOutside(e) {
      if (catFormRef.current && !catFormRef.current.contains(e.target)) {
        setCatFormOpen(false); setCatFormName('')
      }
    }
    document.addEventListener('mousedown', handleOutside)
    return () => document.removeEventListener('mousedown', handleOutside)
  }, [catFormOpen])

  function handleCreateCategory() {
    const name = catFormName.trim()
    if (!name) return
    dispatch(tasksActions.addCategory({ name, color: catFormColor }))
    setActiveCategoryColor(catFormColor)
    setCatFormOpen(false)
    setCatFormName('')
    // Pre-select the next unused color for the next category
    const used = [...categories.map(c => c.color), catFormColor]
    const next = GROUP_COLOR_KEYS.find(k => !used.includes(k))
    if (next) setCatFormColor(next)
  }

  // If the active category was deleted, fall back to "all"
  useEffect(() => {
    if (activeCategoryColor && !categories.some(c => c.color === activeCategoryColor)) {
      setActiveCategoryColor(null)
    }
  }, [categories, activeCategoryColor])

  // Add input + clarify panel
  const [addInput, setAddInput]   = useState('')
  const [clarifyGoal, setClarifyGoal] = useState(null)  // string when panel is open, null when closed
  const addInputRef = useRef(null)

  // Nudge break-room button to sit right next to the planning panel when open
  useEffect(() => {
    const root = document.documentElement
    if (clarifyGoal) {
      root.style.setProperty('--break-btn-left', '404px')
    } else {
      root.style.removeProperty('--break-btn-left')
    }
    return () => root.style.removeProperty('--break-btn-left')
  }, [clarifyGoal])

  // Time filter
  const [timeFilter, setTimeFilter] = useState('20')

  // Smart plan takeover
  const [smartPlanActive,  setSmartPlanActive]  = useState(false)
  const [smartPlanResult,  setSmartPlanResult]  = useState(null)   // { tasks, reasoning, empty }
  const [smartPlanLoading, setSmartPlanLoading] = useState(false)

  async function buildSmartPlan(minutes) {
    const budget = Number(minutes) || 0
    if (budget <= 0) return
    setSmartPlanLoading(true)
    setSmartPlanActive(true)
    setSmartPlanResult(null)
    try {
      const result = await fetchSmartPlan(groups, budget)
      setSmartPlanResult(result)
    } catch {
      setSmartPlanResult({ tasks: [], reasoning: '', empty: true, error: true })
    } finally {
      setSmartPlanLoading(false)
    }
  }

  // Completed tasks visibility toggle — hidden by default
  const [showCompleted, setShowCompleted] = useState(true)

  // Paused section
  const [pausedOpen, setPausedOpen] = useState(false)

  // Scrollable left panel ref — used to scroll to new groups after adding
  const taskListScrollRef = useRef(null)

  // Breakdown chat panel — set to { task, groupId } to open, null to close
  const [breakdownTask, setBreakdownTask] = useState(null)

  // Close breakdown panel if the task or its group was deleted
  useEffect(() => {
    if (!breakdownTask) return
    const grp = groups.find(g => g.id === breakdownTask.groupId)
    if (!grp || !grp.tasks.some(t => t.id === breakdownTask.task?.id)) {
      setBreakdownTask(null)
    }
  }, [groups, breakdownTask])

  // Pebble chat thread (persistent during session)
  const [qaMessages,  setQaMessages]  = useState([])   // [{id,role,content}]
  const [qaInput,     setQaInput]     = useState('')
  const [qaStreaming, setQaStreaming]  = useState(false)
  const [qaStream,    setQaStream]    = useState('')    // in-flight streaming text
  const qaInputRef  = useRef(null)
  const qaChatRef   = useRef(null)
  const genQaId     = () => Math.random().toString(36).slice(2, 10)


  // Auto-expand document-sourced group on first mount
  useEffect(() => {
    if (expandedGroupId) return
    const docGroup = groups.find(g => g.source === 'document')
    if (docGroup) setExpandedGroupId(docGroup.id)
  // Only run once on mount
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── Drag-and-drop (tasks + groups) ──────────────────────────────────────
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }))
  const [dragActiveId,    setDragActiveId]    = useState(null)
  const [dragOverGroupId, setDragOverGroupId] = useState(null)

  function handleDragStart({ active }) {
    setDragActiveId(active.id)
  }

  function handleDragOver({ over }) {
    if (!over) { setDragOverGroupId(null); return }
    const overType = over.data.current?.type
    if (overType === 'group') {
      setDragOverGroupId(over.id)
    } else if (overType === 'task') {
      setDragOverGroupId(over.data.current?.groupId ?? null)
    } else {
      setDragOverGroupId(null)
    }
  }

  function handleDragEnd({ active, over }) {
    setDragActiveId(null)
    setDragOverGroupId(null)
    if (!over || active.id === over.id) return

    const activeType = active.data.current?.type
    const overType   = over.data.current?.type

    if (activeType === 'group') {
      const sortableGroups = groups.filter(g => !(g.name === 'My Tasks' && g.source === 'manual'))
      const oldIdx = sortableGroups.findIndex(g => g.id === active.id)
      const newIdx = sortableGroups.findIndex(g => g.id === over.id)
      if (oldIdx !== -1 && newIdx !== -1 && oldIdx !== newIdx) {
        const fullOldIdx = groups.findIndex(g => g.id === active.id)
        const fullNewIdx = groups.findIndex(g => g.id === over.id)
        dispatch(tasksActions.reorderGroups({ oldIndex: fullOldIdx, newIndex: fullNewIdx }))
      }
    } else if (activeType === 'task') {
      const activeGroupId = active.data.current?.groupId
      let overGroupId = overType === 'task'
        ? over.data.current?.groupId
        : overType === 'group' ? over.id : null
      if (!activeGroupId || !overGroupId) return

      if (activeGroupId === overGroupId) {
        const group = groups.find(g => g.id === activeGroupId)
        if (!group) return
        // Convert task IDs → full array indices so the reducer splices the right positions
        const oldIndex = group.tasks.findIndex(t => t.id === active.id)
        const newIndex = group.tasks.findIndex(t => t.id === over.id)
        if (oldIndex !== -1 && newIndex !== -1 && oldIndex !== newIndex) {
          dispatch(tasksActions.reorderTasks({ groupId: activeGroupId, oldIndex, newIndex }))
        }
      } else {
        dispatch(tasksActions.moveTaskToGroup({ taskId: active.id, fromGroupId: activeGroupId, toGroupId: overGroupId }))
      }
    }
  }

  // Global progress stats
  const allTasks  = groups.flatMap(g => g.tasks.filter(t => !t.paused))
  const pausedAll = groups.flatMap(g => g.tasks.filter(t => t.paused))

  function toggleGroup(id) {
    setExpandedGroupId(cur => cur === id ? null : id)
  }

  function scrollToBottom() {
    setTimeout(() => {
      if (taskListScrollRef.current) {
        taskListScrollRef.current.scrollTo({ top: taskListScrollRef.current.scrollHeight, behavior: 'smooth' })
      }
    }, 120)
  }

  // Open the clarify panel — clears input, opens panel from the left
  function handleAdd() {
    const text = addInput.trim()
    if (!text) return
    setAddInput('')
    setBreakdownTask(null)   // close breakdown panel if open
    setClarifyGoal(text)
  }

  // Pebble chat: full personality via /api/chat, persistent thread
  async function handleQaSubmit() {
    const q = qaInput.trim()
    if (!q || qaStreaming) return

    const userMsg = { id: genQaId(), role: 'user', content: q }
    const next = [...qaMessages, userMsg]
    setQaMessages(next)
    setQaInput('')
    setQaStreaming(true)
    setQaStream('')

    // Scroll to bottom of chat area
    setTimeout(() => qaChatRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }), 50)

    let accumulated = ''
    let finalContent = null   // set by onReplace; onDone is the single add point
    let pendingButtons = []   // route buttons to show below the message
    await chatStream(
      {
        message:              q,
        is_greeting:          false,
        current_page:         'tasks',
        conversation_history: next.slice(-20).map(m => ({ role: m.role, content: m.content })),
        task_groups:          toBackendGroups(groups),
      },
      {
        onToken: token => {
          accumulated += token
          // Strip ###ACTIONS markers so they never flash in the streaming bubble
          const visible = accumulated.replace(/###ACTIONS\[[\s\S]*?###/g, '').replace(/###ACTIONS[\s\S]*$/, '')
          setQaStream(visible)
        },
        onReplace: content => {
          // Save clean version — do NOT add to messages here.
          // onDone is the single place that adds messages.
          finalContent = content
          accumulated = content
          setQaStream('')
        },
        onActions: (buttons) => {
          for (const btn of (buttons || [])) {
            if (btn.type === 'route') {
              // Store navigation buttons to render below the message
              pendingButtons = [...pendingButtons, btn]
              continue
            }
            if (btn.type === 'delete_tasks') {
              const names = new Set((btn.task_names || []).map(n => n.toLowerCase()))
              for (const group of groups) {
                for (const task of group.tasks) {
                  if (names.has(task.task_name.toLowerCase())) {
                    dispatch(tasksActions.deleteTask({ groupId: group.id, taskId: task.id }))
                  }
                }
              }
              continue
            }
            if (btn.type === 'set_due_date') {
              const group = groups.find(g =>
                btn.group_name ? g.name === btn.group_name : g.tasks.some(t => t.task_name === btn.task_name)
              )
              if (!group) continue
              if (btn.task_name) {
                const task = group.tasks.find(t => t.task_name === btn.task_name)
                if (task) {
                  dispatch(tasksActions.updateTask({
                    groupId:   group.id,
                    taskId:    task.id,
                    due_date:  btn.due_date  || null,
                    due_label: btn.due_label || getDueLabel(btn.due_date) || null,
                  }))
                }
              } else {
                for (const task of group.tasks.filter(t => !t.done && !t.paused)) {
                  dispatch(tasksActions.updateTask({
                    groupId:   group.id,
                    taskId:    task.id,
                    due_date:  btn.due_date  || null,
                    due_label: btn.due_label || getDueLabel(btn.due_date) || null,
                  }))
                }
              }
            }
            if (btn.type === 'move_task') {
              const fromGroup = groups.find(g => g.name === btn.from_group)
              const toGroup   = groups.find(g => g.name === btn.to_group)
              if (!fromGroup || !toGroup) continue
              const task = fromGroup.tasks.find(t => t.task_name === btn.task_name)
              if (task) {
                dispatch(tasksActions.moveTaskToGroup({
                  taskId:      task.id,
                  fromGroupId: fromGroup.id,
                  toGroupId:   toGroup.id,
                }))
              }
            }
          }
        },
        onDone: () => {
          const raw = finalContent ?? accumulated
          const content = raw.replace(/###ACTIONS\[[\s\S]*?###/g, '').replace(/###ACTIONS[\s\S]*$/, '').trim()
          if (content) setQaMessages(prev => [...prev, { id: genQaId(), role: 'assistant', content, buttons: pendingButtons }])
          setQaStream('')
          setQaStreaming(false)
          setTimeout(() => qaChatRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }), 50)
        },
        onError: msg => {
          setQaMessages(prev => [...prev, { id: genQaId(), role: 'assistant', content: msg || 'something went quiet. want to try again?' }])
          setQaStream('')
          setQaStreaming(false)
        },
      },
    )
  }

  return (
    <div style={{ flex: 1, minHeight: 0, display: 'flex', overflow: 'hidden' }}>

    {/* ── Left panel: clarify chat (slides in from left when goal is set) ── */}
    <AnimatePresence>
      {clarifyGoal && (
        <motion.div
          key="clarify-panel"
          initial={{ x: '-100%', opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          exit={{ x: '-100%', opacity: 0 }}
          transition={{ type: 'spring', stiffness: 320, damping: 32 }}
          style={{
            width: 380,
            flexShrink: 0,
            borderRight: '1px solid var(--border)',
            background: 'var(--bg-primary)',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
          }}
        >
          <ClarifyPanel
            key={clarifyGoal}
            goal={clarifyGoal}
            onClose={() => setClarifyGoal(null)}
            onConfirm={(groupName, steps) => {
              const newGroupId = Math.random().toString(36).slice(2, 10)
              dispatch(tasksActions.addGroup({ id: newGroupId, name: groupName, source: 'ai', tasks: steps }))
              setExpandedGroupId(newGroupId)
              setClarifyGoal(null)
              scrollToBottom()
            }}
          />
        </motion.div>
      )}
    </AnimatePresence>

    {/* ── Middle panel: task list ───────────────────────────────────── */}
    <div ref={taskListScrollRef} style={{ flex: 1, overflowY: 'auto', minWidth: 0 }}>
    <AnimatePresence mode="wait">

    {smartPlanActive ? (
      <SmartPlanView
        key="smart-plan"
        minutes={timeFilter}
        result={smartPlanResult}
        loading={smartPlanLoading}
        onBack={() => { setSmartPlanActive(false); setSmartPlanResult(null) }}
        onTryTime={mins => { setTimeFilter(String(mins)); buildSmartPlan(mins) }}
        onLetsGo={() => {
          if (!smartPlanResult?.tasks) return
          const allTasks = groups.flatMap(g => g.tasks)
          navigate('/focus', {
            state: {
              customQueue: smartPlanResult.tasks.map(t => {
                const full = allTasks.find(tk => tk.id === t.task_id) || {}
                return {
                  id:               t.task_id,
                  task_name:        t.task_name,
                  duration_minutes: full.duration_minutes ?? 15,
                  motivation_nudge: full.motivation_nudge ?? '',
                  groupId:          t.group_id,
                }
              }),
            },
          })
        }}
      />
    ) : (

    <motion.div
      key="tasks"
      variants={pageVariants}
      initial="initial"
      animate="animate"
      exit="exit"
      style={{ maxWidth: 640, margin: '0 auto', width: '100%', padding: '2rem 1.5rem 6rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}
    >
      {/* ── Page heading ──────────────────────────────────────────────── */}
      <motion.div variants={item} style={{ paddingBottom: '0.25rem' }}>
        <h2 style={{
          fontFamily: 'var(--font-display)',
          fontSize: 'clamp(1.25rem, 3vw, 1.5rem)',
          fontWeight: 400,
          color: 'var(--text-primary)',
          marginBottom: '0.2rem',
          display: 'flex',
          alignItems: 'baseline',
          gap: 3,
        }}>
          your tasks
          <span aria-hidden="true" style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--color-pebble)', display: 'inline-block', flexShrink: 0, marginBottom: 10 }} />
        </h2>
      </motion.div>

      {/* ── Add input ─────────────────────────────────────────────────── */}
      <motion.div variants={item} style={{
        display: 'flex', gap: '0.5rem', alignItems: 'center',
        background: 'var(--bg-card)', border: '1px solid var(--border)',
        borderRadius: 12, padding: '0.5rem 0.5rem 0.5rem 1rem',
      }}>
        <input
          ref={addInputRef}
          type="text"
          className="no-ring"
          placeholder="add a task or goal..."
          value={addInput}
          onChange={e => setAddInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleAdd()}
          style={{
            flex: 1, background: 'none', border: 'none', outline: 'none',
            fontSize: '0.9rem', color: 'var(--text-primary)', padding: 0, width: 'auto',
          }}
          aria-label="Add a task or goal"
        />
        <button
          className="btn btn-primary"
          style={{ fontSize: '0.85rem', padding: '0.45rem 1.1rem', flexShrink: 0, opacity: !addInput.trim() ? 0.45 : 1 }}
          onClick={handleAdd}
          disabled={!addInput.trim()}
        >
          add
        </button>
      </motion.div>

      {/* ── Time filter ───────────────────────────────────────────────── */}
      <motion.div variants={item} style={{ display: 'flex', gap: '0.55rem', alignItems: 'center' }}>
        <span style={{ fontSize: '0.82rem', color: 'var(--text-muted)', flexShrink: 0 }}>I have</span>
        <input
          type="number"
          value={timeFilter}
          onChange={e => setTimeFilter(e.target.value)}
          min={1}
          style={{
            width: 52, textAlign: 'center', fontSize: '0.82rem', fontWeight: 600,
            padding: '0.22rem 0.3rem', borderRadius: 8,
            border: '1px solid var(--border)', color: 'var(--text-primary)', background: 'var(--bg-card)',
          }}
          aria-label="Available minutes"
        />
        <span style={{ fontSize: '0.82rem', color: 'var(--text-muted)', flexShrink: 0 }}>minutes</span>
        <button
          className="btn btn-ghost"
          style={{ fontSize: '0.8rem', padding: '0.28rem 0.75rem', opacity: (timeFilter && !smartPlanLoading) ? 1 : 0.45 }}
          onClick={() => timeFilter && !smartPlanLoading && buildSmartPlan(timeFilter)}
          disabled={!timeFilter || smartPlanLoading}
        >
          {smartPlanLoading ? 'working on it…' : 'show me what fits'}
        </button>
      </motion.div>


      {/* ── Category filter tabs ──────────────────────────────────────── */}
      <AnimatePresence>
        {(categories.length > 0 || catFormOpen) && (
          <motion.div
            variants={item}
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', overflow: 'hidden' }}
          >
            {/* Tab row — pills on left, hide completed on far right */}
            <div style={{ display: 'flex', gap: '0.35rem', alignItems: 'center', overflowX: 'auto', paddingBottom: 2, scrollbarWidth: 'none' }}>

              {/* "all" tab */}
              <button
                onClick={() => setActiveCategoryColor(null)}
                style={{
                  flexShrink: 0, padding: '0.26rem 0.72rem', borderRadius: 99,
                  fontSize: '0.76rem', fontFamily: 'inherit', cursor: 'pointer',
                  border: activeCategoryColor === null ? '1px solid var(--color-pebble)' : '1px solid var(--border)',
                  background: activeCategoryColor === null ? 'var(--color-pebble-soft)' : 'transparent',
                  color: activeCategoryColor === null ? 'var(--text-primary)' : 'var(--text-muted)',
                  fontWeight: activeCategoryColor === null ? 600 : 400,
                  transition: 'all 0.18s ease',
                }}
                onMouseEnter={e => { if (activeCategoryColor !== null) { e.currentTarget.style.borderColor = 'var(--color-pebble)'; e.currentTarget.style.color = 'var(--text-secondary)' } }}
                onMouseLeave={e => { if (activeCategoryColor !== null) { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--text-muted)' } }}
              >
                all
              </button>

              {/* Category pills */}
              {categories.map(cat => {
                const clr     = GROUP_COLORS[cat.color]
                const isActive = activeCategoryColor === cat.color
                return (
                  <div
                    key={cat.id}
                    style={{ position: 'relative', flexShrink: 0, display: 'flex', alignItems: 'center' }}
                    onMouseEnter={e => { const x = e.currentTarget.querySelector('.cat-x'); if (x) x.style.opacity = '1' }}
                    onMouseLeave={e => { const x = e.currentTarget.querySelector('.cat-x'); if (x) x.style.opacity = '0' }}
                  >
                    <button
                      onClick={() => setActiveCategoryColor(isActive ? null : cat.color)}
                      style={{
                        padding: '0.26rem 1.5rem 0.26rem 0.62rem',
                        borderRadius: 99, fontSize: '0.76rem', fontFamily: 'inherit', cursor: 'pointer',
                        display: 'flex', alignItems: 'center', gap: '0.28rem',
                        border: isActive ? `1px solid ${clr.css}` : '1px solid var(--border)',
                        background: isActive ? clr.soft : 'transparent',
                        color: isActive ? 'var(--text-primary)' : 'var(--text-muted)',
                        fontWeight: isActive ? 600 : 400,
                        transition: 'all 0.18s ease',
                      }}
                      onMouseEnter={e => { if (!isActive) { e.currentTarget.style.borderColor = clr.css; e.currentTarget.style.color = 'var(--text-secondary)' } }}
                      onMouseLeave={e => { if (!isActive) { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--text-muted)' } }}
                    >
                      <span style={{ width: 6, height: 6, borderRadius: '50%', background: clr.css, flexShrink: 0, display: 'inline-block' }} />
                      {cat.name}
                    </button>
                    <button
                      className="cat-x"
                      onClick={e => { e.stopPropagation(); dispatch(tasksActions.deleteCategory(cat.id)) }}
                      aria-label={`remove ${cat.name} category`}
                      style={{
                        position: 'absolute', right: 4, top: '50%', transform: 'translateY(-50%)',
                        background: 'none', border: 'none', cursor: 'pointer',
                        color: 'var(--text-muted)', fontSize: '0.65rem', lineHeight: 1,
                        width: 14, height: 14, borderRadius: '50%', padding: 0,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        opacity: 0, transition: 'opacity 0.15s ease, background 0.15s ease',
                      }}
                      onMouseEnter={e => { e.currentTarget.style.background = 'var(--accent-soft)'; e.currentTarget.style.color = 'var(--text-primary)' }}
                      onMouseLeave={e => { e.currentTarget.style.background = 'none'; e.currentTarget.style.color = 'var(--text-muted)' }}
                    >
                      ×
                    </button>
                  </div>
                )
              })}

              {/* + pill — hidden once all 4 colors are claimed */}
              {!catFormOpen && categories.length < 4 && (
                <button
                  onClick={() => {
                    const used = categories.map(c => c.color)
                    const next = GROUP_COLOR_KEYS.find(k => !used.includes(k)) || 'sky'
                    setCatFormColor(next)
                    setCatFormOpen(true)
                    setTimeout(() => catNameInputRef.current?.focus(), 60)
                  }}
                  style={{
                    flexShrink: 0, padding: '0.26rem 0.55rem', borderRadius: 99,
                    fontSize: '0.76rem', fontFamily: 'inherit', cursor: 'pointer',
                    border: '1px dashed var(--border)', background: 'transparent',
                    color: 'var(--text-muted)', transition: 'border-color 0.18s ease, color 0.18s ease',
                  }}
                  onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--color-pebble)'; e.currentTarget.style.color = 'var(--text-secondary)' }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--text-muted)' }}
                >
                  +
                </button>
              )}

              {/* hide completed — lives here when categories are visible */}
              {allTasks.some(t => t.done) && (
                <button
                  onClick={() => setShowCompleted(s => !s)}
                  style={{
                    flexShrink: 0, marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer',
                    fontSize: '0.74rem', color: 'var(--text-muted)', padding: '0.15rem 0',
                    fontFamily: 'inherit', transition: 'color 0.18s ease',
                  }}
                  onMouseEnter={e => { e.currentTarget.style.color = 'var(--text-secondary)' }}
                  onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-muted)' }}
                >
                  {showCompleted ? 'hide completed' : 'show completed'}
                </button>
              )}
            </div>

            {/* Inline category creation form */}
            <AnimatePresence>
              {catFormOpen && (
                <motion.div
                  ref={catFormRef}
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4 }}
                  transition={{ duration: 0.18 }}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '0.6rem',
                    background: 'var(--bg-card)', border: '1px solid var(--border)',
                    borderLeft: `3px solid ${GROUP_COLORS[catFormColor].css}`,
                    borderRadius: 10, padding: '0.55rem 0.85rem',
                  }}
                >
                  <input
                    ref={catNameInputRef}
                    autoFocus
                    value={catFormName}
                    onChange={e => setCatFormName(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter') handleCreateCategory()
                      if (e.key === 'Escape') { setCatFormOpen(false); setCatFormName('') }
                    }}
                    placeholder="category name..."
                    style={{
                      flex: 1, background: 'none', border: 'none', outline: 'none',
                      fontSize: '0.84rem', color: 'var(--text-primary)', fontFamily: 'inherit',
                    }}
                  />
                  <ColorSwatches
                    value={catFormColor}
                    onChange={setCatFormColor}
                    size={13}
                    disabledKeys={categories.map(c => c.color)}
                  />
                  <button
                    className="btn btn-primary"
                    style={{ fontSize: '0.74rem', padding: '0.24rem 0.65rem', flexShrink: 0, opacity: catFormName.trim() ? 1 : 0.45 }}
                    onClick={handleCreateCategory}
                    disabled={!catFormName.trim()}
                  >
                    create
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Utility row — only shown when no categories exist */}
      {categories.length === 0 && !catFormOpen && (
        <motion.div variants={item} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <button
            onClick={() => { setCatFormColor('sky'); setCatFormOpen(true); setTimeout(() => catNameInputRef.current?.focus(), 60) }}
            style={{
              background: 'none', border: 'none', cursor: 'pointer', padding: '0.15rem 0',
              fontSize: '0.74rem', color: 'var(--text-muted)', fontFamily: 'inherit',
              display: 'flex', alignItems: 'center', gap: '0.3rem',
              transition: 'color 0.18s ease',
            }}
            onMouseEnter={e => { e.currentTarget.style.color = 'var(--color-pebble)' }}
            onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-muted)' }}
          >
            <span style={{ fontSize: '0.8rem' }}>+</span> organize into categories
          </button>
          {allTasks.some(t => t.done) && (
            <button
              onClick={() => setShowCompleted(s => !s)}
              style={{
                background: 'none', border: 'none', cursor: 'pointer',
                fontSize: '0.74rem', color: 'var(--text-muted)',
                padding: '0.15rem 0', fontFamily: 'inherit',
                transition: 'color 0.18s ease', flexShrink: 0,
              }}
              onMouseEnter={e => { e.currentTarget.style.color = 'var(--text-secondary)' }}
              onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-muted)' }}
            >
              {showCompleted ? 'hide completed' : 'show completed'}
            </button>
          )}
        </motion.div>
      )}

      {/* ── Task groups ───────────────────────────────────────────────── */}
      {(() => {
        const myTasksGroup = groups.find(g => g.name === 'My Tasks' && g.source === 'manual')
        const otherGroups  = groups.filter(g => !(g.name === 'My Tasks' && g.source === 'manual'))
        // Apply category filter — My Tasks always visible
        const visibleOtherGroups = activeCategoryColor === null
          ? otherGroups
          : otherGroups.filter(g => g.groupColor === activeCategoryColor)

        function renderGroupCard(g, isPermanent = false) {
          return (
            <motion.div key={g.id} variants={item} style={{ borderRadius: 14 }}>
              <motion.div
                animate={{
                  boxShadow: highlightGroupId === g.id
                    ? ['0 0 0 0px rgba(111,169,158,0)', '0 0 0 4px rgba(111,169,158,0.35)', '0 0 0 4px rgba(111,169,158,0.35)', '0 0 0 0px rgba(111,169,158,0)']
                    : '0 0 0 0px rgba(111,169,158,0)',
                }}
                transition={{ duration: 2.4, ease: 'easeInOut' }}
                style={{ borderRadius: 14 }}
              >
                <TaskGroupCard
                  group={g}
                  isOpen={expandedGroupId === g.id}
                  onToggle={() => toggleGroup(g.id)}
                  timeFilter={timeFilter}
                  timeFilterActive={false}
                  onOpenBreakdown={({ task, groupId }) => setBreakdownTask({ task, groupId })}
                  showCompleted={showCompleted}
                  isPermanent={isPermanent}
                  isDropTarget={dragOverGroupId === g.id && dragActiveId !== null}
                  onDeleteGroup={() => dispatch(tasksActions.deleteGroup(g.id))}
                />
              </motion.div>
            </motion.div>
          )
        }

        return (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragStart={handleDragStart}
            onDragOver={handleDragOver}
            onDragEnd={handleDragEnd}
          >
          <motion.div variants={stagger} initial="initial" animate="animate"
            style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}
          >
            {/* My Tasks — always first, permanent — droppable but not sortable */}
            {myTasksGroup && (
              <DroppableGroupWrapper id={myTasksGroup.id}>
                {renderGroupCard(myTasksGroup, true)}
              </DroppableGroupWrapper>
            )}

            {/* Separator between My Tasks and project groups */}
            {myTasksGroup && visibleOtherGroups.length > 0 && (
              <div style={{ height: 1, background: 'var(--border)', opacity: 0.4, margin: '0.1rem 0' }} />
            )}

            {/* Other groups — sortable for drag reorder */}
            <SortableContext items={visibleOtherGroups.map(g => g.id)} strategy={verticalListSortingStrategy}>
              {visibleOtherGroups.map(g => (
                <SortableGroupItem key={g.id} id={g.id}>
                  {renderGroupCard(g, false)}
                </SortableGroupItem>
              ))}
            </SortableContext>

            {/* + new group inline form — always at the bottom */}
            <motion.div variants={item}>
              <AnimatePresence initial={false}>
                {newGroupOpen && (
                  <motion.div
                    key="new-group-form"
                    ref={newGroupFormRef}
                    initial={{ opacity: 0, y: -6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -6 }}
                    transition={{ duration: 0.2 }}
                    style={{
                      background: 'var(--bg-card)', border: '1px solid var(--border)',
                      borderLeft: `3px solid ${GROUP_COLORS[newGroupColor].css}`,
                      borderRadius: 12, padding: '0.75rem 1rem',
                      display: 'flex', alignItems: 'center', gap: '0.65rem',
                    }}
                  >
                    <input
                      ref={newGroupInputRef}
                      autoFocus
                      value={newGroupName}
                      onChange={e => setNewGroupName(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === 'Enter') handleCreateGroup()
                        if (e.key === 'Escape') { setNewGroupOpen(false); setNewGroupName('') }
                      }}
                      placeholder="group name..."
                      style={{
                        flex: 1, background: 'none', border: 'none', outline: 'none',
                        fontSize: '0.88rem', fontWeight: 600, color: 'var(--text-primary)',
                        fontFamily: 'inherit',
                      }}
                    />
                    <ColorSwatches value={newGroupColor} onChange={setNewGroupColor} size={14} />
                    <button
                      className="btn btn-primary"
                      style={{ fontSize: '0.78rem', padding: '0.3rem 0.75rem', flexShrink: 0, opacity: newGroupName.trim() ? 1 : 0.45 }}
                      onClick={handleCreateGroup}
                      disabled={!newGroupName.trim()}
                    >
                      create
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          </motion.div>
          </DndContext>
        )
      })()}

      {/* ── Paused section ────────────────────────────────────────────── */}
      {pausedAll.length > 0 && (
        <motion.div
          initial={{ opacity: 0 }} animate={{ opacity: 1 }}
          style={{
            background: 'var(--bg-card)', border: '1px solid var(--border)',
            borderLeft: '3px solid var(--color-paused)', borderRadius: 12, overflow: 'hidden',
          }}
        >
          <button
            onClick={() => setPausedOpen(o => !o)}
            style={{
              width: '100%', display: 'flex', alignItems: 'center', gap: '0.6rem',
              padding: '0.75rem 1.1rem', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left',
            }}
          >
            <div style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--color-paused)', flexShrink: 0 }} />
            <span style={{ fontSize: '0.85rem', fontWeight: 500, color: 'var(--text-secondary)' }}>
              paused · {pausedAll.length} task{pausedAll.length !== 1 ? 's' : ''}
            </span>
            <motion.span
              animate={{ rotate: pausedOpen ? 90 : 0 }}
              transition={{ duration: 0.2 }}
              style={{ color: 'var(--text-muted)', fontSize: '0.82rem', marginLeft: 'auto', lineHeight: 1 }}
            >
              ›
            </motion.span>
          </button>

          <AnimatePresence initial={false}>
            {pausedOpen && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.25 }}
                style={{ overflow: 'hidden' }}
              >
                <div style={{ padding: '0 1.1rem 0.85rem', display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                  {pausedAll.map(t => {
                    const parentGroup = groups.find(g => g.tasks.some(gt => gt.id === t.id))
                    return (
                      <div key={t.id} style={{ display: 'flex', gap: '0.65rem', alignItems: 'center', padding: '0.4rem 0' }}>
                        <div style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--color-paused)', flexShrink: 0 }} />
                        <span style={{ flex: 1, fontSize: '0.85rem', color: 'var(--text-secondary)' }}>{t.task_name}</span>
                        <button
                          className="btn btn-ghost"
                          style={{ fontSize: '0.78rem', padding: '0.2rem 0.65rem', color: 'var(--color-active)', borderColor: 'var(--color-active)' }}
                          onClick={() => dispatch(tasksActions.resumeTask({ groupId: parentGroup?.id, taskId: t.id }))}
                        >
                          resume
                        </button>
                      </div>
                    )
                  })}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      )}

      {/* ── Pebble chat ──────────────────────────────────────────────── */}
      {groups.length > 0 && (
        <motion.div
          ref={qaChatRef}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1, transition: { delay: 0.3, duration: 0.4 } }}
          style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginTop: '0.25rem' }}
        >
          {/* Divider */}
          <div style={{ height: 1, background: 'var(--border)' }} />

          {/* Chat thread */}
          <AnimatePresence initial={false}>
            {qaMessages.map(msg => (
              <motion.div
                key={msg.id}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0, transition: { duration: 0.3, ease: [0.4, 0, 0.2, 1] } }}
              >
                {msg.role === 'assistant' ? (
                  // Multi-bubble for assistant
                  <div style={{ display: 'flex', gap: '0.6rem', alignItems: 'flex-start' }}>
                    <motion.div
                      animate={{ scale: [0.88, 1.08, 0.88], opacity: [0.7, 1, 0.7] }}
                      transition={{ duration: 3.5, repeat: Infinity, ease: 'easeInOut' }}
                      style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--color-pebble)', flexShrink: 0, marginTop: '0.9rem' }}
                    />
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', maxWidth: '80%' }}>
                      {splitIntoBubbles(msg.content).map((chunk, ci) => (
                        <motion.div
                          key={ci}
                          initial={{ opacity: 0, y: 4 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ duration: 0.3, ease: [0.25, 0.46, 0.45, 0.94], delay: ci * 0.1 }}
                          style={{
                            background: 'rgba(200,148,80,0.07)', border: '1px solid rgba(200,148,80,0.16)',
                            borderRadius: '18px 18px 18px 4px', padding: '0.75rem 1rem',
                            fontSize: '0.88rem', color: 'var(--text-primary)', lineHeight: 1.65,
                            wordBreak: 'break-word', boxShadow: '0 3px 14px rgba(200,148,80,0.07)',
                          }}
                        >
                          {renderMarkdown(chunk)}
                        </motion.div>
                      ))}
                      {/* Route action buttons (e.g. "start focus") */}
                      {msg.buttons?.length > 0 && (
                        <motion.div
                          initial={{ opacity: 0, y: 4 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ duration: 0.3, delay: 0.15 }}
                          style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', paddingTop: '0.1rem' }}
                        >
                          {msg.buttons.map((btn, bi) => (
                            <button
                              key={bi}
                              className="btn btn-primary"
                              style={{ fontSize: '0.8rem', padding: '0.35rem 0.9rem', borderRadius: 99 }}
                              onClick={() => navigate(btn.value)}
                            >
                              {btn.label}
                            </button>
                          ))}
                        </motion.div>
                      )}
                    </div>
                  </div>
                ) : (
                  // User message
                  <div style={{ display: 'flex', gap: '0.6rem', alignItems: 'flex-start', flexDirection: 'row-reverse' }}>
                    <div style={{
                      width: 24, height: 24, borderRadius: '50%', flexShrink: 0, marginTop: '0.2rem',
                      background: 'rgba(42,122,144,0.12)', border: '1px solid rgba(42,122,144,0.2)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: '0.65rem', fontWeight: 600, color: 'var(--color-active)',
                    }}>
                      {(prefs.name && prefs.name !== 'there') ? prefs.name.charAt(0).toUpperCase() : 'Y'}
                    </div>
                    <div style={{
                      maxWidth: '80%', background: 'rgba(42,122,144,0.08)',
                      border: '1px solid rgba(42,122,144,0.16)', borderRadius: '18px 18px 4px 18px',
                      padding: '0.75rem 1rem', fontSize: '0.88rem', color: 'var(--text-primary)',
                      lineHeight: 1.65, wordBreak: 'break-word', boxShadow: '0 2px 10px rgba(42,122,144,0.05)',
                    }}>
                      {msg.content}
                    </div>
                  </div>
                )}
              </motion.div>
            ))}

            {/* In-flight streaming bubble — single bubble until done */}
            {qaStreaming && (
              <motion.div
                key="streaming"
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0, transition: { duration: 0.25 } }}
                style={{ display: 'flex', gap: '0.6rem', alignItems: 'flex-start' }}
              >
                <motion.div
                  animate={{ scale: [0.88, 1.08, 0.88], opacity: [0.7, 1, 0.7] }}
                  transition={{ duration: 3.5, repeat: Infinity, ease: 'easeInOut' }}
                  style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--color-pebble)', flexShrink: 0, marginTop: '0.9rem' }}
                />
                <div style={{
                  background: 'rgba(200,148,80,0.07)', border: '1px solid rgba(200,148,80,0.16)',
                  borderRadius: '18px 18px 18px 4px', padding: '0.75rem 1rem',
                  fontSize: '0.88rem', color: 'var(--text-primary)', lineHeight: 1.65,
                  maxWidth: '80%', boxShadow: '0 3px 14px rgba(200,148,80,0.07)',
                }}>
                  {qaStream
                    ? renderMarkdown(qaStream)
                    : (
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
                    )
                  }
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Chat input */}
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            <input
              ref={qaInputRef}
              type="text"
              placeholder="ask pebble to move, merge, prioritize, or explain..."
              value={qaInput}
              onChange={e => setQaInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleQaSubmit()}
              style={{
                flex: 1, borderRadius: 99, padding: '0.6rem 1.1rem',
                fontSize: '0.85rem', width: 'auto',
              }}
              aria-label="Ask Pebble about your tasks"
            />
            <button
              className="btn btn-primary"
              style={{ borderRadius: 99, padding: '0.6rem 1.1rem', fontSize: '0.85rem', flexShrink: 0, opacity: !qaInput.trim() || qaStreaming ? 0.45 : 1 }}
              disabled={!qaInput.trim() || qaStreaming}
              onClick={handleQaSubmit}
            >
              send
            </button>
          </div>
        </motion.div>
      )}
    </motion.div>

    )} {/* end smartPlanActive ternary */}
    </AnimatePresence>
    </div>

    {/* ── Right panel: breakdown chat ────────────────────────────────── */}
    <AnimatePresence>
      {breakdownTask && (
        <motion.div
          key="breakdown-panel"
          initial={{ x: '100%', opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          exit={{ x: '100%', opacity: 0 }}
          transition={{ type: 'spring', stiffness: 320, damping: 32 }}
          style={{
            width: 380,
            flexShrink: 0,
            borderLeft: '1px solid var(--border)',
            background: 'var(--bg-primary)',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
          }}
        >
          <BreakdownChatPanel
            key={breakdownTask?.task?.id}
            task={breakdownTask.task}
            groupId={breakdownTask.groupId}
            onClose={() => setBreakdownTask(null)}
            onReplaceTask={(gId, taskId, newTasks) => {
              dispatch(tasksActions.replaceTask({ groupId: gId, taskId, newTasks }))
              setBreakdownTask(null)
            }}
          />
        </motion.div>
      )}
    </AnimatePresence>

    </div>
  )
}
