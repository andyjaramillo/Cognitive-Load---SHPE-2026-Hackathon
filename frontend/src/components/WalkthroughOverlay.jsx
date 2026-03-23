/**
 * WalkthroughOverlay — 8-step post-onboarding feature tour
 *
 * Spotlight technique: transparent fixed div over target, enormous box-shadow
 * dims everything else. Pebble glow ring layered in the same box-shadow.
 * Card renders heading (DM Serif Display) + bullet list, never paragraphs.
 * No em dashes. Sentence case throughout.
 */

import { useState, useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { useDispatch } from 'react-redux'
import { prefsActions } from '../store'
import { savePreferences } from '../utils/api'

// ── Step definitions ────────────────────────────────────────────────────── //

const STEPS = [
  {
    id:       'welcome',
    selector: null,
    heading:  'Welcome to Pebble.',
    bullets:  [
      'Your calm place to get things done.',
      'Tell me what you need and I will help you figure it out.',
      'Here is a quick look at how everything works.',
    ],
    padding:  0,
  },
  {
    id:       'nav',
    selector: 'nav[aria-label="Pages"]',
    heading:  'Your four tabs',
    bullets:  [
      'Home, Documents, Tasks, and Focus are always up here.',
      'Each one is a different way I can help you.',
      'You can switch between them anytime.',
    ],
    padding:  8,
  },
  {
    id:       'home',
    selector: '[data-walkthrough="chat-input"]',
    heading:  'Home',
    bullets:  [
      'This is where you talk to me.',
      'Ask anything, share something overwhelming, or just start typing.',
      'I remember what we talk about between sessions.',
    ],
    padding:  12,
  },
  {
    id:       'documents',
    selector: '[data-nav="documents"]',
    heading:  'Documents',
    bullets:  [
      'Paste text or upload a file and I will make sense of it.',
      'I can pull out key points, explain confusing parts, or turn it into tasks.',
    ],
    padding:  8,
  },
  {
    id:       'tasks',
    selector: '[data-nav="tasks"]',
    heading:  'Tasks',
    bullets:  [
      'Tell me a goal and I will break it into small, doable steps.',
      'You can set time estimates and work through things at your own pace.',
    ],
    padding:  8,
  },
  {
    id:       'focus',
    selector: '[data-nav="focus"]',
    heading:  'Focus',
    bullets:  [
      'A full-screen timer that clears everything away.',
      'Just you and one task. No distractions.',
      "If it gets to be too much, there's always a way out.",
    ],
    padding:  8,
  },
  {
    id:       'settings',
    selector: '[data-walkthrough="settings"]',
    heading:  'Settings',
    bullets:  [
      'Adjust fonts, themes, and how I communicate with you.',
      'Everything you set during setup can be changed here anytime.',
    ],
    padding:  10,
  },
  {
    id:       'done',
    selector: null,
    heading:  "That's everything.",
    bullets:  [
      "I'm here whenever you need me.",
      'Start by telling me what is on your mind.',
    ],
    padding:  0,
  },
]

const TOTAL = STEPS.length

// ── Spotlight glow animation ─────────────────────────────────────────────── //

const glowAnimation = {
  boxShadow: [
    '0 0 0 4px rgba(90,138,128,0.22), 0 0 0 8px rgba(90,138,128,0.08), 0 0 0 9999px rgba(0,0,0,0.30)',
    '0 0 0 6px rgba(90,138,128,0.16), 0 0 0 14px rgba(90,138,128,0.05), 0 0 0 9999px rgba(0,0,0,0.30)',
    '0 0 0 4px rgba(90,138,128,0.22), 0 0 0 8px rgba(90,138,128,0.08), 0 0 0 9999px rgba(0,0,0,0.30)',
  ],
  transition: { duration: 2.2, repeat: Infinity, ease: 'easeInOut' },
}

// ── Component ────────────────────────────────────────────────────────────── //

export default function WalkthroughOverlay({ onComplete }) {
  const dispatch = useDispatch()
  const [step,    setStep]    = useState(0)   // 0-indexed
  const [rect,    setRect]    = useState(null)
  const [visible, setVisible] = useState(true)

  const current  = STEPS[step]
  const isFirst  = step === 0
  const isLast   = step === TOTAL - 1

  // Measure spotlight target
  useEffect(() => {
    if (!current.selector) { setRect(null); return }

    function measure() {
      const el = document.querySelector(current.selector)
      if (!el) { setRect(null); return }
      const r = el.getBoundingClientRect()
      setRect({ top: r.top, left: r.left, width: r.width, height: r.height })
    }

    measure()
    window.addEventListener('resize', measure)
    window.addEventListener('scroll', measure, true)
    return () => {
      window.removeEventListener('resize', measure)
      window.removeEventListener('scroll', measure, true)
    }
  }, [step, current.selector])

  const finish = useCallback(async () => {
    setVisible(false)
    try { localStorage.setItem('pebble_walkthrough_complete', 'true') } catch {}
    try { await savePreferences({ walkthrough_complete: true }) } catch {}
    dispatch(prefsActions.setPrefs({ walkthroughComplete: true }))
    setTimeout(onComplete, 300)
  }, [dispatch, onComplete])

  const goNext = () => {
    if (isLast) { finish(); return }
    setStep(s => s + 1)
  }
  const goBack = () => setStep(s => Math.max(s - 1, 0))

  // Card positioning: below target, or above if near bottom, or centered if no target
  function cardStyle() {
    if (!rect) {
      return {
        position:  'fixed',
        bottom:    '12vh',
        left:      '50%',
        transform: 'translateX(-50%)',
        width:     'min(380px, 92vw)',
        zIndex:    502,
      }
    }

    const pad        = current.padding || 0
    const CARD_H     = 200
    const spaceBelow = window.innerHeight - rect.top - rect.height - pad
    const showAbove  = spaceBelow < CARD_H + 28

    const left = Math.min(
      Math.max(rect.left, 12),
      window.innerWidth - 392
    )

    return {
      position: 'fixed',
      left,
      top: showAbove
        ? rect.top - CARD_H - 18 - pad
        : rect.top + rect.height + 18 + pad,
      width:  'min(380px, 92vw)',
      zIndex: 502,
    }
  }

  const overlay = (
    <AnimatePresence>
      {visible && (
        <motion.div
          key="walkthrough-root"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1, transition: { duration: 0.3 } }}
          exit={{ opacity: 0, transition: { duration: 0.25 } }}
          style={{ position: 'fixed', inset: 0, zIndex: 499, pointerEvents: 'none' }}
        >
          {/* ── Spotlight or soft dim ─────────────────────────────────────── */}
          <AnimatePresence mode="wait">
            {rect ? (
              <motion.div
                key={`spot-${step}`}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1, ...glowAnimation }}
                exit={{ opacity: 0, transition: { duration: 0.2 } }}
                style={{
                  position:      'fixed',
                  top:           rect.top    - current.padding,
                  left:          rect.left   - current.padding,
                  width:         rect.width  + current.padding * 2,
                  height:        rect.height + current.padding * 2,
                  borderRadius:  10,
                  pointerEvents: 'none',
                  zIndex:        500,
                }}
              />
            ) : (
              <motion.div
                key={`dim-${step}`}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                style={{
                  position:      'fixed',
                  inset:         0,
                  background:    'rgba(0,0,0,0.18)',
                  pointerEvents: 'none',
                  zIndex:        500,
                }}
              />
            )}
          </AnimatePresence>

          {/* ── Tooltip card ─────────────────────────────────────────────── */}
          <AnimatePresence mode="wait">
            <motion.div
              key={`card-${step}`}
              initial={{ opacity: 0, y: 10, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1, transition: { duration: 0.28, ease: [0.4, 0, 0.2, 1] } }}
              exit={{ opacity: 0, y: -6, scale: 0.97, transition: { duration: 0.18 } }}
              style={{
                ...cardStyle(),
                background:    'var(--bg-card)',
                border:        '1px solid color-mix(in srgb, var(--color-pebble) 22%, transparent)',
                borderRadius:  14,
                padding:       '1.2rem 1.3rem 1rem',
                boxShadow:     '0 8px 32px rgba(0,0,0,0.14), 0 0 0 1px color-mix(in srgb, var(--color-pebble) 10%, transparent)',
                pointerEvents: 'auto',
              }}
            >
              {/* Heading */}
              <h3 style={{
                fontFamily:  '"DM Serif Display", Georgia, serif',
                fontWeight:  400,
                fontSize:    '1.15rem',
                color:       'var(--text-primary)',
                margin:      '0 0 0.7rem',
                lineHeight:  1.3,
              }}>
                {current.heading}
              </h3>

              {/* Bullet list */}
              <ul style={{ margin: '0 0 1rem', padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '0.45rem' }}>
                {current.bullets.map((b, i) => (
                  <li key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: '0.55rem' }}>
                    <span style={{
                      display:    'block',
                      width:      6,
                      height:     6,
                      borderRadius: '50%',
                      background: 'var(--color-pebble)',
                      flexShrink: 0,
                      marginTop:  '0.42rem',
                      opacity:    0.7,
                    }} />
                    <span style={{ fontSize: '0.88rem', lineHeight: 1.6, color: 'var(--text-secondary)' }}>
                      {b}
                    </span>
                  </li>
                ))}
              </ul>

              {/* Navigation row */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem' }}>
                {/* Back + Next */}
                <div style={{ display: 'flex', gap: '0.4rem' }}>
                  {!isFirst && (
                    <button
                      className="btn btn-ghost"
                      onClick={goBack}
                      style={{ fontSize: '0.82rem', padding: '0.38rem 0.85rem' }}
                    >
                      Back
                    </button>
                  )}
                  <button
                    className="btn btn-primary"
                    onClick={goNext}
                    style={{ fontSize: '0.82rem', padding: '0.38rem 1rem' }}
                  >
                    {isLast ? "Let's go" : 'Next'}
                  </button>
                </div>

                {/* Progress pills + skip */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.7rem' }}>
                  <div style={{ display: 'flex', gap: 4 }}>
                    {STEPS.map((_, i) => (
                      <div
                        key={i}
                        style={{
                          width:        i === step ? 14 : 5,
                          height:       5,
                          borderRadius: 3,
                          background:   i === step ? 'var(--color-pebble)' : 'var(--border)',
                          transition:   'all 0.3s ease',
                        }}
                      />
                    ))}
                  </div>
                  {!isLast && (
                    <button
                      onClick={finish}
                      style={{
                        background:  'none',
                        border:      'none',
                        cursor:      'pointer',
                        fontSize:    '0.76rem',
                        color:       'var(--text-muted)',
                        padding:     '0.2rem 0.3rem',
                        opacity:     0.7,
                        transition:  'opacity 0.2s ease',
                        whiteSpace:  'nowrap',
                      }}
                      onMouseEnter={e => { e.currentTarget.style.opacity = '1' }}
                      onMouseLeave={e => { e.currentTarget.style.opacity = '0.7' }}
                      aria-label="Skip tour"
                    >
                      Skip tour
                    </button>
                  )}
                </div>
              </div>
            </motion.div>
          </AnimatePresence>
        </motion.div>
      )}
    </AnimatePresence>
  )

  return createPortal(overlay, document.body)
}
