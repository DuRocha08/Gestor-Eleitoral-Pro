/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['"IBM Plex Sans"', 'system-ui', 'sans-serif'],
        mono: ['"IBM Plex Mono"', 'ui-monospace', 'monospace'],
      },
      colors: {
        navy: {
          50: '#f4f6f9',
          100: '#e8ecf2',
          200: '#c5d0e0',
          300: '#9aadc4',
          400: '#6b84a3',
          500: '#4a6485',
          600: '#354d6b',
          700: '#283a54',
          800: '#1c2a42',
          900: '#121d32',
          950: '#0a1020',
        },
        platinum: {
          50: '#fafbfc',
          100: '#f4f5f7',
          200: '#e8eaed',
          300: '#d1d5db',
        },
        olive: {
          50: '#f6f7f4',
          100: '#e8ebe3',
          500: '#5c6b52',
          600: '#4a5d3f',
          700: '#3d4f34',
        },
        primary: {
          50: '#f4f6f9',
          100: '#e8ecf2',
          200: '#c5d0e0',
          500: '#4a6485',
          600: '#354d6b',
          700: '#283a54',
          800: '#1c2a42',
          900: '#121d32',
          950: '#0a1020',
        },
      },
      boxShadow: {
        executive: '0 1px 2px 0 rgb(18 29 50 / 0.06), 0 1px 3px 0 rgb(18 29 50 / 0.08)',
      },
    },
  },
  plugins: [],
};
