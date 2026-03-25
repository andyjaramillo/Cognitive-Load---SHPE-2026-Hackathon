import { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useDispatch, useSelector } from 'react-redux'
import { useNavigate, useParams, Link } from 'react-router-dom'
import { tasksActions } from '../store'
import { loadDocumentById, loadDocuments, summariseStream, explainSentence, decompose, extractHighlights, chatStream, saveTasks } from '../utils/api'
import { bionicify } from '../utils/bionic'
import { splitIntoBubbles, renderMarkdown } from '../utils/bubbles'

// ── Constants ─────────────────────────────────────────────────────────────── //

const CHOICES = [
  { id: 'actions',    dot: 'var(--color-pebble)',  title: "Let's turn this into tasks",            sub: 'Action items and deadlines, nothing extra' },
  { id: 'simplify',   dot: 'var(--color-done)',     title: "Let's simplify document information",   sub: 'Plain language, easier to digest' },
  { id: 'highlights', dot: 'var(--color-ai)',       title: 'Show me what matters most',             sub: 'Highlight the key sections to focus on' },
  { id: 'questions',  dot: 'var(--color-paused)',   title: 'I have questions about the document',   sub: "Let's chat about what's inside" },
]

// ── Loading dots ─────────────────────────────────────────────────────────── //

const LOADING_DOTS = [
  { color: '#50946A', delay: 0 },
  { color: '#E0A060', delay: 0.18 },
  { color: '#9A88B4', delay: 0.36 },
]

// ── Pill colors (same as Tasks page) ─────────────────────────────────────── //
const _ALL_PILL_COLORS = [
  { key: 'sage',  color: 'var(--color-active)',   border: 'rgba(111,169,158,0.6)',  bg: 'rgba(111,169,158,0.1)'  },
  { key: 'sky',   color: 'var(--color-upcoming)', border: 'rgba(106,150,184,0.6)',  bg: 'rgba(106,150,184,0.1)'  },
  { key: 'lilac', color: 'var(--color-paused)',   border: 'rgba(154,136,180,0.6)',  bg: 'rgba(154,136,180,0.1)'  },
  { key: 'amber', color: 'var(--color-ai)',        border: 'rgba(224,160,96,0.6)',   bg: 'rgba(224,160,96,0.1)'   },
]

function ThreeDotLoader({ text }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem', padding: '3rem 1rem' }}>
      <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
        {LOADING_DOTS.map((dot, i) => (
          <motion.div
            key={i}
            animate={{ y: [0, -8, 0], opacity: [0.5, 1, 0.5] }}
            transition={{ duration: 0.9, repeat: Infinity, ease: 'easeInOut', delay: dot.delay }}
            style={{ width: 8, height: 8, borderRadius: '50%', background: dot.color }}
          />
        ))}
      </div>
      {text && (
        <p style={{ fontSize: '0.88rem', color: 'var(--text-muted)', textAlign: 'center', fontStyle: 'italic', lineHeight: 1.5, margin: 0 }}>
          {text}
        </p>
      )}
    </div>
  )
}

// ── Filename helper ───────────────────────────────────────────────────────── //

function formatFilename(filename) {
  if (!filename) return ''
  return filename
    .replace(/\.[^/.]+$/, '')   // strip extension
    .replace(/[_-]+/g, ' ')     // underscores/hyphens → spaces
    .trim()
}

// ── SVG chevron ──────────────────────────────────────────────────────────── //

function Chevron({ expanded, color = 'var(--color-active)' }) {
  return (
    <motion.span
      animate={{ rotate: expanded ? 90 : 0 }}
      transition={{ duration: 0.2 }}
      style={{ display: 'inline-flex', alignItems: 'center', color }}
    >
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="9 18 15 12 9 6" />
      </svg>
    </motion.span>
  )
}

const CALM_QUOTES = [
  { text: 'almost everything will work again if you unplug it for a few minutes — including you.', author: 'anne lamott' },
  { text: 'you don\'t have to see the whole staircase, just take the first step.', author: 'martin luther king jr.' },
  { text: 'the present moment is the only moment available to us, and it is the door to all moments.', author: 'thich nhat hanh' },
  { text: 'breathe. let go. and remind yourself that this very moment is the only one you know you have for sure.', author: 'oprah winfrey' },
  { text: 'within you, there is a stillness and a sanctuary to which you can retreat at any time.', author: 'hermann hesse' },
  { text: 'nothing diminishes anxiety faster than action.', author: 'walter anderson' },
  { text: 'you are allowed to be both a masterpiece and a work in progress simultaneously.', author: 'sophia bush' },
  { text: 'do what you can, with what you have, where you are.', author: 'theodore roosevelt' },
  { text: 'the only way to do great work is to love what you do.', author: 'steve jobs' },
  { text: 'it does not matter how slowly you go as long as you do not stop.', author: 'confucius' },
]

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

// ── Sub-components ────────────────────────────────────────────────────────── //

function PebbleDot() {
  return (
    <motion.div
      animate={{ scale: [0.88, 1.08, 0.88], opacity: [0.7, 1, 0.7] }}
      transition={{ duration: 3.5, repeat: Infinity, ease: 'easeInOut' }}
      style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--color-pebble)', flexShrink: 0, marginTop: '0.65rem' }}
    />
  )
}

function UserAvatar({ name }) {
  const initial = name ? name.charAt(0).toUpperCase() : 'Y'
  return (
    <div style={{
      width: 26, height: 26, borderRadius: '50%', flexShrink: 0,
      background: 'var(--accent-2-soft)', color: 'var(--color-done)',
      fontSize: '0.68rem', fontWeight: 700,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      border: '1.5px solid var(--border)',
    }}>
      {initial}
    </div>
  )
}

function AIBubble({ children, text, isStreaming = false, orange = false }) {
  const bubbleStyle = {
    background: orange ? 'rgba(200,148,80,0.07)' : 'rgba(200,148,80,0.05)',
    border: `1px solid ${orange ? 'rgba(200,148,80,0.2)' : 'rgba(200,148,80,0.12)'}`,
    borderRadius: '18px 18px 18px 5px',
    padding: '0.9rem 1.1rem',
    fontSize: '0.9rem',
    color: 'var(--text-primary)',
    lineHeight: 1.65,
    boxShadow: '0 3px 14px rgba(200,148,80,0.07)',
  }

  if (text !== undefined) {
    const bubbles = isStreaming ? [text] : splitIntoBubbles(text)
    return (
      <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'flex-start' }}>
        <PebbleDot />
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
          {bubbles.map((chunk, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.32, ease: [0.25, 0.46, 0.45, 0.94], delay: isStreaming ? 0 : i * 0.28 }}
              style={bubbleStyle}
            >
              {renderMarkdown(chunk)}
              {isStreaming && i === bubbles.length - 1 && (
                <span className="streaming-cursor" aria-hidden="true" />
              )}
            </motion.div>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'flex-start' }}>
      <PebbleDot />
      <div style={{ ...bubbleStyle, flex: 1 }}>{children}</div>
    </div>
  )
}

