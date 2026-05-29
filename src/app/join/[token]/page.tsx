"use client";

import React, { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  doc,
  getDoc,
  setDoc,
  serverTimestamp,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/contexts/AuthContext";

type JoinState =
  | "loading"
  | "invalid"
  | "expired"
  | "already_member"
  | "joined"
  | "needs_login"
  | "error";

export default function JoinPage() {
  const { token } = useParams<{ token: string }>();
  const router = useRouter();
  const { user, loading: authLoading, refreshProfile } = useAuth();

  const [state, setState] = useState<JoinState>("loading");
  const [workspaceName, setWorkspaceName] = useState("");
  const [joining, setJoining] = useState(false);

  // Resolve the invite and (if authed) auto-join
  useEffect(() => {
    if (authLoading) return;

    const resolve = async () => {
      try {
        const inviteSnap = await getDoc(doc(db, "invites", token));
        if (!inviteSnap.exists()) { setState("invalid"); return; }

        const invite = inviteSnap.data();
        if (invite.expiresAt < Date.now()) { setState("expired"); return; }

        setWorkspaceName(invite.accountName || "the workspace");

        if (!user) { setState("needs_login"); return; }

        // Check if already a member
        const memberSnap = await getDoc(doc(db, "accountMembers", `${invite.accountId}_${user.uid}`));
        if (memberSnap.exists()) { setState("already_member"); return; }

        setState("loading");
        setJoining(true);
        await setDoc(doc(db, "accountMembers", `${invite.accountId}_${user.uid}`), {
          accountId: invite.accountId,
          uid: user.uid,
          email: user.email,
          displayName: user.displayName || user.email?.split("@")[0] || "Member",
          role: "member",
          joinedAt: serverTimestamp(),
        });
        // Update lastAccountId so they land in the right workspace
        await setDoc(doc(db, "users", user.uid), { lastAccountId: invite.accountId }, { merge: true });
        await refreshProfile();
        setState("joined");
        setTimeout(() => router.replace("/home"), 2000);
      } catch (err) {
        console.error("Join error:", err);
        setState("error");
      } finally {
        setJoining(false);
      }
    };

    resolve();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, user, token]);

  const messages: Record<JoinState, { title: string; body: string; cta?: { label: string; href: string } }> = {
    loading: { title: "Checking invite…", body: "Just a moment." },
    invalid: { title: "Invalid invite", body: "This invite link doesn't exist or has been revoked." },
    expired: { title: "Invite expired", body: "This invite link has expired. Ask the workspace owner to generate a new one." },
    already_member: {
      title: "Already a member",
      body: `You're already in ${workspaceName}.`,
      cta: { label: "Go to workspace →", href: "/home" },
    },
    joined: { title: `Welcome to ${workspaceName}!`, body: "You've joined the workspace. Taking you there now…" },
    needs_login: {
      title: `Join ${workspaceName}`,
      body: "Sign in or create an account to accept this invite.",
      cta: { label: "Sign in to accept →", href: `/login?next=/join/${token}` },
    },
    error: { title: "Something went wrong", body: "We couldn't process your invite. Please try again or contact the workspace owner." },
  };

  const m = messages[state];

  return (
    <div
      suppressHydrationWarning
      style={{
        minHeight: "100vh",
        background: "#f4f3ef",
        display: "grid",
        placeItems: "center",
        padding: "32px 20px",
        fontFamily: "'IBM Plex Sans', system-ui, sans-serif",
        color: "#1a1a1a",
        fontSize: 14,
        WebkitFontSmoothing: "antialiased",
      }}
    >
      <div style={{ width: "100%", maxWidth: 400, textAlign: "center" }}>
        {/* Logo / icon */}
        <div
          style={{
            width: 56,
            height: 56,
            borderRadius: 14,
            background: "#2d4a3e",
            display: "grid",
            placeItems: "center",
            margin: "0 auto 24px",
          }}
        >
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round">
            <rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" />
            <rect x="3" y="14" width="7" height="7" /><rect x="14" y="14" width="7" height="7" />
          </svg>
        </div>

        <h1
          style={{
            fontFamily: "'Fraunces', serif",
            fontSize: 26,
            fontWeight: 600,
            letterSpacing: "-0.02em",
            margin: "0 0 12px",
          }}
        >
          {m.title}
        </h1>
        <p style={{ color: "#55524d", lineHeight: 1.6, margin: "0 0 24px" }}>{m.body}</p>

        {state === "loading" && (
          <svg width="32" height="32" viewBox="0 0 50 50" style={{ margin: "0 auto", display: "block" }}>
            <circle cx="25" cy="25" r="20" fill="none" stroke="rgba(45,74,62,0.1)" strokeWidth="4" />
            <circle cx="25" cy="25" r="20" fill="none" stroke="#2d4a3e" strokeWidth="4" strokeDasharray="80 125" strokeLinecap="round">
              <animateTransform attributeName="transform" type="rotate" repeatCount="indefinite" dur="1s" from="0 25 25" to="360 25 25" />
            </circle>
          </svg>
        )}

        {m.cta && (
          <a
            href={m.cta.href}
            style={{
              display: "inline-block",
              padding: "10px 20px",
              background: "#2d4a3e",
              color: "#fff",
              borderRadius: 8,
              fontSize: 14,
              fontWeight: 500,
              textDecoration: "none",
            }}
          >
            {m.cta.label}
          </a>
        )}
      </div>
    </div>
  );
}
