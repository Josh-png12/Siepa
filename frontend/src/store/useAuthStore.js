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
        if (import.meta.env.DEV || typeof import.meta.env.DEV === 'undefined') {
          console.log(
            `[AuthStore] 🔓 Token recovered from ${storage === window.localStorage ? 'localStorage' : 'sessionStorage'}`,
            `token=${parsed.token.slice(0, 12)}…`,
            `user=${parsed.user.email}`
          );
        }
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

  if (import.meta.env.DEV || typeof import.meta.env.DEV === 'undefined') {
    console.log('[AuthStore] 🔒 No token found in storage (fresh session)');
  }
  return { user: null, token: null, remember: false };
};

const writeAuthToStorage = ({ user, token, remember }) => {
  const payload = JSON.stringify({ user, token });
  window.localStorage.removeItem(STORAGE_KEY);
  window.sessionStorage.removeItem(STORAGE_KEY);

  if (!user || !token) {
    if (import.meta.env.DEV || typeof import.meta.env.DEV === 'undefined') {
      console.log('[AuthStore] 🗑️ Auth cleared from storage (logout)');
    }
    return;
  }

  const target = remember ? 'localStorage' : 'sessionStorage';
  if (remember) {
    window.localStorage.setItem(STORAGE_KEY, payload);
  } else {
    window.sessionStorage.setItem(STORAGE_KEY, payload);
  }

  if (import.meta.env.DEV || typeof import.meta.env.DEV === 'undefined') {
    console.log(
      `[AuthStore] 💾 Token saved to ${target}`,
      `token=${token.slice(0, 12)}…`,
      `user=${user.email}`,
      `remember=${remember}`
    );
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

    if (import.meta.env.DEV || typeof import.meta.env.DEV === 'undefined') {
      console.log(
        '[AuthStore] 🚀 login() called',
        `user=${userData?.email}`,
        `role=${userData?.role}`,
        `token=${authToken?.slice(0, 12)}…`,
        `remember=${remember}`
      );
    }

    writeAuthToStorage({ user: userData, token: authToken, remember });
    set({ user: userData, token: authToken, remember });

    // Verify the token is now in the store
    if (import.meta.env.DEV || typeof import.meta.env.DEV === 'undefined') {
      const stored = useAuthStore.getState().token;
      console.log(
        '[AuthStore] ✅ Store state after login:',
        `token=${stored?.slice(0, 12)}…`,
        `user=${useAuthStore.getState().user?.email}`
      );
    }
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
