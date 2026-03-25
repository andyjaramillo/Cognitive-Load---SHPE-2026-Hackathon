import { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useDispatch, useSelector } from 'react-redux'
import { useNavigate, useParams, Link } from 'react-router-dom'
import { tasksActions } from '../store'
import { loadDocumentById, summariseStream, explainSentence, decompose, extractHighlights, chatStream } from '../utils/api'
import { bionicify } from '../utils/bionic'
import { splitIntoBubbles, renderMarkdown } from '../utils/bubbles'

// ── Constants ─────────────────────────────────────────────────────────────── //

const CHOICES = [
  { id: 'actions',    dot: 'var(--color-active)',   title: "lets turn this into tasks",             sub: 'action items and deadlines, nothing extra' },
  { id: 'simplify',   dot: 'var(--color-done)',     title: "lets simplify document information",    sub: 'plain language, easier to digest' },
  { id: 'highlights', dot: 'var(--color-ai)',       title: 'show me what matters most',             sub: 'highlight the key sections to focus on' },
  { id: 'questions',  dot: 'var(--color-paused)',   title: 'i have questions about the document',   sub: "let's chat about what's inside" },
]

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
    }, 6000)
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
    case 'academic':     return `looks like course material. ${base}. how should i help?`
    case 'legal':        return `looks like a legal document. ${base}. how should i help?`
    case 'instructions': return `looks like a how-to guide. ${base}. how should i help?`
    case 'work':         return `looks like work notes. ${base}. how should i help?`
    case 'article':      return `looks like an article. ${base}. how should i help?`
    default:             return `${base} loaded. how should i help?`
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
            bottom line
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
              <motion.span
                animate={{ rotate: isExpanded ? 90 : 0 }}
                transition={{ duration: 0.2 }}
                style={{ display: 'inline-block', color: 'var(--color-active)', fontSize: '0.9rem' }}
              >
                →
              </motion.span>
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
                    borderLeft: '3px solid var(--color-active)',
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
  const prefs = useSelector(s => s.prefs)

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
        setStreamError("something went quiet. try again?")
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
          setStreamError("this content couldn't be processed. try a different document?")
          return
        }
        setActionItems(res.steps || [])
        setAiGroupName(res.group_name || '')
      } catch {
        setStreamError("something went quiet. try again?")
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

  async function handleTurnIntoTasks() {
    const fallbackName = docName || 'document'
    if (actionItems.length > 0) {
      const groupName = aiGroupName || fallbackName
      dispatch(tasksActions.addGroup({ name: groupName, source: 'document', tasks: actionItems }))
      navigate('/tasks')
      return
    }
    try {
      const truncated = docText.length > 15000 ? docText.slice(0, 15000) + '\n\n[document continues...]' : docText
      const res = await decompose({
        goal: truncated,
        granularity: 'normal',
        reading_level: prefs.readingLevel || 'standard',
      })
      if (!res.flagged && res.steps?.length) {
        const groupName = res.group_name || fallbackName
        dispatch(tasksActions.addGroup({ name: groupName, source: 'document', tasks: res.steps }))
        navigate('/tasks')
      }
    } catch {}
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
          setQaMessages(prev => [...prev, { role: 'ai', text: "something went quiet. try asking again?" }])
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
          <motion.div
            animate={{ scale: [0.88, 1.08, 0.88], opacity: [0.5, 1, 0.5] }}
            transition={{ duration: 2.2, repeat: Infinity, ease: 'easeInOut' }}
            style={{ width: 12, height: 12, borderRadius: '50%', background: 'var(--color-pebble)' }}
          />
          <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginTop: '0.75rem' }}>loading document...</p>
        </div>
      </div>
    )
  }

  if (loadState === 'error') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', flex: 1, overflowY: 'auto', minHeight: 0 }}>
        <div style={{ ...pageStyle, justifyContent: 'center', alignItems: 'center', minHeight: '50vh' }}>
          <p style={{ fontSize: '0.88rem', color: 'var(--text-muted)', textAlign: 'center', marginBottom: '1rem' }}>
            something went quiet. couldn't load this document.
          </p>
          <Link
            to="/documents"
            style={{ fontSize: '0.85rem', color: 'var(--color-active)', textDecoration: 'none' }}
          >
            ← back to documents
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
        {/* Back link — absolute left */}
        <Link
          to="/documents"
          style={{
            position: 'absolute', left: '2rem', top: '1.25rem',
            fontSize: '0.78rem', color: 'var(--text-muted)', textDecoration: 'none',
            display: 'flex', alignItems: 'center', gap: '0.3rem',
            transition: 'color 0.2s ease',
          }}
          onMouseEnter={e => e.currentTarget.style.color = 'var(--color-active)'}
          onMouseLeave={e => e.currentTarget.style.color = 'var(--text-muted)'}
        >
          ← all documents
        </Link>

        {/* Centered doc name */}
        <div style={{ textAlign: 'center' }}>
          <h2 style={{
            fontFamily: 'var(--font-display)', fontSize: 'clamp(1rem, 2.5vw, 1.25rem)',
            fontWeight: 400, color: 'var(--text-primary)', margin: 0, padding: '0.15rem 0',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            maxWidth: '60%', marginLeft: 'auto', marginRight: 'auto',
          }}>
            {docName}
          </h2>
          <div style={{
            width: '3rem', height: '2px', background: 'var(--color-pebble)',
            borderRadius: '1px', margin: '0.35rem auto 0', opacity: 0.5,
          }} />
          {docPages && (
            <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', display: 'block', marginTop: '0.25rem' }}>
              {docPages} page{docPages !== 1 ? 's' : ''}
            </span>
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
                  what would you like to do with your document?
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
                      borderRadius: 'var(--radius)',
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
                      transform: isHovered ? 'scale(1.5)' : 'scale(1)',
                    }} />
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: '0.95rem', fontWeight: 500, color: 'var(--text-primary)' }}>{choice.title}</div>
                      <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>{choice.sub}</div>
                    </div>
                    {/* Arrow that slides in on hover */}
                    <motion.span
                      animate={{ opacity: isHovered ? 1 : 0, x: isHovered ? 0 : -8 }}
                      transition={{ duration: 0.25, ease: [0.25, 0.46, 0.45, 0.94] }}
                      style={{ fontSize: '1.15rem', color: choice.dot, flexShrink: 0 }}
                      aria-hidden="true"
                    >
                      →
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
          <motion.div key="results" {...fadeUp} style={{ ...pageStyle, alignItems: 'stretch', paddingBottom: '6rem' }}>
            <motion.div
              variants={stagger} initial="initial" animate="animate"
              style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}
            >

              {/* Main results bubble */}
              <motion.div variants={staggerItem}>
                {chosenMode === 'questions' && (
                  <AIBubble text="ask me anything about this document. i've read through it and i'm ready to help." />
                )}

                {chosenMode === 'actions' && (
                  <AIBubble>
                    <p style={{ marginBottom: '0.85rem', fontSize: '0.88rem', color: 'var(--text-secondary)' }}>
                      {`found ${actionItems.length > 0 ? actionItems.length : '…'} things you need to do. everything else is background.`}
                    </p>
                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                      {actionItems.length === 0 && !streamError && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--text-muted)', fontSize: '0.85rem', padding: '0.5rem 0' }}>
                          <span className="streaming-cursor" aria-hidden="true" />
                          <span>working through it…</span>
                        </div>
                      )}
                      {actionItems.map((step, i) => (
                        <div key={i} style={{
                          display: 'flex', gap: '0.85rem', alignItems: 'flex-start',
                          padding: '0.75rem 0',
                          borderBottom: i < actionItems.length - 1 ? '1px solid var(--border)' : 'none',
                        }}>
                          <div style={{
                            width: 24, height: 24, borderRadius: '50%', flexShrink: 0,
                            background: 'var(--accent-soft)', color: 'var(--accent)',
                            fontSize: '0.72rem', fontWeight: 700,
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                          }}>
                            {i + 1}
                          </div>
                          <div style={{ flex: 1 }}>
                            <div style={{ fontWeight: 600, fontSize: '0.88rem', color: 'var(--text-primary)', marginBottom: '0.15rem' }}>
                              {step.task_name}
                            </div>
                            {step.motivation_nudge && (
                              <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                                {step.motivation_nudge}
                              </div>
                            )}
                            {step.duration_minutes && (
                              <span style={{
                                display: 'inline-block', marginTop: '0.35rem',
                                fontSize: '0.72rem', fontWeight: 500,
                                color: 'var(--color-upcoming)',
                                background: 'rgba(106,150,184,0.12)',
                                padding: '0.15rem 0.55rem',
                                borderRadius: '99px',
                                border: '1px solid rgba(106,150,184,0.2)',
                              }}>
                                ~{step.duration_minutes} min
                              </span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                    {streamError && (
                      <p style={{ fontSize: '0.85rem', color: 'var(--color-ai)', marginTop: '0.5rem' }}>
                        {streamError}
                      </p>
                    )}
                  </AIBubble>
                )}

                {/* Highlights — priority-based cognitive offloading */}
                {chosenMode === 'highlights' && (
                  <>
                    {!highlightData && !streamError ? (
                      <div style={{
                        display: 'flex', flexDirection: 'column', alignItems: 'center',
                        justifyContent: 'center', padding: '3rem 1rem', gap: '1rem',
                      }}>
                        <motion.div
                          animate={{ scale: [0.85, 1.15, 0.85], opacity: [0.5, 1, 0.5] }}
                          transition={{ duration: 2.8, repeat: Infinity, ease: 'easeInOut' }}
                          style={{ width: 14, height: 14, borderRadius: '50%', background: 'var(--color-pebble)' }}
                        />
                        <p style={{
                          fontSize: '0.88rem', color: 'var(--text-muted)', textAlign: 'center',
                          fontStyle: 'italic', lineHeight: 1.5,
                        }}>
                          reading through everything for you...
                        </p>
                      </div>
                    ) : highlightData ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                        <h3 style={{
                          fontFamily: 'var(--font-display)', fontSize: 'clamp(1rem, 2.5vw, 1.2rem)',
                          fontWeight: 400, color: 'var(--text-primary)', textAlign: 'center',
                          margin: 0,
                        }}>
                          here's what matters most
                        </h3>

                        {/* High priority — always visible */}
                        {highlightData.high.length > 0 && (
                          <motion.div
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.5, ease: [0.25, 0.46, 0.45, 0.94] }}
                          >
                            <p style={{ fontSize: '0.82rem', color: 'var(--color-ai)', fontWeight: 600, marginBottom: '0.6rem' }}>
                              these need your attention
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
                              <motion.span
                                animate={{ rotate: expandedTiers.medium ? 90 : 0 }}
                                transition={{ duration: 0.2 }}
                                style={{ display: 'inline-block' }}
                              >
                                →
                              </motion.span>
                              helpful, but no rush
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
                                          borderLeft: '3px solid var(--color-active)',
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
                              <motion.span
                                animate={{ rotate: expandedTiers.low ? 90 : 0 }}
                                transition={{ duration: 0.2 }}
                                style={{ display: 'inline-block' }}
                              >
                                →
                              </motion.span>
                              just background — you can skip this
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
                      <div style={{
                        display: 'flex', flexDirection: 'column', alignItems: 'center',
                        justifyContent: 'center', padding: '3rem 1rem', gap: '1rem',
                      }}>
                        <motion.div
                          animate={{ scale: [0.85, 1.15, 0.85], opacity: [0.5, 1, 0.5] }}
                          transition={{ duration: 2.8, repeat: Infinity, ease: 'easeInOut' }}
                          style={{ width: 14, height: 14, borderRadius: '50%', background: 'var(--color-pebble)' }}
                        />
                        <p style={{
                          fontSize: '0.88rem', color: 'var(--text-muted)', textAlign: 'center',
                          fontStyle: 'italic', lineHeight: 1.5,
                        }}>
                          don't worry, simplifying for you now
                        </p>
                      </div>
                    ) : (
                      <div>
                        <h3 style={{
                          fontFamily: 'var(--font-display)', fontSize: 'clamp(1rem, 2.5vw, 1.2rem)',
                          fontWeight: 400, color: 'var(--text-primary)', textAlign: 'center',
                          margin: '0 0 1.25rem',
                        }}>
                          here's the simple version
                        </h3>
                        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '0.75rem' }}>
                          <button
                            className="btn btn-ghost"
                            style={{ fontSize: '0.78rem', padding: '0.25rem 0.75rem' }}
                            onClick={() => setBionicMode(b => !b)}
                            aria-pressed={bionicMode}
                          >
                            {bionicMode ? 'normal reading' : 'bionic reading'}
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
              {!isStreaming && chosenMode !== 'questions' && (chosenMode !== 'highlights' || highlightData) && (
                <motion.div
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.45, duration: 0.4, ease: [0.4, 0, 0.2, 1] }}
                >
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
                          style={{ fontSize: '0.82rem', padding: '0.4rem 0.95rem' }}
                          onClick={handleTurnIntoTasks}
                        >
                          turn into tasks
                        </button>
                      )}
                      {chosenMode !== 'simplify' && (
                        <button
                          className="btn btn-ghost"
                          style={{ fontSize: '0.82rem', padding: '0.4rem 0.95rem' }}
                          onClick={() => handleModeSelect('simplify')}
                        >
                          simplify full text
                        </button>
                      )}
                      {chosenMode !== 'highlights' && (
                        <button
                          className="btn btn-ghost"
                          style={{ fontSize: '0.82rem', padding: '0.4rem 0.95rem' }}
                          onClick={() => handleModeSelect('highlights')}
                        >
                          highlight key parts
                        </button>
                      )}
                    </div>
                  </AIBubble>
                </motion.div>
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
                </div>
              )}

              {/* Q&A input */}
              {!isStreaming && (
                <motion.div
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.6, duration: 0.4 }}
                  style={{
                    display: 'flex', gap: '0.65rem', alignItems: 'center',
                    position: 'sticky', bottom: '1.5rem',
                  }}
                >
                  <input
                    type="text"
                    placeholder="ask anything about this document..."
                    value={qaInput}
                    onChange={e => setQaInput(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleQaSubmit()}
                    style={{ flex: 1, borderRadius: '99px', padding: '0.65rem 1.1rem', fontSize: '0.88rem' }}
                    aria-label="Ask a question about this document"
                  />
                  <button
                    className="btn btn-primary"
                    style={{ padding: '0.65rem 1.25rem', borderRadius: '99px', flexShrink: 0, opacity: !qaInput.trim() || qaStreaming ? 0.45 : 1 }}
                    disabled={!qaInput.trim() || qaStreaming}
                    onClick={handleQaSubmit}
                  >
                    ask
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
