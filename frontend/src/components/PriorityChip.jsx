/**
 * PriorityChip — shared component for displaying and changing task priority.
 *
 * Priority integers: 1 = high, 2 = medium (default), 3 = low
 * Color mapping uses Pebble CSS variables — never red, always calm.
 *
 * <PriorityChip priority={2} onChange={p => ...} />
 *   — single tappable chip, cycles med → high → low → med on click
 *   — used on task rows in Tasks.jsx
 *
 * <PriorityPicker priority={2} onChange={p => ...} />
 *   — three chips side-by-side, selected one is active, others dimmed
 *   — used in TaskPreviewCard in Home.jsx before confirming a task
 */

// Priority: 1=high, 2=medium, 3=low
// Colors: all from Pebble's semantic color system — never red
export const PRIORITY_CONFIG = {
  1: {
    label:  'high',
    color:  'var(--color-ai)',                  // soft orange — attention without alarm
    bg:     'rgba(224,160,96,0.12)',
    border: 'rgba(224,160,96,0.3)',
  },
  2: {
    label:  'med',
    color:  'var(--color-upcoming)',             // sky blue — neutral, default
    bg:     'rgba(106,150,184,0.09)',
    border: 'rgba(106,150,184,0.2)',
  },
  3: {
    label:  'low',
    color:  'var(--color-inactive)',             // warm gray — de-emphasized
    bg:     'rgba(180,170,154,0.10)',
    border: 'rgba(180,170,154,0.22)',
  },
}

// Cycle order: med(2) → high(1) → low(3) → med(2)
const CYCLE = { 2: 1, 1: 3, 3: 2 }

const BASE_STYLE = {
  fontSize:    '0.72rem',
  padding:     '1px 7px',
  height:      18,
  lineHeight:  1,
  borderRadius: 99,
  cursor:      'pointer',
  fontWeight:  500,
  letterSpacing: '0.02em',
  display:     'inline-flex',
  alignItems:  'center',
  userSelect:  'none',
  flexShrink:  0,
  // Color props transition smoothly on priority change
  transition:  'background 0.2s ease, border-color 0.2s ease, color 0.2s ease',
}

/**
 * Single cycling chip — click to advance: med → high → low → med
 */
export function PriorityChip({ priority = 2, onChange }) {
  const cfg = PRIORITY_CONFIG[priority] || PRIORITY_CONFIG[2]
  return (
    <button
      onClick={e => { e.stopPropagation(); onChange?.(CYCLE[priority] ?? 2) }}
      title={`Priority: ${cfg.label} — tap to change`}
      style={{
        ...BASE_STYLE,
        background:  cfg.bg,
        border:      `1px solid ${cfg.border}`,
        color:       cfg.color,
        transition:  'background 0.2s ease, border-color 0.2s ease, color 0.2s ease, opacity 0.15s ease',
      }}
      onMouseEnter={e => { e.currentTarget.style.opacity = '0.75' }}
      onMouseLeave={e => { e.currentTarget.style.opacity = '1' }}
    >
      {cfg.label}
    </button>
  )
}

/**
 * Three-chip picker — shows all three options, selected is lit, others dimmed
 */
export function PriorityPicker({ priority = 2, onChange }) {
  return (
    <div style={{ display: 'flex', gap: '0.3rem', alignItems: 'center' }}>
      {[1, 2, 3].map(p => {
        const cfg      = PRIORITY_CONFIG[p]
        const selected = p === priority
        return (
          <button
            key={p}
            onClick={e => { e.stopPropagation(); onChange?.(p) }}
            style={{
              ...BASE_STYLE,
              background:  selected ? cfg.bg        : 'transparent',
              border:      selected
                ? `1px solid ${cfg.border}`
                : '1px solid var(--border)',
              color:       selected ? cfg.color : 'var(--text-muted)',
              fontWeight:  selected ? 500       : 400,
              opacity:     selected ? 1         : 0.5,
              transition:  'background 0.2s ease, border-color 0.2s ease, color 0.2s ease, opacity 0.2s ease',
            }}
            onMouseEnter={e => { if (!selected) e.currentTarget.style.opacity = '0.8' }}
            onMouseLeave={e => { if (!selected) e.currentTarget.style.opacity = '0.5' }}
          >
            {cfg.label}
          </button>
        )
      })}
    </div>
  )
}
