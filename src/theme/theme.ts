import { createTheme } from '@mui/material/styles';

const theme = createTheme({
  palette: {
    background: {
      default: '#f8fafc', // Premium soft slate background
      paper: '#ffffff',
    },
    primary: {
      main: '#2563eb', // Vibrant Tech Blue (Used for primary actions)
      light: '#60a5fa',
      dark: '#1d4ed8',
      contrastText: '#ffffff',
    },
    secondary: {
      main: '#0f172a', // Deep Slate (Used for menus, dark buttons)
      contrastText: '#ffffff',
    },
    info: {
      main: '#0ea5e9', // Blue strictly for information/context
      light: '#e0f2fe',
    },
    success: {
      main: '#10b981', // Crisp emerald green for passes
      light: '#d1fae5',
    },
    error: {
      main: '#ef4444', // Red strictly for failures/errors
      light: '#fee2e2',
    },
    text: {
      primary: '#1e293b', // Not pure black, much softer on the eyes
      secondary: '#64748b',
    },
  },
  typography: {
    fontFamily: '"Inter", "Helvetica", "Arial", sans-serif',
    h4: { fontWeight: 700, letterSpacing: '-0.02em' },
    h6: { fontWeight: 600, letterSpacing: '-0.01em' },
    button: { textTransform: 'none', fontWeight: 600 }, // Disables the harsh all-caps default
  },
  shape: {
    borderRadius: 12, // Soft, modern rounded corners
  },
  components: {
    MuiPaper: {
      styleOverrides: {
        root: {
          backgroundImage: 'none', // Prevents weird dark mode artifacts
          boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.05), 0 2px 4px -2px rgb(0 0 0 / 0.05)', // Premium soft shadow
        },
      },
    },
    MuiButton: {
      styleOverrides: {
        root: {
          padding: '8px 24px',
          boxShadow: 'none', // Flat, modern buttons
          '&:hover': {
            boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)',
          },
        },
      },
    },
  },
});

export default theme;