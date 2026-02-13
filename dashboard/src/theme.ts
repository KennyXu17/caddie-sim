import { createTheme } from '@mui/material/styles';

export const dashboardTheme = createTheme({
  palette: {
    mode: 'dark',
    primary: { main: '#00d4aa' },
    secondary: { main: '#7c4dff' },
    background: {
      default: '#0d1117',
      paper: '#161b22',
    },
    text: {
      primary: '#e6edf3',
      secondary: '#8b949e',
    },
    success: { main: '#3fb950' },
    warning: { main: '#d29922' },
    error: { main: '#f85149' },
    info: { main: '#58a6ff' },
  },
  typography: {
    fontFamily: '"Inter", "JetBrains Mono", sans-serif',
    h6: { fontFamily: '"JetBrains Mono", monospace', fontWeight: 600 },
    body2: { fontFamily: '"JetBrains Mono", monospace' },
  },
  shape: { borderRadius: 8 },
  components: {
    MuiPaper: {
      styleOverrides: {
        root: {
          backgroundImage: 'none',
          border: '1px solid #30363d',
        },
      },
    },
    MuiCard: {
      styleOverrides: {
        root: {
          border: '1px solid #30363d',
        },
      },
    },
  },
});
