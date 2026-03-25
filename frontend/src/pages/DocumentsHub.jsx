import { useState, useRef, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useNavigate } from 'react-router-dom'
import { uploadDocument, loadDocuments, deleteDocument, fetchNudge } from '../utils/api'

// ── Constants ─────────────────────────────────────────────────────────────── //

const ACCEPTED_MIME = new Set([
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/msword',
  'image/png',
  'image/jpeg',
])
const MAX_BYTES = 20 * 1024 * 1024

// ── Color system (mirrors Tasks GROUP_COLORS) ─────────────────────────────── //

const DOC_COLORS = {
  sage:  { css: 'var(--color-active)',   soft: 'rgba(111,169,158,0.1)',  hex: '#6FA99E' },
  sky:   { css: 'var(--color-upcoming)', soft: 'rgba(106,150,184,0.1)',  hex: '#6A96B8' },
  lilac: { css: 'var(--color-paused)',   soft: 'rgba(154,136,180,0.1)',  hex: '#9A88B4' },
  amber: { css: 'var(--color-ai)',        soft: 'rgba(224,160,96,0.1)',   hex: '#E0A060' },
}
const DOC_COLOR_KEYS = ['sage', 'sky', 'lilac', 'amber']

// ── LocalStorage helpers ──────────────────────────────────────────────────── //

function loadDocCategories() {
  try { return JSON.parse(localStorage.getItem('pebble_doc_categories') || '[]') } catch { return [] }
}
function saveDocCategories(cats) {
  try { localStorage.setItem('pebble_doc_categories', JSON.stringify(cats)) } catch {}
}
function loadDocColorMap() {
  try { return JSON.parse(localStorage.getItem('pebble_doc_colors') || '{}') } catch { return {} }
}
function saveDocColorMap(map) {
  try { localStorage.setItem('pebble_doc_colors', JSON.stringify(map)) } catch {}
}
function loadDocBatches() {
  try { return JSON.parse(localStorage.getItem('pebble_doc_batches') || '[]') } catch { return [] }
}
function saveDocBatch(batch) {
  try {
    const existing = loadDocBatches().filter(b => b.id !== batch.id)
    localStorage.setItem('pebble_doc_batches', JSON.stringify([batch, ...existing]))
  } catch {}
}
function removeDocFromBatches(docId) {
  try {
    const updated = loadDocBatches()
      .map(b => ({ ...b, docIds: b.docIds.filter(id => id !== docId) }))
      .filter(b => b.docIds.length > 1)
    localStorage.setItem('pebble_doc_batches', JSON.stringify(updated))
  } catch {}
}

// ── Animation variants ────────────────────────────────────────────────────── //

const fadeUp = {
  initial: { opacity: 0, y: 20 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.65, ease: [0.25, 0.46, 0.45, 0.94] } },
  exit:    { opacity: 0, y: -8, transition: { duration: 0.45, ease: [0.25, 0.46, 0.45, 0.94] } },
}

const stagger = {
  initial: {},
  animate: { transition: { staggerChildren: 0.12 } },
}

const staggerItem = {
  initial: { opacity: 0, y: 10 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.5, ease: [0.25, 0.46, 0.45, 0.94] } },
}

// ── Helpers ───────────────────────────────────────────────────────────────── //

function relativeTime(dateStr) {
  if (!dateStr) return ''
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  if (days < 7) return `${days}d ago`
  return new Date(dateStr).toLocaleDateString()
}

function formatFilename(filename) {
  if (!filename) return ''
  return filename
    .replace(/\.[^/.]+$/, '')
    .replace(/[_-]+/g, ' ')
    .trim()
}

const LOADING_DOTS = [
  { color: '#50946A', delay: 0 },
  { color: '#E0A060', delay: 0.18 },
  { color: '#9A88B4', delay: 0.36 },
]

// ── Color swatch picker ───────────────────────────────────────────────────── //

function ColorSwatches({ value, onChange, disabledKeys = [] }) {
  return (
    <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
      {DOC_COLOR_KEYS.map(key => {
        const isActive   = value === key
        const isDisabled = disabledKeys.includes(key)
        const clr        = DOC_COLORS[key]
        return (
          <button
            key={key}
            onClick={() => !isDisabled && onChange(key)}
            title={key}
            style={{
              width: 16, height: 16, borderRadius: '50%', border: 'none', padding: 0,
              background: clr.css, cursor: isDisabled ? 'default' : 'pointer',
              outline: isActive ? `2.5px solid ${clr.hex}` : '2.5px solid transparent',
              outlineOffset: 2,
              opacity: isDisabled ? 0.28 : 1,
              transform: isActive ? 'scale(1.2)' : 'scale(1)',
              transition: 'transform 0.15s ease, outline 0.15s ease, opacity 0.15s ease',
              flexShrink: 0,
            }}
          />
        )
      })}
    </div>
  )
}

