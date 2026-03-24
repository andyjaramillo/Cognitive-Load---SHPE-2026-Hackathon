import { useState } from 'react'
import { motion } from 'framer-motion'

export default function BreakRoomButton({ onClick }) {
  const [hovered, setHovered] = useState(false)
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches

  return (
    <motion.button
      aria-label="take a break"
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      animate={reducedMotion ? {} : {
        scale: hovered ? 1.08 : [0.92, 1.0, 0.92],
        opacity: hovered ? 1.0 : [0.7, 1.0, 0.7],
      }}
      transition={
        hovered
          ? { duration: 0.18, ease: 'easeOut' }
          : { duration: 2.8, repeat: Infinity, ease: 'easeInOut' }
      }
      className="break-room-btn"
      style={{
        position: 'fixed',
        bottom: 24,
        left: 24,
        zIndex: 9998,
        width: 44,
        height: 44,
        borderRadius: '50%',
        background: hovered
          ? 'color-mix(in srgb, var(--color-pebble) 22%, transparent)'
          : 'var(--color-pebble-soft)',
        border: '1px solid color-mix(in srgb, var(--color-pebble) 30%, transparent)',
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 0,
        transition: 'background 0.18s ease',
        // Reset button defaults
        appearance: 'none',
        WebkitAppearance: 'none',
      }}
    >
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        aria-hidden="true"
      >
        <rect x="6" y="4" width="4" height="16" rx="2" fill="var(--color-pebble)" opacity="0.85" />
        <rect x="14" y="4" width="4" height="16" rx="2" fill="var(--color-pebble)" opacity="0.85" />
      </svg>
    </motion.button>
  )
}
