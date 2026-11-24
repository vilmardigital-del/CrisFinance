const SCOPES = ['https://www.googleapis.com/auth/userinfo.email'];
const GIS_SCRIPT_SRC = 'https://accounts.google.com/gsi/client';

interface GoogleTokenResponse {
  access_token?: string;
  error?: string;
  error_description?: string;
}

interface GoogleTokenClient {
  requestAccessToken: (overrideConfig?: { prompt?: string }) => void;
}

interface GoogleAccountsOAuth2 {
  initTokenClient: (config: {
    client_id: string;
    scope: string;
    callback: (response: GoogleTokenResponse) => void;
    error_callback?: (error: { type?: string; message?: string }) => void;
  }) => GoogleTokenClient;
}

declare global {
  interface Window {
    google?: {
      accounts?: {
        oauth2?: GoogleAccountsOAuth2;
      };
    };
  }
}

let cachedClientId: string | null = null;
let scriptLoadPromise: Promise<void> | null = null;

async function getGoogleClientId(): Promise<string> {
  if (cachedClientId) return cachedClientId;
  const response = await fetch('/api/auth/google-config');
  const data = (await response.json().catch(() => ({}))) as { clientId?: string };
  if (!response.ok || !data.clientId) {
    throw new Error('Configuração de verificação Google indisponível.');
  }
  cachedClientId = data.clientId;
  return cachedClientId;
}

function loadGoogleIdentityScript(): Promise<void> {
  if (window.google?.accounts?.oauth2) {
    return Promise.resolve();
  }
  if (scriptLoadPromise) {
    return scriptLoadPromise;
  }

  scriptLoadPromise = new Promise<void>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(
      `script[src="${GIS_SCRIPT_SRC}"]`
    );
    if (existing) {
      existing.addEventListener('load', () => resolve(), { once: true });
      existing.addEventListener(
        'error',
        () => reject(new Error('Falha ao carregar o serviço do Google.')),
        { once: true }
      );
      return;
    }

    const script = document.createElement('script');
    script.src = GIS_SCRIPT_SRC;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => {
      scriptLoadPromise = null;
      reject(new Error('Falha ao carregar o serviço do Google.'));
    };
    document.head.appendChild(script);
  });

  return scriptLoadPromise;
}

export async function requestGoogleOAuthToken(): Promise<string> {
  const [clientId] = await Promise.all([
    getGoogleClientId(),
    loadGoogleIdentityScript(),
  ]);

  const oauth2 = window.google?.accounts?.oauth2;
  if (!oauth2) {
    throw new Error('Serviço Google Identity indisponível no navegador.');
  }

  return await new Promise<string>((resolve, reject) => {
    const client = oauth2.initTokenClient({
      client_id: clientId,
      scope: SCOPES.join(' '),
      callback: (response) => {
        if (response.error || !response.access_token) {
          reject(
            new Error(
              response.error_description ||
                'Não foi possível validar o e-mail com a Google.'
            )
          );
          return;
        }
        resolve(response.access_token);
      },
      error_callback: (err) => {
        if (err.type === 'popup_closed') {
          reject(new Error('Verificação cancelada antes da conclusão.'));
          return;
        }
        if (err.type === 'popup_failed_to_open') {
          reject(
            new Error(
              'O navegador bloqueou a janela do Google. Permita pop-ups para este site.'
            )
          );
          return;
        }
        reject(new Error(err.message || 'Falha ao validar com a Google.'));
      },
    });

    client.requestAccessToken({ prompt: 'select_account' });
  });
}
