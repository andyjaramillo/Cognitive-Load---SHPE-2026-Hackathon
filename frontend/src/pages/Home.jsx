import { useState, useEffect, useRef, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useNavigate } from 'react-router-dom'
import { useSelector } from 'react-redux'
import { chatStream } from '../utils/api'

// ── Constants ─────────────────────────────────────────────────────────── //

const PLACEHOLDERS = [
  "What's on your mind?",
  "What feels overwhelming right now?",
  "What are you working on today?",
  "Need help breaking something down?",
  "Tell me what you're thinking...",
]

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

const genId = () => Math.random().toString(36).slice(2, 10)
const GREETING_DEDUPE_KEY = 'pebble_home_greeting_ts'
const GREETING_DEDUPE_WINDOW_MS = 2500

// ── Sub-components ────────────────────────────────────────────────────── //

function PulseDot() {
  return (
    <div style={{ display: 'flex', gap: 5, alignItems: 'center', padding: '6px 2px' }}>
      {[0, 1, 2].map(i => (
        <motion.span
          key={i}
          animate={{ scale: [0.85, 1.15, 0.85], opacity: [0.4, 1, 0.4] }}
          transition={{ duration: 2.2, delay: i * 0.35, repeat: Infinity, ease: 'easeInOut' }}
          style={{
            display: 'block',
            width: 7,
            height: 7,
            borderRadius: '50%',
            background: '#5A8A80',
          }}
        />
      ))}
    </div>
  )
}

