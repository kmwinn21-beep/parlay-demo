/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        'procare-dark-blue': '#0B3C62',
        'procare-bright-blue': '#1B76BC',
        'procare-beige': '#E7DED9',
        'procare-gold': '#FFCB3F',
      },
      fontFamily: {
        serif: ['"DM Serif Display"', 'serif'],
        sans: ['Poppins', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
