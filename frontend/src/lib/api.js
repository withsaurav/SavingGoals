import axios from "axios";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
export const API_BASE = `${BACKEND_URL}/api`;

const TOKEN_KEY = "auth_token";

export const tokenStore = {
  get: () => sessionStorage.getItem(TOKEN_KEY),
  set: (t) => sessionStorage.setItem(TOKEN_KEY, t),
  clear: () => {
    sessionStorage.removeItem(TOKEN_KEY);
    // best-effort: clear any legacy localStorage token from earlier sessions
    try { localStorage.removeItem(TOKEN_KEY); } catch (_) { /* ignore — legacy cleanup is best-effort */ }
  },
};

export const api = axios.create({
  baseURL: API_BASE,
  withCredentials: true,
});

// Bearer fallback for preview envs that strip third-party cookies.
// Token lives in sessionStorage — cleared on browser/tab close, narrower
// XSS blast radius than localStorage. The real production-grade transport
// remains the backend's httpOnly cookie, which is set on login/register.
api.interceptors.request.use((config) => {
  const token = tokenStore.get();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

export function formatApiError(detail) {
  if (detail == null) return "Something went wrong. Please try again.";
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail))
    return detail.map((e) => (e && typeof e.msg === "string" ? e.msg : JSON.stringify(e))).join(" ");
  if (detail && typeof detail.msg === "string") return detail.msg;
  return String(detail);
}