// ── Batch group card (stacked paper effect) ───────────────────────────────── //

function BatchGroupCard({ batchDocs, leadDoc, batchId, docColor, onColorChange, navigate, setSavedDocs, onBatchDeleted }) {
  const [hovered,         setHovered]         = useState(false)
  const [colorPickerOpen, setColorPickerOpen] = useState(false)
  const [deleting,        setDeleting]        = useState(false)
  const colorPickerRef                        = useRef(null)
  const extra    = batchDocs.length - 1
  const borderClr = docColor ? DOC_COLORS[docColor]?.css : 'var(--color-pebble)'

  useEffect(() => {
    if (!colorPickerOpen) return
    function handleOutside(e) {
      if (colorPickerRef.current && !colorPickerRef.current.contains(e.target)) setColorPickerOpen(false)
    }
    document.addEventListener('mousedown', handleOutside)
    return () => document.removeEventListener('mousedown', handleOutside)
  }, [colorPickerOpen])

  async function handleDeleteBatch(e) {
    e.stopPropagation()
    for (const doc of batchDocs) {
      try { await deleteDocument(doc.id) } catch {}
    }
    setSavedDocs(prev => prev.filter(d => !batchDocs.some(b => b.id === d.id)))
    onBatchDeleted?.(batchId)
    setDeleting(false)
  }

  return (
    <div style={{ position: 'relative', marginTop: batchDocs.length >= 2 ? 8 : 0 }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* Stack shadow cards */}
      {batchDocs.length >= 3 && (
        <div style={{
          position: 'absolute', top: -7, left: 5, right: 5, height: '100%',
          background: 'var(--bg-card)', border: '1px solid var(--border)',
          borderRadius: 10, zIndex: 0,
        }} />
      )}
      {batchDocs.length >= 2 && (
        <div style={{
          position: 'absolute', top: -4, left: 3, right: 3, height: '100%',
          background: 'var(--bg-card)', border: '1px solid var(--border)',
          borderRadius: 10, zIndex: 1,
        }} />
      )}

      {/* Main card */}
      <motion.div
        style={{
          position: 'relative', zIndex: 2,
          display: 'flex', alignItems: 'center', gap: '0.75rem',
          padding: '0.95rem 1.25rem',
          background: 'var(--bg-card)',
          border: '1px solid var(--border)',
          borderLeft: `3px solid ${borderClr}`,
          borderRadius: '10px',
          cursor: 'pointer',
          boxShadow: hovered ? '0 3px 12px rgba(0,0,0,0.07)' : 'none',
          transition: 'box-shadow 0.18s ease',
        }}
        onClick={() => navigate(`/documents/${leadDoc.id}`)}
      >
        {/* Color dot — click to change */}
        <div
          ref={colorPickerRef}
          style={{ position: 'relative', flexShrink: 0 }}
          onClick={e => e.stopPropagation()}
        >
          <button
            onClick={() => setColorPickerOpen(o => !o)}
            aria-label="change batch color"
            style={{
              width: 10, height: 10, borderRadius: '50%', background: borderClr,
              border: 'none', cursor: 'pointer', padding: 0, flexShrink: 0,
              transition: 'transform 0.18s ease',
            }}
            onMouseEnter={e => { e.currentTarget.style.transform = 'scale(1.5)' }}
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
                  position: 'absolute', top: '1.5rem', left: 0,
                  background: 'var(--bg-card)', border: '1px solid var(--border)',
                  borderRadius: 10, padding: '0.5rem 0.65rem',
                  boxShadow: '0 4px 16px rgba(0,0,0,0.1)', zIndex: 100,
                }}
              >
                <ColorSwatches
                  value={docColor}
                  onChange={color => { onColorChange(leadDoc.id, color); setColorPickerOpen(false) }}
                />
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* File icon */}
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ flexShrink: 0 }}>
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
          <polyline points="14 2 14 8 20 8"/>
        </svg>

        {/* Text */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'nowrap' }}>
            <span style={{ fontSize: '0.92rem', fontWeight: 500, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {formatFilename(leadDoc.filename)}
            </span>
            <span style={{
              fontSize: '0.7rem', fontWeight: 500, color: borderClr,
              background: docColor ? DOC_COLORS[docColor]?.soft : 'rgba(111,169,158,0.1)',
              border: `1px solid ${borderClr}`, borderRadius: 99,
              padding: '0.1rem 0.45rem', flexShrink: 0, whiteSpace: 'nowrap',
            }}>
              +{extra} more
            </span>
          </div>
          <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: '0.15rem' }}>
            {batchDocs.length} documents · {relativeTime(leadDoc.created_at)}
          </div>
        </div>

        {/* Delete — two-step */}
        {deleting ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexShrink: 0 }} onClick={e => e.stopPropagation()}>
            <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>Remove all?</span>
            <button onClick={handleDeleteBatch} style={{ fontSize: '0.72rem', padding: '2px 8px', borderRadius: 6, border: '1px solid var(--color-ai)', background: 'transparent', color: 'var(--color-ai)', cursor: 'pointer' }}>yes</button>
            <button onClick={e => { e.stopPropagation(); setDeleting(false) }} style={{ fontSize: '0.72rem', padding: '2px 8px', borderRadius: 6, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-secondary)', cursor: 'pointer' }}>no</button>
          </div>
        ) : (
          <button
            onClick={e => { e.stopPropagation(); setDeleting(true) }}
            title="remove batch"
            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '6px', color: 'var(--text-muted)', flexShrink: 0, lineHeight: 1, borderRadius: 6, transition: 'background 0.18s ease, color 0.18s ease' }}
            onMouseEnter={e => { e.currentTarget.style.background = 'rgba(200,148,80,0.08)'; e.currentTarget.style.color = 'var(--color-ai)' }}
            onMouseLeave={e => { e.currentTarget.style.background = 'none'; e.currentTarget.style.color = 'var(--text-muted)' }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="3 6 5 6 21 6"/>
              <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
              <path d="M10 11v6M14 11v6"/>
              <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
            </svg>
          </button>
        )}

        {/* Hover chevron */}
        <motion.span
          animate={{ opacity: hovered && !deleting ? 1 : 0, x: hovered && !deleting ? 0 : -6 }}
          transition={{ duration: 0.2, ease: 'easeOut' }}
          style={{ flexShrink: 0, color: 'var(--color-active)', lineHeight: 1, display: 'flex', alignItems: 'center' }}
          aria-hidden="true"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="9 18 15 12 9 6" />
          </svg>
        </motion.span>
      </motion.div>
    </div>
  )
}

