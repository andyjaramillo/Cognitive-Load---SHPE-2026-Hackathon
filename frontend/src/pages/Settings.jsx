import { useEffect } from 'react'
import { motion } from 'framer-motion'
import { useSelector, useDispatch } from 'react-redux'
import { prefsActions } from '../store'
import { savePreferences } from '../utils/api'

const fadeUp = {
  initial: { opacity: 0, y: 20 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.65, ease: [0.25, 0.46, 0.45, 0.94] } },
  exit:    { opacity: 0, y: -8, transition: { duration: 0.45, ease: [0.25, 0.46, 0.45, 0.94] } },
}

const stagger = {
  initial: {},
  animate: { transition: { staggerChildren: 0.12 } },
}

const staggerItem = {
  initial: { opacity: 0, y: 10 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.5, ease: [0.25, 0.46, 0.45, 0.94] } },
}

const FONTS = [
  { label: 'Default',           value: 'default',      css: 'var(--font-body)' },
  { label: 'Lexend',            value: 'lexend',        css: '"Lexend", sans-serif' },
  { label: 'Atkinson',          value: 'atkinson',      css: '"Atkinson Hyperlegible", sans-serif' },
  { label: 'OpenDyslexic',      value: 'opendyslexic',  css: '"OpenDyslexic", sans-serif' },
]

const THEMES = [
  { label: 'Calm (auto)',  value: 'calm' },
  { label: 'Morning',     value: 'morning' },
  { label: 'Afternoon',   value: 'afternoon' },
  { label: 'Evening',     value: 'evening' },
  { label: 'Night',       value: 'night' },
]

const TIMERS = [
  { label: '15 min', value: 15 },
  { label: '25 min', value: 25 },
  { label: '45 min', value: 45 },
  { label: '60 min', value: 60 },
]

const COMM_STYLES = [
  { label: 'Warm',      value: 'warm',     sub: 'Like a deep breath' },
  { label: 'Direct',    value: 'direct',   sub: 'Calm and to the point' },
  { label: 'Balanced',  value: 'balanced', sub: 'A little of each' },
]

const READING_LEVELS = [
  { label: 'Short and clear', value: 'simple',   sub: 'Just the essentials' },
  { label: 'Balanced',        value: 'standard', sub: 'Enough detail, nothing extra' },
  { label: 'Full picture',    value: 'detailed', sub: 'I like having everything' },
]

const GRANULARITIES = [
  { label: 'Step by step', value: 'micro',  sub: 'The smaller, the better' },
  { label: 'Clear plan',   value: 'normal', sub: 'Not too detailed, not too vague' },
  { label: 'Big picture',  value: 'broad',  sub: "I'll figure out the rest" },
]

async function persist(updates) {
  // Convert camelCase Redux keys to snake_case backend keys
  const backendMap = {
    fontChoice:          'font_choice',
    colorTheme:          'color_theme',
    timerLengthMinutes:  'timer_length_minutes',
    communicationStyle:  'communication_style',
    readingLevel:        'reading_level',
    granularity:         'granularity',
  }
  const payload = {}
  for (const [k, v] of Object.entries(updates)) {
    payload[backendMap[k] || k] = v
  }
  try { await savePreferences(payload) } catch { /* best effort */ }
}

