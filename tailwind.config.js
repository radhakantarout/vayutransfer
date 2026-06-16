/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        bg: '#0B0F1A',
        card: '#131929',
        border: '#1E2D45',
        accent: '#00C6FF',
        success: '#00E5A0',
        danger: '#FF5370',
        'text-primary': '#E0EAF8',
        muted: '#5A7090',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
