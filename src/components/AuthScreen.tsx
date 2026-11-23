import React, { useState } from 'react';
import { CheckCircle2, Eye, EyeOff } from 'lucide-react';
import { requestGoogleOAuthToken } from '../googleAuth';
import {
  googleLoginApi,
  loginUserApi,
  registerUserApi,
  resetPasswordWithGoogleApi,
  verifyGoogleEmailApi,
} from '../services/financeService';
import { AuthUser } from '../types';
import { BrandLogo } from './BrandLogo';

interface AuthScreenProps {
  onAuthenticated: (token: string, user: AuthUser) => void;
}

type AuthMode = 'login' | 'register' | 'forgot';

function GoogleIcon() {
  return (
    <svg viewBox="0 0 48 48" className="w-4 h-4 shrink-0" aria-hidden="true">
      <path
        fill="#EA4335"
        d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
      />
      <path
        fill="#4285F4"
        d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
      />
      <path
        fill="#FBBC05"
        d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
      />
      <path
        fill="#34A853"
        d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
      />
    </svg>
  );
}

export const AuthScreen: React.FC<AuthScreenProps> = ({ onAuthenticated }) => {
  const [mode, setMode] = useState<AuthMode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const [verifiedEmail, setVerifiedEmail] = useState<string | null>(null);
  const [verificationProof, setVerificationProof] = useState<string | null>(null);
  const [googleAccessTokenForReset, setGoogleAccessTokenForReset] = useState<string | null>(null);
  const [newPassword, setNewPassword] = useState('');

  const [verifyingGoogle, setVerifyingGoogle] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const switchMode = (nextMode: AuthMode) => {
    setMode(nextMode);
    setErrorMsg(null);
    setPassword('');
    setConfirmPassword('');
    setNewPassword('');
    setVerifiedEmail(null);
    setVerificationProof(null);
    setGoogleAccessTokenForReset(null);
  };

  const handleVerifyWithGoogleForRegister = async () => {
    setErrorMsg(null);
    setVerifyingGoogle(true);
    try {
      const accessToken = await requestGoogleOAuthToken();
      const verified = await verifyGoogleEmailApi(accessToken);
      if (verified.alreadyRegistered) {
        setErrorMsg(`O e-mail ${verified.email} já possui cadastro. Use a aba Entrar.`);
        return;
      }
      setVerifiedEmail(verified.email);
      setVerificationProof(verified.verificationProof);
      setEmail(verified.email);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Não foi possível verificar com a Google.');
    } finally {
      setVerifyingGoogle(false);
    }
  };

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSubmitting(true);
    try {
      const result = await loginUserApi(email, password);
      onAuthenticated(result.token, result.user);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Falha ao entrar.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleGoogleLogin = async () => {
    setErrorMsg(null);
    setVerifyingGoogle(true);
    try {
      const accessToken = await requestGoogleOAuthToken();
      const result = await googleLoginApi(accessToken);
      onAuthenticated(result.token, result.user);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Falha ao entrar com Google.');
    } finally {
      setVerifyingGoogle(false);
    }
  };

  const handleRegisterSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    if (!verifiedEmail || !verificationProof) {
      setErrorMsg('Verifique seu e-mail com a Google antes de criar a conta.');
      return;
    }
    if (password.length < 6) {
      setErrorMsg('A senha deve ter pelo menos 6 caracteres.');
      return;
    }
    if (password !== confirmPassword) {
      setErrorMsg('As senhas não conferem.');
      return;
    }

    setSubmitting(true);
    try {
      const result = await registerUserApi(verifiedEmail, password, verificationProof);
      onAuthenticated(result.token, result.user);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Falha ao criar conta.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleVerifyGoogleForReset = async () => {
    setErrorMsg(null);
    setVerifyingGoogle(true);
    try {
      const accessToken = await requestGoogleOAuthToken();
      const verified = await verifyGoogleEmailApi(accessToken);
      if (!verified.alreadyRegistered) {
        setErrorMsg(`O e-mail ${verified.email} ainda não está cadastrado.`);
        return;
      }
      setVerifiedEmail(verified.email);
      setGoogleAccessTokenForReset(accessToken);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Falha ao validar com a Google.');
    } finally {
      setVerifyingGoogle(false);
    }
  };

  const handleConfirmResetWithGoogle = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    if (!googleAccessTokenForReset) return;
    if (newPassword.length < 6) {
      setErrorMsg('A nova senha deve ter pelo menos 6 caracteres.');
      return;
    }

    setSubmitting(true);
    try {
      const res = await resetPasswordWithGoogleApi(googleAccessTokenForReset, newPassword);
      onAuthenticated(res.token, res.user);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Erro ao redefinir senha.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
      <div className="w-full max-w-md bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="px-6 py-6 border-b border-slate-200 flex flex-col items-center gap-3 text-center">
          <BrandLogo size="lg" />
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            CrisFinance
          </h1>
        </div>

        {mode !== 'forgot' && (
          <div className="grid grid-cols-2 border-b border-slate-200">
            <button
              type="button"
              onClick={() => switchMode('login')}
              className={`py-3 text-sm font-semibold border-b-2 transition-colors cursor-pointer ${
                mode === 'login'
                  ? 'border-slate-900 text-slate-900 bg-white'
                  : 'border-transparent text-slate-500 hover:text-slate-900 bg-slate-50/70'
              }`}
            >
              Entrar
            </button>
            <button
              type="button"
              onClick={() => switchMode('register')}
              className={`py-3 text-sm font-semibold border-b-2 transition-colors cursor-pointer ${
                mode === 'register'
                  ? 'border-slate-900 text-slate-900 bg-white'
                  : 'border-transparent text-slate-500 hover:text-slate-900 bg-slate-50/70'
              }`}
            >
              Criar conta
            </button>
          </div>
        )}

        <div className="p-6">
          {mode === 'login' && (
            <form onSubmit={(e) => void handleLoginSubmit(e)} className="space-y-4">
              <div className="space-y-1.5">
                <label htmlFor="login-email" className="block text-sm font-medium text-slate-700">
                  E-mail
                </label>
                <input
                  id="login-email"
                  type="email"
                  required
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="seu@gmail.com"
                  className="w-full min-h-[44px] px-3.5 py-2 text-sm text-slate-900 bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900 focus:border-slate-900"
                />
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label htmlFor="login-password" className="block text-sm font-medium text-slate-700">
                    Senha
                  </label>
                  <button
                    type="button"
                    onClick={() => switchMode('forgot')}
                    className="text-xs font-medium text-slate-600 hover:text-slate-900 hover:underline cursor-pointer"
                  >
                    Esqueci minha senha
                  </button>
                </div>
                <div className="relative">
                  <input
                    id="login-password"
                    type={showPassword ? 'text' : 'password'}
                    required
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••"
                    className="w-full min-h-[44px] pl-3.5 pr-10 py-2 text-sm text-slate-900 bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900 focus:border-slate-900"
                  />
                  <button
                    type="button"
                    aria-label="Alternar visibilidade da senha"
                    onClick={() => setShowPassword((prev) => !prev)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-700 cursor-pointer"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {errorMsg && (
                <p role="alert" className="text-xs font-medium text-rose-700">
                  {errorMsg}
                </p>
              )}

              <button
                type="submit"
                disabled={submitting || verifyingGoogle}
                className="w-full min-h-[46px] px-5 py-2.5 text-sm font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg transition-colors cursor-pointer disabled:opacity-60"
              >
                {submitting ? 'Entrando...' : 'Entrar'}
              </button>

              <div className="relative py-1 flex items-center">
                <div className="flex-grow border-t border-slate-200" />
                <span className="px-3 text-xs text-slate-400">ou</span>
                <div className="flex-grow border-t border-slate-200" />
              </div>

              <button
                type="button"
                disabled={submitting || verifyingGoogle}
                onClick={() => void handleGoogleLogin()}
                className="w-full min-h-[44px] px-4 py-2 text-sm font-medium text-slate-700 bg-white hover:bg-slate-50 border border-slate-300 rounded-lg transition-colors inline-flex items-center justify-center gap-2.5 cursor-pointer disabled:opacity-60"
              >
                <GoogleIcon />
                <span>{verifyingGoogle ? 'Conectando...' : 'Entrar com Google'}</span>
              </button>
            </form>
          )}

          {mode === 'register' && (
            <div className="space-y-4">
              {!verifiedEmail ? (
                <div className="space-y-4">
                  <button
                    type="button"
                    disabled={verifyingGoogle}
                    onClick={() => void handleVerifyWithGoogleForRegister()}
                    className="w-full min-h-[48px] px-4 py-2.5 text-sm font-semibold text-slate-800 bg-white hover:bg-slate-50 border border-slate-300 rounded-lg transition-colors inline-flex items-center justify-center gap-2.5 cursor-pointer disabled:opacity-60"
                  >
                    <GoogleIcon />
                    <span>
                      {verifyingGoogle
                        ? 'Verificando na Google...'
                        : 'Verificar e-mail com Google'}
                    </span>
                  </button>

                  {errorMsg && (
                    <p role="alert" className="text-xs font-medium text-rose-700">
                      {errorMsg}
                    </p>
                  )}
                </div>
              ) : (
                <form onSubmit={(e) => void handleRegisterSubmit(e)} className="space-y-4">
                  <div className="px-3.5 py-2.5 bg-emerald-50 border border-emerald-200 rounded-lg flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0" />
                      <span className="text-sm font-medium text-emerald-900 truncate">
                        {verifiedEmail}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setVerifiedEmail(null);
                        setVerificationProof(null);
                      }}
                      className="text-xs font-medium text-slate-600 hover:text-slate-900 shrink-0 cursor-pointer"
                    >
                      Trocar
                    </button>
                  </div>

                  <div className="space-y-1.5">
                    <label htmlFor="reg-password" className="block text-sm font-medium text-slate-700">
                      Senha
                    </label>
                    <div className="relative">
                      <input
                        id="reg-password"
                        type={showPassword ? 'text' : 'password'}
                        required
                        minLength={6}
                        autoComplete="new-password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="Mínimo 6 caracteres"
                        className="w-full min-h-[44px] pl-3.5 pr-10 py-2 text-sm text-slate-900 bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900 focus:border-slate-900"
                      />
                      <button
                        type="button"
                        aria-label="Alternar visibilidade da senha"
                        onClick={() => setShowPassword((prev) => !prev)}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-700 cursor-pointer"
                      >
                        {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label htmlFor="reg-confirm" className="block text-sm font-medium text-slate-700">
                      Confirmar senha
                    </label>
                    <input
                      id="reg-confirm"
                      type={showPassword ? 'text' : 'password'}
                      required
                      minLength={6}
                      autoComplete="new-password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="Repita a senha"
                      className="w-full min-h-[44px] px-3.5 py-2 text-sm text-slate-900 bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900 focus:border-slate-900"
                    />
                  </div>

                  {errorMsg && (
                    <p role="alert" className="text-xs font-medium text-rose-700">
                      {errorMsg}
                    </p>
                  )}

                  <button
                    type="submit"
                    disabled={submitting}
                    className="w-full min-h-[46px] px-5 py-2.5 text-sm font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg transition-colors cursor-pointer disabled:opacity-60"
                  >
                    {submitting ? 'Criando conta...' : 'Criar conta'}
                  </button>
                </form>
              )}
            </div>
          )}

          {mode === 'forgot' && (
            <div className="space-y-4">
              <h2 className="text-base font-semibold text-slate-900">
                Recuperar senha
              </h2>

              {!googleAccessTokenForReset ? (
                <div className="space-y-4">
                  <button
                    type="button"
                    disabled={verifyingGoogle}
                    onClick={() => void handleVerifyGoogleForReset()}
                    className="w-full min-h-[48px] px-4 py-2.5 text-sm font-semibold text-slate-800 bg-white hover:bg-slate-50 border border-slate-300 rounded-lg transition-colors inline-flex items-center justify-center gap-2.5 cursor-pointer disabled:opacity-60"
                  >
                    <GoogleIcon />
                    <span>
                      {verifyingGoogle
                        ? 'Validando conta...'
                        : 'Confirmar conta com Google'}
                    </span>
                  </button>

                  {errorMsg && (
                    <p role="alert" className="text-xs font-medium text-rose-700">
                      {errorMsg}
                    </p>
                  )}

                  <div className="flex justify-start">
                    <button
                      type="button"
                      onClick={() => switchMode('login')}
                      className="px-4 py-2 text-sm font-medium text-slate-600 hover:text-slate-900 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer"
                    >
                      Voltar
                    </button>
                  </div>
                </div>
              ) : (
                <form onSubmit={(e) => void handleConfirmResetWithGoogle(e)} className="space-y-4">
                  <div className="px-3.5 py-2.5 bg-emerald-50 border border-emerald-200 rounded-lg flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0" />
                    <span className="text-sm font-medium text-emerald-900 truncate">
                      {verifiedEmail}
                    </span>
                  </div>

                  <div className="space-y-1.5">
                    <label htmlFor="reset-new-password" className="block text-sm font-medium text-slate-700">
                      Nova senha
                    </label>
                    <input
                      id="reset-new-password"
                      type={showPassword ? 'text' : 'password'}
                      required
                      minLength={6}
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      placeholder="Mínimo 6 caracteres"
                      className="w-full min-h-[44px] px-3.5 py-2 text-sm text-slate-900 bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900 focus:border-slate-900"
                    />
                  </div>

                  {errorMsg && (
                    <p role="alert" className="text-xs font-medium text-rose-700">
                      {errorMsg}
                    </p>
                  )}

                  <div className="flex items-center justify-between gap-3">
                    <button
                      type="button"
                      onClick={() => switchMode('login')}
                      className="px-4 py-2 text-sm font-medium text-slate-600 hover:text-slate-900 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer"
                    >
                      Voltar
                    </button>
                    <button
                      type="submit"
                      disabled={submitting}
                      className="min-h-[44px] px-5 py-2 text-sm font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg transition-colors cursor-pointer disabled:opacity-60"
                    >
                      {submitting ? 'Salvando...' : 'Redefinir senha'}
                    </button>
                  </div>
                </form>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
