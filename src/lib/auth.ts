// Sign-in. dev: any email, token "dev:<email>" (the API accepts it only when ENV=local).
// cognito: TODO, the Hosted UI flow is not built yet; getToken() is the seam it plugs into.
export type AuthMode = "dev" | "cognito";

export const AUTH_MODE: AuthMode = process.env.NEXT_PUBLIC_AUTH_MODE === "dev" ? "dev" : "cognito";

const KEY = "clipora.token";
const listeners = new Set<() => void>();

function read(): string | null {
  try {
    return window.localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return read();
}

export function setToken(token: string | null): void {
  try {
    if (token) window.localStorage.setItem(KEY, token);
    else window.localStorage.removeItem(KEY);
  } catch {
    // Storage blocked: the session lasts until reload.
  }
  listeners.forEach((l) => l());
}

export function signInDev(email: string): void {
  setToken(`dev:${email.trim().toLowerCase()}`);
}

export function signOut(): void {
  setToken(null);
}

export function onAuthChange(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
