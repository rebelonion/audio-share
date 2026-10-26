/** @type {import('tailwindcss').Config} */
export default {
  future: {
    hoverOnlyWhenSupported: true,
  },
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        warning: {
          DEFAULT: 'rgb(var(--warning-rgb) / <alpha-value>)',
          strong: 'rgb(var(--warning-strong-rgb) / <alpha-value>)',
          hover: 'rgb(var(--warning-hover-rgb) / <alpha-value>)',
        },
      },
      fontFamily: {
        display: ['"Cormorant Garamond"', 'Georgia', 'serif'],
        sans: ['Jost', 'system-ui', 'sans-serif'],
        mono: ['"IBM Plex Mono"', 'ui-monospace', 'monospace'],
      },
      transitionTimingFunction: {
        DEFAULT: 'var(--ease-out)',
        out: 'var(--ease-out)',
        'in-out': 'var(--ease-in-out)',
      },
    },
  },
  plugins: [],
}
