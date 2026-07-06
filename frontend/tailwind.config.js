module.exports = {
  content: ['./src/**/*.{js,jsx,ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        heading: ['Nunito', 'sans-serif'],
        sans: ['Nunito Sans', 'sans-serif'],
      },
      colors: {
        primary: {
          DEFAULT: '#0B3D5C',
          light: '#155A85',
          dark: '#082B42',
        },
        secondary: {
          DEFAULT: '#0EA5A0',
          light: '#3FC5C0',
          dark: '#0B7A76',
        },
        accent: {
          DEFAULT: '#E8543F',
          light: '#F17862',
          dark: '#C43D2A',
        },
        warning: {
          DEFAULT: '#F5B942',
          light: '#F9CD73',
        },
        background: {
          DEFAULT: '#F7F5F2',
          card: '#FFFFFF',
        },
        text: {
          primary: '#1E2A38',
          secondary: '#5C6B7A',
          muted: '#9AA5B1',
        },
      },
      keyframes: {
        'fade-in': {
          '0%': { opacity: '0', transform: 'translateY(12px) scale(0.97)' },
          '100%': { opacity: '1', transform: 'translateY(0) scale(1)' },
        },
        'slide-up': {
          '0%': { opacity: '0', transform: 'translateY(16px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
      },
      animation: {
        'fade-in': 'fade-in 0.25s ease-out both',
        'slide-up': 'slide-up 0.3s ease-out both',
      },
    },
  },
  plugins: [],
};
