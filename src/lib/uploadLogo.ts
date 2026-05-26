"use client";

import { ref as storageRef, uploadBytes, getDownloadURL, deleteObject } from "firebase/storage";
import { storage } from "@/lib/firebase";

// Logo upload — validates file, optionally resizes, uploads to Firebase Storage.
// Returns the public download URL.

const MAX_FILE_SIZE_BYTES = 2 * 1024 * 1024; // 2 MB
const MAX_DIMENSION = 256; // logos resized to fit within 256x256
const ACCEPTED_TYPES = ["image/png", "image/jpeg", "image/svg+xml", "image/webp"];

export interface UploadLogoOptions {
  accountId: string;
  file: File;
}

export interface UploadLogoResult {
  url: string;
  path: string;
}

export async function uploadLogo({
  accountId,
  file,
}: UploadLogoOptions): Promise<UploadLogoResult> {
  // ─── VALIDATE ──────────────────────────────────────────────────────────
  if (!ACCEPTED_TYPES.includes(file.type)) {
    throw new Error(
      "Unsupported file type. Please upload a PNG, JPG, SVG, or WebP."
    );
  }
  if (file.size > MAX_FILE_SIZE_BYTES) {
    throw new Error(
      `Logo is too large. Please keep it under ${MAX_FILE_SIZE_BYTES / 1024 / 1024} MB.`
    );
  }

  // ─── RESIZE (raster only) ──────────────────────────────────────────────
  let uploadFile: Blob = file;
  if (file.type !== "image/svg+xml") {
    try {
      uploadFile = await resizeImage(file, MAX_DIMENSION);
    } catch {
      // If resize fails for any reason, fall back to the original file
      uploadFile = file;
    }
  }

  // ─── UPLOAD ────────────────────────────────────────────────────────────
  const ext = guessExtension(file.type, file.name);
  // Cache-bust filename so the browser doesn't show a stale logo after re-upload
  const path = `accounts/${accountId}/branding/logo-${Date.now()}.${ext}`;
  const ref = storageRef(storage, path);

  await uploadBytes(ref, uploadFile, {
    contentType: file.type,
    cacheControl: "public, max-age=31536000",
  });

  const url = await getDownloadURL(ref);
  return { url, path };
}

export async function deleteLogo(path: string): Promise<void> {
  try {
    await deleteObject(storageRef(storage, path));
  } catch (err) {
    // If the file doesn't exist, that's fine — swallow
    console.warn("deleteLogo:", err);
  }
}

// ─── HELPERS ─────────────────────────────────────────────────────────────────

function guessExtension(mime: string, filename: string): string {
  if (mime === "image/png") return "png";
  if (mime === "image/jpeg") return "jpg";
  if (mime === "image/svg+xml") return "svg";
  if (mime === "image/webp") return "webp";
  const fromName = filename.split(".").pop();
  return fromName || "png";
}

// Resize an image file to fit within `maxDim` x `maxDim` while preserving aspect.
// Returns a Blob ready for upload. Uses HTMLCanvasElement (browser only).
function resizeImage(file: File, maxDim: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Failed to read file"));
    reader.onload = (e) => {
      const img = new Image();
      img.onerror = () => reject(new Error("Failed to load image"));
      img.onload = () => {
        const { width, height } = img;
        const scale = Math.min(1, maxDim / Math.max(width, height));
        const targetW = Math.round(width * scale);
        const targetH = Math.round(height * scale);

        const canvas = document.createElement("canvas");
        canvas.width = targetW;
        canvas.height = targetH;

        const ctx = canvas.getContext("2d");
        if (!ctx) {
          reject(new Error("Canvas not supported"));
          return;
        }

        // Better resampling for downscale
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = "high";
        ctx.drawImage(img, 0, 0, targetW, targetH);

        canvas.toBlob(
          (blob) => {
            if (!blob) reject(new Error("Failed to encode image"));
            else resolve(blob);
          },
          file.type,
          0.92
        );
      };
      img.src = e.target?.result as string;
    };
    reader.readAsDataURL(file);
  });
}