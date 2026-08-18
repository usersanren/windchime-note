/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        paper: {
          warm: '#FDF6E3',
          pink: '#FFF0F5',
          green: '#F0FFF4',
          kraft: '#DEB887',
        },
        ink: '#4A3728',
        rope: '#8B6F47',
        ropeLight: '#A0826D',
        stamp: '#C0392B',
      },
      fontFamily: {
        hand: ['"Zhi Mang Xing"', 'STXingkai', '华文行楷', 'KaiTi', '楷体', 'STKaiti', 'SimSun', 'cursive'],
      },
      boxShadow: {
        note: '2px 4px 12px rgba(0,0,0,0.08)',
        noteHover: '3px 8px 20px rgba(0,0,0,0.14)',
      },
    },
  },
  plugins: [],
};