// ── Session card ──────────────────────────────────────────────────────────── //

function SessionCard({ doc, docColor, onColorChange, navigate, deletingDocId, setDeletingDocId, setSavedDocs, onDocDeleted }) {
  const [hovered,         setHovered]         = useState(false)
  const [colorPickerOpen, setColorPickerOpen] = useState(false)
  const colorPickerRef                        = useRef(null)

  const borderClr = docColor ? DOC_COLORS[docColor]?.css : 'var(--border)'

  // Close color picker on outside click
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
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      style={{
        display: 'flex', alignItems: 'center', gap: '0.75rem',
        padding: '1rem 1.25rem',
        background: 'var(--bg-card)',
        border: '1px solid var(--border)',
        borderLeft: `3px solid ${borderClr}`,
        borderRadius: '10px',
        cursor: 'pointer',
        boxShadow: hovered ? '0 3px 12px rgba(0,0,0,0.07)' : 'none',
        transition: 'box-shadow 0.18s ease',
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={() => navigate(`/documents/${doc.id}`)}
    >
      {/* Color dot — click to pick category color */}
      <div
        ref={colorPickerRef}
        style={{ position: 'relative', flexShrink: 0 }}
        onClick={e => e.stopPropagation()}
      >
        <button
          onClick={() => setColorPickerOpen(o => !o)}
          aria-label="change document color"
          title="change color"
          style={{
            width: 10, height: 10, borderRadius: '50%',
            background: docColor ? DOC_COLORS[docColor]?.css : 'var(--border)',
            border: 'none', cursor: 'pointer', padding: 0, flexShrink: 0,
            transition: 'transform 0.18s ease',
          }}
          onMouseEnter={e => { e.currentTarget.style.transform = 'scale(1.5)' }}
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
                position: 'absolute', top: '1.5rem', left: 0,
                background: 'var(--bg-card)', border: '1px solid var(--border)',
                borderRadius: 10, padding: '0.5rem 0.65rem',
                boxShadow: '0 4px 16px rgba(0,0,0,0.1)', zIndex: 100,
              }}
            >
              <ColorSwatches
                value={docColor}
                onChange={color => { onColorChange(doc.id, color); setColorPickerOpen(false) }}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ flexShrink: 0 }}>
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
        <polyline points="14 2 14 8 20 8"/>
      </svg>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: '0.92rem', fontWeight: 500, color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {formatFilename(doc.filename)}
        </div>
        <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: '0.15rem' }}>
          {relativeTime(doc.created_at)}
        </div>
      </div>

      {/* Delete — two-step confirm */}
      {deletingDocId === doc.id ? (
        <div
          style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexShrink: 0 }}
          onClick={e => e.stopPropagation()}
        >
          <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>Remove?</span>
          <button
            onClick={async (e) => {
              e.stopPropagation()
              try { await deleteDocument(doc.id) } catch {}
              setSavedDocs(prev => prev.filter(d => d.id !== doc.id))
              onDocDeleted?.(doc.id)
              setDeletingDocId(null)
            }}
            style={{
              fontSize: '0.72rem', padding: '2px 8px', borderRadius: 6,
              border: '1px solid var(--color-ai)', background: 'transparent', color: 'var(--color-ai)',
              cursor: 'pointer',
            }}
          >yes</button>
          <button
            onClick={(e) => { e.stopPropagation(); setDeletingDocId(null) }}
            style={{
              fontSize: '0.72rem', padding: '2px 8px', borderRadius: 6,
              border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-secondary)',
              cursor: 'pointer',
            }}
          >no</button>
        </div>
      ) : (
        <button
          onClick={(e) => { e.stopPropagation(); setDeletingDocId(doc.id) }}
          title="remove document"
          style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '6px', color: 'var(--text-muted)', flexShrink: 0, lineHeight: 1, borderRadius: 6, transition: 'background 0.18s ease, color 0.18s ease' }}
          onMouseEnter={e => { e.currentTarget.style.background = 'rgba(200,148,80,0.08)'; e.currentTarget.style.color = 'var(--color-ai)' }}
          onMouseLeave={e => { e.currentTarget.style.background = 'none'; e.currentTarget.style.color = 'var(--text-muted)' }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="3 6 5 6 21 6"/>
            <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
            <path d="M10 11v6M14 11v6"/>
            <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
          </svg>
        </button>
      )}

      {/* Hover chevron */}
      <motion.span
        animate={{ opacity: hovered ? 1 : 0, x: hovered ? 0 : -6 }}
        transition={{ duration: 0.2, ease: 'easeOut' }}
        style={{ flexShrink: 0, color: 'var(--color-active)', lineHeight: 1, display: 'flex', alignItems: 'center' }}
        aria-hidden="true"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="9 18 15 12 9 6" />
        </svg>
      </motion.span>
    </motion.div>
  )
}

