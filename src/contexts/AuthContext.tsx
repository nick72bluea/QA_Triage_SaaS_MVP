"use client";

import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  useMemo,
} from "react";
import { useRouter, usePathname } from "next/navigation";
import {
  doc,
  getDoc,
  setDoc,
  deleteField,
  collection,
  query,
  where,
  getDocs,
  serverTimestamp,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import {
  auth,
  onAuthStateChanged,
  signOut as firebaseSignOut,
  User,
} from "@/lib/auth";
import { verifyPin } from "@/lib/pin";
import { hasPendingInvite, postLoginPath } from "@/lib/post-login";

// ─── TYPES ───────────────────────────────────────────────────────────────────

export type Role = "owner" | "admin" | "member" | "viewer";

export interface UserProfile {
  uid: string;
  email: string;
  displayName: string;
  photoURL: string | null;
  hasPinSet: boolean;
  lastAccountId: string | null;
  createdAt: any;
  lastLoginAt: any;
}

export interface AccountMembership {
  accountId: string;
  accountName: string;
  role: Role;
}

export interface AuthContextValue {
  user: User | null;
  profile: UserProfile | null;
  loading: boolean;
  currentAccountId: string | null;
  currentRole: Role | null;
  /** owner/admin/member (or super user): may create and change data */
  canEdit: boolean;
  /** owner/admin (or super user): may manage settings, members and invites */
  canManage: boolean;
  /** Proofdeck super user (custom auth claim) — can see every workspace */
  isSuperUser: boolean;
  accounts: AccountMembership[];
  pinVerified: boolean;
  switchAccount: (accountId: string) => Promise<void>;
  verifyUserPin: (pin: string) => Promise<boolean>;
  signOut: () => Promise<void>;
  fullSignOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  /** Call right after a magic-link sign-in: unlocks the app, and finishes a "Forgot PIN" reset. */
  afterMagicLinkSignIn: () => Promise<void>;
  /** Change the signed-in user's display name everywhere it's shown. */
  updateDisplayName: (name: string) => Promise<void>;
}

const PUBLIC_ROUTES = [
  "/login",
  "/login/verify",
  "/login/pin",
  "/login/setup-pin",
];

// Frictionless routes for external testers + join links
const isFrictionlessRoute = (path: string | null) => {
  if (!path) return false;
  return path.startsWith("/tester") || path.startsWith("/mobile-upload") || path.startsWith("/join");
};

const isPublicRoute = (path: string | null) => {
  if (!path) return false;
  return PUBLIC_ROUTES.includes(path) || isFrictionlessRoute(path);
};

// Key used in sessionStorage to remember PIN verification across page refreshes.
const PIN_VERIFIED_KEY = "pinVerified";
// Super users looking inside a workspace they aren't a member of (per tab).
const SUPER_VIEW_KEY = "proofdeck_super_view";
// Set by "Forgot PIN?" — the next magic-link sign-in clears the PIN.
export const PIN_RESET_KEY = "proofdeck_pin_reset";

const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within <AuthProvider>");
  return ctx;
}

// ─── FIRESTORE HELPERS ───────────────────────────────────────────────────────

async function getOrCreateUserProfile(user: User): Promise<UserProfile> {
  const ref = doc(db, "users", user.uid);
  const snap = await getDoc(ref);

  if (snap.exists()) {
    await setDoc(ref, { lastLoginAt: serverTimestamp() }, { merge: true });
    return snap.data() as UserProfile;
  }

  const profile: UserProfile = {
    uid: user.uid,
    email: user.email ?? "",
    displayName: user.displayName ?? user.email?.split("@")[0] ?? "User",
    photoURL: user.photoURL ?? null,
    hasPinSet: false,
    lastAccountId: null,
    createdAt: serverTimestamp(),
    lastLoginAt: serverTimestamp(),
  };

  await setDoc(ref, profile);
  return profile;
}

