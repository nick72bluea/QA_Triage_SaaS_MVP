"use client";

import React, { useState, useEffect } from 'react';

export default function TesterPage() {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) return null;

  return (
    <div style={{ 
      padding: '40px', 
      fontFamily: 'sans-serif', 
      display: 'flex', 
      flexDirection: 'column', 
      alignItems: 'center', 
      justifyContent: 'center',
      minHeight: '80vh'
    }}>
      <h1>Tester Dashboard</h1>
      <p style={{ color: '#555' }}>Welcome to the testing portal.</p>
      {/* You can add your actual tester logic here */}
    </div>
  );
}