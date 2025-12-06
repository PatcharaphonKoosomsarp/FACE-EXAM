export const tokens = {
  colors: {
    primary: {
      DEFAULT: '#E35205', // KMUTNB Orange
      hover: '#c44604',
      light: '#fff1eb',
    },
    secondary: {
      DEFAULT: '#1F2937', // Dark Gray
      light: '#374151',
    },
    success: {
      DEFAULT: '#10B981',
      light: '#D1FAE5',
    },
    error: {
      DEFAULT: '#EF4444',
      light: '#FEE2E2',
    },
    warning: {
      DEFAULT: '#F59E0B',
      light: '#FEF3C7',
    },
    background: {
      main: '#F3F4F6',
      card: '#FFFFFF',
    },
    text: {
      primary: '#111827',
      secondary: '#6B7280',
      light: '#FFFFFF',
    }
  },
  spacing: {
    container: '1280px',
    header: '64px',
  },
  borderRadius: {
    card: '1rem',
    button: '0.5rem',
  },
  typography: {
    fontFamily: "'Sarabun', sans-serif",
  }
} as const;
