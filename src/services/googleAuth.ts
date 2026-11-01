export interface GoogleWorkspaceUser {
  uid: string;
  displayName: string | null;
  email: string | null;
  photoURL: string | null;
}

const WORKSPACE_SCOPES = [
  'openid',
  'email',
  'profile',
  'https://www.googleapis.com/auth/spreadsheets',
  'https://www.googleapis.com/auth/drive.file',
  'https://www.googleapis.com/auth/gmail.send',
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/calendar',
  'https://www.googleapis.com/auth/calendar.events',
].join(' ');

const STORAGE_KEY_GOOGLE_USER = 'cuk_chem_workspace_user';

let cachedAccessToken: string | null = null;
let cachedUser: GoogleWorkspaceUser | null = (() => {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY_GOOGLE_USER);
    return raw ? (JSON.parse(raw) as GoogleWorkspaceUser) : null;
  } catch {
    return null;
  }
})();

const authListeners = new Set<(user: GoogleWorkspaceUser | null, token: string | null) => void>();

function notifyListeners() {
  for (const listener of authListeners) {
    listener(cachedUser, cachedAccessToken);
  }
}

function loadGisScript(): Promise<void> {
  return new Promise((resolve, reject) => {
    if ((window as any).google?.accounts?.oauth2) {
      resolve();
      return;
    }
    const existing = document.querySelector('script[src="https://accounts.google.com/gsi/client"]');
    if (existing) {
      existing.addEventListener('load', () => resolve());
      existing.addEventListener('error', () =>
        reject(new Error('Failed to load Google Identity Services script'))
      );
      return;
    }
    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Failed to load Google Identity Services script'));
    document.head.appendChild(script);
  });
}

export const initAuth = (
  onAuthSuccess?: (user: GoogleWorkspaceUser, token: string) => void,
  onAuthFailure?: () => void
) => {
  const listener = (user: GoogleWorkspaceUser | null, token: string | null) => {
    if (user && token) {
      onAuthSuccess?.(user, token);
    } else {
      onAuthFailure?.();
    }
  };
  authListeners.add(listener);

  if (cachedUser && cachedAccessToken) {
    onAuthSuccess?.(cachedUser, cachedAccessToken);
  } else {
    onAuthFailure?.();
  }

  return () => {
    authListeners.delete(listener);
  };
};

export const googleSignIn = async (): Promise<{
  user: GoogleWorkspaceUser;
  accessToken: string;
} | null> => {
  const clientId = (import.meta as any).env?.VITE_GOOGLE_CLIENT_ID;
  if (!clientId) {
    throw new Error(
      'Google OAuth Client ID (VITE_GOOGLE_CLIENT_ID) is not configured for direct Workspace API access. Use the CSV Export buttons in the Faculty or CR Portal for offline spreadsheet export.'
    );
  }

  await loadGisScript();

  return new Promise((resolve, reject) => {
    const tokenClient = (window as any).google.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: WORKSPACE_SCOPES,
      callback: async (response: any) => {
        if (response.error) {
          reject(new Error(response.error_description || response.error));
          return;
        }
        const accessToken = response.access_token as string;
        cachedAccessToken = accessToken;

        try {
          const userInfoRes = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
            headers: { Authorization: `Bearer ${accessToken}` },
          });
          const profile = userInfoRes.ok ? await userInfoRes.json() : {};
          const user: GoogleWorkspaceUser = {
            uid: profile.sub || `google_${Date.now()}`,
            displayName: profile.name || 'Google Workspace User',
            email: profile.email || null,
            photoURL: profile.picture || null,
          };
          cachedUser = user;
          try {
            sessionStorage.setItem(STORAGE_KEY_GOOGLE_USER, JSON.stringify(user));
          } catch {
            // ignore storage errors
          }
          notifyListeners();
          resolve({ user, accessToken });
        } catch (err) {
          reject(err);
        }
      },
    });

    tokenClient.requestAccessToken({ prompt: 'consent' });
  });
};

export const getAccessToken = async (): Promise<string | null> => {
  return cachedAccessToken;
};

export const logoutGoogle = async () => {
  const token = cachedAccessToken;
  cachedAccessToken = null;
  cachedUser = null;
  try {
    sessionStorage.removeItem(STORAGE_KEY_GOOGLE_USER);
  } catch {
    // ignore
  }
  if (token && (window as any).google?.accounts?.oauth2?.revoke) {
    try {
      (window as any).google.accounts.oauth2.revoke(token, () => {});
    } catch {
      // ignore
    }
  }
  notifyListeners();
};