export default function Settings() {
  const dispatch = useDispatch()
  const prefs    = useSelector(s => s.prefs)

  // Apply font immediately when it changes
  useEffect(() => {
    document.documentElement.setAttribute('data-font', prefs.fontChoice || 'default')
  }, [prefs.fontChoice])

  function setFont(value) {
    dispatch(prefsActions.setPrefs({ fontChoice: value }))
    persist({ fontChoice: value })
  }

  function setTheme(value) {
    dispatch(prefsActions.setPrefs({ colorTheme: value }))
    persist({ colorTheme: value })
  }

  function setTimer(value) {
    dispatch(prefsActions.setPrefs({ timerLengthMinutes: value }))
    persist({ timerLengthMinutes: value })
  }

  function setCommStyle(value) {
    dispatch(prefsActions.setPrefs({ communicationStyle: value }))
    persist({ communicationStyle: value })
  }

  function setReadingLevel(value) {
    dispatch(prefsActions.setPrefs({ readingLevel: value }))
    persist({ readingLevel: value })
  }

  function setGranularity(value) {
    dispatch(prefsActions.setPrefs({ granularity: value }))
    persist({ granularity: value })
  }

  return (
    <motion.div
      {...fadeUp}
      style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flex: 1, padding: '1.5rem 2rem', paddingBottom: '22vh', overflowY: 'auto' }}
    >
      <motion.div
        variants={stagger}
        initial="initial"
        animate="animate"
        style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', maxWidth: '560px', width: '100%' }}
      >
        <motion.div variants={staggerItem}>
          <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '1.75rem', fontWeight: 400, color: 'var(--text-primary)', marginBottom: '0.35rem' }}>
            settings.
          </h2>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.92rem' }}>
            adjust how Pebble looks and feels — changes apply instantly.
          </p>
        </motion.div>

        {/* Reading & Display */}
        <motion.div variants={staggerItem} className="card" style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          <h3 style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--text-primary)' }}>Reading & Display</h3>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            <label style={{ fontSize: '0.88rem', fontWeight: 500, color: 'var(--text-secondary)' }}>Font</label>
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
              {FONTS.map(f => (
                <button
                  key={f.value}
                  onClick={() => setFont(f.value)}
                  className={`btn ${prefs.fontChoice === f.value ? 'btn-primary' : 'btn-ghost'}`}
                  style={{ fontSize: '0.83rem', fontFamily: f.css }}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            <label style={{ fontSize: '0.88rem', fontWeight: 500, color: 'var(--text-secondary)' }}>Theme</label>
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
              {THEMES.map(t => (
                <button
                  key={t.value}
                  onClick={() => setTheme(t.value)}
                  className={`btn ${prefs.colorTheme === t.value ? 'btn-primary' : 'btn-ghost'}`}
                  style={{ fontSize: '0.83rem' }}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>
        </motion.div>

        {/* Focus & Timer */}
        <motion.div variants={staggerItem} className="card" style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          <h3 style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--text-primary)' }}>Focus & Timer</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            <label style={{ fontSize: '0.88rem', fontWeight: 500, color: 'var(--text-secondary)' }}>Default timer length</label>
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
              {TIMERS.map(t => (
                <button
                  key={t.value}
                  onClick={() => setTimer(t.value)}
                  className={`btn ${prefs.timerLengthMinutes === t.value ? 'btn-primary' : 'btn-ghost'}`}
                  style={{ fontSize: '0.83rem' }}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>
        </motion.div>

        {/* Communication & AI */}
        <motion.div variants={staggerItem} className="card" style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          <h3 style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--text-primary)' }}>Communication & AI</h3>

          {/* Communication style */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            <label style={{ fontSize: '0.88rem', fontWeight: 500, color: 'var(--text-secondary)' }}>
              What does helpful sound like?
            </label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
              {COMM_STYLES.map(c => (
                <button
                  key={c.value}
                  onClick={() => setCommStyle(c.value)}
                  style={{
                    textAlign:    'left',
                    background:   prefs.communicationStyle === c.value ? 'rgba(42,122,144,0.1)' : 'var(--bg-card)',
                    border:       prefs.communicationStyle === c.value ? '1.5px solid rgba(42,122,144,0.4)' : '1px solid var(--border)',
                    borderRadius: 10,
                    padding:      '10px 14px',
                    cursor:       'pointer',
                    transition:   'all 0.2s ease',
                  }}
                >
                  <div style={{ fontSize: '0.88rem', fontWeight: 500, color: 'var(--text-primary)' }}>{c.label}</div>
                  <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: 2 }}>{c.sub}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Reading level */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            <label style={{ fontSize: '0.88rem', fontWeight: 500, color: 'var(--text-secondary)' }}>
              How much detail do you want in explanations?
            </label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
              {READING_LEVELS.map(r => (
                <button
                  key={r.value}
                  onClick={() => setReadingLevel(r.value)}
                  style={{
                    textAlign:    'left',
                    background:   prefs.readingLevel === r.value ? 'rgba(42,122,144,0.1)' : 'var(--bg-card)',
                    border:       prefs.readingLevel === r.value ? '1.5px solid rgba(42,122,144,0.4)' : '1px solid var(--border)',
                    borderRadius: 10,
                    padding:      '10px 14px',
                    cursor:       'pointer',
                    transition:   'all 0.2s ease',
                  }}
                >
                  <div style={{ fontSize: '0.88rem', fontWeight: 500, color: 'var(--text-primary)' }}>{r.label}</div>
                  <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: 2 }}>{r.sub}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Task granularity */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            <label style={{ fontSize: '0.88rem', fontWeight: 500, color: 'var(--text-secondary)' }}>
              When I break tasks down, how detailed should they be?
            </label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
              {GRANULARITIES.map(g => (
                <button
                  key={g.value}
                  onClick={() => setGranularity(g.value)}
                  style={{
                    textAlign:    'left',
                    background:   prefs.granularity === g.value ? 'rgba(42,122,144,0.1)' : 'var(--bg-card)',
                    border:       prefs.granularity === g.value ? '1.5px solid rgba(42,122,144,0.4)' : '1px solid var(--border)',
                    borderRadius: 10,
                    padding:      '10px 14px',
                    cursor:       'pointer',
                    transition:   'all 0.2s ease',
                  }}
                >
                  <div style={{ fontSize: '0.88rem', fontWeight: 500, color: 'var(--text-primary)' }}>{g.label}</div>
                  <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: 2 }}>{g.sub}</div>
                </button>
              ))}
            </div>
          </div>
        </motion.div>

      </motion.div>
    </motion.div>
  )
}
