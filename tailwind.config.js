import tailwindcssAnimate from 'tailwindcss-animate';

/** @type {import('tailwindcss').Config} */
export default {
  darkMode: ['class'],
  content: ['./index.html', './src/**/*.{js,jsx,ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        display: ['var(--font-display)'],
        sans: ['var(--font-display)'],
        mono: ['var(--font-mono)'],
      },
      fontSize: {
        xs: ['11px', '1.45'],
        sm: ['13px', '1.5'],
        base: ['15px', '1.5'],
        lg: ['17px', '1.35'],
        xl: ['20px', '1.3'],
        '2xl': ['24px', '1.25'],
        '3xl': ['30px', '1.15'],
        '4xl': ['36px', '1.1'],
      },
      colors: {
        paper: { DEFAULT: 'var(--paper)', 2: 'var(--paper-2)' },
        surface: 'var(--surface)',
        cream: { DEFAULT: '#F0EFE9', hover: '#E8E7E1', active: '#E8E7E1' },
        ink: {
          DEFAULT: 'var(--ink)',
          soft: '#787774',
          faint: '#AEACA8',
          wash: 'rgba(26,26,26,0.05)',
        },
        line: {
          DEFAULT: 'var(--rule)',
          strong: 'var(--rule-strong)',
          subtle: 'var(--rule-soft)',
        },
        pos: { DEFAULT: 'var(--pos)', bg: 'var(--pos-bg)' },
        neg: { DEFAULT: 'var(--neg)', bg: 'var(--neg-bg)' },
        warn: { DEFAULT: 'var(--warn)', bg: 'var(--warn-bg)' },
        note: { DEFAULT: 'var(--note)', bg: 'var(--note-bg)' },
        gold: { DEFAULT: 'var(--gold)', bg: 'var(--gold-bg)' },
        alert: '#C0392B',
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        card: { DEFAULT: 'hsl(var(--card))', foreground: 'hsl(var(--card-foreground))' },
        popover: { DEFAULT: 'hsl(var(--popover))', foreground: 'hsl(var(--popover-foreground))' },
        primary: { DEFAULT: 'hsl(var(--primary))', foreground: 'hsl(var(--primary-foreground))' },
        secondary: { DEFAULT: 'hsl(var(--secondary))', foreground: 'hsl(var(--secondary-foreground))' },
        muted: { DEFAULT: 'hsl(var(--muted))', foreground: 'hsl(var(--muted-foreground))' },
        accent: { DEFAULT: 'hsl(var(--accent))', foreground: 'hsl(var(--accent-foreground))' },
        destructive: { DEFAULT: 'hsl(var(--destructive))', foreground: 'hsl(var(--destructive-foreground))' },
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
      },
      borderRadius: {
        none: '0', sm: '4px', DEFAULT: '6px', md: '6px', lg: '10px', xl: '14px', '2xl': '16px', '3xl': '20px', full: '9999px',
      },
      boxShadow: {
        none: 'none',
        xs: '0 1px 2px rgba(26,26,26,0.04)',
        sm: '0 1px 3px rgba(26,26,26,0.05)',
        md: '0 6px 20px rgba(26,26,26,0.06)',
        lg: '0 16px 44px rgba(26,26,26,0.10)',
        xl: '0 28px 70px rgba(26,26,26,0.14)',
      },
      keyframes: {
        'accordion-down': { from: { height: '0' }, to: { height: 'var(--radix-accordion-content-height)' } },
        'accordion-up': { from: { height: 'var(--radix-accordion-content-height)' }, to: { height: '0' } },
      },
      animation: {
        'accordion-down': 'accordion-down 0.2s ease-out',
        'accordion-up': 'accordion-up 0.2s ease-out',
      },
    },
  },
  plugins: [tailwindcssAnimate],
};
