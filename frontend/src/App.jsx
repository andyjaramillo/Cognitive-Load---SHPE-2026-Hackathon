import { useEffect } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import { motion, AnimatePresence } from 'framer-motion'
import { prefsActions } from './store'
import { fetchPreferences } from './utils/api'
import Decomposer from './components/Decomposer'
import Refactor from './components/Refactor'
import PreferenceDashboard from './components/PreferenceDashboard'
import './styles/global.css'

export default function App() {
  const dispatch = useDispatch()
  const prefs = useSelector(s => s.prefs)

  // Load preferences from Cosmos on mount
  useEffect(() => {
    fetchPreferences()
      .then(p => {
        const mapped = {
          readingLevel: p.reading_level,
          fontChoice: p.font_choice,
          bionicReading: p.bionic_reading,
          lineHeight: p.line_height,
          letterSpacing: p.letter_spacing,
          timerLengthMinutes: p.timer_length_minutes,
          focusMode: p.focus_mode,
          granularity: p.granularity,
          colorTheme: p.color_theme,
        }
        dispatch(prefsActions.setPrefs(mapped))
      })
      .catch(() => dispatch(prefsActions.setPrefs({})))
  }, [dispatch])

  // Apply CSS variables from prefs
  useEffect(() => {
    const root = document.documentElement
    root.setAttribute('data-theme', prefs.colorTheme || 'calm')
    root.setAttribute('data-font', prefs.fontChoice || 'default')
    root.style.setProperty('--line-height', prefs.lineHeight ?? 1.6)
    root.style.setProperty('--letter-spacing', `${prefs.letterSpacing ?? 0}px`)
  }, [prefs.colorTheme, prefs.fontChoice, prefs.lineHeight, prefs.letterSpacing])

  return (
    <div className="app-shell">
      {/* Sidebar */}
      <AnimatePresence>
        {!prefs.focusMode && (
          <motion.aside
            className="sidebar"
            initial={{ x: -280, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: -280, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 260, damping: 28 }}
            aria-label="Settings sidebar"
          >
            {/* Logo */}
            <div style={{ marginBottom: '2rem' }}>
              <h1 style={{ fontFamily: 'var(--font-display)', fontSize: '1.4rem', color: 'var(--text-primary)' }}>
                NeuroFocus
              </h1>
              <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: '0.15rem' }}>
                Your calm work companion
              </p>
            </div>

            <PreferenceDashboard />
          </motion.aside>
        )}
      </AnimatePresence>

      {/* Main content */}
      <main className="main-content" aria-label="Main content">
        {/* Focus mode toggle */}
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <button
            className="btn btn-ghost"
            style={{ fontSize: '0.82rem' }}
            onClick={() => dispatch(prefsActions.toggleFocusMode())}
            aria-pressed={prefs.focusMode}
          >
            {prefs.focusMode ? '← Show sidebar' : 'Focus mode'}
          </button>
        </div>

        <div style={{ display: 'flex', gap: '1.5rem', flex: 1, flexWrap: 'wrap', alignItems: 'flex-start' }}>
          <div style={{ flex: '1 1 380px', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            <Decomposer />
          </div>
          <div style={{ flex: '1 1 380px', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            <Refactor />
          </div>
        </div>
      </main>
    </div>
  )
}
