import React, { useState } from 'react';
import { CheckCircle2, Eye, EyeOff, ShieldAlert } from 'lucide-react';
import {
  loginUserApi,
  registerUserApi,
  requestPasswordResetApi,
  resetPasswordApi,
  verifyEmailVirtuallyApi,
} from '../services/financeService';
import { AuthUser } from '../types';
import { BrandLogo } from './BrandLogo';

interface AuthScreenProps {
  onAuthenticated: (token: string, user: AuthUser) => void;
}

type AuthMode = 'login' | 'register' | 'forgot';

export const AuthScreen: React.FC<AuthScreenProps> = ({ onAuthenticated }) => {
  const [mode, setMode] = useState<AuthMode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const [emailVerification, setEmailVerification] = useState<{
    checkedEmail: string;
    valid: boolean;
    message: string;
  } | null>(null);
  const [checkingEmail, setCheckingEmail] = useState(false);

  const [resetStep, setResetStep] = useState<'request' | 'confirm'>('request');
  const [resetCode, setResetCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [virtualCodeDisplay, setVirtualCodeDisplay] = useState<string | null>(null);
  const [resetDeliveryInfo, setResetDeliveryInfo] = useState<string | null>(null);

  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const switchMode = (nextMode: AuthMode) => {
    setMode(nextMode);
    setErrorMsg(null);
    setPassword('');
    setConfirmPassword('');
    setEmailVerification(null);
    setResetStep('request');
    setResetCode('');
    setNewPassword('');
    setVirtualCodeDisplay(null);
    setResetDeliveryInfo(null);
  };

  const handleVerifyEmail = async () => {
    const trimmed = email.trim().toLowerCase();
    if (!trimmed) {
      setEmailVerification({
        checkedEmail: '',
        valid: false,
        message: 'Informe um e-mail para verificar.',
      });
      return;
    }

    setCheckingEmail(true);
    setErrorMsg(null);
    try {
      const result = await verifyEmailVirtuallyApi(trimmed);
      if (result.valid) {
        setEmailVerification({
          checkedEmail: trimmed,
          valid: true,
          message: `E-mail válido (${result.domain})`,
        });
      } else {
        setEmailVerification({
          checkedEmail: trimmed,
          valid: false,
          message: result.error || 'E-mail inválido.',
        });
      }
    } catch {
      setEmailVerification({
        checkedEmail: trimmed,
        valid: false,
        message: 'Falha ao verificar e-mail.',
      });
    } finally {
      setCheckingEmail(false);
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

  const handleRegisterSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

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
      const result = await registerUserApi(email, password);
      onAuthenticated(result.token, result.user);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Falha ao criar conta.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleRequestReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSubmitting(true);
    try {
      const res = await requestPasswordResetApi(email);
      setResetStep('confirm');
      if (res.delivery === 'virtual' && res.virtualCode) {
        setVirtualCodeDisplay(res.virtualCode);
        setResetDeliveryInfo(`Verificação virtual enviada para ${res.email}`);
      } else {
        setVirtualCodeDisplay(null);
        setResetDeliveryInfo(`Código enviado para ${res.email}`);
      }
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Não foi possível iniciar a recuperação.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleConfirmReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSubmitting(true);
    try {
      const res = await resetPasswordApi({
        email,
        code: resetCode,
        newPassword,
      });
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
                  placeholder="seu@email.com"
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
                disabled={submitting}
                className="w-full min-h-[46px] px-5 py-2.5 text-sm font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg transition-colors cursor-pointer disabled:opacity-60"
              >
                {submitting ? 'Entrando...' : 'Entrar'}
              </button>
            </form>
          )}

          {mode === 'register' && (
            <form onSubmit={(e) => void handleRegisterSubmit(e)} className="space-y-4">
              <div className="space-y-1.5">
                <label htmlFor="reg-email" className="block text-sm font-medium text-slate-700">
                  E-mail
                </label>
                <div className="flex gap-2">
                  <input
                    id="reg-email"
                    type="email"
                    required
                    autoComplete="email"
                    value={email}
                    onChange={(e) => {
                      setEmail(e.target.value);
                      setEmailVerification(null);
                    }}
                    placeholder="seu@email.com"
                    className="flex-1 min-h-[44px] px-3.5 py-2 text-sm text-slate-900 bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900 focus:border-slate-900"
                  />
                  <button
                    type="button"
                    disabled={checkingEmail}
                    onClick={() => void handleVerifyEmail()}
                    className="min-h-[44px] px-3.5 py-2 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 border border-slate-200 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-60"
                  >
                    {checkingEmail ? 'Verificando...' : 'Verificar'}
                  </button>
                </div>

                {emailVerification && (
                  <p
                    className={`text-xs font-medium flex items-center gap-1.5 ${
                      emailVerification.valid ? 'text-emerald-700' : 'text-rose-700'
                    }`}
                  >
                    {emailVerification.valid ? (
                      <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                    ) : (
                      <ShieldAlert className="w-3.5 h-3.5 shrink-0" />
                    )}
                    <span>{emailVerification.message}</span>
                  </p>
                )}
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

          {mode === 'forgot' && (
            <div className="space-y-4">
              <h2 className="text-base font-semibold text-slate-900">
                Recuperar senha
              </h2>

              {resetStep === 'request' ? (
                <form onSubmit={(e) => void handleRequestReset(e)} className="space-y-4">
                  <div className="space-y-1.5">
                    <label htmlFor="forgot-email" className="block text-sm font-medium text-slate-700">
                      E-mail cadastrado
                    </label>
                    <input
                      id="forgot-email"
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="seu@email.com"
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
                      {submitting ? 'Enviando...' : 'Enviar código'}
                    </button>
                  </div>
                </form>
              ) : (
                <form onSubmit={(e) => void handleConfirmReset(e)} className="space-y-4">
                  {resetDeliveryInfo && (
                    <p className="text-xs text-slate-600">{resetDeliveryInfo}</p>
                  )}

                  {virtualCodeDisplay && (
                    <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg flex items-center justify-between">
                      <span className="text-xs text-slate-600">Código virtual:</span>
                      <span className="text-base font-mono tabular-nums font-bold text-slate-900 tracking-widest">
                        {virtualCodeDisplay}
                      </span>
                    </div>
                  )}

                  <div className="space-y-1.5">
                    <label htmlFor="reset-code" className="block text-sm font-medium text-slate-700">
                      Código de 6 dígitos
                    </label>
                    <input
                      id="reset-code"
                      type="text"
                      inputMode="numeric"
                      maxLength={6}
                      required
                      value={resetCode}
                      onChange={(e) => setResetCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                      placeholder="000000"
                      className="w-full min-h-[44px] px-3.5 py-2 text-base font-mono tabular-nums tracking-widest text-slate-900 bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900 focus:border-slate-900"
                    />
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
