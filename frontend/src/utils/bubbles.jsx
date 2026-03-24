/**
 * Pebble bubble rendering utilities.
 *
 * splitIntoBubbles — splits GPT text on natural paragraph breaks (double newlines).
 *   Only splits where GPT-4o itself put blank lines. Never splits on character
 *   count, sentence count, or punctuation — only on actual paragraph breaks.
 *
 * renderMarkdown — renders inline markdown (bold, italic, inline code, bullet
 *   lists, numbered lists) as React JSX. Only renders what GPT-4o sent — never
 *   adds formatting that wasn't there.
 */

import React from 'react'

/** Render one text string with **bold**, *italic*, `code` inline. */
function renderInline(text) {
  const parts = []
  // Order matters: **bold** must be checked before *italic*
  const rx = /\*\*(.+?)\*\*|\*(.+?)\*|`(.+?)`/g
  let last = 0, key = 0, m

  while ((m = rx.exec(text)) !== null) {
    if (m.index > last) parts.push(text.slice(last, m.index))

    if (m[1] !== undefined) {
      // **bold**
      parts.push(<strong key={key++} style={{ fontWeight: 600 }}>{m[1]}</strong>)
    } else if (m[2] !== undefined) {
      // *italic*
      parts.push(<em key={key++}>{m[2]}</em>)
    } else {
      // `code`
      parts.push(
        <code key={key++} style={{
          fontFamily: 'ui-monospace, "SF Mono", monospace',
          fontSize: '0.875em',
          background: 'rgba(200,148,80,0.12)',
          borderRadius: 3,
          padding: '1px 4px',
        }}>
          {m[3]}
        </code>
      )
    }
    last = m.index + m[0].length
  }

  if (last < text.length) parts.push(text.slice(last))
  // If the whole result is a single plain string, return it directly (no span wrapper)
  if (parts.length === 1 && typeof parts[0] === 'string') return parts[0]
  return parts
}

/**
 * Render a text chunk as JSX with markdown support.
 * Handles: bullet lists, numbered lists, bold, italic, inline code.
 * Does NOT add formatting — only renders what's already in the text.
 */
export function renderMarkdown(text) {
  if (!text) return null

  const lines = text.split('\n')
  const out   = []
  let i = 0

  while (i < lines.length) {
    const line = lines[i]

    // Bullet list — consume consecutive bullet lines as a group
    if (/^[-*]\s+/.test(line)) {
      const items = []
      while (i < lines.length && /^[-*]\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^[-*]\s+/, ''))
        i++
      }
      out.push(
        <ul key={`ul${i}`} style={{
          margin: '0.15rem 0',
          paddingLeft: '1.15rem',
          listStyleType: 'disc',
        }}>
          {items.map((item, j) => (
            <li key={j} style={{ marginBottom: '0.15rem', lineHeight: 1.65 }}>
              {renderInline(item)}
            </li>
          ))}
        </ul>
      )
      continue
    }

    // Numbered list — consume consecutive numbered lines as a group
    if (/^\d+\.\s+/.test(line)) {
      const items = []
      while (i < lines.length && /^\d+\.\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\d+\.\s+/, ''))
        i++
      }
      out.push(
        <ol key={`ol${i}`} style={{
          margin: '0.15rem 0',
          paddingLeft: '1.15rem',
        }}>
          {items.map((item, j) => (
            <li key={j} style={{ marginBottom: '0.15rem', lineHeight: 1.65 }}>
              {renderInline(item)}
            </li>
          ))}
        </ol>
      )
      continue
    }

    // Non-empty line — render with inline markdown
    if (line.trim()) {
      out.push(
        <span key={i} style={{ display: 'block', lineHeight: 1.7 }}>
          {renderInline(line)}
        </span>
      )
    }

    i++
  }

  return out.length > 0 ? out : text
}

/**
 * Split a GPT response into natural thought-chunks for multi-bubble rendering.
 *
 * Splits ONLY on paragraph breaks (double newlines) that GPT-4o itself put there.
 * Also treats [SPLIT] markers as paragraph breaks.
 * Short single-thought responses stay as one bubble — nothing is force-split.
 */
export function splitIntoBubbles(text) {
  if (!text) return []
  return text
    .replace(/\[SPLIT\]/gi, '\n\n')   // [SPLIT] markers count as paragraph breaks
    .split(/\n\n+/)                   // split on actual blank lines only
    .map(s => s.trim())
    .filter(Boolean)
}
