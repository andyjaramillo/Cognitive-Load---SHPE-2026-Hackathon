/**
 * WalkthroughOverlay — 5-step teal glow tour after first onboarding
 *
 * Technique: a transparent fixed div positioned over the target element
 * uses an enormous box-shadow to dim everything around it (the "spotlight" trick).
 * The teal glow ring is layered into the same box-shadow.
 */

import { useState, useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { useDispatch } from 'react-redux'
import { prefsActions } from '../store'
import { savePreferences } from '../utils/api'

// ── Step definitions ──────────────────────────────────────────────────── //

const STEPS = [
  {
    selector: '[data-walkthrough="chat-input"]',
    message:  'this is home. whenever you need anything — a question answered, a document simplified, a task broken down, or just someone to talk to — start here.',
    primary:  { label: 'got it',       action: 'done' },
    secondary:{ label: 'show me more', action: 'next' },
    padding:  12,
  },
  {
    selector: '[data-nav="documents"]',
    message:  "when something feels overwhelming — a long document, a confusing email, pages of text — bring it here. i'll break it down and pull out what matters.",
    primary:  { label: 'next', action: 'next' },
    secondary: null,
    padding:  8,
  },
  {
    selector: '[data-nav="tasks"]',
    message:  "tasks is where things get organized. tell me what you need to do and i'll help you break them into small, doable pieces.",
    primary:  { label: 'next', action: 'next' },
    secondary: null,
    padding:  8,
  },
  {
    selector: '[data-nav="focus"]',
    message:  "when you're ready to get things done, focus mode clears everything away. just you, one task, and a timer. if it gets to be too much, there's always an exit.",
    primary:  { label: 'next', action: 'next' },
    secondary: null,
    padding:  8,
  },
  {
    selector: null,
    message:  "that's everything. i'm here whenever you need me.",
    primary: { label: "let's begin", action: 'done' },
    secondary: null,
    padding:  0,
  },
]

// ── Spotlight ring — animated via Framer Motion keyframes ─────────────── //

const GLOW_KEYFRAMES = {
  animate: {
    boxShadow: [
      '0 0 0 4px rgba(90,138,128,0.25), 0 0 0 8px rgba(90,138,128,0.10), 0 0 0 9999px rgba(0,0,0,0.22)',
      '0 0 0 6px rgba(90,138,128,0.18), 0 0 0 12px rgba(90,138,128,0.06), 0 0 0 9999px rgba(0,0,0,0.22)',
      '0 0 0 4px rgba(90,138,128,0.25), 0 0 0 8px rgba(90,138,128,0.10), 0 0 0 9999px rgba(0,0,0,0.22)',
    ],
    transition: { duration: 2.1, repeat: Infinity, ease: 'easeInOut' },
  },
}

// Fallback dim when no target (step 5)
const DIM_ONLY = '0 0 0 9999px rgba(0,0,0,0.15)'

// ── WalkthroughOverlay ───────────────────────────────────────────────── //

export default function WalkthroughOverlay({ onComplete }) {
  const dispatch    = useDispatch()
  const [step,      setStep]    = useState(1)
  const [rect,      setRect]    = useState(null)
  const [visible,   setVisible] = useState(true)

  const content = STEPS[step - 1]

  // Measure target element, re-measure on resize
  useEffect(() => {
    if (!content.selector) { setRect(null); return }

    function measure() {
      const el = document.querySelector(content.selector)
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
  }, [step, content.selector])

  const finish = useCallback(async () => {
    setVisible(false)
    try { localStorage.setItem('pebble_walkthrough_complete', 'true') } catch {}
    try {
      await savePreferences({ walkthrough_complete: true })
    } catch { /* best effort */ }
    dispatch(prefsActions.setPrefs({ walkthroughComplete: true }))
    setTimeout(onComplete, 300)
  }, [dispatch, onComplete])

  const handleAction = useCallback((action) => {
    if (action === 'done')  { finish(); return }
    if (action === 'next')  { setStep(s => Math.min(s + 1, 5)); return }
  }, [finish])

  // Message card position: below target (or above if near bottom)
  function cardStyle() {
    const pad = content.padding || 0
    const CARD_HEIGHT = 160 // approximate

    if (!rect) {
      // No target — center bottom
      return {
        position: 'fixed',
        bottom:   '10vh',
        left:     '50%',
        transform:'translateX(-50%)',
        width:    'min(360px, 90vw)',
        zIndex:   502,
      }
    }

    const spaceBelow = window.innerHeight - rect.top - rect.height - pad
    const showAbove  = spaceBelow < CARD_HEIGHT + 24

    return {
      position: 'fixed',
      left:     Math.min(Math.max(rect.left, 12), window.innerWidth - 380),
      top:      showAbove
        ? rect.top - CARD_HEIGHT - 16 - pad
        : rect.top + rect.height + 16 + pad,
      width:    'min(360px, 90vw)',
      zIndex:   502,
    }
  }

  const overlay = (
    <AnimatePresence>
      {visible && (
        <motion.div
          key="walkthrough-root"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1, transition: { duration: 0.35 } }}
          exit={{ opacity: 0, transition: { duration: 0.25 } }}
          style={{ position: 'fixed', inset: 0, zIndex: 499, pointerEvents: 'none' }}
        >
          {/* ── Spotlight mask (or plain dim when no target) ─────────────── */}
          {rect ? (
            <motion.div
              key={`spotlight-${step}`}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1, ...GLOW_KEYFRAMES.animate, transition: { opacity: { duration: 0.3 }, ...GLOW_KEYFRAMES.animate.transition } }}
              style={{
                position:     'fixed',
                top:          rect.top    - content.padding,
                left:         rect.left   - content.padding,
                width:        rect.width  + content.padding * 2,
                height:       rect.height + content.padding * 2,
                borderRadius: 10,
                pointerEvents:'none',
                zIndex:       500,
              }}
            />
          ) : (
            <motion.div
              key={`dim-${step}`}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              style={{
                position:    'fixed',
                inset:       0,
                background:  'rgba(0,0,0,0.15)',
                pointerEvents:'none',
                zIndex:      500,
              }}
            />
          )}

          {/* ── Message card ──────────────────────────────────────────────── */}
          <motion.div
            key={`card-${step}`}
            initial={{ opacity: 0, y: 8, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1, transition: { duration: 0.32, ease: [0.4, 0, 0.2, 1] } }}
            exit={{ opacity: 0, y: -4, transition: { duration: 0.2 } }}
            style={{
              ...cardStyle(),
              background:   'var(--bg-card)',
              border:       '1px solid rgba(90,138,128,0.25)',
              borderRadius: 14,
              padding:      '1.1rem 1.25rem 1rem',
              boxShadow:    '0 8px 32px rgba(0,0,0,0.12), 0 0 0 1px rgba(90,138,128,0.12)',
              pointerEvents:'auto',
            }}
          >
            {/* Pebble dot + message */}
            <div style={{ display: 'flex', gap: '0.6rem', alignItems: 'flex-start', marginBottom: '0.85rem' }}>
              <motion.div
                animate={{ scale: [0.85, 1.1, 0.85], opacity: [0.65, 1, 0.65] }}
                transition={{ duration: 2.8, repeat: Infinity, ease: 'easeInOut' }}
                style={{
                  width: 8, height: 8, borderRadius: '50%',
                  background: '#5A8A80', flexShrink: 0, marginTop: '0.32rem',
                }}
              />
              <p style={{
                margin: 0,
                fontSize: '0.9rem',
                lineHeight: 1.7,
                color: 'var(--text-primary)',
              }}>
                {content.message}
              </p>
            </div>

            {/* Action buttons */}
            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                {content.primary && (
                  <button
                    className="btn btn-primary"
                    onClick={() => handleAction(content.primary.action)}
                    style={{ fontSize: '0.82rem', padding: '0.38rem 0.9rem' }}
                  >
                    {content.primary.label}
                  </button>
                )}
                {content.secondary && (
                  <button
                    className="btn"
                    onClick={() => handleAction(content.secondary.action)}
                    style={{
                      fontSize: '0.82rem',
                      padding: '0.38rem 0.9rem',
                      background: 'var(--accent-soft)',
                      color: 'var(--color-active)',
                      border: '1px solid rgba(42,122,144,0.2)',
                    }}
                  >
                    {content.secondary.label}
                  </button>
                )}
              </div>

              {/* Step indicator + skip */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                {/* Progress dots */}
                <div style={{ display: 'flex', gap: 4 }}>
                  {STEPS.map((_, i) => (
                    <div
                      key={i}
                      style={{
                        width:        i + 1 === step ? 14 : 5,
                        height:       5,
                        borderRadius: 3,
                        background:   i + 1 === step ? '#5A8A80' : 'var(--border)',
                        transition:   'all 0.3s ease',
                      }}
                    />
                  ))}
                </div>

                <button
                  onClick={finish}
                  style={{
                    background: 'none',
                    border:     'none',
                    cursor:     'pointer',
                    fontSize:   '0.76rem',
                    color:      'var(--text-muted)',
                    padding:    '0.2rem 0.3rem',
                    opacity:    0.65,
                    transition: 'opacity 0.2s ease',
                    whiteSpace: 'nowrap',
                  }}
                  onMouseEnter={e => { e.currentTarget.style.opacity = '1' }}
                  onMouseLeave={e => { e.currentTarget.style.opacity = '0.65' }}
                  aria-label="Skip tour"
                >
                  skip tour
                </button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )

  return createPortal(overlay, document.body)
}
