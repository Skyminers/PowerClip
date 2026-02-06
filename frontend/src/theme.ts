// Theme colors - Centralized color definitions
export const theme = {
  colors: {
    bg: '#1e1e2e',
    bgSecondary: '#29293f',
    bgHover: '#3a3a4f',
    text: '#cdd6f4',
    textMuted: '#6c7086',
    accent: '#89b4fa',
    border: '#45475a',
    selected: '#585b70',
  },
} as const

// Type exports for convenience
export type ThemeColors = typeof theme.colors
