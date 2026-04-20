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
        // CSS variable channels — supports opacity modifiers (e.g. bg-brand-secondary/50)
        'brand-primary':   'rgb(var(--brand-primary-rgb)   / <alpha-value>)',
        'brand-secondary': 'rgb(var(--brand-secondary-rgb) / <alpha-value>)',
        'brand-accent':    'rgb(var(--brand-accent-rgb)    / <alpha-value>)',
        'brand-highlight': 'rgb(var(--brand-highlight-rgb) / <alpha-value>)',
      },
      fontFamily: {
        serif: ['var(--font-heading)', 'serif'],
        sans:  ['var(--font-body)', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
