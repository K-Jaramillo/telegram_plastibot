/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        cork: '#e8e0d5',
        'sticky-yellow': '#fff59d',
        'sticky-yellow-dark': '#f9a825',
        'sticky-green': '#a5d6a7',
        'sticky-green-dark': '#2e7d32',
        'sticky-blue': '#90caf9',
        'sticky-blue-dark': '#1565c0',
      },
    },
  },
  plugins: [],
};