async function getOrCreateAccount(
  user: User,
  profile: UserProfile
): Promise<{ accountId: string; role: Role } | null> {
  const membersQuery = query(
    collection(db, "accountMembers"),
    where("uid", "==", user.uid)
  );
  const membersSnap = await getDocs(membersQuery);

  if (!membersSnap.empty) {
    const memberships = membersSnap.docs.map((d) => d.data());
    const preferred = profile.lastAccountId
      ? memberships.find((m) => m.accountId === profile.lastAccountId)
      : null;
    const m = preferred || memberships[0];
    return { accountId: m.accountId, role: m.role };
  }

  // New user arriving from an invite link: don't make them a workspace of
  // their own — the join page will add them to the inviting one.
  if (hasPendingInvite()) return null;

  // New user — create a new account for them
  const accountRef = doc(collection(db, "accounts"));
  const accountId = accountRef.id;

  await setDoc(accountRef, {
    name: `${profile.displayName}'s Workspace`,
    ownerId: user.uid,
    createdAt: serverTimestamp(),
  });

  await setDoc(doc(db, "accounts", accountId, "settings", "workspace"), {
    workspaceName: `${profile.displayName}'s Workspace`,
    createdAt: serverTimestamp(),
  });

  const memberRef = doc(db, "accountMembers", `${accountId}_${user.uid}`);
  await setDoc(memberRef, {
    accountId,
    uid: user.uid,
    email: user.email,
    displayName: profile.displayName,
    role: "owner" as Role,
    joinedAt: serverTimestamp(),
  });

  return { accountId, role: "owner" };
}

async function getUserMemberships(uid: string): Promise<AccountMembership[]> {
  const q = query(collection(db, "accountMembers"), where("uid", "==", uid));
  const snap = await getDocs(q);

  const memberships: AccountMembership[] = [];
  for (const memberDoc of snap.docs) {
    const data = memberDoc.data();
    const accountSnap = await getDoc(doc(db, "accounts", data.accountId));
    const accountName = accountSnap.exists()
      ? accountSnap.data().name
      : "Unknown Workspace";
    memberships.push({
      accountId: data.accountId,
      accountName,
      role: data.role,
    });
  }

  return memberships;
}