function UserBubble({ text, userName }) {
  return (
    <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'flex-start', flexDirection: 'row-reverse' }}>
      <UserAvatar name={userName} />
      <div style={{
        background: 'var(--accent-2-soft)',
        border: '1px solid rgba(80,148,106,0.2)',
        borderRadius: '18px 18px 5px 18px',
        padding: '0.9rem 1.1rem',
        fontSize: '0.9rem',
        color: 'var(--text-primary)',
        lineHeight: 1.65,
        maxWidth: '80%',
        boxShadow: '0 3px 14px rgba(42,122,144,0.06)',
      }}>
        {text}
      </div>
    </div>
  )
}

function SentenceTooltip({ text }) {
  const [tip, setTip] = useState(null)
  const [loading, setLoading] = useState(false)
  const [open, setOpen] = useState(false)
  const wrapperRef = { current: null }

  async function handleClick(e) {
    e.stopPropagation()
    if (open) { setOpen(false); return }
    setOpen(true)
    if (tip || loading) return
    setLoading(true)
    try {
      const res = await explainSentence(text)
      if (!res.flagged) setTip(res)
    } catch {}
    setLoading(false)
  }

  return (
    <span
      ref={el => wrapperRef.current = el}
      className="tooltip-wrapper"
      onClick={handleClick}
      style={{ borderBottom: '1.5px dashed var(--color-active)', cursor: 'pointer' }}
    >
      {text}{' '}
      {open && (
        <span className="tooltip-box" role="tooltip">
          {loading
            ? 'thinking…'
            : tip
              ? <><strong>why simplified:</strong> {tip.reason}<br /><em>{tip.simplified}</em></>
              : null}
        </span>
      )}
    </span>
  )
}

function CalmQuotes() {
  const startIndex = useRef(Math.floor(Math.random() * CALM_QUOTES.length))
  const [index, setIndex] = useState(startIndex.current)

  useEffect(() => {
    const timer = setInterval(() => {
      setIndex(prev => (prev + 1) % CALM_QUOTES.length)
    }, 18000)
    return () => clearInterval(timer)
  }, [])

  const quote = CALM_QUOTES[index]

  return (
    <div style={{ textAlign: 'center', padding: '1.5rem 1rem 0' }}>
      <AnimatePresence mode="wait">
        <motion.div
          key={index}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6 }}
          transition={{ duration: 0.6, ease: [0.25, 0.46, 0.45, 0.94] }}
        >
          <p style={{
            fontSize: '0.82rem', color: 'var(--text-muted)', lineHeight: 1.6,
            fontStyle: 'italic', maxWidth: '480px', margin: '0 auto',
          }}>
            "{quote.text}"
          </p>
          <p style={{
            fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '0.4rem',
            opacity: 0.7,
          }}>
            — {quote.author}
          </p>
        </motion.div>
      </AnimatePresence>
    </div>
  )
}

// ── Document type heuristics ──────────────────────────────────────────────── //

function detectDocType(text, fileName) {
  const sample = (text + ' ' + (fileName || '')).toLowerCase()
  if (/syllabus|course|lecture|assignment|midterm|final exam|office hours|grading|prerequisite|semester|credit/.test(sample)) return 'academic'
  if (/contract|agreement|terms|privacy policy|clause|hereby|indemnif|liability|warrant|obligations|party|signator/.test(sample)) return 'legal'
  if (/step \d|steps to|how to|instructions|tutorial|guide|follow these|first,|next,|then,|finally,/.test(sample)) return 'instructions'
  if (/wikipedia|retrieved from|references\n|this article|birth|death|founded|century|historical|biography/.test(sample)) return 'article'
  if (/meeting|agenda|action items|discussion|standup|sprint|status update|project|deadline|deliverable|q[1-4]/.test(sample)) return 'work'
  return 'unknown'
}

function buildAiDesc(docType, pages, filename) {
  const base = pages ? `${pages} page${pages !== 1 ? 's' : ''}` : filename
  switch (docType) {
    case 'academic':     return `Looks like course material. ${base}. How should I help?`
    case 'legal':        return `Looks like a legal document. ${base}. How should I help?`
    case 'instructions': return `Looks like a how-to guide. ${base}. How should I help?`
    case 'work':         return `Looks like work notes. ${base}. How should I help?`
    case 'article':      return `Looks like an article. ${base}. How should I help?`
    default:             return `${base} loaded. How should I help?`
  }
}

function stripMarkdown(text) {
  return text
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/\*(.+?)\*/g,   '$1')
    .replace(/^#+\s+/gm,     '')
    .replace(/^[-*]\s+/gm,   '')
}

