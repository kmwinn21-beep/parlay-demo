/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './lib/**/*.{js,ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        // CSS variable channels — supports opacity modifiers (e.g. bg-procare-bright-blue/50)
        'procare-dark-blue':   'rgb(var(--procare-dark-blue-rgb)   / <alpha-value>)',
        'procare-bright-blue': 'rgb(var(--procare-bright-blue-rgb) / <alpha-value>)',
        'procare-beige':       'rgb(var(--procare-beige-rgb)       / <alpha-value>)',
        'procare-gold':        'rgb(var(--procare-gold-rgb)        / <alpha-value>)',
      },
      fontFamily: {
        serif: ['"DM Serif Display"', 'serif'],
        sans:  ['Poppins', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
