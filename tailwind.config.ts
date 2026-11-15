import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./lib/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        // SkyBlink (viewer) palette
        sky: {
          bg: '#0a0d14',
          surface: '#131824',
          surface2: '#1a2030',
          ink: '#e9edf3',
          inkDim: '#8b96a8',
          accent: '#5ab9fc',
          accentDim: '#2a7ab5',
          border: '#1f2a3c',
        },
        // Blink Battle palette
        battle: {
          bg: '#2b2216',
          surface: '#382d1e',
          surface2: '#44382a',
          ink: '#e4e2da',
          inkDim: '#a89880',
          accent: '#bda38b',
          accentDim: '#8c7260',
          border: '#4a3c2c',
        },
      },
      fontFamily: {
        manrope: ['Manrope', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
      borderRadius: {
        DEFAULT: '8px',
        sm: '4px',
        md: '8px',
        lg: '12px',
        xl: '16px',
      },
      backgroundImage: {
        'sky-gradient': 'radial-gradient(ellipse at top, #131824 0%, #0a0d14 70%)',
      },
    },
  },
  plugins: [],
};

export default config;
