"use client";

import React, { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db, storage } from '@/lib/firebase';

const MobileUploadStyles = React.memo(() => (
  <style dangerouslySetInnerHTML={{__html: `
    @import url('https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,500;0,9..144,600&family=IBM+Plex+Sans:wght@400;500;600&display=swap');
    
    :root, .mobile-upload-page {
      --bg: #0f1410; 
      --surface: #171d18; 
      --ink: #f4f3ef;
      --ink-mute: #7a7a72; 
      --accent: #7ab28a; 
      --accent-ink: #4a7c59;
      --line: rgba(255,255,255,0.08);
      --rose: #d88a90;
    }
    
    .mobile-upload-page {
      background: var(--bg); 
      color: var(--ink);
      font-family: 'IBM Plex Sans', system-ui, -apple-system, sans-serif;
      min-height: 100vh; 
      display: flex; 
      flex-direction: column;
      align-items: center; 
      justify-content: center; 
      padding: 24px;
      text-align: center;
      background: radial-gradient(ellipse at 50% 0%, rgba(122,178,138,0.15) 0%, transparent 70%), var(--bg);
    }
    
    .upload-card {
      background: var(--surface); 
      border: 1px solid var(--line);
      border-radius: 24px; 
      padding: 40px 24px; 
      width: 100%; 
      max-width: 400px;
      box-shadow: 0 24px 48px rgba(0,0,0,0.4);
      animation: slideUp 0.4s cubic-bezier(0.2, 0.6, 0.2, 1);
    }

    @keyframes slideUp {
      from { opacity: 0; transform: translateY(20px); }
      to { opacity: 1; transform: translateY(0); }
    }

    .icon-circle {
      width: 72px; 
      height: 72px; 
      border-radius: 50%;
      background: rgba(122,178,138,0.15); 
      color: var(--accent);
      display: flex; 
      align-items: center; 
      justify-content: center;
      margin: 0 auto 24px;
    }

    .title { 
      font-family: 'Fraunces', serif;
      font-size: 28px; 
      font-weight: 500; 
      margin: 0 0 12px; 
      letter-spacing: -0.02em; 
    }
    
    .title em {
      font-style: italic;
      color: var(--accent);
    }

    .sub { 
      font-size: 15px; 
      color: var(--ink-mute); 
      margin: 0 0 32px; 
      line-height: 1.5; 
    }

    .upload-btn {
      display: flex; 
      align-items: center; 
      justify-content: center; 
      gap: 10px;
      width: 100%; 
      height: 60px; 
      background: var(--accent); 
      color: #0f1410;
      border-radius: 16px; 
      font-size: 17px; 
      font-weight: 600; 
      cursor: pointer;
      border: none; 
      position: relative;
      overflow: hidden;
      transition: all 0.2s;
    }

    .upload-btn:active { 
      transform: scale(0.97); 
    }

    .upload-btn input {
      position: absolute; 
      inset: 0; 
      opacity: 0; 
      cursor: pointer;
      width: 100%;
    }

    .success-tick {
      width: 88px; 
      height: 88px; 
      border-radius: 50%;
      background: var(--accent); 
      color: #0f1410;
      display: flex; 
      align-items: center; 
      justify-content: center;
      margin: 0 auto 24px; 
      box-shadow: 0 0 0 12px rgba(122,178,138,0.15);
      animation: pop 0.5s cubic-bezier(0.2, 0.8, 0.3, 1.2);
    }

    @keyframes pop {
      0% { transform: scale(0.5); opacity: 0; }
      100% { transform: scale(1); opacity: 1; }
    }

    .spinner {
      width: 24px;
      height: 24px;
      border: 3px solid rgba(15,20,16,0.2);
      border-top-color: #0f1410;
      border-radius: 50%;
      animation: spin 1s linear infinite;
    }

    @keyframes spin {
      to { transform: rotate(360deg); }
    }
    
    .error-text {
      color: var(--rose);
      font-size: 14px;
      margin-top: 16px;
      font-weight: 500;
    }
  `}} />
));
MobileUploadStyles.displayName = 'MobileUploadStyles';

export default function MobileUploadPage() {
  const params = useParams();
  const token = params?.token as string;
  
  const [status, setStatus] = useState<'idle' | 'uploading' | 'success' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState('');
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !token) return;

    setStatus('uploading');
    setErrorMessage('');

    try {
      // 1. Upload to Firebase Storage
      const fileExtension = file.name.split('.').pop() || 'jpg';
      const storageRef = ref(storage, `mobile_evidence/${Date.now()}_${Math.random().toString(36).substring(7)}.${fileExtension}`);
      
      await uploadBytes(storageRef, file);
      
      // 2. Get the public download URL
      const downloadUrl = await getDownloadURL(storageRef);

      // 3. Write it to the specific token document so the Desktop listener triggers
      await setDoc(doc(db, 'mobileUploads', token), { 
        url: downloadUrl,
        createdAt: serverTimestamp()
      });

      setStatus('success');
    } catch (err) {
      console.error("Upload failed:", err);
      setStatus('error');
      setErrorMessage("Failed to upload file. Please try again.");
    }
  };

  if (!mounted) return null;

  return (
    <div className="mobile-upload-page">
      <MobileUploadStyles />
      
      <div className="upload-card">
        {status === 'idle' || status === 'error' ? (
          <>
            <div className="icon-circle">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
                <circle cx="8.5" cy="8.5" r="1.5"/>
                <polyline points="21 15 16 10 5 21"/>
              </svg>
            </div>
            <h1 className="title">Upload <em>Evidence</em></h1>
            <p className="sub">Take a photo, record a video, or choose from your library to send to your desktop.</p>
            
            <button className="upload-btn">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                <polyline points="17 8 12 3 7 8"/>
                <line x1="12" y1="3" x2="12" y2="15"/>
              </svg>
              Select Media
              {/* Accept both images and videos. The phone will offer Camera or Library options */}
              <input 
                type="file" 
                accept="image/*,video/*" 
                onChange={handleFileChange} 
              />
            </button>
            {status === 'error' && <div className="error-text">{errorMessage}</div>}
          </>
        ) : status === 'uploading' ? (
          <>
            <div className="icon-circle" style={{ background: 'transparent' }}>
              <div className="spinner"></div>
            </div>
            <h1 className="title">Uploading...</h1>
            <p className="sub">Sending your file securely to the desktop. Please don't close this page.</p>
          </>
        ) : (
          <>
            <div className="success-tick">
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round">
                <polyline points="20 6 9 17 4 12"/>
              </svg>
            </div>
            <h1 className="title">Sent <em>Successfully!</em></h1>
            <p className="sub">Your evidence is now attached to the test step. You can close this tab on your phone.</p>
          </>
        )}
      </div>
    </div>
  );
}