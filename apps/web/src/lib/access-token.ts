/** Short-lived access JWT storage (sessionStorage) + listeners for AuthProvider. */

const TOKEN_KEY = "et_access_token";

type Listener = (token: string | null) => void;
const listeners = new Set<Listener>();

export function getAccessToken(): string | null {
  try {
    window.localStorage.removeItem(TOKEN_KEY);
    return window.sessionStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setAccessToken(token: string | null) {
  try {
    window.localStorage.removeItem(TOKEN_KEY);
    if (token) {
      window.sessionStorage.setItem(TOKEN_KEY, token);
    } else {
      window.sessionStorage.removeItem(TOKEN_KEY);
    }
  } catch {
    // ignore storage failures
  }
  for (const listener of listeners) {
    listener(token);
  }
}

export function subscribeAccessToken(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
