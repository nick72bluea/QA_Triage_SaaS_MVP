"use client";

import React from 'react';
import { ThemeProvider as MUIThemeProvider, CssBaseline } from '@mui/material';
import theme from '@/theme/theme';

export default function ThemeProvider({ children }: { children: React.ReactNode }) {
  return (
    <MUIThemeProvider theme={theme}>
      {/* CssBaseline kicks off an elegant, consistent, and simple baseline to build upon. */}
      <CssBaseline />
      {children}
    </MUIThemeProvider>
  );
}