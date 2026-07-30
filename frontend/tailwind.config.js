/** MillionaireMind design tokens — v2 "Institutional".
 *
 *  Light-first, Bloomberg-density, buy-side aesthetics. The palette is a trust
 *  palette: slate canvas, pure-white surfaces, navy for authority, emerald for
 *  profit, coral for loss, amber reserved exclusively for "this is not real
 *  money". Nothing neon — a trading desk that glows is a desk nobody can read
 *  for eight hours.
 *
 *  Token names are unchanged from v1 so every screen re-skins in place.
 */
/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // ── canvas & surfaces ────────────────────────────────────────────
        void:    '#F8FAFC',   // app background (very light slate)
        abyss:   '#FFFFFF',   // top bar / chrome
        panel:   '#FFFFFF',   // card surface
        panel2:  '#F9FAFB',   // zebra stripe / row hover
        hair:    '#E2E8F0',   // hairline borders
        hair2:   '#CBD5E1',   // stronger dividers
        // ── typography ───────────────────────────────────────────────────
        ink:     '#0F172A',   // dark navy — headers and key numbers
        body:    '#1E293B',   // primary text
        muted:   '#64748B',   // secondary text
        faint:   '#6B7280',   // micro-copy ("as of T+1 close")
        // ── directional ──────────────────────────────────────────────────
        up:      '#10B981',   // emerald — profit
        upDim:   '#047857',
        upGlow:  'rgba(16,185,129,0.10)',
        down:    '#EF4444',   // coral — loss
        downDim: '#B91C1C',
        // ── signals ──────────────────────────────────────────────────────
        amber:   '#F59E0B',   // paper mode / high volatility
        cyan:    '#2563EB',   // primary action blue
        violet:  '#6366F1',
        navy:    '#0F172A',
      },
      fontFamily: {
        sans: ['Inter', '"SF Pro Display"', '-apple-system', 'BlinkMacSystemFont',
               'Roboto', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', '"DIN Alternate"', 'ui-monospace',
               'SFMono-Regular', 'Menlo', 'monospace'],
      },
      fontSize: {
        '2xs': ['0.6875rem', { lineHeight: '1rem' }],
      },
      spacing: {
        // the two padding steps the whole layout is built from
        gutter: '1.5rem',   // 24px
        gutter2: '1rem',    // 16px
      },
      borderRadius: {
        card: '8px',
      },
      boxShadow: {
        // the single institutional card elevation
        panel: '0 4px 6px -1px rgba(0,0,0,0.10), 0 2px 4px -2px rgba(0,0,0,0.06)',
        lift:  '0 10px 15px -3px rgba(0,0,0,0.10), 0 4px 6px -4px rgba(0,0,0,0.10)',
        node:  '0 0 0 1px rgba(16,185,129,0.45), 0 6px 16px -6px rgba(16,185,129,0.35)',
        kill:  '0 0 0 1px rgba(239,68,68,0.45), 0 6px 16px -6px rgba(239,68,68,0.30)',
        tape:  '0 1px 0 0 #E2E8F0',
      },
      keyframes: {
        pulseRing: {
          '0%,100%': { opacity: '0.45', transform: 'scale(1)' },
          '50%':     { opacity: '1',    transform: 'scale(1.06)' },
        },
        ticker: { from: { opacity: '0', transform: 'translateY(4px)' }, to: { opacity: '1', transform: 'none' } },
        sheen: { from: { backgroundPosition: '-200% 0' }, to: { backgroundPosition: '200% 0' } },
        livedot: {
          '0%,100%': { opacity: '1', boxShadow: '0 0 0 0 rgba(16,185,129,0.55)' },
          '70%':     { opacity: '1', boxShadow: '0 0 0 5px rgba(16,185,129,0)' },
        },
      },
      animation: {
        pulseRing: 'pulseRing 2.4s ease-in-out infinite',
        ticker: 'ticker 240ms ease-out',
        sheen: 'sheen 2.5s linear infinite',
        livedot: 'livedot 2s ease-out infinite',
      },
    },
  },
  plugins: [],
}
