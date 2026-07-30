/** MillionaireMind design tokens.
 *  Dark-first, Bloomberg-terminal density with modern SaaS restraint.
 *  One high-energy accent for "money up", one restrained red for risk.
 */
/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // canvas: deep navy fading to near-black
        void:    '#05070d',
        abyss:   '#080b14',
        panel:   '#0d1220',
        panel2:  '#111828',
        hair:    '#1b2438',   // hairline borders
        hair2:   '#26314a',
        // type
        ink:     '#e8edf7',
        muted:   '#8593ad',
        faint:   '#4d5a75',
        // money up — the single high-energy accent
        up:      '#00e59b',
        upDim:   '#0b8f66',
        upGlow:  'rgba(0,229,155,0.16)',
        // risk / loss — restrained, never neon
        down:    '#e0526a',
        downDim: '#8f2e3e',
        // secondary signals
        amber:   '#f5a524',
        cyan:    '#3ea8ff',
        violet:  '#8b7cf8',
      },
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
      fontSize: {
        '2xs': ['0.6875rem', { lineHeight: '1rem' }],
      },
      boxShadow: {
        node: '0 0 0 1px rgba(0,229,155,0.35), 0 0 28px -4px rgba(0,229,155,0.35)',
        panel: '0 1px 0 0 rgba(255,255,255,0.03) inset, 0 8px 32px -12px rgba(0,0,0,0.8)',
        kill: '0 0 0 1px rgba(224,82,106,0.5), 0 0 40px -6px rgba(224,82,106,0.45)',
      },
      keyframes: {
        pulseRing: {
          '0%,100%': { opacity: '0.35', transform: 'scale(1)' },
          '50%':     { opacity: '0.9',  transform: 'scale(1.06)' },
        },
        ticker: { from: { opacity: '0', transform: 'translateY(4px)' }, to: { opacity: '1', transform: 'none' } },
        sheen: { from: { backgroundPosition: '-200% 0' }, to: { backgroundPosition: '200% 0' } },
      },
      animation: {
        pulseRing: 'pulseRing 2.4s ease-in-out infinite',
        ticker: 'ticker 240ms ease-out',
        sheen: 'sheen 2.5s linear infinite',
      },
    },
  },
  plugins: [],
}
