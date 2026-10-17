export const a11yTokens = {
  highContrast: {
    border: '2px solid #000000',
    borderDark: '2px solid #ffffff',
    textPrimary: '#000000',
    textPrimaryDark: '#ffffff',
    focusOutline: '3px solid #2563eb',
    focusOffset: '2px',
  },
  tapTargets: {
    minimumSize: '44px',
    minimumSpacing: '8px',
  },
  typography: {
    minimumReadableScale: '14px',
    largeTextScale: '18px',
    lineHeightReadable: '1.6',
  },
} as const;

export type A11yTokens = typeof a11yTokens;