function parseSimplifiedSections(text) {
  // Split streamed text into sections by ## headings
  const parts = text.split(/^## /gm).filter(Boolean)
  return parts.map(part => {
    const newline = part.indexOf('\n')
    if (newline === -1) return { heading: part.trim(), bullets: [] }
    const heading = part.slice(0, newline).trim()
    const body = part.slice(newline + 1).trim()
    const bullets = body
      .split('\n')
      .map(l => l.replace(/^[-*]\s+/, '').trim())
      .filter(Boolean)
    return { heading, bullets }
  })
}

function SimplifiedSections({ text, bionicMode }) {
  const sections = parseSimplifiedSections(text)
  if (sections.length === 0) return null

  // Separate bottom line from other sections
  const bottomLine = sections.find(s => s.heading.toLowerCase() === 'bottom line')
  const otherSections = sections.filter(s => s.heading.toLowerCase() !== 'bottom line')

  const [expandedSections, setExpandedSections] = useState(() => {
    // First section auto-expanded, rest collapsed
    const initial = {}
    otherSections.forEach((_, i) => { initial[i] = i === 0 })
    return initial
  })

  const renderBullet = (bullet, bionicOn) => bionicOn ? bionicify(bullet) : bullet

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      {/* Bottom line — highlighted TL;DR */}
      {bottomLine && bottomLine.bullets.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: [0.25, 0.46, 0.45, 0.94] }}
          style={{
            background: 'rgba(200,148,80,0.07)',
            borderLeft: '3px solid var(--color-ai)',
            borderRadius: '10px',
            padding: '1rem 1.15rem',
            boxShadow: '0 2px 8px rgba(200,148,80,0.06)',
          }}
        >
          <p style={{
            fontSize: '0.82rem', color: 'var(--color-ai)', fontWeight: 600,
            marginBottom: '0.4rem', letterSpacing: '0.01em',
          }}>
            Bottom line
          </p>
          <p style={{
            fontSize: '0.92rem', color: 'var(--text-primary)', lineHeight: 1.6,
            margin: 0, fontWeight: 500,
          }}>
            {renderBullet(bottomLine.bullets[0], bionicMode)}
          </p>
        </motion.div>
      )}

      {/* Content sections — progressive disclosure */}
      {otherSections.map((section, i) => {
        const isExpanded = expandedSections[i] !== false
        return (
          <motion.div
            key={i}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15 + i * 0.1, duration: 0.45, ease: [0.25, 0.46, 0.45, 0.94] }}
          >
            <button
              onClick={() => setExpandedSections(prev => ({ ...prev, [i]: !prev[i] }))}
              style={{
                background: 'none', border: 'none', cursor: 'pointer',
                fontSize: '0.88rem', fontFamily: 'var(--font-display)', fontWeight: 400,
                color: 'var(--text-primary)', padding: '0.4rem 0',
                display: 'flex', alignItems: 'center', gap: '0.5rem',
                width: '100%', textAlign: 'left',
              }}
            >
              <Chevron expanded={isExpanded} />
              {section.heading}
            </button>
            <AnimatePresence>
              {isExpanded && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.3, ease: [0.25, 0.46, 0.45, 0.94] }}
                  style={{ overflow: 'hidden' }}
                >
                  <div style={{
                    borderLeft: '3px solid var(--color-pebble)',
                    borderRadius: '0 10px 10px 0',
                    padding: '0.75rem 1rem',
                    marginTop: '0.25rem',
                    background: 'var(--bg-card)',
                    boxShadow: '0 2px 8px rgba(0,0,0,0.03)',
                    display: 'flex', flexDirection: 'column', gap: '0.5rem',
                  }}>
                    {section.bullets.map((bullet, j) => (
                      <p key={j} style={{
                        fontSize: '0.88rem', color: 'var(--text-primary)',
                        lineHeight: 1.65, margin: 0,
                      }}>
                        {renderBullet(bullet, bionicMode)}
                      </p>
                    ))}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        )
      })}
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────── //

