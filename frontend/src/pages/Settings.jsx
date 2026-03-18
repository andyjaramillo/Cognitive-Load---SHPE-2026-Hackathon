import { motion } from 'framer-motion'

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

export default function Settings() {
  return (
    <motion.div
      {...fadeUp}
      style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flex: 1, padding: '1.5rem 2rem', paddingBottom: '22vh' }}
    >
      <motion.div
        variants={stagger}
        initial="initial"
        animate="animate"
        style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', maxWidth: '560px', width: '100%' }}
      >
        <motion.div variants={staggerItem}>
          <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '1.75rem', color: 'var(--text-primary)', marginBottom: '0.35rem' }}>
            Settings
          </h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: '1rem' }}>
            Adjust how NeuroFocus looks and behaves — changes apply instantly.
          </p>
        </motion.div>

        {/* Reading & Display */}
        <motion.div variants={staggerItem} className="card" style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          <h3 style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--text-primary)' }}>Reading & Display</h3>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            <label style={{ fontSize: '0.88rem', fontWeight: 500, color: 'var(--text-secondary)' }}>Font</label>
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
              {['Default (DM Sans)', 'OpenDyslexic', 'Atkinson Hyperlegible'].map(f => (
                <button key={f} className="btn btn-ghost" style={{ fontSize: '0.83rem' }}>{f}</button>
              ))}
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            <label style={{ fontSize: '0.88rem', fontWeight: 500, color: 'var(--text-secondary)' }}>Theme</label>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              {['Warm', 'Dark', 'High Contrast'].map(t => (
                <button key={t} className="btn btn-ghost" style={{ fontSize: '0.83rem' }}>{t}</button>
              ))}
            </div>
          </div>
        </motion.div>

        {/* Focus & Timer */}
        <motion.div variants={staggerItem} className="card" style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          <h3 style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--text-primary)' }}>Focus & Timer</h3>
          <p style={{ fontSize: '0.88rem', color: 'var(--text-muted)' }}>
            Timer length, granularity defaults, and more — built in Session 6
          </p>
        </motion.div>

        <motion.p variants={staggerItem} style={{ fontSize: '0.83rem', color: 'var(--text-muted)', textAlign: 'center' }}>
          Full settings panel built in Session 6
        </motion.p>
      </motion.div>
    </motion.div>
  )
}