// ── Main component ────────────────────────────────────────────────────────── //

export default function DocumentsHub() {
  const navigate     = useNavigate()
  const fileInputRef = useRef(null)

  const [savedDocs,     setSavedDocs]     = useState([])
  const [uploadQueue,   setUploadQueue]   = useState([])   // [{id,fileName,file,batchId,status,docId,error}]
  const [docBatches,    setDocBatches]    = useState(loadDocBatches)
  const [isDragging,    setIsDragging]    = useState(false)
  const [deletingDocId, setDeletingDocId] = useState(null)
  const [subtitle,      setSubtitle]      = useState("Offload what's weighing on you. We'll make sense of it.")
  const queueDoneRef = useRef(false)

  function handleDocDeleted(docId) {
    removeDocFromBatches(docId)
    setDocBatches(loadDocBatches())
  }

  // ── Category state (localStorage-backed) ─────────────────────────────── //
  const [docCategories,    setDocCategories]    = useState(loadDocCategories)
  const [docColorMap,      setDocColorMap]      = useState(loadDocColorMap)
  const [activeCatColor,   setActiveCatColor]   = useState(null)  // null = all
  const [catFormOpen,      setCatFormOpen]      = useState(false)
  const [catFormName,      setCatFormName]      = useState('')
  const [catFormColor,     setCatFormColor]     = useState('sky')
  const catFormRef      = useRef(null)
  const catNameInputRef = useRef(null)

  // Persist categories and color map whenever they change
  useEffect(() => { saveDocCategories(docCategories) }, [docCategories])
  useEffect(() => { saveDocColorMap(docColorMap) },      [docColorMap])

  // Fall back to "all" if the active category is deleted
  useEffect(() => {
    if (activeCatColor && !docCategories.some(c => c.color === activeCatColor)) {
      setActiveCatColor(null)
    }
  }, [docCategories, activeCatColor])

  // Close category form on outside click
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

  useEffect(() => {
    loadDocuments().then(docs => {
      if (!Array.isArray(docs)) return
      setSavedDocs(docs)
      const ctx = docs.length > 0
        ? `documents page. write one short warm lowercase pebble-voice line — focus on being a calm, present companion ready to help with whatever they bring. do not mention document titles or history. something gentle and inviting, like "drop something in and we'll figure it out together" or "bring me something heavy. we'll make it lighter." keep it under 12 words. no exclamation marks.`
        : `documents page, nothing uploaded yet. write one short warm lowercase pebble-voice line inviting the user to bring something in. focus on warmth and calm, not features. under 12 words. no exclamation marks.`
      fetchNudge(ctx, 0).then(r => { if (r?.message) setSubtitle(r.message) }).catch(() => {})
    }).catch(() => {})
  }, [])

  // ── Category handlers ─────────────────────────────────────────────────── //

  function handleCreateCategory() {
    const name = catFormName.trim()
    if (!name) return
    if (docCategories.some(c => c.color === catFormColor)) return
    const newCats = [...docCategories, { id: Math.random().toString(36).slice(2, 10), name, color: catFormColor }]
    setDocCategories(newCats)
    setActiveCatColor(catFormColor)
    setCatFormOpen(false)
    setCatFormName('')
    const used = newCats.map(c => c.color)
    const next = DOC_COLOR_KEYS.find(k => !used.includes(k))
    if (next) setCatFormColor(next)
  }

  function handleDocColorChange(docId, color) {
    setDocColorMap(prev => ({ ...prev, [docId]: color }))
  }

  // ── File validation ───────────────────────────────────────────────────── //

  function validateFile(f) {
    if (!ACCEPTED_MIME.has(f.type)) return "can only use PDFs, Word docs, and images."
    if (f.size > MAX_BYTES) return "file is over 20 MB — try a smaller one."
    return null
  }

  // ── Multi-file handler ────────────────────────────────────────────────── //

  function handleFiles(fileList) {
    const files = Array.from(fileList).slice(0, 5)
    if (files.length === 0) return
    queueDoneRef.current = false
    const batchId = files.length > 1 ? Math.random().toString(36).slice(2, 10) : null
    const items = files.map(f => ({
      id:       Math.random().toString(36).slice(2, 10),
      fileName: f.name,
      file:     f,
      batchId,
      status:   validateFile(f) ? 'error' : 'pending',
      docId:    null,
      error:    validateFile(f),
    }))
    setUploadQueue(items)
  }

  // ── Sequential upload processor ───────────────────────────────────────── //

  useEffect(() => {
    const uploading = uploadQueue.some(u => u.status === 'uploading')
    if (uploading) return
    const next = uploadQueue.find(u => u.status === 'pending')
    if (!next) {
      // All items resolved — save batch record + refresh doc list once
      const hasDone = uploadQueue.some(u => u.status === 'done')
      if (hasDone && !queueDoneRef.current) {
        queueDoneRef.current = true
        // Save batch if multiple docs succeeded together
        const doneItems = uploadQueue.filter(u => u.status === 'done' && u.batchId)
        if (doneItems.length > 1) {
          const bid = doneItems[0].batchId
          saveDocBatch({ id: bid, docIds: doneItems.map(u => u.docId), createdAt: new Date().toISOString() })
          setDocBatches(loadDocBatches())
        }
        loadDocuments().then(docs => { if (Array.isArray(docs)) setSavedDocs(docs) }).catch(() => {})
      }
      return
    }
    // Mark next as uploading
    setUploadQueue(prev => prev.map(u => u.id === next.id ? { ...u, status: 'uploading' } : u))
    // Run upload
    uploadDocument(next.file)
      .then(res => {
        if (res.flagged) {
          setUploadQueue(prev => prev.map(u => u.id === next.id
            ? { ...u, status: 'error', error: res.message || "couldn't process that one." }
            : u))
        } else {
          setUploadQueue(prev => prev.map(u => u.id === next.id
            ? { ...u, status: 'done', docId: res.doc_id }
            : u))
        }
      })
      .catch(() => {
        setUploadQueue(prev => prev.map(u => u.id === next.id
          ? { ...u, status: 'error', error: "something went quiet. try again?" }
          : u))
      })
  }, [uploadQueue])

  // ── Drag & drop ───────────────────────────────────────────────────────── //

  const queueBusy = uploadQueue.some(u => u.status === 'pending' || u.status === 'uploading')

  function handleDragOver(e)  { e.preventDefault(); if (!queueBusy) setIsDragging(true)  }
  function handleDragLeave(e) { e.preventDefault(); setIsDragging(false) }
  function handleDrop(e) {
    e.preventDefault(); setIsDragging(false)
    if (queueBusy) return
    if (e.dataTransfer.files.length) handleFiles(e.dataTransfer.files)
  }

  // ── Filtered list ─────────────────────────────────────────────────────── //

  const visibleDocs = activeCatColor === null
    ? savedDocs
    : savedDocs.filter(d => docColorMap[d.id] === activeCatColor)

  // ── Render ────────────────────────────────────────────────────────────── //

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, overflowY: 'auto', minHeight: 0 }}>
      <motion.div
        {...fadeUp}
        style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center',
          padding: '4rem 2rem', gap: '1.5rem',
          maxWidth: '720px', margin: '0 auto', width: '100%',
        }}
      >
        <motion.div
          variants={stagger} initial="initial" animate="animate"
          style={{ width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1.5rem' }}
        >

          {/* ── Heading ── */}
          <motion.div variants={staggerItem} style={{ textAlign: 'center' }}>
            <h1 style={{
              fontFamily: 'var(--font-display)', fontSize: 'clamp(2rem, 5vw, 2.6rem)', fontWeight: 400,
              color: 'var(--text-primary)', marginBottom: '0.4rem',
              display: 'flex', alignItems: 'baseline', justifyContent: 'center', gap: 0,
            }}>
              Documents
              <span aria-hidden="true" style={{
                display: 'inline-block', width: 10, height: 10, borderRadius: '50%',
                background: 'var(--color-pebble)', marginLeft: 4, marginBottom: 3, flexShrink: 0,
              }} />
            </h1>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.88rem', minHeight: '1.3em', transition: 'opacity 0.4s ease' }}>
              {subtitle}
            </p>
          </motion.div>

          {/* ── Upload zone ── */}
          <motion.div
            variants={staggerItem}
            className={`upload-zone${isDragging ? ' dragging' : ''}`}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={() => !queueBusy && fileInputRef.current?.click()}
            style={{
              width: '100%', cursor: queueBusy ? 'default' : 'pointer',
              display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
              padding: '2rem 1.5rem', gap: '0.6rem', minHeight: '140px',
              transition: 'border-color 0.25s ease, background 0.25s ease, opacity 0.25s ease',
              borderRadius: 14, opacity: queueBusy ? 0.45 : 1,
            }}
          >
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
              <polyline points="14 2 14 8 20 8"/>
              <line x1="12" y1="18" x2="12" y2="12"/>
              <line x1="9" y1="15" x2="12" y2="12"/>
              <line x1="15" y1="15" x2="12" y2="12"/>
            </svg>
            <span style={{ fontSize: '0.92rem', fontWeight: 500, color: 'var(--text-primary)' }}>
              {queueBusy ? 'upload in progress…' : 'Upload documents'}
            </span>
            <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
              {queueBusy ? 'wait for current uploads to finish' : 'drop up to 5 files · PDF, Word, images'}
            </span>
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.docx,.doc,.png,.jpg,.jpeg"
              multiple
              style={{ display: 'none' }}
              onChange={e => { if (e.target.files?.length) handleFiles(e.target.files); e.target.value = '' }}
              aria-hidden="true"
            />
          </motion.div>

          {/* ── Upload queue panel ── */}
          <AnimatePresence>
            {uploadQueue.length > 0 && (
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.35, ease: [0.25, 0.46, 0.45, 0.94] }}
                style={{ width: '100%' }}
              >
                {/* Panel header */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                  <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 400 }}>
                    {uploadQueue.every(u => u.status === 'done' || u.status === 'error')
                      ? `${uploadQueue.filter(u => u.status === 'done').length} of ${uploadQueue.length} ready`
                      : (() => {
                          const doneCount = uploadQueue.filter(u => u.status === 'done' || u.status === 'error').length
                          return `reading ${doneCount + 1} of ${uploadQueue.length}…`
                        })()
                    }
                  </p>
                  {uploadQueue.every(u => u.status === 'done' || u.status === 'error') && (
                    <button
                      onClick={() => setUploadQueue([])}
                      style={{ fontSize: '0.72rem', color: 'var(--text-muted)', background: 'none', border: 'none', cursor: 'pointer', padding: '2px 4px', borderRadius: 4, transition: 'color 0.15s ease' }}
                      onMouseEnter={e => { e.currentTarget.style.color = 'var(--text-primary)' }}
                      onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-muted)' }}
                    >
                      dismiss
                    </button>
                  )}
                </div>

                {/* File rows */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                  {uploadQueue.map((item, i) => (
                    <motion.div
                      key={item.id}
                      initial={{ opacity: 0, x: -8 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ duration: 0.28, delay: i * 0.05 }}
                      style={{
                        display: 'flex', alignItems: 'center', gap: '0.65rem',
                        padding: '0.65rem 0.9rem',
                        background: 'var(--bg-card)',
                        border: '1px solid var(--border)',
                        borderLeft: `3px solid ${
                          item.status === 'done'     ? 'var(--color-done)'
                          : item.status === 'error'  ? 'var(--color-ai)'
                          : item.status === 'uploading' ? 'var(--color-pebble)'
                          : 'var(--border)'
                        }`,
                        borderRadius: 10,
                        transition: 'border-left-color 0.3s ease',
                      }}
                    >
                      {/* Status icon */}
                      <div style={{ width: 20, height: 20, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        {item.status === 'uploading' && (
                          <div style={{ display: 'flex', gap: 3 }}>
                            {LOADING_DOTS.map((dot, di) => (
                              <motion.span
                                key={di}
                                animate={{ scale: [0.85, 1.15, 0.85], opacity: [0.35, 0.9, 0.35] }}
                                transition={{ duration: 2.2, delay: di * 0.35, repeat: Infinity, ease: 'easeInOut' }}
                                style={{ display: 'block', width: 4, height: 4, borderRadius: '50%', background: dot.color }}
                              />
                            ))}
                          </div>
                        )}
                        {item.status === 'done' && (
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--color-done)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="20 6 9 17 4 12"/>
                          </svg>
                        )}
                        {item.status === 'error' && (
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--color-ai)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                            <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                          </svg>
                        )}
                        {item.status === 'pending' && (
                          <div style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--border)' }} />
                        )}
                      </div>

                      {/* Filename */}
                      <span style={{
                        flex: 1, fontSize: '0.84rem', fontWeight: 400,
                        color: item.status === 'pending' ? 'var(--text-muted)' : 'var(--text-primary)',
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                        transition: 'color 0.25s ease',
                      }}>
                        {item.fileName.replace(/\.[^/.]+$/, '')}
                      </span>

                      {/* Right side: status text or open link */}
                      {item.status === 'uploading' && (
                        <span style={{ fontSize: '0.74rem', color: 'var(--text-muted)', flexShrink: 0, fontStyle: 'italic' }}>reading…</span>
                      )}
                      {item.status === 'pending' && (
                        <span style={{ fontSize: '0.74rem', color: 'var(--text-muted)', flexShrink: 0 }}>waiting</span>
                      )}
                      {item.status === 'done' && item.docId && (
                        <button
                          onClick={() => navigate(`/documents/${item.docId}`)}
                          style={{ fontSize: '0.74rem', color: 'var(--color-pebble)', background: 'none', border: 'none', cursor: 'pointer', flexShrink: 0, display: 'flex', alignItems: 'center', gap: '0.2rem', padding: '2px 4px', borderRadius: 4, transition: 'opacity 0.15s ease' }}
                          onMouseEnter={e => { e.currentTarget.style.opacity = '0.7' }}
                          onMouseLeave={e => { e.currentTarget.style.opacity = '1' }}
                        >
                          open
                          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="9 18 15 12 9 6"/>
                          </svg>
                        </button>
                      )}
                      {item.status === 'error' && (
                        <span style={{ fontSize: '0.74rem', color: 'var(--color-ai)', flexShrink: 0 }}>{item.error}</span>
                      )}
                    </motion.div>
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* ── Document sessions ── */}
          {savedDocs.length > 0 && (
            <motion.div variants={staggerItem} style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>

              {/* ── Category filter bar ── */}
              <div style={{ display: 'flex', gap: '0.35rem', alignItems: 'center', flexWrap: 'wrap', marginBottom: '0.15rem' }}>

                {/* "all" pill */}
                <button
                  onClick={() => setActiveCatColor(null)}
                  style={{
                    flexShrink: 0, padding: '0.26rem 0.72rem', borderRadius: 99,
                    fontSize: '0.76rem', fontFamily: 'inherit', cursor: 'pointer',
                    border: activeCatColor === null ? '1px solid var(--color-pebble)' : '1px solid var(--border)',
                    background: activeCatColor === null ? 'var(--color-pebble-soft)' : 'transparent',
                    color: activeCatColor === null ? 'var(--text-primary)' : 'var(--text-muted)',
                    fontWeight: activeCatColor === null ? 600 : 400,
                    transition: 'all 0.18s ease',
                  }}
                  onMouseEnter={e => { if (activeCatColor !== null) { e.currentTarget.style.borderColor = 'var(--color-pebble)'; e.currentTarget.style.color = 'var(--text-secondary)' } }}
                  onMouseLeave={e => { if (activeCatColor !== null) { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--text-muted)' } }}
                >
                  all
                </button>

                {/* Category pills */}
                {docCategories.map(cat => {
                  const clr      = DOC_COLORS[cat.color]
                  const isActive = activeCatColor === cat.color
                  return (
                    <div
                      key={cat.id}
                      style={{ position: 'relative', flexShrink: 0, display: 'flex', alignItems: 'center' }}
                      onMouseEnter={e => { const x = e.currentTarget.querySelector('.cat-x'); if (x) x.style.opacity = '1' }}
                      onMouseLeave={e => { const x = e.currentTarget.querySelector('.cat-x'); if (x) x.style.opacity = '0' }}
                    >
                      <button
                        onClick={() => setActiveCatColor(isActive ? null : cat.color)}
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
                        onClick={e => {
                          e.stopPropagation()
                          setDocCategories(prev => prev.filter(c => c.id !== cat.id))
                        }}
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

                {/* + new category pill */}
                {!catFormOpen && docCategories.length < 4 && (
                  <button
                    onClick={() => {
                      const used = docCategories.map(c => c.color)
                      const next = DOC_COLOR_KEYS.find(k => !used.includes(k)) || 'sky'
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
              </div>

              {/* Category creation form — own row so it never gets clipped */}
              <AnimatePresence>
                {catFormOpen && (
                  <motion.div
                    ref={catFormRef}
                    initial={{ opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -4 }}
                    transition={{ duration: 0.18 }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.35rem 0 0.2rem', flexWrap: 'wrap' }}>
                      <ColorSwatches
                        value={catFormColor}
                        onChange={setCatFormColor}
                        disabledKeys={docCategories.map(c => c.color)}
                      />
                      <input
                        ref={catNameInputRef}
                        value={catFormName}
                        onChange={e => setCatFormName(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') handleCreateCategory(); if (e.key === 'Escape') { setCatFormOpen(false); setCatFormName('') } }}
                        placeholder="category name..."
                        style={{
                          fontSize: '0.76rem', padding: '0.28rem 0.6rem', borderRadius: 6,
                          border: '1px solid var(--border)', background: 'var(--bg-card)',
                          color: 'var(--text-primary)', outline: 'none', width: 140,
                        }}
                      />
                      <button
                        className="btn btn-primary"
                        style={{ fontSize: '0.72rem', padding: '0.28rem 0.65rem', flexShrink: 0, opacity: catFormName.trim() ? 1 : 0.45 }}
                        onClick={handleCreateCategory}
                        disabled={!catFormName.trim()}
                      >
                        add
                      </button>
                      <button
                        style={{ fontSize: '0.72rem', padding: '0.28rem 0.5rem', borderRadius: 6, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-muted)', cursor: 'pointer', flexShrink: 0 }}
                        onClick={() => { setCatFormOpen(false); setCatFormName('') }}
                      >
                        cancel
                      </button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Section label — below categories */}
              <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.4rem', marginTop: '0.25rem', marginBottom: '0.1rem' }}>
                <p style={{ fontSize: '0.82rem', fontWeight: 400, color: 'var(--text-muted)', letterSpacing: '0.1px' }}>
                  Document Sessions
                </p>
                <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)', opacity: 0.7 }}>
                  · click to pick up where you left off
                </p>
              </div>

              {/* Document cards — batch-grouped */}
              {(() => {
                // Build docId → batchId lookup
                const docBatchMap = {}
                docBatches.forEach(b => b.docIds.forEach(id => { docBatchMap[id] = b.id }))
                // Build display items: one item per batch (first occurrence), one per solo doc
                const seenBatches = new Set()
                const items = []
                for (const doc of visibleDocs) {
                  const batchId = docBatchMap[doc.id]
                  if (batchId) {
                    if (!seenBatches.has(batchId)) {
                      seenBatches.add(batchId)
                      const batch = docBatches.find(b => b.id === batchId)
                      const batchDocs = (batch?.docIds || [])
                        .map(id => savedDocs.find(d => d.id === id))
                        .filter(Boolean)
                      items.push({ type: 'batch', batchId, batchDocs, leadDoc: batchDocs[0] || doc })
                    }
                  } else {
                    items.push({ type: 'single', doc })
                  }
                }
                return items.length > 0 ? items.map(item =>
                  item.type === 'batch' ? (
                    <BatchGroupCard
                      key={item.batchId}
                      batchDocs={item.batchDocs}
                      leadDoc={item.leadDoc}
                      batchId={item.batchId}
                      docColor={docColorMap[item.leadDoc?.id] || null}
                      onColorChange={handleDocColorChange}
                      navigate={navigate}
                      setSavedDocs={setSavedDocs}
                      onBatchDeleted={bid => {
                        removeDocFromBatches(bid)
                        setDocBatches(loadDocBatches())
                      }}
                    />
                  ) : (
                    <SessionCard
                      key={item.doc.id}
                      doc={item.doc}
                      docColor={docColorMap[item.doc.id] || null}
                      onColorChange={handleDocColorChange}
                      navigate={navigate}
                      deletingDocId={deletingDocId}
                      setDeletingDocId={setDeletingDocId}
                      setSavedDocs={setSavedDocs}
                      onDocDeleted={handleDocDeleted}
                    />
                  )
                ) : (
                  <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', padding: '0.5rem 0' }}>
                    no documents in this category yet.
                  </p>
                )
              })()}
            </motion.div>
          )}

          {/* Empty state */}
          {savedDocs.length === 0 && (
            <motion.div variants={staggerItem} style={{ textAlign: 'center', padding: '1rem 0' }}>
              <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>
                Nothing here yet. Upload something and we'll work through it together.
              </p>
            </motion.div>
          )}

        </motion.div>
      </motion.div>
    </div>
  )
}
