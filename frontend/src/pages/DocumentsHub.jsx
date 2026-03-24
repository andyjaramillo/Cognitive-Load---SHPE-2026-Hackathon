import { useState, useRef, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useNavigate } from 'react-router-dom'
import { uploadDocument, loadDocuments, deleteDocument } from '../utils/api'

// ── Constants ─────────────────────────────────────────────────────────────── //

const ACCEPTED_MIME = new Set([
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/msword',
  'image/png',
  'image/jpeg',
])
const MAX_BYTES = 20 * 1024 * 1024

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

// ── Session card with hover arrow ─────────────────────────────────────────── //

function SessionCard({ doc, navigate, deletingDocId, setDeletingDocId, setSavedDocs }) {
  const [hovered, setHovered] = useState(false)

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      style={{
        display: 'flex', alignItems: 'center', gap: '0.75rem',
        padding: '1rem 1.25rem',
        background: hovered ? 'var(--accent-soft)' : 'var(--bg-card)',
        border: '1px solid var(--border)',
        borderLeft: '3px solid var(--color-active)',
        borderRadius: '10px',
        cursor: 'pointer',
        transition: 'background 0.18s ease',
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={() => navigate(`/documents/${doc.id}`)}
    >
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ flexShrink: 0 }}>
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
        <polyline points="14 2 14 8 20 8"/>
      </svg>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: '0.92rem', fontWeight: 500, color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {doc.filename}
        </div>
        <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: '0.15rem' }}>
          {doc.page_count ? `${doc.page_count} page${doc.page_count !== 1 ? 's' : ''}` : ''}
          {doc.page_count && doc.created_at ? ' · ' : ''}
          {relativeTime(doc.created_at)}
        </div>
      </div>

      {/* Delete — two-step confirm */}
      {deletingDocId === doc.id ? (
        <div
          style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexShrink: 0 }}
          onClick={e => e.stopPropagation()}
        >
          <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>remove?</span>
          <button
            onClick={async (e) => {
              e.stopPropagation()
              try { await deleteDocument(doc.id) } catch {}
              setSavedDocs(prev => prev.filter(d => d.id !== doc.id))
              setDeletingDocId(null)
            }}
            style={{ fontSize: '0.72rem', padding: '2px 8px', borderRadius: 6, border: '1px solid var(--color-ai)', background: 'transparent', color: 'var(--color-ai)', cursor: 'pointer' }}
          >yes</button>
          <button
            onClick={(e) => { e.stopPropagation(); setDeletingDocId(null) }}
            style={{ fontSize: '0.72rem', padding: '2px 8px', borderRadius: 6, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-muted)', cursor: 'pointer' }}
          >no</button>
        </div>
      ) : (
        <button
          onClick={(e) => { e.stopPropagation(); setDeletingDocId(doc.id) }}
          title="remove document"
          style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px', color: 'var(--text-muted)', opacity: 0.5, flexShrink: 0, lineHeight: 1 }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/>
          </svg>
        </button>
      )}

      {/* Hover arrow — slides in from right */}
      <motion.span
        animate={{ opacity: hovered ? 1 : 0, x: hovered ? 0 : -6 }}
        transition={{ duration: 0.2, ease: 'easeOut' }}
        style={{ flexShrink: 0, color: 'var(--color-active)', fontSize: '1rem', lineHeight: 1 }}
        aria-hidden="true"
      >
        →
      </motion.span>
    </motion.div>
  )
}

// ── Main component ────────────────────────────────────────────────────────── //

