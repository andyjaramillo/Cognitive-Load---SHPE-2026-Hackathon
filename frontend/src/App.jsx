import { useEffect, useState, Component } from 'react'
import { Routes, Route, useLocation, useNavigate } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { useDispatch, useSelector } from 'react-redux'
import { prefsActions } from './store'
import { fetchPreferences } from './utils/api'
import TopNav from './components/TopNav'
import WalkthroughOverlay from './components/WalkthroughOverlay'
import BreakRoomButton from './components/BreakRoomButton'
import BreakRoomOverlay from './components/BreakRoomOverlay'
import Home from './pages/Home'
import DocumentsHub from './pages/DocumentsHub'
import DocumentSession from './pages/DocumentSession'
import Tasks from './pages/Tasks'
import FocusMode from './pages/FocusMode'
import Settings from './pages/Settings'
import Onboarding from './pages/Onboarding'
import './styles/global.css'

// Catches render errors inside a page without unmounting the whole app
class PageErrorBoundary extends Component {
  constructor(props) { super(props); this.state = { hasError: false } }
  static getDerivedStateFromError() { return { hasError: true } }
  componentDidCatch(err) { console.error('[Pebble] page render error:', err) }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 1, padding: '3rem 1rem' }}>
          <p style={{ fontSize: '0.9rem', color: 'var(--text-muted)', textAlign: 'center' }}>
            something went quiet. try navigating back or refreshing.
          </p>
        </div>
      )
    }
    return this.props.children
  }
}

const PEBBLE_COLORS = {
  sage:  { hex: '#6FA99E', soft: 'rgba(111,169,158,0.12)' },
  amber: { hex: '#C89450', soft: 'rgba(200,148,80,0.12)' },
  lilac: { hex: '#9A88B4', soft: 'rgba(154,136,180,0.12)' },
  sky:   { hex: '#6A96B8', soft: 'rgba(106,150,184,0.12)' },
}

