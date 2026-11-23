import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut } from 'firebase/auth';
import firebaseConfig from '../firebase-applet-config.json';

const SCOPES = ['https://www.googleapis.com/auth/userinfo.email'];

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);

const provider = new GoogleAuthProvider();
for (const scope of SCOPES) {
  provider.addScope(scope);
}
provider.setCustomParameters({ prompt: 'select_account' });

export async function requestGoogleOAuthToken(): Promise<string> {
  try {
    const result = await signInWithPopup(auth, provider);
    const credential = GoogleAuthProvider.credentialFromResult(result);
    if (!credential?.accessToken) {
      throw new Error('Não foi possível obter a validação da Google.');
    }
    const token = credential.accessToken;
    await signOut(auth).catch(() => undefined);
    return token;
  } catch (error) {
    const code =
      error && typeof error === 'object' && 'code' in error
        ? String((error as { code: string }).code)
        : '';
    if (code === 'auth/popup-blocked') {
      throw new Error('O navegador bloqueou a janela do Google. Permita pop-ups para este site.');
    }
    if (code === 'auth/popup-closed-by-user') {
      throw new Error('Verificação cancelada antes da conclusão.');
    }
    throw error instanceof Error ? error : new Error('Falha ao validar com a Google.');
  }
}
