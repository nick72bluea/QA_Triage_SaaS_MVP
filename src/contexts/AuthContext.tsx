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

// ─── TYPES ───────────────────────────────────────────────────────────────────

export type Role = "owner" | "admin" | "editor" | "viewer";

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
  accounts: AccountMembership[];
  pinVerified: boolean;
  switchAccount: (accountId: string) => Promise<void>;
  verifyUserPin: (pin: string) => Promise<boolean>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const PUBLIC_ROUTES = [
  "/login",
  "/login/verify",
  "/login/pin",
  "/login/setup-pin",
];

// Frictionless routes for external testers
const isFrictionlessRoute = (path: string | null) => {
  if (!path) return false;
  return path.startsWith("/tester") || path.startsWith("/mobile-upload");
};

const isPublicRoute = (path: string | null) => {
  if (!path) return false;
  return PUBLIC_ROUTES.includes(path) || isFrictionlessRoute(path);
};

// Key used in sessionStorage to remember PIN verification across page refreshes.
const PIN_VERIFIED_KEY = "pinVerified";

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
): Promise<{ accountId: string; role: Role }> {
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

        const { accountId, role } = await getOrCreateAccount(
          firebaseUser,
          userProfile
        );
        setCurrentAccountId(accountId);
        setCurrentRole(role);

        await setDoc(
          doc(db, "users", firebaseUser.uid),
          { lastAccountId: accountId },
          { merge: true }
        );

        const memberships = await getUserMemberships(firebaseUser.uid);
        setAccounts(memberships);
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
        return "/home";
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
      if (!membership) throw new Error("Not a member of that account");
      setCurrentAccountId(accountId);
      setCurrentRole(membership.role);
      await setDoc(
        doc(db, "users", user.uid),
        { lastAccountId: accountId },
        { merge: true }
      );
    },
    [user, accounts]
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

  const signOut = useCallback(async () => {
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

  const value: AuthContextValue = {
    user,
    profile,
    loading,
    currentAccountId,
    currentRole,
    accounts,
    pinVerified,
    switchAccount,
    verifyUserPin,
    signOut,
    refreshProfile,
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