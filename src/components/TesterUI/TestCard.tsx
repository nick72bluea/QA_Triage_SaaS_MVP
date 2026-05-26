"use client";

import React, { useState, useEffect } from 'react';
import { 
  Card, Typography, Box, Button, TextField, CircularProgress, 
  Collapse, Chip, Dialog, DialogTitle, DialogContent, IconButton 
} from '@mui/material';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import CancelIcon from '@mui/icons-material/Cancel';
import CloudUploadIcon from '@mui/icons-material/CloudUpload';
import AttachFileIcon from '@mui/icons-material/AttachFile';
import QrCodeScannerIcon from '@mui/icons-material/QrCodeScanner';
import CloseIcon from '@mui/icons-material/Close';
import LinkIcon from '@mui/icons-material/Link';
import PlayCircleIcon from '@mui/icons-material/PlayCircle';
import InsertDriveFileIcon from '@mui/icons-material/InsertDriveFile';
import EditIcon from '@mui/icons-material/Edit';
import { QRCodeSVG } from 'qrcode.react';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { doc, onSnapshot, deleteDoc } from 'firebase/firestore';
import { db, storage } from '@/lib/firebase';
import { TestStep, TestResult } from '@/types';

interface TestCardProps {
  step: TestStep;
  index: number;
  result?: TestResult;
  onUpdateResult: (stepId: string, status: 'Passed' | 'Failed', notes?: string, evidenceUrls?: string[]) => void;
}

const getMediaType = (url: string) => {
  const lowerUrl = url.toLowerCase();
  if (lowerUrl.match(/\.(mp4|webm|ogg|mov)(?=\?|$)/i)) return 'video';
  if (lowerUrl.match(/\.(pdf)(?=\?|$)/i)) return 'pdf';
  return 'image'; 
};

