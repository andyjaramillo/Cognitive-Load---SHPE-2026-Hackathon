import { useState, useEffect, useRef } from 'react'
import { NavLink, Link } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { useSelector, useDispatch } from 'react-redux'
import { prefsActions } from '../store'
import { savePreferences } from '../utils/api'

const NAV_ITEMS = [
  { to: '/',          label: 'Home',      end: true,  dataNav: null         },
  { to: '/documents', label: 'Documents', end: false, dataNav: 'documents'  },
  { to: '/tasks',     label: 'Tasks',     end: false, dataNav: 'tasks'      },
  { to: '/focus',     label: 'Focus',     end: false, dataNav: 'focus'      },
]

const PEBBLE_COLOR_OPTIONS = [
  { id: 'sage',  label: 'sage',  hex: '#6FA99E' },
  { id: 'sky',   label: 'sky',   hex: '#6A96B8' },
  { id: 'lilac', label: 'lilac', hex: '#9A88B4' },
  { id: 'amber', label: 'amber', hex: '#C89450' },
]

export default function TopNav() {
  const dispatch     = useDispatch()
  const name         = useSelector(s => s.prefs.name)
  const pebbleColor  = useSelector(s => s.prefs.pebbleColor) || 'sage'
  const initial      = (name && name !== 'there') ? name.charAt(0).toUpperCase() : null
  const [open, setOpen]   = useState(false)
  const containerRef      = useRef(null)

  // Close on outside click
  useEffect(() => {
    if (!open) return
    function onDown(e) {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  // Close on Escape
  useEffect(() => {
    if (!open) return
    function onKey(e) { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open])

  function pickColor(colorId) {
    dispatch(prefsActions.setPrefs({ pebbleColor: colorId }))
    savePreferences({ pebble_color: colorId }).catch(() => {})
    setOpen(false)
  }

  const activeColor = PEBBLE_COLOR_OPTIONS.find(c => c.id === pebbleColor) || PEBBLE_COLOR_OPTIONS[0]

  return (
    <motion.header
      className="top-nav"
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: [0.4, 0, 0.2, 1] }}
      aria-label="Main navigation"
    >
      {/* Logo — left: "Pebble" + identity dot */}
      <Link
        to="/"
        className="top-nav__logo"
        style={{ textDecoration: 'none', display: 'flex', alignItems: 'baseline', gap: 0 }}
        aria-label="Pebble home"
      >
        <span style={{ fontFamily: '"DM Serif Display", Georgia, serif', color: 'var(--text-primary)' }}>
          Pebble
        </span>
        <span
          aria-hidden="true"
          style={{
            display: 'inline-block',
            width: 8,
            height: 8,
            borderRadius: '50%',
            background: 'var(--color-pebble)',
            marginLeft: 2,
            marginBottom: 1,
            verticalAlign: 'baseline',
            flexShrink: 0,
          }}
        />
      </Link>

      {/* Nav links — center-right */}
      <nav role="navigation" aria-label="Pages" className="top-nav__links">
        {NAV_ITEMS.map(({ to, label, end, dataNav }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) => `top-nav__item${isActive ? ' active' : ''}`}
            style={{ textDecoration: 'none' }}
            {...(dataNav ? { 'data-nav': dataNav } : {})}
          >
            {label}
          </NavLink>
        ))}
      </nav>

      {/* Right side — settings icon + avatar with color picker */}
      <div className="top-nav__right">
        <Link
          to="/settings"
          className="top-nav__icon-btn"
          data-walkthrough="settings"
          aria-label="Settings"
          style={{ textDecoration: 'none' }}
        >
          <GearIcon />
        </Link>

        {/* Avatar button — click to open color picker */}
        <div ref={containerRef} style={{ position: 'relative' }}>
          <button
            onClick={() => setOpen(o => !o)}
            className="top-nav__avatar"
            aria-label="Change Pebble color"
            aria-expanded={open}
            style={{
              width: 28,
              height: 28,
              borderRadius: '50%',
              background: 'var(--color-pebble-soft)',
              border: `1.5px solid color-mix(in srgb, var(--color-pebble) 35%, transparent)`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              transition: 'background 0.2s ease, border-color 0.2s ease, opacity 0.15s ease',
            }}
            onMouseEnter={e => { e.currentTarget.style.opacity = '0.8' }}
            onMouseLeave={e => { e.currentTarget.style.opacity = '1' }}
          >
            {initial
              ? <span style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--color-pebble)', letterSpacing: '0.02em' }}>{initial}</span>
              : <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--color-pebble)', display: 'block' }} />
            }
          </button>

          {/* Color picker popover */}
          <AnimatePresence>
            {open && (
              <motion.div
                initial={{ opacity: 0, y: -6, scale: 0.97 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -6, scale: 0.97 }}
                transition={{ duration: 0.18, ease: [0.4, 0, 0.2, 1] }}
                style={{
                  position: 'absolute',
                  top: 'calc(100% + 8px)',
                  right: 0,
                  background: 'var(--bg-card)',
                  border: '1px solid var(--border)',
                  borderRadius: 14,
                  padding: '12px 14px',
                  zIndex: 9997,
                  minWidth: 160,
                  boxShadow: '0 8px 32px rgba(0,0,0,0.12)',
                }}
                role="dialog"
                aria-label="Choose Pebble color"
              >
                {/* Header */}
                <p style={{
                  fontSize: '0.72rem',
                  color: 'var(--text-muted)',
                  margin: '0 0 10px',
                  letterSpacing: '0.04em',
                  textTransform: 'lowercase',
                }}>
                  pebble color
                </p>

                {/* Color swatches */}
                <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                  {PEBBLE_COLOR_OPTIONS.map(c => {
                    const isSelected = c.id === pebbleColor
                    return (
                      <button
                        key={c.id}
                        onClick={() => pickColor(c.id)}
                        aria-label={`${c.label}${isSelected ? ' (selected)' : ''}`}
                        aria-pressed={isSelected}
                        style={{
                          width: 26,
                          height: 26,
                          borderRadius: '50%',
                          background: c.hex,
                          border: isSelected
                            ? `2px solid ${c.hex}`
                            : '2px solid transparent',
                          outline: isSelected ? `2.5px solid var(--bg-card)` : 'none',
                          outlineOffset: isSelected ? -1 : 0,
                          boxShadow: isSelected
                            ? `0 0 0 3px ${c.hex}55, 0 2px 8px ${c.hex}44`
                            : 'none',
                          cursor: 'pointer',
                          padding: 0,
                          transition: 'box-shadow 0.18s ease, transform 0.18s ease',
                          flexShrink: 0,
                        }}
                        onMouseEnter={e => { if (!isSelected) e.currentTarget.style.transform = 'scale(1.12)' }}
                        onMouseLeave={e => { if (!isSelected) e.currentTarget.style.transform = 'scale(1)' }}
                      />
                    )
                  })}
                </div>

                {/* Current color name */}
                <p style={{
                  fontSize: '0.72rem',
                  color: 'var(--color-pebble)',
                  margin: '10px 0 0',
                  letterSpacing: '0.02em',
                }}>
                  {activeColor.label}
                </p>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </motion.header>
  )
}

function GearIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  )
}