export default function App() {
  const dispatch = useDispatch()
  const prefs = useSelector(s => s.prefs)
  const location = useLocation()
  const navigate = useNavigate()
  const isFocusMode    = location.pathname === '/focus'
  const showWalkthrough = prefs.loaded && prefs.onboardingComplete && !prefs.walkthroughComplete
  const [breakRoomOpen, setBreakRoomOpen] = useState(false)

  // Load preferences from Cosmos on mount, then redirect to home
  useEffect(() => {
    fetchPreferences()
      .then(p => {
        // If Cosmos says true, write localStorage. If Cosmos says false, check
        // localStorage as fallback — handles silent savePreferences failures
        // during onboarding where the flag never reached Cosmos.
        let onboardingComplete = p.onboarding_complete
        if (!onboardingComplete) {
          try { onboardingComplete = localStorage.getItem('pebble_onboarding_complete') === 'true' } catch {}
        }
        if (onboardingComplete) try { localStorage.setItem('pebble_onboarding_complete', 'true') } catch {}
        // Cosmos is the source of truth for walkthrough — sync localStorage to match exactly
        const walkthroughComplete = !!p.walkthrough_complete
        try {
          if (walkthroughComplete) localStorage.setItem('pebble_walkthrough_complete', 'true')
          else                     localStorage.removeItem('pebble_walkthrough_complete')
        } catch {}

        dispatch(prefsActions.setPrefs({
          name:               p.name,
          communicationStyle: p.communication_style,
          onboardingComplete,
          walkthroughComplete,
          readingLevel: p.reading_level,
          fontChoice:   p.font_choice,
          bionicReading: p.bionic_reading,
          lineHeight:   p.line_height,
          letterSpacing: p.letter_spacing,
          timerLengthMinutes: p.timer_length_minutes,
          focusMode:    p.focus_mode,
          granularity:  p.granularity,
          colorTheme:   p.color_theme,
          pebbleColor:  p.pebble_color || 'sage',
          language:     p.language || 'en',
        }))
        // Always land on home after a fresh load (unless in focus mode)
        if (location.pathname !== '/focus') {
          navigate('/', { replace: true })
        }
      })
      .catch(() => {
        // Backend unreachable — restore both completion flags from localStorage
        let onboardingComplete  = false
        let walkthroughComplete = false
        try { onboardingComplete  = localStorage.getItem('pebble_onboarding_complete')  === 'true' } catch {}
        try { walkthroughComplete = localStorage.getItem('pebble_walkthrough_complete') === 'true' } catch {}
        dispatch(prefsActions.setPrefs({ onboardingComplete, walkthroughComplete }))
      })
  }, [dispatch]) // eslint-disable-line react-hooks/exhaustive-deps

  // Set time-of-day theme once on mount
  useEffect(() => {
    const hour = new Date().getHours()
    let timeTheme = 'afternoon'
    if (hour >= 6 && hour < 12) timeTheme = 'morning'
    else if (hour >= 12 && hour < 17) timeTheme = 'afternoon'
    else if (hour >= 17 && hour < 21) timeTheme = 'evening'
    else timeTheme = 'night'
    document.documentElement.setAttribute('data-time-theme', timeTheme)
  }, [])

  // Apply CSS variables whenever preferences change
  useEffect(() => {
    const root = document.documentElement
    // 'calm' = no manual override, time theme shows through
    if (prefs.colorTheme && prefs.colorTheme !== 'calm') {
      root.setAttribute('data-theme', prefs.colorTheme)
    } else {
      root.removeAttribute('data-theme')
    }
    root.setAttribute('data-font', prefs.fontChoice || 'default')
    root.style.setProperty('--line-height', prefs.lineHeight ?? 1.6)
    root.style.setProperty('--letter-spacing', `${prefs.letterSpacing ?? 0}px`)
    // Pebble identity color
    const pc = PEBBLE_COLORS[prefs.pebbleColor] || PEBBLE_COLORS.sage
    root.style.setProperty('--color-pebble', pc.hex)
    root.style.setProperty('--color-pebble-soft', pc.soft)
  }, [prefs.colorTheme, prefs.fontChoice, prefs.lineHeight, prefs.letterSpacing, prefs.pebbleColor])

  // Prefs not yet loaded — show a minimal centered dot so there's no flash
  if (!prefs.loaded) {
    return (
      <div style={{
        position: 'fixed', inset: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'var(--bg-primary)',
      }}>
        <motion.div
          animate={{ scale: [0.85, 1.15, 0.85], opacity: [0.4, 1, 0.4] }}
          transition={{ duration: 2.2, repeat: Infinity, ease: 'easeInOut' }}
          style={{ width: 8, height: 8, borderRadius: '50%', background: '#5A8A80' }}
        />
      </div>
    )
  }

  // New user — show full-screen onboarding (no nav)
  if (!prefs.onboardingComplete) {
    return <Onboarding />
  }

  // Single return — WalkthroughOverlay stays in the same React tree position
  // across all route changes (including /focus), so it never remounts mid-tour.
  return (
    <>
      {isFocusMode ? (
        <FocusMode />
      ) : (
        <div className="app-shell">
          <TopNav />
          <main className="main-content" aria-label="Main content">
            <PageErrorBoundary key={location.pathname}>
              <AnimatePresence mode="wait">
                <Routes location={location} key={location.pathname}>
                  <Route path="/" element={<Home />} />
                  <Route path="/home" element={<Home />} />
                  <Route path="/documents" element={<DocumentsHub />} />
                  <Route path="/documents/:id" element={<DocumentSession />} />
                  <Route path="/tasks" element={<Tasks />} />
                  <Route path="/settings" element={<Settings />} />
                </Routes>
              </AnimatePresence>
            </PageErrorBoundary>
          </main>
        </div>
      )}

      {showWalkthrough && <WalkthroughOverlay />}

      {/* Break room — available everywhere except Focus Mode */}
      {!isFocusMode && (
        <BreakRoomButton onClick={() => setBreakRoomOpen(true)} />
      )}
      <AnimatePresence>
        {breakRoomOpen && (
          <BreakRoomOverlay onClose={() => setBreakRoomOpen(false)} />
        )}
      </AnimatePresence>
    </>
  )
}