export default function TestCard({ step, index, result, onUpdateResult }: TestCardProps) {
  const [isUploading, setIsUploading] = useState(false);
  const [activeMedia, setActiveMedia] = useState<string | null>(step.mediaUrls && step.mediaUrls.length > 0 ? step.mediaUrls[0] : null);
  
  // NEW: Focus Mode State
  const [isPassedCollapsed, setIsPassedCollapsed] = useState(result?.status === 'Passed');

  const [qrModalOpen, setQrModalOpen] = useState(false);
  const [uploadToken, setUploadToken] = useState('');
  const [uploadUrl, setUploadUrl] = useState('');

  const handleStatusChange = (status: 'Passed' | 'Failed') => {
    onUpdateResult(step.id, status, result?.notes || "", result?.evidenceUrls || []);
    
    // Auto-Collapse and Smooth Scroll Logic
    if (status === 'Passed') {
      setIsPassedCollapsed(true);
    }
    
    setTimeout(() => {
      const nextCard = document.getElementById(`test-card-${index + 1}`);
      if (nextCard) {
        nextCard.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }, 400);
  };

  const handleNotesChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!result?.status) return;
    onUpdateResult(step.id, result.status, e.target.value, result?.evidenceUrls || []);
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0 || !result?.status) return;
    setIsUploading(true);
    try {
      const newUrls: string[] = [];
      for (const file of files) {
        const uniqueFileName = `evidence/${Date.now()}_${file.name}`;
        const storageRef = ref(storage, uniqueFileName);
        await uploadBytes(storageRef, file);
        newUrls.push(await getDownloadURL(storageRef));
      }
      onUpdateResult(step.id, result.status, result.notes || "", [...(result.evidenceUrls || []), ...newUrls]);
    } catch (error) { alert("Failed to upload files."); } 
    finally { setIsUploading(false); }
  };

  const openQrScanner = () => {
    const token = Math.random().toString(36).substring(2, 15);
    setUploadToken(token); setUploadUrl(`${window.location.origin}/mobile-upload/${token}`); setQrModalOpen(true);
  };

  useEffect(() => {
    if (!qrModalOpen || !uploadToken || !result?.status) return;
    const docRef = doc(db, 'mobileUploads', uploadToken);
    const unsubscribe = onSnapshot(docRef, (docSnap) => {
      if (docSnap.exists() && docSnap.data().url) {
        onUpdateResult(step.id, result.status!, result.notes || "", [...(result.evidenceUrls || []), docSnap.data().url]);
        deleteDoc(docRef).catch(console.error); setQrModalOpen(false);
      }
    });
    return () => unsubscribe();
  }, [qrModalOpen, uploadToken, result?.status, result?.evidenceUrls, step.id, onUpdateResult]);

  const isPassed = result?.status === 'Passed';
  const isFailed = result?.status === 'Failed';
  const hasContext = step.area || step.scenario || step.objective || step.preConditions || step.priority || step.testType;
  const hasAdminMedia = step.mediaUrls && step.mediaUrls.length > 0;
  const hasReferenceLinks = step.referenceLinks && step.referenceLinks.length > 0;

  // --- COMPACT VIEW FOR PASSED TESTS ---
  if (isPassed && isPassedCollapsed) {
    return (
      <Card 
        id={`test-card-${index}`} 
        elevation={0} 
        sx={{ 
          p: 2, mb: 3, borderRadius: 3, border: '1px solid #d1fae5', bgcolor: '#f0fdf4',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer',
          transition: 'all 0.2s ease', '&:hover': { boxShadow: '0 4px 12px rgba(16, 185, 129, 0.1)' }
        }}
        onClick={() => setIsPassedCollapsed(false)}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <CheckCircleIcon color="success" />
          <Box>
            <Typography variant="caption" color="success.main" fontWeight="bold">STEP {index + 1} PASSED</Typography>
            <Typography variant="body2" color="text.primary" fontWeight="500" sx={{ mt: -0.5 }}>{step.action}</Typography>
          </Box>
        </Box>
        <Button size="small" variant="text" color="success" startIcon={<EditIcon />}>Edit</Button>
      </Card>
    );
  }

  // --- FULL VIEW ---
  return (
    <>
      <Card id={`test-card-${index}`} elevation={0} sx={{ p: 4, mb: 4, borderRadius: 4, border: '1px solid', borderColor: isPassed ? 'success.light' : isFailed ? 'error.light' : '#e2e8f0', transition: '0.3s', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.05)' }}>
        
        {hasContext && (
          <Box sx={{ mb: 3, p: 2, bgcolor: '#f8fafc', borderRadius: 3, border: '1px dashed #cbd5e1' }}>
            <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mb: (step.preConditions || step.objective) ? 1.5 : 0 }}>
              {step.priority && <Chip label={`Priority: ${step.priority}`} size="small" color={step.priority.toLowerCase().includes('high') ? 'error' : 'info'} />}
              {step.area && <Chip label={`Area: ${step.area}`} size="small" variant="outlined" sx={{ bgcolor: '#fff' }} />}
              {step.scenario && <Chip label={`Scenario: ${step.scenario}`} size="small" variant="outlined" sx={{ bgcolor: '#fff' }} />}
            </Box>
            {(step.objective || step.preConditions) && (
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                {step.objective && <Typography variant="body2" color="text.secondary"><strong>Objective:</strong> {step.objective}</Typography>}
                {step.preConditions && <Typography variant="body2" color="warning.dark"><strong>Pre-conditions:</strong> {step.preConditions}</Typography>}
              </Box>
            )}
          </Box>
        )}

        {hasAdminMedia && activeMedia && (
          <Box sx={{ mb: 4, borderRadius: 3, overflow: 'hidden', border: '1px solid #e2e8f0', bgcolor: '#f8fafc' }}>
            <Box sx={{ width: '100%', height: '350px', display: 'flex', justifyContent: 'center', alignItems: 'center', bgcolor: '#e0f2fe' }}>
              {getMediaType(activeMedia) === 'video' ? <video src={activeMedia} controls style={{ maxWidth: '100%', maxHeight: '100%', borderRadius: '8px' }} /> : getMediaType(activeMedia) === 'pdf' ? <Box sx={{ textAlign: 'center' }}><InsertDriveFileIcon sx={{ fontSize: 60, color: '#38bdf8', mb: 1 }} /><Button variant="outlined" component="a" href={activeMedia} target="_blank">Open PDF</Button></Box> : <img src={activeMedia} alt="Expected Design" style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />}
            </Box>
            {step.mediaUrls!.length > 1 && (
              <Box sx={{ display: 'flex', gap: 1, p: 1.5, bgcolor: '#fff', borderTop: '1px solid #e2e8f0', overflowX: 'auto' }}>
                {step.mediaUrls!.map((url, i) => (
                  <Box key={i} onClick={() => setActiveMedia(url)} sx={{ width: 70, height: 70, flexShrink: 0, cursor: 'pointer', borderRadius: 2, overflow: 'hidden', border: activeMedia === url ? '3px solid #2563eb' : '1px solid #cbd5e1', opacity: activeMedia === url ? 1 : 0.6, display: 'flex', justifyContent: 'center', alignItems: 'center', bgcolor: '#f1f5f9' }}>
                    {getMediaType(url) === 'video' ? <PlayCircleIcon sx={{ color: 'text.secondary', fontSize: 30 }} /> : getMediaType(url) === 'pdf' ? <InsertDriveFileIcon sx={{ color: 'text.secondary', fontSize: 30 }} /> : <img src={url} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />}
                  </Box>
                ))}
              </Box>
            )}
          </Box>
        )}

        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 3 }}>
          <Box sx={{ flex: 1 }}>
            <Typography variant="caption" color="text.secondary" fontWeight="700" letterSpacing="0.05em" gutterBottom>STEP {index + 1}</Typography>
            <Typography variant="h6" sx={{ mt: 0.5, mb: 1, fontWeight: '600' }}>{step.action}</Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}><strong>Expected:</strong> {step.expectedResult}</Typography>

            {hasReferenceLinks && (
              <Box sx={{ mt: 2, mb: 1 }}>
                <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                  {step.referenceLinks?.map((url, i) => <Chip key={`link-${i}`} icon={<LinkIcon />} label={`Reference ${i + 1}`} component="a" href={url} target="_blank" clickable color="primary" variant="outlined" sx={{ bgcolor: '#f8fafc' }} />)}
                </Box>
              </Box>
            )}
          </Box>

          <Box sx={{ display: 'flex', gap: 1.5 }}>
            <Button variant={isPassed ? "contained" : "outlined"} color="success" startIcon={<CheckCircleIcon />} onClick={() => handleStatusChange('Passed')} sx={{ borderRadius: 8, px: 3, fontWeight: 'bold' }}>Pass</Button>
            <Button variant={isFailed ? "contained" : "outlined"} color="error" startIcon={<CancelIcon />} onClick={() => handleStatusChange('Failed')} sx={{ borderRadius: 8, px: 3, fontWeight: 'bold' }}>Fail</Button>
          </Box>
        </Box>

        <Collapse in={!!result?.status}>
          <Box sx={{ mt: 4, pt: 3, borderTop: '1px dashed #e2e8f0' }}>
            <Typography variant="subtitle2" color="text.secondary" fontWeight="600" gutterBottom>Tester Notes & Evidence</Typography>
            <TextField fullWidth placeholder={isFailed ? "Describe the issue..." : "Add optional notes..."} value={result?.notes || ''} onChange={handleNotesChange} multiline rows={2} sx={{ mb: 3, '& .MuiOutlinedInput-root': { borderRadius: 3 } }} />
            
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap' }}>
              <Button component="label" variant="outlined" color="inherit" disabled={isUploading} startIcon={isUploading ? <CircularProgress size={16} /> : <CloudUploadIcon />} sx={{ borderRadius: 3, color: 'text.secondary', borderColor: '#cbd5e1' }}>
                {isUploading ? 'Uploading...' : 'Desktop Upload'}
                <input type="file" accept="image/*,.pdf,.doc,video/*" multiple hidden onChange={handleFileUpload} />
              </Button>
              <Button variant="outlined" color="primary" onClick={openQrScanner} startIcon={<QrCodeScannerIcon />} sx={{ borderRadius: 3 }}>
                Upload from Phone
              </Button>
              {result?.evidenceUrls?.map((url, i) => <Chip key={i} icon={<AttachFileIcon />} label={`Upload ${i + 1}`} component="a" href={url} target="_blank" clickable color="info" variant="outlined" />)}
            </Box>
          </Box>
        </Collapse>
      </Card>

      <Dialog open={qrModalOpen} onClose={() => setQrModalOpen(false)} maxWidth="xs" fullWidth PaperProps={{ sx: { borderRadius: 4 } }}>
        <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>Scan to Upload <IconButton onClick={() => setQrModalOpen(false)} size="small"><CloseIcon /></IconButton></DialogTitle>
        <DialogContent sx={{ textAlign: 'center', pb: 4 }}>
          <Box sx={{ p: 2, bgcolor: '#f8fafc', display: 'inline-block', borderRadius: 3, border: '1px solid #e2e8f0' }}>{uploadUrl && <QRCodeSVG value={uploadUrl} size={200} />}</Box>
        </DialogContent>
      </Dialog>
    </>
  );
}