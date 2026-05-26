// src/app/home/layout.tsx
import React from 'react';

// We disable the global DashboardLayout wrapper for the Home route
// because the new bespoke Home page has its own integrated dark sidebar!
export default function HomeLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}