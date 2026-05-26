// src/app/tester/layout.tsx
import React from 'react';

// Disables the global PM Dashboard wrapper for the Tester Execution Engine
// so it can render perfectly in full-screen standalone mode.
export default function TesterLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}