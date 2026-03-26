import { useEffect, useRef, useState, useImperativeHandle, forwardRef } from 'react'
import { motion } from 'framer-motion'

const SIZE        = 170
const STROKE_BG   = 2
const STROKE_FG   = 3
const R           = (SIZE - STROKE_FG * 2) / 2
const CIRCUMFERENCE = 2 * Math.PI * R

// Ambient display: "~15m", "~5m", "+1m" etc.
function ambientLabel(remainingMs, overtime) {
  if (overtime) {
    const mins = Math.ceil(Math.abs(remainingMs) / 60000)
    return `+${mins}m`
  }
  const mins = Math.ceil(remainingMs / 60000)
  if (mins <= 0) return '~1m'
  return `~${mins}m`
}

// FocusTimer exposes: start(), pause(), resume(), reset(durationMinutes), forceComplete()
// Props: durationMinutes, paused, onOvertimeNudge (called once when overtime begins)
const FocusTimer = forwardRef(function FocusTimer({ durationMinutes = 25, onOvertimeNudge }, ref) {
  const totalMs     = durationMinutes * 60 * 1000
  const startTimeRef = useRef(null)   // Date.now() when started / last resumed
  const pausedMsRef  = useRef(0)      // accumulated elapsed ms before pauses
  const runningRef   = useRef(false)
  const overtimeRef  = useRef(false)
  const rafRef       = useRef(null)

  // Displayed state
  const [fraction,   setFraction]   = useState(1)      // 1 = full, 0 = depleted
  const [remainingMs, setRemainingMs] = useState(totalMs)
  const [overtime,   setOvertime]   = useState(false)
  const [fillComplete, setFillComplete] = useState(false) // completion animation flag

  function getElapsedMs() {
    if (!runningRef.current || startTimeRef.current === null) return pausedMsRef.current
    return pausedMsRef.current + (Date.now() - startTimeRef.current)
  }

  function tick() {
    const elapsed  = getElapsedMs()
    const remaining = totalMs - elapsed

    if (remaining <= 0) {
      setFraction(0)
      setRemainingMs(remaining) // negative = overtime amount
      if (!overtimeRef.current) {
        overtimeRef.current = true
        setOvertime(true)
        onOvertimeNudge?.()
      }
    } else {
      setFraction(remaining / totalMs)
      setRemainingMs(remaining)
    }

    if (runningRef.current) {
      rafRef.current = requestAnimationFrame(tick)
    }
  }

  useImperativeHandle(ref, () => ({
    start() {
      if (runningRef.current) return
      runningRef.current = true
      startTimeRef.current = Date.now()
      rafRef.current = requestAnimationFrame(tick)
    },
    pause() {
      if (!runningRef.current) return
      pausedMsRef.current = getElapsedMs()
      runningRef.current = false
      startTimeRef.current = null
      cancelAnimationFrame(rafRef.current)
    },
    resume() {
      if (runningRef.current) return
      runningRef.current = true
      startTimeRef.current = Date.now()
      rafRef.current = requestAnimationFrame(tick)
    },
    reset(newDurationMinutes) {
      cancelAnimationFrame(rafRef.current)
      runningRef.current   = false
      startTimeRef.current = null
      pausedMsRef.current  = 0
      overtimeRef.current  = false
      const newTotalMs = (newDurationMinutes ?? durationMinutes) * 60 * 1000
      setFraction(1)
      setRemainingMs(newTotalMs)
      setOvertime(false)
      setFillComplete(false)
    },
    forceComplete() {
      // animate ring to full green, then call back
      cancelAnimationFrame(rafRef.current)
      runningRef.current = false
      setFillComplete(true)
      setFraction(1)
      setOvertime(false)
    },
    getElapsedMinutes() {
      return Math.round(getElapsedMs() / 60000)
    },
  }))

  // Cleanup on unmount
  useEffect(() => () => cancelAnimationFrame(rafRef.current), [])

  // When overtime, ring stays empty (CIRCUMFERENCE offset = fully depleted).
  // Removed the old `overtime ? 0` branch that snapped back to full and triggered
  // the CSS fill-up animation via the stroke-dashoffset transition.
  const dashOffset = fillComplete
    ? 0
    : CIRCUMFERENCE * (1 - fraction)

  const strokeColor = fillComplete
    ? 'var(--color-done)'
    : overtime
      ? 'var(--color-ai)'   // soft amber — "running over, no rush"
      : 'var(--color-pebble)'
  const glowBg = fillComplete
    ? 'radial-gradient(circle, #50946A 0%, transparent 70%)'
    : overtime
      ? 'radial-gradient(circle, var(--color-ai) 0%, transparent 70%)'
      : 'radial-gradient(circle, var(--color-pebble) 0%, transparent 70%)'

  // scale(1,-1) mirrors the SVG vertically, flipping the arc from CCW to CW.
  // dotAngle tracks the clockwise-moving tip of the remaining arc.
  const safeFrac = Math.max(0, Math.min(1, fraction))
  const dotAngle = safeFrac * 2 * Math.PI
  const dotX     = SIZE / 2 + R * Math.cos(dotAngle)
  const dotY     = SIZE / 2 + R * Math.sin(dotAngle)
  const showDot  = !fillComplete && !overtime && safeFrac > 0.005

  const label = ambientLabel(remainingMs, overtime && !fillComplete)

  return (
    <div style={{ position: 'relative', width: SIZE, height: SIZE, flexShrink: 0 }}>
      {/* Breathing glow — calm inhale/exhale behind the ring */}
      <motion.div
        animate={{ opacity: [0.07, 0.22, 0.07], scale: [0.93, 1.07, 0.93] }}
        transition={{ duration: 5, ease: 'easeInOut', repeat: Infinity }}
        style={{
          position: 'absolute',
          top: -30, left: -30,
          width: SIZE + 60, height: SIZE + 60,
          borderRadius: '50%',
          background: glowBg,
          pointerEvents: 'none',
          transition: 'background 2s ease',
        }}
      />

      {/* SVG ring */}
      <svg
        width={SIZE}
        height={SIZE}
        style={{
          transform: 'rotate(-90deg) scale(1, -1)',
          filter: fillComplete
            ? 'drop-shadow(0 0 7px var(--color-done))'
            : overtime
              ? 'drop-shadow(0 0 4px var(--color-ai))'
              : 'drop-shadow(0 0 4px var(--color-pebble))',
          transition: 'filter 1s ease',
        }}
      >
        {/* Track */}
        <circle
          cx={SIZE / 2} cy={SIZE / 2} r={R}
          stroke="var(--color-pebble)"
          strokeOpacity={0.18}
          strokeWidth={STROKE_BG}
          fill="none"
        />
        {/* Progress arc */}
        <circle
          cx={SIZE / 2} cy={SIZE / 2} r={R}
          strokeWidth={STROKE_FG}
          strokeLinecap="round"
          strokeDasharray={CIRCUMFERENCE}
          strokeDashoffset={dashOffset}
          fill="none"
          style={{
            stroke: strokeColor,
            // No stroke-dashoffset transition during normal depletion — the rAF loop
            // already updates at 60fps so no CSS smoothing needed, and a 1s transition
            // caused the arc to visually lag behind the pebble dot. The fillComplete
            // 0.4s ease is kept for the intentional "ring fills green" completion animation.
            transition: fillComplete
              ? 'stroke-dashoffset 0.4s ease, stroke 0.4s ease'
              : 'stroke 0.6s ease',
          }}
        />
        {/* Arc-tip pebble — brand dot riding the leading edge of the arc */}
        {showDot && (
          <>
            <circle cx={dotX} cy={dotY} r={11}  style={{ fill: 'var(--color-pebble)', opacity: 0.08 }} />
            <circle cx={dotX} cy={dotY} r={7}   style={{ fill: 'var(--color-pebble)', opacity: 0.22 }} />
            <circle cx={dotX} cy={dotY} r={4.5} style={{ fill: 'var(--color-pebble)', opacity: 1    }} />
          </>
        )}
      </svg>

      {/* Time label — centered */}
      <div style={{
        position: 'absolute', inset: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <span style={{
          fontSize: 28,
          fontWeight: 500,
          color: 'var(--text-primary)',
          letterSpacing: '-1px',
          fontFamily: 'var(--font-display)',
        }}>
          {label}
        </span>
      </div>
    </div>
  )
})

export default FocusTimer