function AiBubble({ content, buttons, navigate }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', alignItems: 'flex-start', maxWidth: '85%' }}>
      <div style={{
        background: 'rgba(200,148,80,0.09)',
        border: '1px solid rgba(200,148,80,0.18)',
        borderRadius: '16px 16px 16px 4px',
        padding: '0.8rem 1rem',
        color: 'var(--text-primary)',
        fontSize: '0.95rem',
        lineHeight: 1.65,
        whiteSpace: 'pre-wrap',
        wordBreak: 'break-word',
      }}>
        {content}
      </div>
      {buttons && buttons.length > 0 && (
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginTop: '0.1rem' }}>
          {buttons.map((btn, i) => (
            <button
              key={i}
              onClick={() => navigate(btn.value)}
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
  )
}

function UserBubble({ content }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
      <div style={{
        background: 'rgba(42,122,144,0.1)',
        border: '1px solid rgba(42,122,144,0.2)',
        borderRadius: '16px 16px 4px 16px',
        padding: '0.8rem 1rem',
        color: 'var(--text-primary)',
        fontSize: '0.95rem',
        lineHeight: 1.65,
        maxWidth: '80%',
        whiteSpace: 'pre-wrap',
        wordBreak: 'break-word',
      }}>
        {content}
      </div>
    </div>
  )
}

// ── Home page ─────────────────────────────────────────────────────────── //

export default function Home() {
  const navigate    = useNavigate()
  const prefs       = useSelector(s => s.prefs)

  // Chat state — local only (no Redux slice needed for chat messages)
  const [messages,        setMessages]        = useState([])
  const [streamingContent, setStreamingContent] = useState('')
  const [pendingButtons,  setPendingButtons]  = useState([])
  const [isStreaming,     setIsStreaming]      = useState(false)
  const [input,           setInput]           = useState('')
  const [placeholderIdx,  setPlaceholderIdx]  = useState(0)
  const [hoveredAction,   setHoveredAction]   = useState(null)

  const messagesEndRef = useRef(null)
  const inputRef       = useRef(null)

  // Rotate placeholder text every 4 seconds
  useEffect(() => {
    const timer = setInterval(
      () => setPlaceholderIdx(i => (i + 1) % PLACEHOLDERS.length),
      4000,
    )
    return () => clearInterval(timer)
  }, [])

  // Scroll to bottom whenever messages or streaming content updates
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, streamingContent])

  // ── Core streaming function ──────────────────────────────────────────── //

  const sendMessage = useCallback(async (userText, isGreeting = false, currentMsgs) => {
    setIsStreaming(true)
    setStreamingContent('')
    setPendingButtons([])

    let accumulated = ''
    let accButtons  = []
    let replaced    = false

    // Build conversation history from whatever messages exist at call time
    const history = (currentMsgs || [])
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
          accumulated += token
          setStreamingContent(accumulated)
        },
        onActions: buttons => {
          accButtons = buttons
          setPendingButtons(buttons)
        },
        onReplace: content => {
          replaced = true
          setStreamingContent('')
          setMessages(prev => [...prev, { id: genId(), role: 'assistant', content, buttons: [] }])
        },
        onDone: () => {
          if (!replaced && accumulated) {
            setMessages(prev => [...prev, {
              id:      genId(),
              role:    'assistant',
              content: accumulated,
              buttons: accButtons,
            }])
          }
          setStreamingContent('')
          setPendingButtons([])
          setIsStreaming(false)
        },
        onError: msg => {
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

  // Fire greeting on mount
  useEffect(() => {
    // React Strict Mode can invoke mount effects twice in development.
    // Keep a tiny dedupe window so only one greeting request is sent.
    const now = Date.now()
    const lastTsRaw = window.sessionStorage.getItem(GREETING_DEDUPE_KEY)
    const lastTs = lastTsRaw ? Number(lastTsRaw) : 0
    if (lastTs && now - lastTs < GREETING_DEDUPE_WINDOW_MS) return
    window.sessionStorage.setItem(GREETING_DEDUPE_KEY, String(now))

    sendMessage('', true, [])
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // ── User actions ──────────────────────────────────────────────────────── //

  const handleSend = () => {
    const text = input.trim()
    if (!text || isStreaming) return
    const userMsg = { id: genId(), role: 'user', content: text }
    setMessages(prev => {
      const next = [...prev, userMsg]
      sendMessage(text, false, next)
      return next
    })
    setInput('')
  }

  const handleKeyDown = e => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const handlePreviousWork = () => {
    if (isStreaming) return
    const text   = 'What was I working on?'
    const userMsg = { id: genId(), role: 'user', content: text }
    setMessages(prev => {
      const next = [...prev, userMsg]
      sendMessage(text, false, next)
      return next
    })
  }

  // Quick actions disappear once the user has sent at least one message
  const hasUserMessages = messages.some(m => m.role === 'user')

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

      {/* ── Messages area ─────────────────────────────────────────────── */}
      <div
        style={{
          flex:          1,
          overflowY:     'auto',
          padding:       '1.5rem 1rem 0.5rem',
          display:       'flex',
          flexDirection: 'column',
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
          {/* Persisted messages */}
          {messages.map(msg => (
            <motion.div
              key={msg.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0, transition: { duration: 0.38, ease: [0.4, 0, 0.2, 1] } }}
            >
              {msg.role === 'assistant'
                ? <AiBubble content={msg.content} buttons={msg.buttons} navigate={navigate} />
                : <UserBubble content={msg.content} />
              }
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
                  ? <AiBubble content={streamingContent} buttons={pendingButtons} navigate={navigate} />
                  : <PulseDot />
                }
              </motion.div>
            )}
          </AnimatePresence>

          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* ── Quick actions (visible before first user message) ─────────── */}
      <AnimatePresence>
        {!hasUserMessages && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0, transition: { duration: 0.4, delay: 0.25 } }}
            exit={{ opacity: 0, y: 10, transition: { duration: 0.25 } }}
            style={{ padding: '0.75rem 1rem 0' }}
          >
            <div
              style={{
                maxWidth:      640,
                margin:        '0 auto',
                display:       'flex',
                flexDirection: 'column',
                gap:           '0.6rem',
              }}
            >
              {/* Quick action pills */}
              <div
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

                    {/* Hover tooltip */}
                    <AnimatePresence>
                      {hoveredAction === action.route && (
                        <motion.div
                          initial={{ opacity: 0, y: 4 }}
                          animate={{ opacity: 1, y: 0, transition: { duration: 0.18 } }}
                          exit={{ opacity: 0, transition: { duration: 0.12 } }}
                          style={{
                            position:   'absolute',
                            top:        'calc(100% + 7px)',
                            left:       '50%',
                            transform:  'translateX(-50%)',
                            background: 'var(--surface)',
                            border:     '1px solid var(--border)',
                            borderRadius: 8,
                            padding:    '0.4rem 0.8rem',
                            fontSize:   '0.8rem',
                            color:      'var(--text-secondary)',
                            whiteSpace: 'nowrap',
                            zIndex:     20,
                            boxShadow:  '0 4px 16px rgba(0,0,0,0.08)',
                            pointerEvents: 'none',
                          }}
                        >
                          {action.hint}
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                ))}
              </div>

              {/* "What was I working on?" lilac link */}
              <div style={{ textAlign: 'center' }}>
                <button
                  onClick={handlePreviousWork}
                  disabled={isStreaming}
                  style={{
                    background: 'none',
                    border:     'none',
                    cursor:     isStreaming ? 'default' : 'pointer',
                    color:      'var(--color-paused, #9B8FC4)',
                    fontSize:   '0.85rem',
                    padding:    '0.25rem 0.5rem',
                    opacity:    isStreaming ? 0.45 : 0.8,
                    transition: 'opacity 0.25s ease',
                  }}
                  onMouseEnter={e => { if (!isStreaming) e.currentTarget.style.opacity = '1' }}
                  onMouseLeave={e => { e.currentTarget.style.opacity = isStreaming ? '0.45' : '0.8' }}
                >
                  What was I working on? →
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Input area ───────────────────────────────────────────────────── */}
      <div style={{ padding: '0.75rem 1rem 1.25rem', flexShrink: 0 }}>
        <div
          style={{
            maxWidth:    640,
            margin:      '0 auto',
            display:     'flex',
            gap:         '0.75rem',
            alignItems:  'flex-end',
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
            style={{
              flex:       1,
              resize:     'none',
              borderRadius: 12,
              opacity:    isStreaming ? 0.55 : 1,
              transition: 'opacity 0.25s ease',
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
