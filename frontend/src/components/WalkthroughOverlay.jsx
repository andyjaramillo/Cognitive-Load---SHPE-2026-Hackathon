/**
 * WalkthroughOverlay — post-onboarding feature tour
 *
 * Navigates to each page so the user sees the real UI in context.
 * pageStep = true  → light 20% dim, no blur, page fully visible, card anchored to bottom
 * pageStep = false → heavier dim + blur, card centered (welcome / done)
 * Spotlight steps  → box-shadow technique to highlight a specific DOM element
 */

import { useState, useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { useDispatch, useSelector } from 'react-redux'
import { prefsActions } from '../store'
import { savePreferences } from '../utils/api'

function hexToRgb(hex) {
  const h = hex.trim().replace('#', '')
  const r = parseInt(h.slice(0, 2), 16)
  const g = parseInt(h.slice(2, 4), 16)
  const b = parseInt(h.slice(4, 6), 16)
  return `${r},${g},${b}`
}

// ── Step definitions ────────────────────────────────────────────────────── //

const STEPS = [
  {
    id:       'welcome',
    route:    '/',
    selector: null,
    pageStep: false,
    heading:  'Welcome to Pebble.',
    bullets:  [
      'Your calm place to get things done.',
      "Tell me what's on your mind and I'll help you figure it out.",
      "Here's a quick look at how everything works.",
    ],
    padding:  0,
  },
  {
    id:       'home',
    route:    '/',
    selector: '[data-walkthrough="chat-input"]',
    pageStep: false,
    heading:  'Home',
    bullets:  [
      'This is where you talk to me.',
      'Ask anything, share what feels overwhelming, or just start typing.',
      'I remember what we talk about between sessions.',
    ],
    padding:  12,
  },
  {
    id:       'documents',
    route:    '/documents',
    selector: null,
    pageStep: true,
    heading:  'Documents',
    bullets:  [
      'Paste text or upload any file — PDFs, Word docs, images, screenshots, plain text.',
      'I can pull out key points, explain confusing parts, or turn it into tasks.',
    ],
    padding:  0,
  },
  {
    id:       'tasks',
    route:    '/tasks',
    selector: null,
    pageStep: true,
    heading:  'Tasks',
    bullets:  [
      'Tell me a goal and I will break it into small, doable steps.',
      'Set time estimates and move through things at your own pace.',
      'Groups keep related tasks together without the overwhelm.',
    ],
    padding:  0,
  },
  {
    id:       'focus',
    route:    '/focus',
    selector: null,
    pageStep: true,
    heading:  'Focus',
    bullets:  [
      'A full-screen timer that clears everything else away.',
      'Just you and one task. No distractions.',
      "If it gets to be too much, there's always a way out.",
    ],
    padding:  0,
  },
  {
    id:       'settings',
    route:    '/settings',
    selector: null,
    pageStep: true,
    heading:  'Settings',
    bullets:  [
      'Adjust fonts, themes, and how I communicate with you.',
      'Everything you chose during setup can be changed here anytime.',
    ],
    padding:  0,
  },
  {
    id:       'done',
    route:    '/',
    selector: null,
    pageStep: false,
    heading:  "That's everything.",
    bullets:  [
      "I'm here whenever you need me.",
      "Start by telling me what's on your mind.",
    ],
    padding:  0,
  },
]

const TOTAL = STEPS.length

// ── Spotlight glow animation — built dynamically in component ────────────── //

function buildGlowKeyframes(rgb) {
  return {
    boxShadow: [
      `0 0 0 4px rgba(${rgb},0.22), 0 0 0 8px rgba(${rgb},0.08), 0 0 0 9999px rgba(0,0,0,0.52)`,
      `0 0 0 6px rgba(${rgb},0.16), 0 0 0 14px rgba(${rgb},0.05), 0 0 0 9999px rgba(0,0,0,0.52)`,
      `0 0 0 4px rgba(${rgb},0.22), 0 0 0 8px rgba(${rgb},0.08), 0 0 0 9999px rgba(0,0,0,0.52)`,
    ],
  }
}

// Per-property transitions — opacity must NOT inherit repeat:Infinity
const GLOW_TRANSITION = {
  opacity:   { duration: 0.35 },
  boxShadow: { duration: 2.2, repeat: Infinity, ease: 'easeInOut' },
}

// ── Component ────────────────────────────────────────────────────────────── //

export default function WalkthroughOverlay() {
  const dispatch     = useDispatch()
  const navigate     = useNavigate()
  const pebbleColor  = useSelector(s => s.prefs.pebbleColor)
  const [step,    setStep]    = useState(() => {
    try { return Math.min(parseInt(sessionStorage.getItem('pebble_wt_step') || '0', 10), TOTAL - 1) } catch { return 0 }
  })
  const [rect,    setRect]    = useState(null)
  const [visible, setVisible] = useState(true)

  // Build glow keyframes from the live CSS variable so it follows pebble color.
  // Reading pebbleColor from Redux ensures we re-render (and recompute) when it changes.
  const glowKeyframes = buildGlowKeyframes(
    hexToRgb(getComputedStyle(document.documentElement).getPropertyValue('--color-pebble').trim() || '#5A8A80')
  )
  void pebbleColor // consumed above via getComputedStyle — keeps lint happy

  const current  = STEPS[step]
  const isFirst  = step === 0
  const isLast   = step === TOTAL - 1

  // Navigate to the page for each step
  useEffect(() => {
    if (current.route) navigate(current.route)
  }, [step]) // eslint-disable-line react-hooks/exhaustive-deps

  // Measure spotlight target — double-rAF so the page has rendered before measuring
  useEffect(() => {
    if (!current.selector) { setRect(null); return }

    let raf
    function measure() {
      const el = document.querySelector(current.selector)
      if (!el) { setRect(null); return }
      const r = el.getBoundingClientRect()
      setRect({ top: r.top, left: r.left, width: r.width, height: r.height })
    }

    raf = requestAnimationFrame(() => requestAnimationFrame(measure))
    window.addEventListener('resize', measure)
    window.addEventListener('scroll', measure, true)
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', measure)
      window.removeEventListener('scroll', measure, true)
    }
  }, [step, current.selector])

  const finish = useCallback(async () => {
    setVisible(false)
    navigate('/')
    try { sessionStorage.removeItem('pebble_wt_step') } catch {}
    try { localStorage.setItem('pebble_walkthrough_complete', 'true') } catch {}
    try { await savePreferences({ walkthrough_complete: true }) } catch {}
    dispatch(prefsActions.setPrefs({ walkthroughComplete: true }))
  }, [dispatch, navigate])

  const goStep = (n) => {
    try { sessionStorage.setItem('pebble_wt_step', String(n)) } catch {}
    setStep(n)
  }
  const goNext = () => { if (isLast) { finish(); return } ; goStep(step + 1) }
  const goBack = () => { if (!isFirst) goStep(step - 1) }

  // Card position for spotlight steps
  function spotlightCardStyle() {
    const pad        = current.padding || 0
    const CARD_W     = Math.min(380, window.innerWidth * 0.92)
    const CARD_H     = 240
    const GAP        = 56
    const spaceBelow = window.innerHeight - rect.top - rect.height - pad
    const showAbove  = spaceBelow < CARD_H + GAP
    const centerX    = rect.left + rect.width / 2
    const left       = Math.min(Math.max(centerX - CARD_W / 2, 12), window.innerWidth - CARD_W - 12)

    return {
      position: 'fixed',
      left,
      top: showAbove ? rect.top - CARD_H - GAP - pad : rect.top + rect.height + GAP + pad,
      width: CARD_W,
      zIndex: 502,
    }
  }

  const CARD_BASE = {
    background:    'var(--bg-primary)',
    border:        '1px solid color-mix(in srgb, var(--color-pebble) 22%, transparent)',
    borderRadius:  16,
    padding:       '1.3rem 1.4rem 1.1rem',
    boxShadow:     '0 24px 64px rgba(0,0,0,0.22), 0 0 0 1px color-mix(in srgb, var(--color-pebble) 12%, transparent)',
    pointerEvents: 'auto',
  }

  // ── Shared card interior ─────────────────────────────────────────────── //
  const cardInner = (
    <>
      {/* DM Serif heading */}
      <h3 style={{
        fontFamily: '"DM Serif Display", Georgia, serif',
        fontWeight: 400, fontSize: '1.15rem',
        color: 'var(--text-primary)', margin: '0 0 0.8rem', lineHeight: 1.3,
      }}>
        {current.heading}
      </h3>

      {/* Bullets */}
      <ul style={{ margin: `0 0 ${current.id === 'settings' ? '0.75rem' : '1.1rem'}`, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
        {current.bullets.map((b, i) => (
          <li key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: '0.55rem' }}>
            <span style={{
              display: 'block', width: 5, height: 5, borderRadius: '50%',
              background: 'var(--color-pebble)', flexShrink: 0, marginTop: '0.48rem', opacity: 0.5,
            }} />
            <span style={{ fontSize: '0.875rem', lineHeight: 1.65, color: 'var(--text-primary)', opacity: 0.85 }}>
              {b}
            </span>
          </li>
        ))}
      </ul>

      {/* Settings step: restart tour button */}
      {current.id === 'settings' && (
        <button
          onClick={() => goStep(0)}
          style={{
            width: '100%', marginBottom: '0.85rem',
            padding: '0.6rem 1rem', borderRadius: 10,
            border: '1px solid color-mix(in srgb, var(--color-pebble) 30%, transparent)',
            background: 'color-mix(in srgb, var(--color-pebble) 8%, transparent)',
            color: 'var(--color-pebble)', fontSize: '0.83rem', cursor: 'pointer',
            display: 'flex', alignItems: 'center', gap: '0.5rem',
            transition: 'background 0.18s ease',
          }}
          onMouseEnter={e => { e.currentTarget.style.background = 'color-mix(in srgb, var(--color-pebble) 15%, transparent)' }}
          onMouseLeave={e => { e.currentTarget.style.background = 'color-mix(in srgb, var(--color-pebble) 8%, transparent)' }}
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M4 12a8 8 0 0 1 14-5.29" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
            <path d="M20 12a8 8 0 0 1-14 5.29" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
            <path d="M17 6l1-3 3 2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            <path d="M7 18l-1 3-3-2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          take the tour again from the start
        </button>
      )}

      {/* Nav row: Back + Next | progress pills + skip */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem' }}>
        <div style={{ display: 'flex', gap: '0.4rem' }}>
          {!isFirst && (
            <button className="btn btn-ghost" onClick={goBack}
              style={{ fontSize: '0.82rem', padding: '0.38rem 0.85rem' }}>
              back
            </button>
          )}
          <button className="btn btn-primary" onClick={goNext}
            style={{ fontSize: '0.82rem', padding: '0.38rem 1.1rem' }}>
            {isLast ? "let's go" : 'next'}
          </button>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <div style={{ display: 'flex', gap: 4 }}>
            {STEPS.map((_, i) => (
              <div key={i} style={{
                width: i === step ? 16 : 5, height: 5, borderRadius: 3,
                background: i === step ? 'var(--color-pebble)' : 'var(--border)',
                transition: 'all 0.35s ease',
              }} />
            ))}
          </div>
          {!isLast && (
            <button onClick={finish} style={{
              background: 'none', border: 'none', cursor: 'pointer',
              fontSize: '0.76rem', color: 'var(--text-muted)',
              padding: '0.2rem 0.3rem', opacity: 0.65, transition: 'opacity 0.2s ease', whiteSpace: 'nowrap',
            }}
              onMouseEnter={e => { e.currentTarget.style.opacity = '1' }}
              onMouseLeave={e => { e.currentTarget.style.opacity = '0.65' }}
              aria-label="Skip tour"
            >
              skip tour
            </button>
          )}
        </div>
      </div>
    </>
  )

  // ── Overlay ──────────────────────────────────────────────────────────── //
  const overlay = (
    <AnimatePresence>
      {visible && (
        <motion.div
          key="walkthrough-root"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1, transition: { duration: 0.55, delay: step === 0 ? 0.9 : 0 } }}
          exit={{ opacity: 0, transition: { duration: 0.35 } }}
          style={{ position: 'fixed', inset: 0, zIndex: 499, pointerEvents: 'none', overflow: 'visible' }}
        >

          {/* ── Overlay layer ───────────────────────────────────────────── */}
          <AnimatePresence mode="wait">
            {rect ? (
              /* Spotlight: box-shadow darkens everything except the element */
              <motion.div
                key={`spot-${step}`}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1, ...glowKeyframes }}
                transition={GLOW_TRANSITION}
                exit={{ opacity: 0, transition: { duration: 0.3 } }}
                style={{
                  position: 'fixed',
                  top:    rect.top  - current.padding,
                  left:   rect.left - current.padding,
                  width:  rect.width  + current.padding * 2,
                  height: rect.height + current.padding * 2,
                  borderRadius: 10, pointerEvents: 'none', zIndex: 500,
                }}
              />
            ) : current.pageStep ? (
              /* Page tour: very light tint — page stays fully visible */
              <motion.div
                key={`pagedim-${step}`}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1, transition: { duration: 0.5 } }}
                exit={{ opacity: 0, transition: { duration: 0.3 } }}
                style={{
                  position: 'fixed', inset: 0,
                  background: 'rgba(0,0,0,0.18)',
                  pointerEvents: 'none', zIndex: 500,
                }}
              />
            ) : (
              /* Modal: heavier dim + blur for welcome / done */
              <motion.div
                key={`dim-${step}`}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1, transition: { duration: 0.5 } }}
                exit={{ opacity: 0, transition: { duration: 0.3 } }}
                style={{
                  position: 'fixed', inset: 0,
                  background: 'rgba(0,0,0,0.48)',
                  backdropFilter: 'blur(4px)',
                  WebkitBackdropFilter: 'blur(4px)',
                  pointerEvents: 'none', zIndex: 500,
                }}
              />
            )}
          </AnimatePresence>

          {/* ── Card ────────────────────────────────────────────────────── */}
          <AnimatePresence mode="wait">
            {rect ? (
              /* Spotlight card — positioned near the highlighted element */
              <motion.div
                key={`card-${step}`}
                initial={{ opacity: 0, y: 14, scale: 0.96 }}
                animate={{ opacity: 1, y: 0, scale: 1, transition: { duration: 0.52, ease: [0.25, 0, 0.15, 1] } }}
                exit={{ opacity: 0, y: -10, scale: 0.96, transition: { duration: 0.34, ease: 'easeIn' } }}
                style={{ ...spotlightCardStyle(), ...CARD_BASE }}
              >
                {cardInner}
              </motion.div>
            ) : current.pageStep ? (
              /* Page tour card — same centered layout as welcome/done, light overlay shows the page */
              <motion.div
                key={`card-${step}`}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1, transition: { duration: 0.52, ease: [0.25, 0, 0.15, 1] } }}
                exit={{ opacity: 0, transition: { duration: 0.34 } }}
                style={{
                  position: 'fixed', inset: 0,
                  display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
                  padding: '0 20px 52px',
                  zIndex: 502, pointerEvents: 'none',
                }}
              >
                <motion.div
                  initial={{ y: 20, scale: 0.97 }}
                  animate={{ y: 0, scale: 1, transition: { duration: 0.55, ease: [0.25, 0, 0.15, 1] } }}
                  exit={{ y: -14, scale: 0.97, transition: { duration: 0.34, ease: 'easeIn' } }}
                  style={{ width: 'min(420px, 92vw)', ...CARD_BASE }}
                >
                  {cardInner}
                </motion.div>
              </motion.div>
            ) : (
              /* Modal card — centered, heavier overlay behind it */
              <motion.div
                key={`card-${step}`}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1, transition: { duration: 0.52, ease: [0.25, 0, 0.15, 1] } }}
                exit={{ opacity: 0, transition: { duration: 0.34 } }}
                style={{
                  position: 'fixed', inset: 0,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  zIndex: 502, pointerEvents: 'none',
                }}
              >
                <motion.div
                  initial={{ y: 20, scale: 0.97 }}
                  animate={{ y: 0, scale: 1, transition: { duration: 0.55, ease: [0.25, 0, 0.15, 1] } }}
                  exit={{ y: -14, scale: 0.97, transition: { duration: 0.34, ease: 'easeIn' } }}
                  style={{ width: 'min(400px, 92vw)', ...CARD_BASE }}
                >
                  {cardInner}
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>

        </motion.div>
      )}
    </AnimatePresence>
  )

  return createPortal(overlay, document.body)
}