export default function DocumentSession() {
  const { id: docId } = useParams()
  const dispatch = useDispatch()
  const navigate = useNavigate()
  const prefs       = useSelector(s => s.prefs)
  const taskGroups  = useSelector(s => s.tasks.groups)

  // Batch-aware doc switcher
  const [allDocs, setAllDocs] = useState([])
  useEffect(() => {
    loadDocuments().then(docs => { if (Array.isArray(docs)) setAllDocs(docs) }).catch(() => {})
  }, [docId])
  // Check if this doc is part of a batch
  const batches = (() => { try { return JSON.parse(localStorage.getItem('pebble_doc_batches') || '[]') } catch { return [] } })()
  const myBatch = batches.find(b => b.docIds.includes(docId))
  // Navigation context: within batch if batched, else across all docs
  const navDocs = myBatch
    ? myBatch.docIds.map(id => allDocs.find(d => d.id === id)).filter(Boolean)
    : allDocs
  const currentIndex = navDocs.findIndex(d => d.id === docId)
  const prevDoc = currentIndex > 0 ? navDocs[currentIndex - 1] : null
  const nextDoc = currentIndex !== -1 && currentIndex < navDocs.length - 1 ? navDocs[currentIndex + 1] : null
  const navLabel = myBatch ? 'in this batch' : 'documents'

  // Loading state
  const [loadState, setLoadState] = useState('loading') // 'loading' | 'ready' | 'error'
  const [docText, setDocText] = useState('')
  const [docName, setDocName] = useState('')
  const [docPages, setDocPages] = useState(null)
  const [docType, setDocType] = useState('unknown')
  const [aiDesc, setAiDesc] = useState('')

  // Phase: 'question' | 'results'
  const [phase, setPhase] = useState('question')

  // Results
  const [chosenMode, setChosenMode] = useState(null)
  const [actionItems, setActionItems] = useState([])
  const [aiGroupName, setAiGroupName] = useState('')
  const [isSaving,    setIsSaving]    = useState(false)
  const [streamText, setStreamText] = useState('')
  const [isStreaming, setIsStreaming] = useState(false)
  const [streamError, setStreamError] = useState(null)
  const [bionicMode, setBionicMode] = useState(false)

  // Q&A
  const [qaMessages, setQaMessages] = useState([])
  const [qaInput, setQaInput] = useState('')
  const [qaStreaming, setQaStreaming] = useState(false)

  // Highlights (priority-based)
  const [highlightData, setHighlightData] = useState(null) // { high: [], medium: [], low: [] }
  const [expandedTiers, setExpandedTiers] = useState({ medium: false, low: false })

  // Hover state for choice cards
  const [hoveredChoice, setHoveredChoice] = useState(null)

  // ── Load document on mount ────────────────────────────────────────────── //

  useEffect(() => {
    let cancelled = false
    async function loadDoc() {
      try {
        const doc = await loadDocumentById(docId)
        if (cancelled) return
        const text = doc.extracted_text || ''
        const name = doc.filename || 'document'
        const pages = doc.page_count || null
        setDocText(text)
        setDocName(name)
        setDocPages(pages)
        const detected = detectDocType(text, name)
        setDocType(detected)
        setAiDesc(buildAiDesc(detected, pages, name))
        setLoadState('ready')
      } catch {
        if (!cancelled) setLoadState('error')
      }
    }
    loadDoc()
    return () => { cancelled = true }
  }, [docId])

  // ── Mode selection → results ──────────────────────────────────────────── //

  async function handleModeSelect(modeId) {
    // Questions mode — go straight to Q&A chat
    if (modeId === 'questions') {
      setChosenMode('questions')
      setPhase('results')
      return
    }

    setChosenMode(modeId)
    setPhase('results')
    setActionItems([])
    setStreamText('')
    setIsStreaming(false)
    setStreamError(null)

    if (modeId === 'highlights') {
      try {
        const truncated = docText.length > 15000 ? docText.slice(0, 15000) + '\n\n[document continues...]' : docText
        const res = await extractHighlights({
          text: truncated,
          reading_level: prefs.readingLevel || 'standard',
        })
        setHighlightData(res)
        setExpandedTiers({ medium: false, low: false })
      } catch {
        setStreamError("That didn't work the way I expected. Let's try again.")
      }
    } else if (modeId === 'actions') {
      try {
        const truncated = docText.length > 15000 ? docText.slice(0, 15000) + '\n\n[document continues...]' : docText
        const res = await decompose({
          goal: truncated,
          granularity: 'normal',
          reading_level: prefs.readingLevel || 'standard',
        })
        if (res.flagged) {
          setStreamError("Hmm, that one didn't come through. Want to try a different document?")
          return
        }
        setActionItems(res.steps || [])
        setAiGroupName(res.group_name || '')
      } catch {
        setStreamError("That didn't work the way I expected. Let's try again.")
      }
    } else {
      setIsStreaming(true)
      const truncated = docText.length > 15000 ? docText.slice(0, 15000) : docText
      await summariseStream(
        { text: truncated, reading_level: prefs.readingLevel || 'simple' },
        chunk => setStreamText(prev => prev + chunk),
        () => setIsStreaming(false),
        err => { setStreamError(err); setIsStreaming(false) },
      )
    }
  }

  // ── Turn into tasks ───────────────────────────────────────────────────── //

  async function handleTurnIntoTasks(e) {
    if (e && typeof e.preventDefault === 'function') e.preventDefault()
    if (isSaving) return
    setIsSaving(true)
    setStreamError(null)

    try {
      const fallbackName = docName || 'document'
      let tasks     = actionItems
      let groupName = aiGroupName || fallbackName

      // If actionItems is empty for some reason, decompose on the fly
      if (tasks.length === 0) {
        const truncated = docText.length > 15000 ? docText.slice(0, 15000) + '\n\n[document continues...]' : docText
        const res = await decompose({
          goal: truncated,
          granularity: 'normal',
          reading_level: prefs.readingLevel || 'standard',
        })
        if (res.flagged || !res.steps?.length) {
          setStreamError("something went quiet. let's try again.")
          setIsSaving(false)
          return
        }
        tasks     = res.steps
        groupName = res.group_name || fallbackName
      }

      // Build a stable group ID so Tasks.jsx can highlight it
      const newGroupId = Math.random().toString(36).slice(2, 10)

      // 1. Dispatch to Redux immediately (synchronous — Tasks.jsx will see it)
      dispatch(tasksActions.addGroup({ id: newGroupId, name: groupName, source: 'document', tasks }))

      // 2. Persist to Cosmos explicitly — don't rely on Tasks.jsx debounce
      //    Build combined list manually since Redux dispatch is synchronous but
      //    the selector won't reflect it until next render.
      const newGroup = { id: newGroupId, name: groupName, source: 'document', created_at: new Date().toISOString(), tasks }
      saveTasks([...taskGroups, newGroup]).catch(() => {}) // fire-and-forget

      // 3. Navigate with highlight state
      navigate('/tasks', { state: { highlightGroupId: newGroupId } })
    } catch {
      setStreamError("something went quiet. let's try again.")
      setIsSaving(false)
    }
  }

  // ── Q&A ────────────────────────────────────────────────────────────────── //

  async function handleQaSubmit() {
    const q = qaInput.trim()
    if (!q || qaStreaming) return

    const history = qaMessages.map(m => ({ role: m.role === 'ai' ? 'assistant' : 'user', content: m.text }))
    const docContext = docText.length > 3000 ? docText.slice(0, 3000) : docText
    const messageWithContext = `[document context: "${docContext}"]\n\n${q}`

    setQaMessages(prev => [...prev, { role: 'user', text: q }])
    setQaInput('')
    setQaStreaming(true)

    await chatStream(
      { message: messageWithContext, current_page: 'documents', conversation_history: history },
      {
        onToken: chunk => setQaMessages(prev => {
          const msgs = [...prev]
          const last = msgs[msgs.length - 1]
          if (last?.role === 'ai') {
            msgs[msgs.length - 1] = { role: 'ai', text: last.text + chunk }
          } else {
            msgs.push({ role: 'ai', text: chunk })
          }
          return msgs
        }),
        onReplace: content => setQaMessages(prev => {
          const msgs = [...prev]
          const last = msgs[msgs.length - 1]
          if (last?.role === 'ai') {
            msgs[msgs.length - 1] = { role: 'ai', text: content }
          } else {
            msgs.push({ role: 'ai', text: content })
          }
          return msgs
        }),
        onDone: () => setQaStreaming(false),
        onError: () => {
          setQaMessages(prev => [...prev, { role: 'ai', text: "That didn't come through. Want to try asking again?" }])
          setQaStreaming(false)
        },
      },
    )
  }

  // ── Layout ────────────────────────────────────────────────────────────── //

  const pageStyle = {
    display: 'flex', flexDirection: 'column', alignItems: 'center',
    padding: '2rem 2rem 4rem', gap: '1.5rem',
    maxWidth: '720px', margin: '0 auto', width: '100%',
  }

  // ── Loading state ─────────────────────────────────────────────────────── //

  if (loadState === 'loading') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', flex: 1, overflowY: 'auto', minHeight: 0 }}>
        <div style={{ ...pageStyle, justifyContent: 'center', alignItems: 'center', minHeight: '50vh' }}>
          <ThreeDotLoader text="Loading document..." />
        </div>
      </div>
    )
  }

  if (loadState === 'error') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', flex: 1, overflowY: 'auto', minHeight: 0 }}>
        <div style={{ ...pageStyle, justifyContent: 'center', alignItems: 'center', minHeight: '50vh' }}>
          <p style={{ fontSize: '0.88rem', color: 'var(--text-muted)', textAlign: 'center', marginBottom: '1rem' }}>
            Something went quiet. We couldn't load this document.
          </p>
          <Link
            to="/documents"
            style={{ fontSize: '0.85rem', color: 'var(--color-active)', textDecoration: 'none' }}
          >
            ← Back to documents
          </Link>
        </div>
      </div>
    )
  }

  // ── Render ────────────────────────────────────────────────────────────── //

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, overflowY: 'auto', minHeight: 0 }}>
      {/* Header bar */}
      <div style={{
        position: 'relative',
        padding: '1.25rem 2rem 0',
        maxWidth: '720px', margin: '0 auto', width: '100%',
      }}>
        {/* Back link — left */}
        <Link
          to="/documents"
          style={{
            position: 'absolute', left: '2rem', top: '1.25rem',
            fontSize: '0.78rem', color: 'var(--text-secondary)', textDecoration: 'none',
            display: 'flex', alignItems: 'center', gap: '0.25rem',
            transition: 'color 0.2s ease',
          }}
          onMouseEnter={e => e.currentTarget.style.color = 'var(--color-active)'}
          onMouseLeave={e => e.currentTarget.style.color = 'var(--text-secondary)'}
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6"/>
          </svg>
          all documents
        </Link>

        {/* Centered doc name */}
        <div style={{ textAlign: 'center' }}>
          <h2 style={{
            fontFamily: 'var(--font-display)', fontSize: 'clamp(1rem, 2.5vw, 1.25rem)',
            fontWeight: 400, color: 'var(--text-primary)', margin: 0, padding: '0.15rem 0',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            maxWidth: '60%', marginLeft: 'auto', marginRight: 'auto',
          }}>
            {formatFilename(docName)}
          </h2>
        </div>

        <div style={{ marginTop: '0.6rem' }}>
          {/* Prev / Next doc switcher */}
          {navDocs.length > 1 && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0', marginTop: '0.6rem' }}>
              {/* Prev */}
              <button
                onClick={() => prevDoc && navigate(`/documents/${prevDoc.id}`)}
                disabled={!prevDoc}
                title={prevDoc ? formatFilename(prevDoc.filename) : undefined}
                style={{
                  display: 'flex', alignItems: 'center', gap: '0.22rem',
                  fontSize: '0.72rem', color: 'var(--text-muted)',
                  background: 'none', border: 'none',
                  borderRadius: 8, padding: '0.22rem 0.5rem',
                  cursor: prevDoc ? 'pointer' : 'default',
                  opacity: prevDoc ? 1 : 0.25,
                  transition: 'background 0.15s ease, color 0.15s ease, opacity 0.15s ease',
                }}
                onMouseEnter={e => { if (prevDoc) { e.currentTarget.style.background = 'var(--accent-soft)'; e.currentTarget.style.color = 'var(--color-pebble)' } }}
                onMouseLeave={e => { e.currentTarget.style.background = 'none'; e.currentTarget.style.color = 'var(--text-muted)' }}
              >
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
                {prevDoc && (
                  <span style={{ maxWidth: 72, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {formatFilename(prevDoc.filename)}
                  </span>
                )}
              </button>

              {/* Counter */}
              <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)', fontVariantNumeric: 'tabular-nums', padding: '0 0.55rem' }}>
                {currentIndex + 1} / {navDocs.length}
              </span>

              {/* Next */}
              <button
                onClick={() => nextDoc && navigate(`/documents/${nextDoc.id}`)}
                disabled={!nextDoc}
                title={nextDoc ? formatFilename(nextDoc.filename) : undefined}
                style={{
                  display: 'flex', alignItems: 'center', gap: '0.22rem',
                  fontSize: '0.72rem', color: 'var(--text-muted)',
                  background: 'none', border: 'none',
                  borderRadius: 8, padding: '0.22rem 0.5rem',
                  cursor: nextDoc ? 'pointer' : 'default',
                  opacity: nextDoc ? 1 : 0.25,
                  transition: 'background 0.15s ease, color 0.15s ease, opacity 0.15s ease',
                }}
                onMouseEnter={e => { if (nextDoc) { e.currentTarget.style.background = 'var(--accent-soft)'; e.currentTarget.style.color = 'var(--color-pebble)' } }}
                onMouseLeave={e => { e.currentTarget.style.background = 'none'; e.currentTarget.style.color = 'var(--text-muted)' }}
              >
                {nextDoc && (
                  <span style={{ maxWidth: 72, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {formatFilename(nextDoc.filename)}
                  </span>
                )}
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
              </button>
            </div>
          )}
        </div>
      </div>

      <AnimatePresence mode="wait">

        {/* ── Question phase ──────────────────────────────────────────────── */}
        {phase === 'question' && (
          <motion.div key="question" {...fadeUp} style={{ ...pageStyle, alignItems: 'stretch' }}>
            <motion.div
              variants={stagger} initial="initial" animate="animate"
              style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}
            >
              {/* Prompt heading */}
              <motion.div variants={staggerItem} style={{ textAlign: 'center', padding: '0.25rem 0' }}>
                <h3 style={{
                  fontFamily: 'var(--font-display)', fontSize: 'clamp(1.1rem, 3vw, 1.35rem)',
                  fontWeight: 400, color: 'var(--text-primary)', margin: 0, lineHeight: 1.4,
                }}>
                  What would you like to do with your document?
                </h3>
              </motion.div>

              {/* Choice cards */}
              {CHOICES.map(choice => {
                const isHovered = hoveredChoice === choice.id
                return (
                  <motion.button
                    key={choice.id}
                    variants={staggerItem}
                    onClick={() => handleModeSelect(choice.id)}
                    onMouseEnter={() => setHoveredChoice(choice.id)}
                    onMouseLeave={() => setHoveredChoice(null)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: '1rem',
                      padding: '1.25rem 1.5rem',
                      background: isHovered ? 'var(--accent-soft)' : 'var(--bg-card)',
                      borderTop: `1.5px solid ${isHovered ? choice.dot : 'var(--border)'}`,
                      borderRight: `1.5px solid ${isHovered ? choice.dot : 'var(--border)'}`,
                      borderBottom: `1.5px solid ${isHovered ? choice.dot : 'var(--border)'}`,
                      borderLeft: `3px solid ${isHovered ? choice.dot : 'var(--border)'}`,
                      borderRadius: 12,
                      cursor: 'pointer', textAlign: 'left', width: '100%',
                      color: 'var(--text-primary)',
                      transition: 'background 0.25s ease, border-color 0.25s ease, box-shadow 0.25s ease',
                      boxShadow: isHovered ? '0 4px 18px rgba(0,0,0,0.04)' : 'var(--shadow)',
                      position: 'relative',
                    }}
                    whileTap={{ scale: 0.99 }}
                    aria-label={choice.title}
                  >
                    <div style={{
                      width: 10, height: 10, borderRadius: '50%', background: choice.dot, flexShrink: 0,
                      transition: 'transform 0.25s ease',
                      transform: isHovered ? 'scale(1.2)' : 'scale(1)',
                    }} />
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: '0.95rem', fontWeight: 500, color: 'var(--text-primary)' }}>{choice.title}</div>
                      <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>{choice.sub}</div>
                    </div>
                    {/* Chevron that slides in on hover */}
                    <motion.span
                      animate={{ opacity: isHovered ? 1 : 0, x: isHovered ? 0 : -8 }}
                      transition={{ duration: 0.25, ease: [0.25, 0.46, 0.45, 0.94] }}
                      style={{ color: choice.dot, flexShrink: 0, display: 'flex', alignItems: 'center' }}
                      aria-hidden="true"
                    >
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="9 18 15 12 9 6" />
                      </svg>
                    </motion.span>
                  </motion.button>
                )
              })}

              {/* Calming quotes */}
              <motion.div variants={staggerItem}>
                <CalmQuotes />
              </motion.div>
            </motion.div>
          </motion.div>
        )}

        {/* ── Results phase ───────────────────────────────────────────────── */}
        {phase === 'results' && (
          <motion.div key="results" {...fadeUp} style={{ ...pageStyle, alignItems: 'stretch', paddingBottom: '8rem' }}>
            <motion.div
              variants={stagger} initial="initial" animate="animate"
              style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}
            >

              {/* Main results bubble */}
              <motion.div variants={staggerItem}>
                {chosenMode === 'questions' && (
                  <AIBubble text="Ask me anything about this document. I've read through it and I'm ready to help." />
                )}

                {chosenMode === 'actions' && (() => {
                  return (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>

                    {/* Pebble intro line */}
                    <div style={{ display: 'flex', gap: '0.55rem', alignItems: 'flex-start' }}>
                      <motion.div
                        animate={{ scale: [0.88, 1.08, 0.88], opacity: [0.7, 1, 0.7] }}
                        transition={{ duration: 3.5, repeat: Infinity, ease: 'easeInOut' }}
                        style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--color-pebble)', flexShrink: 0, marginTop: '0.35rem' }}
                      />
                      <p style={{ fontSize: '0.88rem', color: 'var(--text-secondary)', margin: 0, lineHeight: 1.6 }}>
                        {actionItems.length > 0
                          ? `found ${actionItems.length} things to do. everything else is background.`
                          : 'working through it…'}
                      </p>
                    </div>

                    {/* Loading state */}
                    {actionItems.length === 0 && !streamError && (
                      <ThreeDotLoader text="breaking it down…" />
                    )}

                    {/* Group header */}
                    {actionItems.length > 0 && (
                      <motion.div
                        initial={{ opacity: 0, y: 6 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.35 }}
                        style={{
                          display: 'flex', alignItems: 'center', gap: '0.6rem',
                          padding: '0.65rem 1rem',
                          background: 'var(--bg-card)',
                          border: '1px solid var(--border)',
                          borderLeft: '3px solid var(--color-pebble)',
                          borderRadius: '12px 12px 0 0',
                          marginTop: '0.35rem',
                        }}
                      >
                        <div style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--color-pebble)', flexShrink: 0 }} />
                        <span style={{
                          fontFamily: 'var(--font-display)', fontSize: '0.95rem', fontWeight: 400,
                          color: 'var(--text-primary)', flex: 1,
                        }}>
                          {aiGroupName || docName || 'from this document'}
                        </span>
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                          {actionItems.length} task{actionItems.length !== 1 ? 's' : ''}
                        </span>
                      </motion.div>
                    )}

                    {/* Task cards with interactive pills */}
                    {actionItems.map((step, i) => {
                      return (
                        <motion.div
                          key={i}
                          initial={{ opacity: 0, y: 8 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ duration: 0.32, delay: i * 0.06 }}
                          style={{
                            display: 'flex', alignItems: 'flex-start', gap: '0.75rem',
                            padding: '0.85rem 1rem',
                            background: 'var(--bg-card)',
                            border: '1px solid var(--border)',
                            borderLeft: '3px solid var(--color-pebble)',
                            borderTop: 'none',
                            borderRadius: i === actionItems.length - 1 ? '0 0 12px 12px' : '0',
                          }}
                        >
                          {/* Circle checkbox */}
                          <div style={{
                            width: 16, height: 16, borderRadius: '50%', flexShrink: 0, marginTop: '0.22rem',
                            border: '1.5px solid var(--border)', background: 'transparent',
                          }} />

                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: '0.9rem', fontWeight: 500, color: 'var(--text-primary)', lineHeight: 1.45 }}>
                              {step.task_name}
                            </div>
                            {step.motivation_nudge && (
                              <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', lineHeight: 1.5, marginTop: '0.2rem' }}>
                                {step.motivation_nudge}
                              </div>
                            )}
                          </div>
                        </motion.div>
                      )
                    })}

                    {streamError && (
                      <p style={{ fontSize: '0.85rem', color: 'var(--color-ai)', marginTop: '0.25rem' }}>
                        {streamError}
                      </p>
                    )}
                  </div>
                  )
                })()}

                {/* Highlights — priority-based cognitive offloading */}
                {chosenMode === 'highlights' && (
                  <>
                    {!highlightData && !streamError ? (
                      <ThreeDotLoader text="Reading through everything for you..." />
                    ) : highlightData ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                        <h3 style={{
                          fontFamily: 'var(--font-display)', fontSize: 'clamp(1rem, 2.5vw, 1.2rem)',
                          fontWeight: 400, color: 'var(--text-primary)', textAlign: 'center',
                          margin: 0,
                        }}>
                          Here's what matters most
                        </h3>

                        {/* High priority — always visible */}
                        {highlightData.high.length > 0 && (
                          <motion.div
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.5, ease: [0.25, 0.46, 0.45, 0.94] }}
                          >
                            <p style={{ fontSize: '0.82rem', color: 'var(--color-ai)', fontWeight: 600, marginBottom: '0.6rem' }}>
                              These need your attention
                            </p>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                              {highlightData.high.map((item, i) => (
                                <motion.div
                                  key={i}
                                  initial={{ opacity: 0, y: 6 }}
                                  animate={{ opacity: 1, y: 0 }}
                                  transition={{ delay: i * 0.1, duration: 0.4 }}
                                  style={{
                                    background: 'var(--bg-card)',
                                    borderLeft: '3px solid var(--color-ai)',
                                    borderRadius: '10px',
                                    padding: '0.85rem 1rem',
                                    boxShadow: '0 2px 8px rgba(0,0,0,0.03)',
                                  }}
                                >
                                  <div style={{ fontWeight: 600, fontSize: '0.9rem', color: 'var(--text-primary)', marginBottom: '0.2rem' }}>
                                    {item.title}
                                  </div>
                                  <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)', lineHeight: 1.55 }}>
                                    {item.detail}
                                  </div>
                                </motion.div>
                              ))}
                            </div>
                          </motion.div>
                        )}

                        {/* Medium priority — collapsed by default */}
                        {highlightData.medium.length > 0 && (
                          <motion.div
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: 0.3, duration: 0.5 }}
                          >
                            <button
                              onClick={() => setExpandedTiers(prev => ({ ...prev, medium: !prev.medium }))}
                              style={{
                                background: 'none', border: 'none', cursor: 'pointer',
                                fontSize: '0.82rem', color: 'var(--color-active)', fontWeight: 600,
                                padding: '0.4rem 0', display: 'flex', alignItems: 'center', gap: '0.4rem',
                                marginBottom: expandedTiers.medium ? '0.6rem' : 0,
                              }}
                            >
                              <Chevron expanded={expandedTiers.medium} />
                              Helpful, but no rush
                              <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 400 }}>
                                ({highlightData.medium.length})
                              </span>
                            </button>
                            <AnimatePresence>
                              {expandedTiers.medium && (
                                <motion.div
                                  initial={{ height: 0, opacity: 0 }}
                                  animate={{ height: 'auto', opacity: 1 }}
                                  exit={{ height: 0, opacity: 0 }}
                                  transition={{ duration: 0.35, ease: [0.25, 0.46, 0.45, 0.94] }}
                                  style={{ overflow: 'hidden' }}
                                >
                                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                                    {highlightData.medium.map((item, i) => (
                                      <motion.div
                                        key={i}
                                        initial={{ opacity: 0, y: 6 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        transition={{ delay: i * 0.08, duration: 0.35 }}
                                        style={{
                                          background: 'var(--bg-card)',
                                          borderLeft: '3px solid var(--color-pebble)',
                                          borderRadius: '10px',
                                          padding: '0.85rem 1rem',
                                          boxShadow: '0 2px 8px rgba(0,0,0,0.03)',
                                        }}
                                      >
                                        <div style={{ fontWeight: 600, fontSize: '0.9rem', color: 'var(--text-primary)', marginBottom: '0.2rem' }}>
                                          {item.title}
                                        </div>
                                        <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)', lineHeight: 1.55 }}>
                                          {item.detail}
                                        </div>
                                      </motion.div>
                                    ))}
                                  </div>
                                </motion.div>
                              )}
                            </AnimatePresence>
                          </motion.div>
                        )}

                        {/* Low priority — collapsed by default */}
                        {highlightData.low.length > 0 && (
                          <motion.div
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: 0.45, duration: 0.5 }}
                          >
                            <button
                              onClick={() => setExpandedTiers(prev => ({ ...prev, low: !prev.low }))}
                              style={{
                                background: 'none', border: 'none', cursor: 'pointer',
                                fontSize: '0.82rem', color: 'var(--text-muted)', fontWeight: 600,
                                padding: '0.4rem 0', display: 'flex', alignItems: 'center', gap: '0.4rem',
                                marginBottom: expandedTiers.low ? '0.6rem' : 0,
                              }}
                            >
                              <Chevron expanded={expandedTiers.low} color="var(--text-muted)" />
                              Just background. You can skip this
                              <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 400 }}>
                                ({highlightData.low.length})
                              </span>
                            </button>
                            <AnimatePresence>
                              {expandedTiers.low && (
                                <motion.div
                                  initial={{ height: 0, opacity: 0 }}
                                  animate={{ height: 'auto', opacity: 1 }}
                                  exit={{ height: 0, opacity: 0 }}
                                  transition={{ duration: 0.35, ease: [0.25, 0.46, 0.45, 0.94] }}
                                  style={{ overflow: 'hidden' }}
                                >
                                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                                    {highlightData.low.map((item, i) => (
                                      <motion.div
                                        key={i}
                                        initial={{ opacity: 0, y: 6 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        transition={{ delay: i * 0.08, duration: 0.35 }}
                                        style={{
                                          background: 'var(--bg-card)',
                                          borderLeft: '3px solid var(--border)',
                                          borderRadius: '10px',
                                          padding: '0.85rem 1rem',
                                          boxShadow: '0 2px 8px rgba(0,0,0,0.03)',
                                        }}
                                      >
                                        <div style={{ fontWeight: 600, fontSize: '0.9rem', color: 'var(--text-primary)', marginBottom: '0.2rem' }}>
                                          {item.title}
                                        </div>
                                        <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)', lineHeight: 1.55 }}>
                                          {item.detail}
                                        </div>
                                      </motion.div>
                                    ))}
                                  </div>
                                </motion.div>
                              )}
                            </AnimatePresence>
                          </motion.div>
                        )}

                        {streamError && (
                          <p style={{ fontSize: '0.85rem', color: 'var(--color-ai)', marginTop: '0.5rem' }}>
                            {streamError}
                          </p>
                        )}
                      </div>
                    ) : (
                      <p style={{ fontSize: '0.85rem', color: 'var(--color-ai)' }}>
                        {streamError}
                      </p>
                    )}
                  </>
                )}

                {/* Simplify — calming loader while streaming, structured sections when done */}
                {chosenMode === 'simplify' && (
                  <>
                    {isStreaming ? (
                      <ThreeDotLoader text="Simplifying it for you now..." />
                    ) : (
                      <div>
                        <h3 style={{
                          fontFamily: 'var(--font-display)', fontSize: 'clamp(1rem, 2.5vw, 1.2rem)',
                          fontWeight: 400, color: 'var(--text-primary)', textAlign: 'center',
                          margin: '0 0 1.25rem',
                        }}>
                          Here's the simple version
                        </h3>
                        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '0.75rem' }}>
                          <button
                            onClick={() => setBionicMode(b => !b)}
                            aria-pressed={bionicMode}
                            style={{
                              borderRadius: 999,
                              border: '1px solid var(--border)',
                              padding: '0.2rem 0.85rem',
                              fontSize: '0.78rem',
                              background: bionicMode ? 'var(--color-pebble)' : 'transparent',
                              color: bionicMode ? 'white' : 'var(--text-secondary)',
                              transition: 'all 0.2s ease',
                              cursor: 'pointer',
                            }}
                          >
                            {bionicMode ? 'Normal reading' : 'Bionic reading'}
                          </button>
                        </div>
                        <SimplifiedSections text={streamText} bionicMode={bionicMode} />
                        {streamError && (
                          <p style={{ fontSize: '0.85rem', color: 'var(--color-ai)', marginTop: '0.5rem' }}>
                            {streamError}
                          </p>
                        )}
                      </div>
                    )}
                  </>
                )}
              </motion.div>

              {/* Follow-up actions */}
              {!isStreaming && chosenMode !== 'questions' && (chosenMode !== 'highlights' || highlightData) && (chosenMode !== 'actions' || actionItems.length > 0) && (
                <div>
                  {chosenMode === 'actions' && actionItems.length > 0 ? (
                    /* Actions mode: prominent add-to-tasks CTA */
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.55rem' }}>
                      <button
                        type="button"
                        className="btn btn-primary"
                        disabled={isSaving}
                        style={{ width: '100%', fontSize: '0.88rem', padding: '0.65rem 1.25rem', borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem', opacity: isSaving ? 0.7 : 1, cursor: isSaving ? 'default' : 'pointer' }}
                        onClick={handleTurnIntoTasks}
                      >
                        {isSaving ? 'adding…' : 'add these to my tasks'}
                        {!isSaving && (
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="9 18 15 12 9 6"/>
                          </svg>
                        )}
                      </button>
                    {(() => {
                        const chosen2 = prefs.pebbleColor || 'sage'
                        const nonChosen = _ALL_PILL_COLORS.filter(c => c.key !== chosen2)
                        const simplifyClr = nonChosen[1] || nonChosen[0]
                        const highlightClr = nonChosen[2] || nonChosen[1]
                        return (
                          <div style={{ display: 'flex', gap: '0.5rem' }}>
                            {chosenMode !== 'simplify' && (
                              <button
                                onClick={() => handleModeSelect('simplify')}
                                style={{
                                  flex: 1, fontSize: '0.8rem', padding: '0.38rem 0.75rem', borderRadius: 10,
                                  cursor: 'pointer', fontFamily: 'inherit', fontWeight: 500,
                                  background: simplifyClr.bg,
                                  border: `1px solid ${simplifyClr.border}`,
                                  color: simplifyClr.color,
                                  transition: 'opacity 0.18s ease',
                                }}
                                onMouseEnter={e => { e.currentTarget.style.opacity = '0.75' }}
                                onMouseLeave={e => { e.currentTarget.style.opacity = '1' }}
                              >
                                simplify full text
                              </button>
                            )}
                            {chosenMode !== 'highlights' && (
                              <button
                                onClick={() => handleModeSelect('highlights')}
                                style={{
                                  flex: 1, fontSize: '0.8rem', padding: '0.38rem 0.75rem', borderRadius: 10,
                                  cursor: 'pointer', fontFamily: 'inherit', fontWeight: 500,
                                  background: highlightClr.bg,
                                  border: `1px solid ${highlightClr.border}`,
                                  color: highlightClr.color,
                                  transition: 'opacity 0.18s ease',
                                }}
                                onMouseEnter={e => { e.currentTarget.style.opacity = '0.75' }}
                                onMouseLeave={e => { e.currentTarget.style.opacity = '1' }}
                              >
                                highlight key parts
                              </button>
                            )}
                          </div>
                        )
                      })()}
                    </div>
                  ) : (
                    <AIBubble orange>
                      <p style={{ marginBottom: '0.75rem', fontSize: '0.88rem' }}>
                        {docType === 'article'
                          ? 'want to explore this further?'
                          : 'want me to do anything else with this?'}
                      </p>
                      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                        {docType !== 'article' && (
                          <button
                            className="btn btn-primary"
                            style={{ fontSize: '0.82rem', padding: '0.4rem 0.95rem', borderRadius: 999, background: 'var(--color-pebble)', border: 'none' }}
                            onClick={() => handleModeSelect('actions')}
                          >
                            turn into tasks
                          </button>
                        )}
                        {chosenMode !== 'simplify' && (
                          <button className="btn btn-ghost" style={{ fontSize: '0.82rem', padding: '0.4rem 0.95rem', borderRadius: 999 }} onClick={() => handleModeSelect('simplify')}>
                            simplify full text
                          </button>
                        )}
                        {chosenMode !== 'highlights' && (
                          <button className="btn btn-ghost" style={{ fontSize: '0.82rem', padding: '0.4rem 0.95rem', borderRadius: 999 }} onClick={() => handleModeSelect('highlights')}>
                            highlight key parts
                          </button>
                        )}
                      </div>
                    </AIBubble>
                  )}
                </div>
              )}

              {/* Q&A thread */}
              {qaMessages.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
                  {qaMessages.map((msg, i) =>
                    msg.role === 'user'
                      ? <UserBubble key={i} text={msg.text} userName={prefs.name} />
                      : (
                        <motion.div key={i} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
                          <AIBubble
                            text={msg.text}
                            isStreaming={qaStreaming && i === qaMessages.length - 1}
                          />
                        </motion.div>
                      )
                  )}
                  {/* Loading dots when waiting for first token */}
                  {qaStreaming && qaMessages[qaMessages.length - 1]?.role === 'user' && (
                    <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} style={{ display: 'flex', gap: '0.75rem', alignItems: 'flex-start' }}>
                      <div style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--color-pebble)', flexShrink: 0, marginTop: '0.75rem' }} />
                      <div style={{
                        background: 'rgba(200,148,80,0.07)', border: '1px solid rgba(200,148,80,0.12)',
                        borderRadius: '18px 18px 18px 5px', padding: '0.75rem 1rem',
                      }}>
                        <div style={{ display: 'flex', gap: 5, alignItems: 'flex-end', height: 16 }}>
                          {LOADING_DOTS.map((dot, i) => (
                            <motion.span
                              key={i}
                              animate={{ y: [0, -6, 0] }}
                              transition={{ duration: 1.1, delay: dot.delay, repeat: Infinity, ease: 'easeInOut', repeatDelay: 0.5 }}
                              style={{ display: 'block', width: 6, height: 6, borderRadius: '50%', background: dot.color, flexShrink: 0 }}
                            />
                          ))}
                        </div>
                      </div>
                    </motion.div>
                  )}
                </div>
              )}

              {/* Q&A input — only in questions mode */}
              {!isStreaming && chosenMode === 'questions' && (
                <motion.div
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.6, duration: 0.4 }}
                  style={{
                    display: 'flex', gap: '0.65rem', alignItems: 'center',
                    position: 'sticky', bottom: '1.5rem',
                    marginTop: '1rem',
                  }}
                >
                  <input
                    type="text"
                    placeholder="Ask me anything about this document..."
                    value={qaInput}
                    onChange={e => setQaInput(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleQaSubmit()}
                    style={{ flex: 1, borderRadius: '99px', padding: '0.65rem 1.1rem', fontSize: '0.88rem' }}
                    aria-label="Ask a question about this document"
                  />
                  <button
                    className="btn btn-primary"
                    style={{ padding: '0.65rem 1.25rem', borderRadius: 999, flexShrink: 0, opacity: !qaInput.trim() || qaStreaming ? 0.45 : 1, background: 'var(--color-pebble)', border: 'none' }}
                    disabled={!qaInput.trim() || qaStreaming}
                    onClick={handleQaSubmit}
                  >
                    Ask
                  </button>
                </motion.div>
              )}

            </motion.div>
          </motion.div>
        )}

      </AnimatePresence>
    </div>
  )
}
