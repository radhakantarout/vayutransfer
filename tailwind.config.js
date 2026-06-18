/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        bg:           'rgb(var(--bg)           / <alpha-value>)',
        card:         'rgb(var(--card)         / <alpha-value>)',
        nav:          'rgb(var(--nav)          / <alpha-value>)',
        border:       'rgb(var(--border)       / <alpha-value>)',
        accent:       'rgb(var(--accent)       / <alpha-value>)',
        success:      'rgb(var(--success)      / <alpha-value>)',
        danger:       'rgb(var(--danger)       / <alpha-value>)',
        'text-primary':'rgb(var(--text)        / <alpha-value>)',
        muted:        'rgb(var(--muted)        / <alpha-value>)',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