// ─── PROVIDER ────────────────────────────────────────────────────────────────

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();

  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [currentAccountId, setCurrentAccountId] = useState<string | null>(null);
  const [currentRole, setCurrentRole] = useState<Role | null>(null);
  const [accounts, setAccounts] = useState<AccountMembership[]>([]);
  const [isSuperUser, setIsSuperUser] = useState(false);

  const [pinVerified, setPinVerifiedState] = useState(false);

  const setPinVerified = useCallback(
    (value: boolean) => {
      setPinVerifiedState(value);
      if (typeof window === "undefined") return;
      try {
        if (value && user) {
          sessionStorage.setItem(PIN_VERIFIED_KEY, user.uid);
        } else {
          sessionStorage.removeItem(PIN_VERIFIED_KEY);
        }
      } catch {
        // sessionStorage ignore
      }
    },
    [user]
  );

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      try {
        if (!firebaseUser) {
          setUser(null);
          setProfile(null);
          setCurrentAccountId(null);
          setCurrentRole(null);
          setAccounts([]);
          setIsSuperUser(false);
          setPinVerifiedState(false);
          if (typeof window !== "undefined") {
            try {
              sessionStorage.removeItem(PIN_VERIFIED_KEY);
            } catch {}
          }
          setLoading(false);
          return;
        }

        setUser(firebaseUser);
        const tokenResult = await firebaseUser.getIdTokenResult();
        setIsSuperUser(tokenResult.claims.superUser === true);

        if (typeof window !== "undefined") {
          try {
            const stored = sessionStorage.getItem(PIN_VERIFIED_KEY);
            if (stored && stored === firebaseUser.uid) {
              setPinVerifiedState(true);
            } else if (stored && stored !== firebaseUser.uid) {
              sessionStorage.removeItem(PIN_VERIFIED_KEY);
              setPinVerifiedState(false);
            }
          } catch {}
        }

        const userProfile = await getOrCreateUserProfile(firebaseUser);
        setProfile(userProfile);

        // Store a lightweight hint for the login page so returning users
        // with a PIN see a "welcome back" prompt. Kept on sign-out intentionally.
        if (typeof window !== "undefined") {
          try {
            localStorage.setItem("proofdeck_last_user", JSON.stringify({
              displayName: userProfile.displayName,
              email: userProfile.email,
              hasPinSet: userProfile.hasPinSet,
            }));
          } catch {}
        }

        const active = await getOrCreateAccount(firebaseUser, userProfile);
        setCurrentAccountId(active?.accountId ?? null);
        setCurrentRole(active?.role ?? null);

        if (active) {
          await setDoc(
            doc(db, "users", firebaseUser.uid),
            { lastAccountId: active.accountId },
            { merge: true }
          );
        }

        const memberships = await getUserMemberships(firebaseUser.uid);
        setAccounts(memberships);

        // Restore a super user's "viewing another workspace" choice after reloads.
        if (tokenResult.claims.superUser === true) {
          try {
            const viewing = sessionStorage.getItem(SUPER_VIEW_KEY);
            if (viewing && !memberships.some((m) => m.accountId === viewing)) {
              setCurrentAccountId(viewing);
              setCurrentRole(null);
            }
          } catch {}
        }
      } catch (err) {
        console.error("Auth state error:", err);
      } finally {
        setLoading(false);
      }
    });

    return () => unsubscribe();
  }, []);

  // ─── REDIRECT DECISION ───────────────────────────────────────────────────

  const requiredRoute = useMemo<string | null>(() => {
    if (loading) return null; 
    
    // Explicit exception for Tester and Mobile Upload flows
    if (isFrictionlessRoute(pathname)) return null; 

    // Let a magic link finish signing in before any PIN gate kicks in —
    // a fresh email sign-in proves identity better than a PIN.
    if (pathname === "/login/verify") return null;

    // Not signed in → must be on /login (or other public routes)
    if (!user) {
      return isPublicRoute(pathname) ? null : "/login";
    }

    // Signed in, profile loaded:
    if (profile) {
      if (profile.hasPinSet && !pinVerified) {
        return pathname === "/login/pin" ? null : "/login/pin";
      }

      if (!profile.hasPinSet) {
        const dismissed =
          typeof window !== "undefined"
            ? sessionStorage.getItem("pinSetupDismissed")
            : null;
        if (!dismissed && pathname !== "/login/setup-pin") {
          return "/login/setup-pin";
        }
      }

      if (
        pinVerified &&
        (pathname === "/login" ||
          pathname === "/login/pin" ||
          pathname === "/login/verify")
      ) {
        return postLoginPath();
      }
    }

    return null; 
  }, [loading, user, profile, pinVerified, pathname]);

  useEffect(() => {
    if (requiredRoute && requiredRoute !== pathname) {
      router.replace(requiredRoute);
    }
  }, [requiredRoute, pathname, router]);

  // ─── ACTIONS ─────────────────────────────────────────────────────────────

  const switchAccount = useCallback(
    async (accountId: string) => {
      if (!user) return;
      const membership = accounts.find((a) => a.accountId === accountId);
      if (!membership) {
        // Super users can look inside any workspace without being a member.
        // Not remembered as lastAccountId — next sign-in returns to their own.
        if (!isSuperUser) throw new Error("Not a member of that account");
        try { sessionStorage.setItem(SUPER_VIEW_KEY, accountId); } catch {}
        setCurrentAccountId(accountId);
        setCurrentRole(null);
        return;
      }
      try { sessionStorage.removeItem(SUPER_VIEW_KEY); } catch {}
      setCurrentAccountId(accountId);
      setCurrentRole(membership.role);
      await setDoc(
        doc(db, "users", user.uid),
        { lastAccountId: accountId },
        { merge: true }
      );
    },
    [user, accounts, isSuperUser]
  );

  const verifyUserPin = useCallback(
    async (pin: string): Promise<boolean> => {
      if (!user) return false;
      try {
        const snap = await getDoc(doc(db, "users", user.uid));
        if (!snap.exists()) return false;
        const { pinHash } = snap.data();
        if (!pinHash) return false;
        const ok = await verifyPin(pin, pinHash);
        if (ok) setPinVerified(true);
        return ok;
      } catch {
        return false;
      }
    },
    [user, setPinVerified]
  );

  // Lock: for PIN users, preserve Firebase session and send to PIN page.
  // For non-PIN users, do a full sign-out.
  const signOut = useCallback(async () => {
    if (profile?.hasPinSet) {
      setPinVerified(false);
      router.replace("/login/pin");
    } else {
      await firebaseSignOut();
      setPinVerified(false);
      setProfile(null);
      setCurrentAccountId(null);
      router.replace("/login");
    }
  }, [router, setPinVerified, profile]);

  // Full sign-out: always ends the Firebase session regardless of PIN.
  // Used by the PIN page "Use a different account" link.
  const fullSignOut = useCallback(async () => {
    await firebaseSignOut();
    setPinVerified(false);
    setProfile(null);
    setCurrentAccountId(null);
    router.replace("/login");
  }, [router, setPinVerified]);

  const refreshProfile = useCallback(async () => {
    if (!user) return;
    const snap = await getDoc(doc(db, "users", user.uid));
    if (snap.exists()) setProfile(snap.data() as UserProfile);
  }, [user]);

  const canEdit = isSuperUser || currentRole === "owner" || currentRole === "admin" || currentRole === "member";
  const canManage = isSuperUser || currentRole === "owner" || currentRole === "admin";

  const afterMagicLinkSignIn = useCallback(async () => {
    const current = auth.currentUser;
    if (!current) return;
    const ref = doc(db, "users", current.uid);
    try {
      if (localStorage.getItem(PIN_RESET_KEY)) {
        await setDoc(ref, { hasPinSet: false, pinHash: deleteField() }, { merge: true });
        localStorage.removeItem(PIN_RESET_KEY);
        sessionStorage.removeItem("pinSetupDismissed");
      }
    } catch (err) {
      console.error("PIN reset failed", err);
    }
    setPinVerifiedState(true);
    try { sessionStorage.setItem(PIN_VERIFIED_KEY, current.uid); } catch {}
    const snap = await getDoc(ref);
    if (snap.exists()) {
      const fresh = snap.data() as UserProfile;
      setProfile(fresh);
      try {
        localStorage.setItem("proofdeck_last_user", JSON.stringify({
          displayName: fresh.displayName, email: fresh.email, hasPinSet: fresh.hasPinSet,
        }));
      } catch {}
    }
  }, []);

  const updateDisplayName = useCallback(async (name: string) => {
    const clean = name.trim().slice(0, 80);
    if (!user || !clean) return;
    await setDoc(doc(db, "users", user.uid), { displayName: clean }, { merge: true });
    // Membership docs carry a copy for the members list.
    await Promise.all(
      accounts.map((a) =>
        setDoc(doc(db, "accountMembers", `${a.accountId}_${user.uid}`), { displayName: clean }, { merge: true })
          .catch((err) => console.warn("Couldn't update name on membership", a.accountId, err))
      )
    );
    setProfile((p) => (p ? { ...p, displayName: clean } : p));
  }, [user, accounts]);

  const value: AuthContextValue = {
    user,
    profile,
    loading,
    currentAccountId,
    currentRole,
    canEdit,
    canManage,
    isSuperUser,
    accounts,
    pinVerified,
    switchAccount,
    verifyUserPin,
    signOut,
    fullSignOut,
    refreshProfile,
    afterMagicLinkSignIn,
    updateDisplayName,
  };

  const shouldHideContent =
    loading ||
    (requiredRoute !== null && requiredRoute !== pathname);

  return (
    <AuthContext.Provider value={value}>
      {shouldHideContent ? <AuthLoadingScreen /> : children}
    </AuthContext.Provider>
  );
}

// ─── HYDRATION-SAFE LOADING SCREEN ───────────────────────────────────────────

function AuthLoadingScreen() {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) return null;

  return (
    <div
      suppressHydrationWarning
      style={{
        position: "fixed",
        inset: 0,
        background: "#f4f3ef",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 9999
      }}
      aria-busy="true"
    >
      <div style={{ textAlign: 'center' }}>
        <svg width="40" height="40" viewBox="0 0 50 50" style={{ margin: '0 auto 16px', display: 'block' }}>
          <circle cx="25" cy="25" r="20" fill="none" stroke="rgba(45,74,62,0.1)" strokeWidth="4" />
          <circle cx="25" cy="25" r="20" fill="none" stroke="#2d4a3e" strokeWidth="4" strokeDasharray="80 125" strokeLinecap="round">
            <animateTransform attributeName="transform" type="rotate" repeatCount="indefinite" dur="1s" from="0 25 25" to="360 25 25" />
          </circle>
        </svg>
        <div style={{ color: "#2d4a3e", fontFamily: "monospace", fontSize: '12px', letterSpacing: '0.1em' }}>
          LOADING WORKSPACE...
        </div>
      </div>
    </div>
  );
}