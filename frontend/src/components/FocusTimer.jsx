import { useEffect, useRef, useState, useImperativeHandle, forwardRef } from 'react'

const SIZE        = 170
const STROKE_BG   = 2
const STROKE_FG   = 3
const R           = (SIZE - STROKE_FG * 2) / 2
const CIRCUMFERENCE = 2 * Math.PI * R

// Returns current ring color hex string based on fraction remaining (0–1)
function ringColor(fraction) {
  if (fraction > 0.5) return 'var(--color-done)'          // green
  if (fraction > 0.2) return 'var(--color-active)'        // teal
  return 'var(--color-ai)'                                // amber/orange
}

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

// Resolve CSS variable to a hex/rgb string for use in radial-gradient
// We pass a fallback for the glow since CSS vars can't go inside radial-gradient easily
const GLOW_COLORS = {
  done:    '#50946A',
  active:  '#2A7A90',
  ai:      '#C8A046',
}

function glowColor(fraction) {
  if (fraction > 0.5) return GLOW_COLORS.done
  if (fraction > 0.2) return GLOW_COLORS.active
  return GLOW_COLORS.ai
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

  const dashOffset = fillComplete
    ? 0
    : overtime
      ? 0
      : CIRCUMFERENCE * (1 - fraction)

  const strokeColor = fillComplete ? 'var(--color-done)' : ringColor(fraction)
  const glow        = fillComplete ? GLOW_COLORS.done    : glowColor(fraction)
  const glowOpacity = 0.15
  const label       = ambientLabel(remainingMs, overtime && !fillComplete)

  return (
    <div style={{ position: 'relative', width: SIZE, height: SIZE, flexShrink: 0 }}>
      {/* Glow behind ring */}
      <div style={{
        position: 'absolute',
        top: -25, left: -25,
        width: SIZE + 50, height: SIZE + 50,
        borderRadius: '50%',
        background: `radial-gradient(circle, ${glow} 0%, transparent 70%)`,
        opacity: glowOpacity,
        transition: 'background 2s ease, opacity 0.6s ease',
        pointerEvents: 'none',
      }} />

      {/* SVG ring */}
      <svg
        width={SIZE}
        height={SIZE}
        style={{
          transform: 'rotate(-90deg)',
          filter: 'var(--focus-ring-shadow, none)',
        }}
      >
        {/* Track */}
        <circle
          cx={SIZE / 2} cy={SIZE / 2} r={R}
          stroke="var(--color-inactive)"
          strokeOpacity={0.08}
          strokeWidth={STROKE_BG}
          fill="none"
        />
        {/* Progress arc */}
        <circle
          cx={SIZE / 2} cy={SIZE / 2} r={R}
          stroke={strokeColor}
          strokeWidth={STROKE_FG}
          strokeLinecap="round"
          strokeDasharray={CIRCUMFERENCE}
          strokeDashoffset={dashOffset}
          fill="none"
          style={{
            transition: fillComplete
              ? 'stroke-dashoffset 0.4s ease, stroke 0.4s ease'
              : 'stroke-dashoffset 1s linear, stroke 2s ease',
          }}
        />
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
