import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/modules/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        cream: {
          50: '#fdf7ed',
          100: '#f9efd9',
          200: '#f1dfba',
          300: '#e4c999',
          400: '#d2af75',
          500: '#bb8f50',
          600: '#9b7038',
          700: '#7b542a',
          800: '#53371c',
          900: '#2f2112',
        },
        cocoa: {
          50: '#f6f0e8',
          100: '#e8ddcf',
          200: '#d2c0a8',
          300: '#baa486',
          400: '#9d8769',
          500: '#7f6b50',
          600: '#65543f',
          700: '#4f4233',
          800: '#3a3126',
          900: '#241f19',
        },
        charcoal: {
          900: '#211c19',
          800: '#2d2621',
          700: '#3a312b',
          600: '#4f453d',
          500: '#655a50',
          400: '#8b7c6f',
          300: '#b3a699',
          200: '#d6cbbc',
          100: '#ede0d1',
          50: '#f7efe3',
        },
        accent: {
          200: '#ffe9b9',
          300: '#ffd27a',
          400: '#ffc04d',
          500: '#f5b13d',
          600: '#d08a1d',
        },
        slate: {
          50: '#fbf6ed',
          100: '#f6ebd8',
          200: '#edd9bc',
          300: '#e0c3a0',
          400: '#cfad86',
          500: '#b18d6a',
          600: '#8f6d52',
          700: '#6f5341',
          800: '#4c372f',
          900: '#2f231f',
          950: '#1f1612',
        },
      },
      backgroundImage: {
        'gradient-radial': 'radial-gradient(var(--tw-gradient-stops))',
        'gradient-conic': 'conic-gradient(from 180deg at 50% 50%, var(--tw-gradient-stops))',
      },
    },
  },
  plugins: [],
};

export default config;
