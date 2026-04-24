import { createTheme } from '@mui/material/styles';

export const theme = createTheme({
  palette: {
    mode: 'light',
    primary: {
      main: '#1e40af',
      light: '#3b82f6',
      dark: '#1e3a8a',
      contrastText: '#ffffff',
    },
    secondary: { main: '#0891b2', light: '#22d3ee', dark: '#155e75' },
    success: { main: '#16a34a' },
    warning: { main: '#ea580c' },
    error: { main: '#dc2626' },
    background: { default: '#f8fafc', paper: '#ffffff' },
    text: { primary: '#0f172a', secondary: '#475569' },
    divider: 'rgba(15, 23, 42, 0.08)',
  },
  shape: { borderRadius: 8 },
  typography: {
    fontFamily: 'Inter, -apple-system, "Segoe UI", Roboto, sans-serif',
    h1: { fontSize: '2.25rem', fontWeight: 700, letterSpacing: '-0.02em' },
    h2: { fontSize: '1.875rem', fontWeight: 700, letterSpacing: '-0.01em' },
    h3: { fontSize: '1.5rem', fontWeight: 600 },
    h4: { fontSize: '1.25rem', fontWeight: 600 },
    body1: { fontSize: '0.9375rem', lineHeight: 1.55 },
    body2: { fontSize: '0.8125rem', lineHeight: 1.55 },
    button: { textTransform: 'none', fontWeight: 600 },
  },
  components: {
    MuiButton: {
      defaultProps: { disableElevation: true },
      styleOverrides: {
        root: { borderRadius: 8, paddingInline: 18, paddingBlock: 8 },
      },
    },
    MuiPaper: {
      defaultProps: { elevation: 0 },
      styleOverrides: {
        root: { border: '1px solid rgba(15, 23, 42, 0.08)' },
      },
    },
    MuiTextField: {
      defaultProps: { size: 'small', fullWidth: true },
    },
    MuiCard: {
      defaultProps: { elevation: 0, variant: 'outlined' },
    },
  },
});
