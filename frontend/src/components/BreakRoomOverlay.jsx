import { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence } from 'framer-motion'

const BREAK_TIPS = [
  "try 4-7-8 breathing: in for 4, hold for 7, out for 8.",
  "notice 5 things you can see right now.",
  "let your shoulders drop away from your ears.",
  "you don't have to solve anything right now.",
  "one breath at a time. that's all.",
]

function pickRandom(arr) {
  return arr[Math.floor(Math.random() * arr.length)]
}

function BreathingCircle() {
  const [phase, setPhase] = useState('in') // 'in' | 'hold' | 'out'
  const phaseRef = useRef('in')
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches

  useEffect(() => {
    if (reducedMotion) return
    const durations = { in: 4000, hold: 2000, out: 4000 }
    let timeout
    function advance() {
      const next =
        phaseRef.current === 'in' ? 'hold'
        : phaseRef.current === 'hold' ? 'out'
        : 'in'
      phaseRef.current = next
      setPhase(next)
      timeout = setTimeout(advance, durations[next])
    }
    timeout = setTimeout(advance, durations['in'])
    return () => clearTimeout(timeout)
  }, [reducedMotion])

  const scale     = phase === 'in' ? 1.15 : phase === 'hold' ? 1.15 : 0.85
  const ringScale = phase === 'in' ? 1.20 : phase === 'hold' ? 1.20 : 1.00
  const label     = phase === 'in' ? 'breathe in' : phase === 'hold' ? 'hold' : 'breathe out'

  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      position: 'relative', width: 220, height: 220,
    }}>
      {/* Ghost ring — uses pebble identity color */}
      {!reducedMotion && (
        <motion.div
          animate={{ scale: ringScale, opacity: phase === 'hold' ? 0.18 : 0.1 }}
          transition={{ duration: phase === 'hold' ? 0.1 : 4, ease: 'easeInOut' }}
          style={{
            position: 'absolute',
            width: 200, height: 200,
            borderRadius: '50%',
            border: '1px solid var(--color-pebble)',
            opacity: 0.18,
          }}
        />
      )}
      {/* Main circle — uses pebble identity color */}
      <motion.div
        animate={reducedMotion ? {} : { scale }}
        transition={{ duration: phase === 'hold' ? 0.1 : 4, ease: 'easeInOut' }}
        style={{
          width: 160, height: 160,
          borderRadius: '50%',
          border: '2px solid color-mix(in srgb, var(--color-pebble) 40%, transparent)',
          background: 'radial-gradient(circle, color-mix(in srgb, var(--color-pebble) 12%, transparent) 0%, transparent 70%)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}
      >
        <AnimatePresence mode="wait">
          <motion.span
            key={phase}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1, transition: { duration: 0.5 } }}
            exit={{ opacity: 0, transition: { duration: 0.4 } }}
            style={{
              fontSize: 12,
              color: 'var(--text-secondary)',
              textAlign: 'center',
              padding: '0 16px',
              letterSpacing: '0.3px',
            }}
          >
            {label}
          </motion.span>
        </AnimatePresence>
      </motion.div>
    </div>
  )
}

export default function BreakRoomOverlay({ onClose }) {
  const [tip] = useState(() => pickRandom(BREAK_TIPS))

  // Close on Escape
  useEffect(() => {
    function handleKey(e) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [onClose])

  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches

  const overlayContent = (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.25, ease: 'easeOut' }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        // Stronger backdrop so card is clearly distinct from any page background
        background: 'rgba(0,0,0,0.72)',
        backdropFilter: 'blur(6px)',
        WebkitBackdropFilter: 'blur(6px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '1.5rem',
      }}
    >
      <motion.div
        initial={reducedMotion ? { opacity: 0 } : { opacity: 0, scale: 0.96 }}
        animate={reducedMotion ? { opacity: 1 } : { opacity: 1, scale: 1 }}
        exit={reducedMotion ? { opacity: 0 } : { opacity: 0, scale: 0.96 }}
        transition={{ duration: 0.35, ease: [0.4, 0, 0.2, 1] }}
        style={{
          maxWidth: 360,
          width: '100%',
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: 20,
          padding: '2.5rem 2rem',
          textAlign: 'center',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          boxShadow: '0 24px 64px rgba(0,0,0,0.28)',
        }}
      >
        {/* Heading — dot AFTER text, dot IS the period */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: '0.5rem' }}>
          <h2 style={{
            fontFamily: 'var(--font-display)',
            fontSize: '1.15rem',
            fontWeight: 400,
            color: 'var(--text-primary)',
            margin: 0,
          }}>
            taking a little break
          </h2>
          <span
            aria-hidden="true"
            style={{
              width: 8, height: 8,
              borderRadius: '50%',
              background: 'var(--color-pebble)',
              display: 'inline-block',
              flexShrink: 0,
              marginBottom: 1,
            }}
          />
        </div>

        <p style={{
          fontSize: '0.82rem',
          color: 'var(--text-secondary)',
          margin: '0 0 1.25rem',
        }}>
          no rush. just breathe.
        </p>

        <BreathingCircle />

        {/* Break tip */}
        <p style={{
          fontSize: '0.8rem',
          color: 'var(--text-secondary)',
          lineHeight: 1.65,
          maxWidth: 260,
          margin: '1.25rem 0 0',
          fontStyle: 'italic',
        }}>
          {tip}
        </p>


        {/* Back button */}
        <button
          onClick={onClose}
          className="btn btn-primary"
          style={{
            marginTop: '1.25rem',
            padding: '0.65rem 2rem',
            minHeight: 44,
            fontSize: '0.88rem',
            borderRadius: 10,
            display: 'block',
            margin: '1.25rem auto 0',
          }}
        >
          Back to what I was doing
        </button>
      </motion.div>
    </motion.div>
  )

  return createPortal(overlayContent, document.body)
}
