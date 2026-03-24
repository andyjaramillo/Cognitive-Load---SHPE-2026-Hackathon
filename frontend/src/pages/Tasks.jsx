import { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useDispatch, useSelector } from 'react-redux'
import { useNavigate, useLocation } from 'react-router-dom'
import { tasksActions } from '../store'
import { decompose, fetchNudge, summariseStream, loadTasks, saveTasks, chatStream } from '../utils/api'
import {
  DndContext, closestCenter, PointerSensor, useSensor, useSensors,
} from '@dnd-kit/core'
import {
  SortableContext, verticalListSortingStrategy, useSortable, arrayMove,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { splitIntoBubbles, renderMarkdown } from '../utils/bubbles'
import { PriorityChip } from '../components/PriorityChip'

// ── Helpers ───────────────────────────────────────────────────────────────── //

function formatMinutes(m) {
  if (!m || m <= 0) return null
  if (m < 60) return `~${m} min`
  const h = Math.floor(m / 60), rem = m % 60
  return rem ? `~${h} hr ${rem} min` : `~${h} hr`
}

function sumMinutes(tasks) {
  return tasks.filter(t => !t.done && !t.paused).reduce((s, t) => s + (t.duration_minutes || 0), 0)
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

// ── DragHandle ────────────────────────────────────────────────────────────── //

function DragHandle({ listeners, attributes }) {
  return (
    <span
      {...listeners}
      {...attributes}
      className="drag-handle"
      style={{
        display: 'flex', flexDirection: 'column', gap: 2.5,
        padding: '4px 6px', cursor: 'grab',
        color: 'var(--text-muted)', opacity: 0,
        transition: 'opacity 0.2s ease', flexShrink: 0,
        userSelect: 'none', touchAction: 'none',
        alignSelf: 'center',
      }}
      aria-label="Drag to reorder"
    >
      {[0, 1, 2].map(i => (
        <span key={i} style={{ display: 'flex', gap: 3 }}>
          <span style={{ width: 3, height: 3, borderRadius: '50%', background: 'currentColor' }} />
          <span style={{ width: 3, height: 3, borderRadius: '50%', background: 'currentColor' }} />
        </span>
      ))}
    </span>
  )
}

// ── SortableTaskItem ──────────────────────────────────────────────────────── //

function SortableTaskItem({ id, children }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id })
  return (
    <div
      ref={setNodeRef}
      className="task-row-wrapper"
      style={{
        transform: CSS.Transform.toString(transform),
        transition: transition || 'transform 200ms cubic-bezier(0.25, 1, 0.5, 1)',
        zIndex: isDragging ? 50 : undefined,
        position: 'relative',
        boxShadow: isDragging ? '0 4px 16px rgba(0,0,0,0.08)' : undefined,
        borderRadius: isDragging ? 10 : undefined,
        background: isDragging ? 'var(--bg-card)' : undefined,
        opacity: isDragging ? 0.92 : 1,
      }}
    >
      {children({ isDragging, dragHandleProps: { listeners, attributes } })}
    </div>
  )
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

// ── MoreMenu ──────────────────────────────────────────────────────────────── //

function MoreMenu({ onClose, onEdit, onPause, onDelete, onChatRequest, taskName, groupName, triggerRef }) {
  const menuRef = useRef(null)

  useEffect(() => {
    function handleClick(e) {
      if (triggerRef?.current && triggerRef.current.contains(e.target)) return
      if (menuRef.current && !menuRef.current.contains(e.target)) onClose()
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [onClose, triggerRef])

  const menuItems = [
    { id: 'edit',   dot: 'var(--color-upcoming)', label: 'Edit task',  desc: 'Change text or time estimate' },
    { id: 'pause',  dot: 'var(--color-paused)',   label: 'Pause',      desc: 'Set aside without deleting' },
    { id: 'delete', dot: 'var(--color-inactive)', label: 'Delete',     desc: 'Remove permanently', divider: true },
  ]

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
          <button
            onClick={() => {
              if (mi.id === 'edit')   { onEdit(); onClose() }
              else if (mi.id === 'pause')  { onPause(); onClose() }
              else if (mi.id === 'delete') { onDelete(); onClose() }
              else if (mi.id === 'move')  {
                onChatRequest?.(`move "${taskName}" to a different group`)
                onClose()
              }
              else if (mi.id === 'merge') {
                onChatRequest?.(`merge the "${groupName}" group with another group`)
                onClose()
              }
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
            <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginLeft: 'auto' }}>
              {mi.desc}
            </span>
          </button>
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

// ── TaskRow — unified expand-in-place task component ─────────────────────── //
// Replaces the old ActiveTaskCard + UpcomingTaskRow split.
// All non-completed tasks render in their list position.
// Clicking expands to reveal details + action buttons; clicking again collapses.

function TaskRow({ task, groupId, groupName, isExpanded, onToggleExpand, onComplete, onDelete, onChatRequest, onOpenBreakdown, dimmed, dragHandleProps }) {
  const dispatch = useDispatch()
  const navigate = useNavigate()
  const [moreOpen, setMoreOpen] = useState(false)
  const moreBtnRef = useRef(null)
  const [editing, setEditing]   = useState(false)
  const [editName, setEditName] = useState(task.task_name)
  const [editMins, setEditMins] = useState(String(task.duration_minutes || ''))

  // Keep edit fields in sync if task is updated externally
  useEffect(() => {
    if (!editing) {
      setEditName(task.task_name)
      setEditMins(String(task.duration_minutes || ''))
    }
  }, [task.task_name, task.duration_minutes, editing])

  function saveEdit() {
    const name = editName.trim()
    const mins = parseInt(editMins, 10)
    const nameChanged = name && name !== task.task_name
    dispatch(tasksActions.updateTask({
      groupId, taskId: task.id,
      task_name: name || task.task_name,
      duration_minutes: isNaN(mins) ? task.duration_minutes : mins,
      ...(nameChanged ? { motivation_nudge: '' } : {}),
    }))
    setEditing(false)
  }

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: dimmed ? 0.3 : 1, y: 0 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.25 }}
      style={{
        borderRadius: 14,
        background: isExpanded ? 'rgba(42,122,144,0.05)' : 'transparent',
        border: isExpanded ? '1px solid rgba(42,122,144,0.18)' : '1px solid transparent',
        transition: 'background 0.25s ease, border-color 0.25s ease',
        overflow: 'hidden',
      }}
    >
      {/* Collapsed row — always visible, click to expand/collapse */}
      <div
        role="button"
        tabIndex={editing ? -1 : 0}
        aria-expanded={isExpanded}
        onKeyDown={e => { if (!editing && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); onToggleExpand() } }}
        style={{
          display: 'flex', gap: '0.55rem', alignItems: 'center',
          padding: isExpanded ? '0.65rem 0.75rem 0.45rem' : '0.5rem 0.5rem 0.5rem 0',
          minHeight: 44,
          cursor: editing ? 'default' : 'pointer',
          transition: 'padding 0.25s ease',
          outline: 'none',
        }}
        onFocus={e => { if (!editing) e.currentTarget.style.boxShadow = '0 0 0 2px var(--color-active)' }}
        onBlur={e => { e.currentTarget.style.boxShadow = 'none' }}
        onClick={e => {
          if (editing) return
          // Only block clicks originating from interactive elements (button, input)
          if (e.target.closest('button') || e.target.tagName === 'INPUT') return
          onToggleExpand()
        }}
      >
        {/* Drag handle — only appears on non-expanded rows via CSS */}
        {dragHandleProps && <DragHandle {...dragHandleProps} />}

        <TaskCircle done={false} active={isExpanded} onClick={e => { onComplete(); }} size={isExpanded ? 20 : 18} />

        <div style={{ flex: 1, minWidth: 0 }}>
          {editing ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
              <input
                autoFocus
                value={editName}
                onChange={e => setEditName(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && saveEdit()}
                onClick={e => e.stopPropagation()}
                style={{ fontSize: '0.88rem', padding: '0.3rem 0.5rem', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text-primary)', width: '100%' }}
              />
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <input
                  type="number"
                  value={editMins}
                  onChange={e => setEditMins(e.target.value)}
                  onClick={e => e.stopPropagation()}
                  style={{ width: 56, fontSize: '0.82rem', padding: '0.25rem 0.4rem', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text-primary)' }}
                  min={1}
                />
                <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>min</span>
                <button className="btn btn-primary" style={{ fontSize: '0.78rem', padding: '0.25rem 0.7rem', marginLeft: 'auto' }} onClick={e => { e.stopPropagation(); saveEdit() }}>save</button>
                <button className="btn btn-ghost"   style={{ fontSize: '0.78rem', padding: '0.25rem 0.7rem' }} onClick={e => { e.stopPropagation(); setEditing(false) }}>cancel</button>
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', flexWrap: 'wrap' }}>
              <span style={{
                fontSize: isExpanded ? '0.9rem' : '0.85rem',
                fontWeight: isExpanded ? 600 : 400,
                color: isExpanded ? 'var(--text-primary)' : 'var(--text-secondary)',
                lineHeight: 1.4,
                transition: 'font-size 0.2s ease, font-weight 0.2s ease',
              }}>
                {task.task_name}
              </span>
              <PriorityChip
                priority={task.priority ?? 2}
                onChange={newP => {
                  dispatch(tasksActions.updateTask({ groupId, taskId: task.id, priority: newP }))
                }}
              />
            </div>
          )}
        </div>

        {/* Duration — always visible when not editing */}
        {!editing && task.duration_minutes > 0 && (
          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', flexShrink: 0 }}>
            {formatMinutes(task.duration_minutes)}
          </span>
        )}

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
            <div style={{ padding: '0 0.75rem 0.75rem', paddingLeft: dragHandleProps ? '1.6rem' : '2.6rem' }}>

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
              <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
                <button
                  className="btn btn-primary"
                  style={{ fontSize: '0.78rem', padding: '0.35rem 0.9rem', minHeight: 36 }}
                  onClick={e => { e.stopPropagation(); onOpenBreakdown?.({ task, groupId }) }}
                >
                  break down
                </button>
                <button
                  className="btn btn-ghost"
                  style={{ fontSize: '0.78rem', padding: '0.35rem 0.8rem', minHeight: 36 }}
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
                  style={{ fontSize: '0.78rem', padding: '0.35rem 0.8rem', minHeight: 36 }}
                  onClick={e => { e.stopPropagation(); setMoreOpen(o => !o) }}
                  aria-expanded={moreOpen}
                >
                  more ···
                </button>
              </div>

              {/* More menu */}
              <AnimatePresence>
                {moreOpen && (
                  <MoreMenu
                    onClose={() => setMoreOpen(false)}
                    onEdit={() => { setEditing(true) }}
                    onPause={() => dispatch(tasksActions.pauseTask({ groupId, taskId: task.id }))}
                    onDelete={onDelete}
                    onChatRequest={onChatRequest}
                    taskName={task.task_name}
                    groupName={groupName}
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

// ── TaskGroupCard ─────────────────────────────────────────────────────────── //

function TaskGroupCard({ group, isOpen, onToggle, timeFilter, timeFilterActive, onStartNewGroup, onChatRequest, onOpenBreakdown, showCompleted }) {
  const dispatch = useDispatch()
  const navigate = useNavigate()

  const [confirmDelete, setConfirmDelete] = useState(false)
  // Which task is currently expanded (shows details + action buttons)
  const [expandedTaskId, setExpandedTaskId] = useState(null)

  // DnD sensors — 8px activation distance so taps don't accidentally start a drag
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }))

  const pendingTasks   = group.tasks.filter(t => !t.done && !t.paused)
  const completedTasks = group.tasks.filter(t => t.done)
  const totalUnpaused  = group.tasks.filter(t => !t.paused).length
  const doneCount      = completedTasks.length
  const timeLeft       = sumMinutes(group.tasks)
  const allDone        = totalUnpaused > 0 && doneCount >= totalUnpaused

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

  function handleDragEnd(event) {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const oldIndex = pendingTasks.findIndex(t => t.id === active.id)
    const newIndex = pendingTasks.findIndex(t => t.id === over.id)
    if (oldIndex === -1 || newIndex === -1) return
    // Map pending indices back to full group task indices
    const fullOldIndex = group.tasks.findIndex(t => t.id === active.id)
    const fullNewIndex = group.tasks.findIndex(t => t.id === over.id)
    dispatch(tasksActions.reorderTasks({ groupId: group.id, oldIndex: fullOldIndex, newIndex: fullNewIndex }))
  }

  const leftBorderColor = group.source === 'document' ? 'var(--color-active)'
                        : group.source === 'ai'       ? 'var(--color-upcoming)'
                        : 'var(--border)'

  return (
    <motion.div
      layout
      style={{
        background: 'var(--bg-card)',
        border: '1px solid var(--border)',
        borderLeft: `3px solid ${leftBorderColor}`,
        borderRadius: 12,
        overflow: 'hidden',
      }}
    >
      {/* Header — toggle area + delete button */}
      <div style={{ display: 'flex', alignItems: 'stretch' }}>
        <button
          onClick={onToggle}
          onMouseEnter={e => { e.currentTarget.style.background = 'var(--accent-soft)' }}
          onMouseLeave={e => { e.currentTarget.style.background = 'none' }}
          style={{
            flex: 1, display: 'flex', alignItems: 'center', gap: '0.75rem',
            padding: '0.85rem 1.1rem', background: 'none', border: 'none',
            cursor: 'pointer', textAlign: 'left', transition: 'background 0.18s ease', minWidth: 0,
          }}
          aria-expanded={isOpen}
        >
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: '0.88rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '0.1rem' }}>
              {group.name}
            </div>
            <div style={{ fontSize: '0.76rem', color: 'var(--text-muted)' }}>
              {doneCount} of {totalUnpaused} done
              {timeLeft > 0 && ` · ${formatMinutes(timeLeft)}`}
            </div>
          </div>

          {/* Mini progress bar */}
          <div style={{ width: 56, height: 3, background: 'rgba(200,148,80,0.22)', borderRadius: 99, flexShrink: 0 }}>
            <motion.div
              animate={{ width: totalUnpaused > 0 ? `${(doneCount / totalUnpaused) * 100}%` : '0%' }}
              transition={{ duration: 0.4, ease: 'easeOut' }}
              style={{ height: '100%', borderRadius: 99, background: allDone ? 'var(--color-done)' : 'var(--color-active)' }}
            />
          </div>

          {/* Chevron */}
          <motion.span
            animate={{ rotate: isOpen ? 90 : 0 }}
            transition={{ duration: 0.22 }}
            style={{ color: 'var(--text-muted)', fontSize: '0.82rem', flexShrink: 0, lineHeight: 1 }}
          >
            ›
          </motion.span>
        </button>

        {/* Trash button */}
        <button
          onClick={e => { e.stopPropagation(); setConfirmDelete(true) }}
          aria-label="Delete group"
          style={{
            background: 'none', border: 'none', borderLeft: '1px solid var(--border)',
            cursor: 'pointer', padding: '0 0.85rem', color: 'var(--text-muted)',
            flexShrink: 0, transition: 'background 0.18s ease, color 0.18s ease',
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
        </button>
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
                delete <strong style={{ color: 'var(--text-primary)', fontWeight: 600 }}>"{group.name}"</strong> and all its tasks?
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
                    you finished everything here. that's real progress.
                  </div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                    total time: {formatMinutes(group.tasks.reduce((s, t) => s + (t.duration_minutes || 0), 0))}
                  </div>
                  <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'center', marginTop: '0.75rem' }}>
                    <button className="btn btn-ghost" style={{ fontSize: '0.8rem', padding: '0.3rem 0.85rem' }} onClick={() => { onToggle(); onStartNewGroup?.() }}>
                      start another group
                    </button>
                    <button className="btn btn-primary" style={{ fontSize: '0.8rem', padding: '0.3rem 0.85rem' }} onClick={() => navigate('/focus', { state: { startBreak: true } })}>
                      take a break
                    </button>
                  </div>
                </motion.div>
              ) : (
                <>
                  {/* Pending tasks — draggable + expand-in-place */}
                  {pendingTasks.length > 0 && (
                    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                      <SortableContext items={pendingTasks.map(t => t.id)} strategy={verticalListSortingStrategy}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                          {pendingTasks.map(t => {
                            const dimmed = timeFilterActive && Number(timeFilter) > 0 && (t.duration_minutes || 0) > Number(timeFilter)
                            return (
                              <SortableTaskItem key={t.id} id={t.id}>
                                {({ isDragging, dragHandleProps }) => (
                                  <TaskRow
                                    task={t}
                                    groupId={group.id}
                                    groupName={group.name}
                                    isExpanded={!isDragging && expandedTaskId === t.id}
                                    onToggleExpand={() => handleToggleExpand(t.id)}
                                    onComplete={() => handleComplete(t.id)}
                                    onDelete={() => dispatch(tasksActions.deleteTask({ groupId: group.id, taskId: t.id }))}
                                    onChatRequest={onChatRequest}
                                    onOpenBreakdown={onOpenBreakdown}
                                    dimmed={dimmed}
                                    dragHandleProps={dragHandleProps}
                                  />
                                )}
                              </SortableTaskItem>
                            )
                          })}
                        </div>
                      </SortableContext>
                    </DndContext>
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
  const prefs        = useSelector(s => s.prefs)
  const [messages,   setMessages]   = useState([])
  const [input,      setInput]      = useState('')
  const [streaming,  setStreaming]  = useState(false)
  const [streamText, setStreamText] = useState('')
  const [applying,   setApplying]   = useState(false)
  const [applyErr,   setApplyErr]   = useState(null)
  const bottomRef   = useRef(null)
  const initialSent = useRef(false)
  const genId       = () => Math.random().toString(36).slice(2, 10)

  const stripMd = t => t
    .replace(/\*\*(.+?)\*\*/g, '$1').replace(/\*(.+?)\*/g, '$1')
    .replace(/^#+\s+/gm, '').replace(/^[-*]\s+/gm, '')

  async function sendChat(text, history = []) {
    setStreaming(true)
    setStreamText('')
    let accumulated = ''
    await chatStream(
      {
        message: text,
        is_greeting: false,
        current_page: 'tasks',
        conversation_history: history.slice(-12).map(m => ({ role: m.role, content: m.content })),
      },
      {
        onToken: t => { accumulated += t; setStreamText(accumulated) },
        onReplace: content => {
          accumulated = content
          setStreamText('')
          setMessages(prev => [...prev, { id: genId(), role: 'assistant', content }])
        },
        onDone: () => {
          if (accumulated) setMessages(prev => [...prev, { id: genId(), role: 'assistant', content: accumulated }])
          setStreamText('')
          setStreaming(false)
          setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 50)
        },
        onError: msg => {
          setMessages(prev => [...prev, { id: genId(), role: 'assistant', content: msg || 'something went quiet. try again?' }])
          setStreamText('')
          setStreaming(false)
        },
      },
    )
  }

  // On mount: seed Pebble with the task context — Pebble's response is the first
  // visible message (the trigger is hidden so the chat opens with Pebble already helping)
  useEffect(() => {
    if (initialSent.current) return
    initialSent.current = true
    const seed = `I want to break down this task: "${task.task_name}"${task.duration_minutes > 0 ? ` (about ${task.duration_minutes} min)` : ''}. walk me through the smaller steps to get this done.`
    sendChat(seed, [])
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function handleSend() {
    const text = input.trim()
    if (!text || streaming) return
    const userMsg = { id: genId(), role: 'user', content: text }
    const next = [...messages, userMsg]
    setMessages(next)
    setInput('')
    await sendChat(text, next)
  }

  async function handleApply() {
    if (applying) return
    setApplying(true)
    setApplyErr(null)
    try {
      const res = await decompose({
        goal: task.task_name,
        granularity: prefs.granularity || 'normal',
        reading_level: prefs.readingLevel || 'standard',
      })
      if (res.flagged) { setApplyErr("Couldn't break that down."); setApplying(false); return }
      const steps = res.steps || []
      if (steps.length > 1) {
        onReplaceTask(groupId, task.id, steps)
      } else {
        setApplyErr("That task is already as simple as it can be.")
        setApplying(false)
      }
    } catch {
      setApplyErr("Something went quiet. Try again?")
      setApplying(false)
    }
  }

  const userInitial = (prefs.name && prefs.name !== 'there') ? prefs.name.charAt(0).toUpperCase() : 'Y'

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {/* Header */}
      <div style={{ padding: '1rem 1.25rem 0.85rem', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem' }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: '0.25rem' }}>
              breaking down
            </div>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: '1rem', fontWeight: 400, color: 'var(--text-primary)', lineHeight: 1.35 }}>
              {task.task_name}
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
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
        {/* Quick apply button */}
        <div style={{ marginTop: '0.7rem' }}>
          <button
            className="btn btn-primary"
            style={{ width: '100%', fontSize: '0.82rem', padding: '0.42rem 1rem', opacity: applying ? 0.55 : 1 }}
            onClick={handleApply}
            disabled={applying}
          >
            {applying ? 'Breaking down…' : 'Break it down for me →'}
          </button>
          {applyErr && (
            <p style={{ fontSize: '0.76rem', color: 'var(--color-ai)', marginTop: '0.3rem', textAlign: 'center' }}>
              {applyErr}
            </p>
          )}
        </div>
      </div>

      {/* Chat thread */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '1rem 1.25rem', display: 'flex', flexDirection: 'column', gap: '0.7rem' }}>
        {messages.map(msg => (
          <motion.div
            key={msg.id}
            initial={{ opacity: 0, y: 5 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.28 }}
          >
            {msg.role === 'assistant' ? (
              // Multi-bubble: dot on left, bubbles stacked to its right
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
                      transition={{ duration: 0.28, ease: [0.25, 0.46, 0.45, 0.94], delay: ci * 0.28 }}
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
              // User message — unchanged
              <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-start', flexDirection: 'row-reverse' }}>
                <div style={{
                  width: 22, height: 22, borderRadius: '50%', flexShrink: 0, marginTop: '0.2rem',
                  background: 'rgba(42,122,144,0.12)', border: '1px solid rgba(42,122,144,0.2)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: '0.62rem', fontWeight: 600, color: 'var(--color-active)',
                }}>
                  {userInitial}
                </div>
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

        {/* In-flight streaming bubble — single bubble until done */}
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
                <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                  {[0,1,2].map(i => (
                    <motion.span key={i}
                      animate={{ scale: [0.85,1.15,0.85], opacity: [0.35,0.9,0.35] }}
                      transition={{ duration: 2.2, delay: i*0.35, repeat: Infinity, ease: 'easeInOut' }}
                      style={{ display: 'block', width: 5, height: 5, borderRadius: '50%', background: 'var(--color-pebble)' }}
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

  // Capture initial groups length at mount time (before any async loads).
  // If groups are already populated (e.g., navigated here from Documents or chat),
  // we don't overwrite Redux with Cosmos data — we just let the save effect persist them.
  const initialGroupsLengthRef = useRef(groups.length)

  // Load tasks from Cosmos on mount
  useEffect(() => {
    loadTasks()
      .then(data => {
        // Only populate from Cosmos if Redux was empty at mount time.
        // This prevents clobbering tasks that Documents/chat created before navigating here.
        if (data.groups && data.groups.length > 0 && initialGroupsLengthRef.current === 0) {
          dispatch(tasksActions.setGroups(data.groups))
        }
      })
      .catch(() => { /* keep whatever is in Redux */ })
      .finally(() => setCosmosSynced(true))
  }, [dispatch])

  // Save tasks to Cosmos whenever groups change (after initial load)
  useEffect(() => {
    if (!cosmosSynced) return
    saveTasks(groups).catch(() => { /* silent — don't interrupt the user */ })
  }, [groups, cosmosSynced])

  // Accordion
  const [expandedGroupId, setExpandedGroupId] = useState(null)
  const [pendingExpand, setPendingExpand] = useState(null) // 'my-tasks' | 'last'

  // Add input
  const [addInput, setAddInput]     = useState('')
  const [addLoading, setAddLoading] = useState(false)
  const [addMsg, setAddMsg]         = useState(null) // { type: 'ai' | 'error', text }
  const addMsgTimer   = useRef(null)
  const addInputRef   = useRef(null)

  // Time filter
  const [timeFilter, setTimeFilter]             = useState('20')
  const [timeFilterActive, setTimeFilterActive] = useState(false)

  // Completed tasks visibility toggle — hidden by default
  const [showCompleted, setShowCompleted] = useState(false)

  // Paused section
  const [pausedOpen, setPausedOpen] = useState(false)

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

  // Cleanup timers on unmount
  useEffect(() => () => {
    clearTimeout(addMsgTimer.current)
  }, [])

  // Called by MoreMenu move/merge — pre-fills chat and scrolls to it
  function handleChatRequest(text) {
    setQaInput(text)
    setTimeout(() => {
      qaInputRef.current?.focus()
      qaChatRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }, 80)
  }

  // Auto-expand document-sourced group on first mount
  useEffect(() => {
    if (expandedGroupId) return
    const docGroup = groups.find(g => g.source === 'document')
    if (docGroup) setExpandedGroupId(docGroup.id)
  // Only run once on mount
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Auto-expand after a new group is added
  useEffect(() => {
    if (pendingExpand === 'my-tasks') {
      const g = groups.find(g => g.name === 'My Tasks' && g.source === 'manual')
      if (g) { setExpandedGroupId(g.id); setPendingExpand(null) }
    } else if (pendingExpand === 'last' && groups.length > 0) {
      setExpandedGroupId(groups[groups.length - 1].id)
      setPendingExpand(null)
    }
  }, [groups, pendingExpand])

  // Global progress stats
  const allTasks  = groups.flatMap(g => g.tasks.filter(t => !t.paused))
  const doneCount = allTasks.filter(t => t.done).length
  const timeLeft  = sumMinutes(allTasks)
  const pausedAll = groups.flatMap(g => g.tasks.filter(t => t.paused))

  function toggleGroup(id) {
    setExpandedGroupId(cur => cur === id ? null : id)
  }

  // Smart add: calls /api/decompose and decides single task vs new group
  async function handleAdd() {
    const text = addInput.trim()
    if (!text || addLoading) return
    setAddLoading(true)
    setAddMsg(null)
    try {
      const res = await decompose({
        goal: text,
        granularity: prefs.granularity || 'normal',
        reading_level: prefs.readingLevel || 'standard',
      })
      if (res.flagged) {
        setAddMsg({ type: 'error', text: "Can't process that right now. Try rephrasing?" })
        setAddLoading(false)
        return
      }
      const steps = res.steps || []
      if (steps.length <= 1) {
        dispatch(tasksActions.addSimpleTask({
          task_name:        steps[0]?.task_name || text,
          duration_minutes: steps[0]?.duration_minutes || 15,
          motivation_nudge: steps[0]?.motivation_nudge || '',
        }))
        setPendingExpand('my-tasks')
        setAddMsg({ type: 'ai', text: "Added to your tasks." })
      } else {
        const groupName = res.group_name || (text.length > 36 ? text.slice(0, 34) + '…' : text)
        dispatch(tasksActions.addGroup({ name: groupName, source: 'ai', tasks: steps }))
        setPendingExpand('last')
        setAddMsg({ type: 'ai', text: `That's a bigger one. I broke it into ${steps.length} steps.` })
      }
      setAddInput('')
    } catch {
      setAddMsg({ type: 'error', text: "Something went quiet. Try again?" })
    }
    setAddLoading(false)
    // Auto-clear the AI message after 4 seconds — clear previous timer first
    clearTimeout(addMsgTimer.current)
    addMsgTimer.current = setTimeout(() => setAddMsg(null), 4000)
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
    await chatStream(
      {
        message:              q,
        is_greeting:          false,
        current_page:         'tasks',
        conversation_history: next.slice(-20).map(m => ({ role: m.role, content: m.content })),
      },
      {
        onToken: token => {
          accumulated += token
          setQaStream(accumulated)
        },
        onReplace: content => {
          accumulated = content
          setQaStream('')
          setQaMessages(prev => [...prev, { id: genQaId(), role: 'assistant', content }])
        },
        onDone: () => {
          if (accumulated) {
            setQaMessages(prev => [...prev, { id: genQaId(), role: 'assistant', content: accumulated }])
          }
          setQaStream('')
          setQaStreaming(false)
          setTimeout(() => qaChatRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }), 50)
        },
        onError: msg => {
          setQaMessages(prev => [...prev, { id: genQaId(), role: 'assistant', content: msg || 'Something went quiet. Want to try again?' }])
          setQaStream('')
          setQaStreaming(false)
        },
      },
    )
  }

  return (
    <div style={{ flex: 1, minHeight: 0, display: 'flex', overflow: 'hidden' }}>

    {/* ── Left panel: task list ─────────────────────────────────────── */}
    <div style={{ flex: 1, overflowY: 'auto', minWidth: 0 }}>
    <motion.div
      variants={pageVariants}
      initial="initial"
      animate="animate"
      exit="exit"
      style={{ maxWidth: 640, margin: '0 auto', width: '100%', padding: '2rem 1.5rem 6rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}
    >
      {/* ── Page heading ──────────────────────────────────────────────── */}
      <motion.div variants={item} style={{ paddingBottom: '0.25rem', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '0.75rem' }}>
        <div>
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
          {allTasks.length > 0 && (
            <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
              {timeLeft > 0 ? `${formatMinutes(timeLeft)} of work left` : 'all done for now'}
            </p>
          )}
        </div>
        {/* Completed tasks toggle — only shown when there are completed tasks */}
        {allTasks.some(t => t.done) && (
          <button
            onClick={() => setShowCompleted(s => !s)}
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              fontSize: '0.75rem', color: 'var(--text-muted)',
              padding: '0.25rem 0', marginTop: '0.15rem',
              transition: 'color 0.2s ease', flexShrink: 0,
              fontFamily: 'inherit',
            }}
            onMouseEnter={e => { e.currentTarget.style.color = 'var(--text-secondary)' }}
            onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-muted)' }}
          >
            {showCompleted ? 'hide completed' : 'show completed'}
          </button>
        )}
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
          placeholder="Add a task or goal..."
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
          style={{ fontSize: '0.85rem', padding: '0.45rem 1.1rem', flexShrink: 0, opacity: !addInput.trim() || addLoading ? 0.45 : 1 }}
          onClick={handleAdd}
          disabled={!addInput.trim() || addLoading}
        >
          {addLoading ? '…' : 'Add'}
        </button>
      </motion.div>

      {/* Add message (AI confirmation or error) */}
      <AnimatePresence>
        {addMsg && (
          <motion.p
            initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            style={{
              fontSize: '0.82rem', textAlign: 'center',
              color: addMsg.type === 'error' ? 'var(--color-ai)' : 'var(--text-muted)',
            }}
          >
            {addMsg.text}
          </motion.p>
        )}
      </AnimatePresence>

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
          style={{ fontSize: '0.8rem', padding: '0.28rem 0.75rem', opacity: timeFilter ? 1 : 0.45 }}
          onClick={() => setTimeFilterActive(a => !a)}
          aria-pressed={timeFilterActive}
        >
          {timeFilterActive ? 'Clear filter' : 'Show me what fits'}
        </button>
      </motion.div>


      {/* ── Task groups ───────────────────────────────────────────────── */}
      <motion.div
        variants={stagger} initial="initial" animate="animate"
        style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}
      >
        {groups.length === 0 ? (
          <motion.div
            variants={item}
            style={{ textAlign: 'center', padding: '3.5rem 1rem' }}
          >
            <motion.div
              animate={{ scale: [0.85, 1.1, 0.85], opacity: [0.4, 1, 0.4] }}
              transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
              style={{ width: 10, height: 10, borderRadius: '50%', background: 'var(--color-pebble)', margin: '0 auto 1.1rem' }}
            />
            <p style={{ fontFamily: 'var(--font-display)', fontSize: '1.1rem', color: 'var(--text-primary)', marginBottom: '0.4rem', fontWeight: 400 }}>
              Nothing here yet.
            </p>
            <p style={{ fontSize: '0.84rem', color: 'var(--text-muted)' }}>
              Add a goal above and I'll break it into steps.
            </p>
          </motion.div>
        ) : (
          groups.map(g => (
            <motion.div
              key={g.id}
              variants={item}
              animate={highlightGroupId === g.id ? {
                boxShadow: [
                  '0 0 0 0px rgba(111,169,158,0)',
                  '0 0 0 4px rgba(111,169,158,0.35)',
                  '0 0 0 4px rgba(111,169,158,0.35)',
                  '0 0 0 0px rgba(111,169,158,0)',
                ],
              } : { boxShadow: '0 0 0 0px rgba(111,169,158,0)' }}
              transition={{ duration: 2.4, ease: 'easeInOut' }}
              style={{ borderRadius: 14 }}
            >
              <TaskGroupCard
                group={g}
                isOpen={expandedGroupId === g.id}
                onToggle={() => toggleGroup(g.id)}
                timeFilter={timeFilter}
                timeFilterActive={timeFilterActive}
                onChatRequest={handleChatRequest}
                onOpenBreakdown={({ task, groupId }) => setBreakdownTask({ task, groupId })}
                showCompleted={showCompleted}
                onStartNewGroup={() => {
                  setTimeout(() => {
                    addInputRef.current?.focus()
                    addInputRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
                  }, 80)
                }}
              />
            </motion.div>
          ))
        )}
      </motion.div>

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
                          Resume
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
          {/* Divider label */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
            <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', letterSpacing: '0.05em' }}>ask pebble</span>
            <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
          </div>

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
                          transition={{ duration: 0.3, ease: [0.25, 0.46, 0.45, 0.94], delay: ci * 0.28 }}
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
                      <div style={{ display: 'flex', gap: 5, alignItems: 'center', padding: '2px 0' }}>
                        {[0, 1, 2].map(i => (
                          <motion.span
                            key={i}
                            animate={{ scale: [0.85, 1.15, 0.85], opacity: [0.4, 1, 0.4] }}
                            transition={{ duration: 2.2, delay: i * 0.35, repeat: Infinity, ease: 'easeInOut' }}
                            style={{ display: 'block', width: 6, height: 6, borderRadius: '50%', background: 'var(--color-pebble)' }}
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
              className="btn btn-ghost"
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
