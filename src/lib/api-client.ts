"use client";

// fetch() wrapper for calling our own /api routes as the signed-in user.
// Adds the Firebase ID token so the server can verify who is calling.

import { auth } from "@/lib/auth";

export async function authFetch(input: string, init: RequestInit = {}): Promise<Response> {
  const user = auth.currentUser;
  if (!user) throw new Error("You need to be signed in.");
  const token = await user.getIdToken();

  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${token}`);
  if (init.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  return fetch(input, { ...init, headers });
}
