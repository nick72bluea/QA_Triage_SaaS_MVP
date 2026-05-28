"use client";

import {
  getAuth,
  sendSignInLinkToEmail,
  isSignInWithEmailLink,
  signInWithEmailLink,
  GoogleAuthProvider,
  OAuthProvider,
  signInWithPopup,
  signOut as firebaseSignOut,
  onAuthStateChanged,
  User,
} from "firebase/auth";
import { app } from "@/lib/firebase";

export const auth = getAuth(app);

// ─── PROVIDERS ───────────────────────────────────────────────────────────────

const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: "select_account" });

const microsoftProvider = new OAuthProvider("microsoft.com");
microsoftProvider.setCustomParameters({ prompt: "select_account" });

// ─── MAGIC LINK ──────────────────────────────────────────────────────────────

export async function sendMagicLink(email: string): Promise<void> {
  const baseUrl =
    process.env.NEXT_PUBLIC_APP_URL ||
    (typeof window !== "undefined" ? window.location.origin : "");

  const actionCodeSettings = {
    url: `${baseUrl}/login/verify`,
    handleCodeInApp: true,
  };

  await sendSignInLinkToEmail(auth, email, actionCodeSettings);
  if (typeof window !== "undefined") {
    window.localStorage.setItem("emailForSignIn", email);
  }
}

export async function completeMagicLinkSignIn(
  url: string
): Promise<User | null> {
  if (!isSignInWithEmailLink(auth, url)) return null;

  let email =
    typeof window !== "undefined"
      ? window.localStorage.getItem("emailForSignIn")
      : null;

  if (!email) {
    email = window.prompt("Please enter your email to confirm sign-in") || "";
  }

  if (!email) throw new Error("No email provided");

  const result = await signInWithEmailLink(auth, email, url);
  if (typeof window !== "undefined") {
    window.localStorage.removeItem("emailForSignIn");
  }
  return result.user;
}

// ─── OAUTH ───────────────────────────────────────────────────────────────────

export async function signInWithGoogle(): Promise<User> {
  const result = await signInWithPopup(auth, googleProvider);
  return result.user;
}

export async function signInWithMicrosoft(): Promise<User> {
  const result = await signInWithPopup(auth, microsoftProvider);
  return result.user;
}

// ─── SIGN OUT ────────────────────────────────────────────────────────────────

export async function signOut(): Promise<void> {
  await firebaseSignOut(auth);
}

export { onAuthStateChanged };
export type { User };