export default function DocumentsHub() {
  const navigate = useNavigate()
  const fileInputRef = useRef(null)

  const [savedDocs, setSavedDocs] = useState([])
  const [isUploading, setIsUploading] = useState(false)
  const [isDragging, setIsDragging] = useState(false)
  const [fileError, setFileError] = useState(null)
  const [deletingDocId, setDeletingDocId] = useState(null)

  useEffect(() => {
    loadDocuments()
      .then(docs => { if (Array.isArray(docs)) setSavedDocs(docs) })
      .catch(() => {})
  }, [])

  // ── File validation ──────────────────────────────────────────────────── //

  function validateFile(f) {
    if (!ACCEPTED_MIME.has(f.type)) return "i can work with PDFs, Word docs, and images. try one of those?"
    if (f.size > MAX_BYTES) return "that file is a bit large. try one under 20MB?"
    return null
  }

  async function handleUpload(f) {
    const err = validateFile(f)
    if (err) { setFileError(err); return }
    setFileError(null)
    setIsUploading(true)
    try {
      const res = await uploadDocument(f)
      if (res.flagged) {
        setFileError(res.message || "this content couldn't be processed right now.")
        setIsUploading(false)
        return
      }
      if (res.doc_id) {
        navigate(`/documents/${res.doc_id}`)
      }
    } catch {
      setFileError("something went quiet. try again?")
    }
    setIsUploading(false)
  }

  // ── Drag & drop ──────────────────────────────────────────────────────── //

  function handleDragOver(e) { e.preventDefault(); setIsDragging(true) }
  function handleDragLeave(e) { e.preventDefault(); setIsDragging(false) }
  function handleDrop(e) {
    e.preventDefault()
    setIsDragging(false)
    const dropped = e.dataTransfer.files[0]
    if (dropped) handleUpload(dropped)
  }

  // ── Render ────────────────────────────────────────────────────────────── //

  const pageStyle = {
    display: 'flex', flexDirection: 'column', alignItems: 'center',
    padding: '4rem 2rem', gap: '1.5rem',
    maxWidth: '720px', margin: '0 auto', width: '100%',
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, overflowY: 'auto', minHeight: 0 }}>
      <motion.div {...fadeUp} style={pageStyle}>
        <motion.div
          variants={stagger} initial="initial" animate="animate"
          style={{ width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1.5rem' }}
        >
          {/* Heading */}
          <motion.div variants={staggerItem} style={{ textAlign: 'center' }}>
            <h2 style={{
              fontFamily: 'var(--font-display)', fontSize: 'clamp(1.25rem, 3vw, 1.5rem)', fontWeight: 400,
              color: 'var(--text-primary)', marginBottom: '0.4rem',
              display: 'flex', alignItems: 'baseline', justifyContent: 'center', gap: 0,
            }}>
              documents
              <span aria-hidden="true" style={{
                display: 'inline-block', width: 9, height: 9, borderRadius: '50%',
                background: 'var(--color-pebble)', marginLeft: 3, marginBottom: 2, flexShrink: 0,
              }} />
            </h2>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.88rem' }}>
              offload what's weighing on you. we'll make sense of it.
            </p>
          </motion.div>

          {/* Upload zone — large rectangle for ADHD-friendly target */}
          <motion.div
            variants={staggerItem}
            className={`upload-zone${isDragging ? ' dragging' : ''}`}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={() => !isUploading && fileInputRef.current?.click()}
            style={{
              width: '100%', cursor: isUploading ? 'wait' : 'pointer',
              display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
              padding: '2.5rem 1.5rem', gap: '0.75rem', minHeight: '160px',
              transition: 'border-color 0.25s ease, background 0.25s ease',
            }}
          >
            {isUploading ? (
              <>
                <motion.div
                  animate={{ scale: [0.88, 1.08, 0.88], opacity: [0.5, 1, 0.5] }}
                  transition={{ duration: 2.2, repeat: Infinity, ease: 'easeInOut' }}
                  style={{ width: 12, height: 12, borderRadius: '50%', background: 'var(--color-pebble)' }}
                />
                <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>reading your document...</span>
              </>
            ) : (
              <>
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                  <polyline points="14 2 14 8 20 8"/>
                  <line x1="12" y1="18" x2="12" y2="12"/>
                  <line x1="9" y1="15" x2="12" y2="12"/>
                  <line x1="15" y1="15" x2="12" y2="12"/>
                </svg>
                <span style={{ fontSize: '0.92rem', fontWeight: 500, color: 'var(--text-primary)' }}>
                  upload a document
                </span>
                <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                  drop a file here or click to browse · PDF, Word, images
                </span>
              </>
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.docx,.doc,.png,.jpg,.jpeg"
              style={{ display: 'none' }}
              onChange={e => e.target.files[0] && handleUpload(e.target.files[0])}
              aria-hidden="true"
            />
          </motion.div>

          {/* Validation error */}
          <AnimatePresence>
            {fileError && (
              <motion.p
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                style={{ fontSize: '0.85rem', color: 'var(--color-ai)', textAlign: 'center' }}
              >
                {fileError}
              </motion.p>
            )}
          </AnimatePresence>

          {/* Document sessions list */}
          {savedDocs.length > 0 && (
            <motion.div variants={staggerItem} style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', letterSpacing: '0.2px', fontWeight: 500 }}>
                document sessions
              </p>
              <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '-0.15rem', opacity: 0.7 }}>
                click into a session to pick up where you left off
              </p>
              {savedDocs.map(doc => (
                <SessionCard
                  key={doc.id}
                  doc={doc}
                  navigate={navigate}
                  deletingDocId={deletingDocId}
                  setDeletingDocId={setDeletingDocId}
                  setSavedDocs={setSavedDocs}
                />
              ))}
            </motion.div>
          )}

          {/* Empty state */}
          {savedDocs.length === 0 && (
            <motion.div variants={staggerItem} style={{ textAlign: 'center', padding: '1rem 0' }}>
              <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>
                nothing here yet. upload something and we'll work through it together.
              </p>
            </motion.div>
          )}
        </motion.div>
      </motion.div>
    </div>
  )
}
