import { create } from 'zustand';

const STORAGE_KEY = 'siepa-auth-storage';

const readAuthFromStorage = () => {
  const sources = [window.localStorage, window.sessionStorage];

  for (const storage of sources) {
    try {
      const raw = storage.getItem(STORAGE_KEY);
      if (!raw) continue;
      const parsed = JSON.parse(raw);
      if (parsed?.user && parsed?.token) {
        return {
          user: parsed.user,
          token: parsed.token,
          remember: storage === window.localStorage
        };
      }
    } catch (_error) {
      continue;
    }
  }

  return { user: null, token: null, remember: false };
};

const writeAuthToStorage = ({ user, token, remember }) => {
  const payload = JSON.stringify({ user, token });
  window.localStorage.removeItem(STORAGE_KEY);
  window.sessionStorage.removeItem(STORAGE_KEY);

  if (!user || !token) return;

  if (remember) {
    window.localStorage.setItem(STORAGE_KEY, payload);
  } else {
    window.sessionStorage.setItem(STORAGE_KEY, payload);
  }
};

const initialState = typeof window !== 'undefined'
  ? readAuthFromStorage()
  : { user: null, token: null, remember: false };

const useAuthStore = create((set, get) => ({
  user: initialState.user,
  token: initialState.token,
  remember: initialState.remember,

  login: (userData, authToken, options = {}) => {
    const remember = Boolean(options.remember);
    writeAuthToStorage({ user: userData, token: authToken, remember });
    set({ user: userData, token: authToken, remember });
  },

  logout: () => {
    writeAuthToStorage({ user: null, token: null, remember: false });
    set({ user: null, token: null, remember: false });
  },

  isTokenValid: () => {
    const token = get().token;
    if (!token) return false;

    try {
      const payload = JSON.parse(atob(token.split('.')[1]));
      const expiry = payload.exp * 1000;
      return Date.now() < expiry;
    } catch (_err) {
      return false;
    }
  }
}));

export { useAuthStore };
