import crypto from 'node:crypto';
import dns from 'node:dns/promises';
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import dotenv from 'dotenv';
import express from 'express';
import type { NextFunction, Request, Response } from 'express';

dotenv.config();

const PORT = Number(process.env.PORT) || 3000;
const IS_PROD = process.env.NODE_ENV === 'production';
const SESSION_SECRET =
  process.env.SESSION_SECRET && process.env.SESSION_SECRET.trim().length >= 16
    ? process.env.SESSION_SECRET.trim()
    : crypto.randomBytes(32).toString('hex');

const OAUTH_CONFIG_PATH = path.resolve(process.cwd(), 'google-oauth-config.json');
let GOOGLE_OAUTH_CLIENT_ID = process.env.GOOGLE_CLIENT_ID?.trim() ?? '';
let GOOGLE_PROJECT_NUMBER = '';
if (fs.existsSync(OAUTH_CONFIG_PATH)) {
  try {
    const parsed = JSON.parse(fs.readFileSync(OAUTH_CONFIG_PATH, 'utf8')) as {
      clientId?: string;
      projectNumber?: string;
    };
    if (!GOOGLE_OAUTH_CLIENT_ID) {
      GOOGLE_OAUTH_CLIENT_ID = parsed.clientId?.trim() ?? '';
    }
    GOOGLE_PROJECT_NUMBER = parsed.projectNumber?.trim() ?? '';
  } catch {
    GOOGLE_PROJECT_NUMBER = '';
  }
}

const DATA_DIR = path.resolve(process.cwd(), 'data');
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const db = new DatabaseSync(path.join(DATA_DIR, 'crisfinance.db'));
db.exec('PRAGMA foreign_keys = ON;');
db.exec('PRAGMA journal_mode = WAL;');

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    email_verified INTEGER NOT NULL DEFAULT 1,
    mx_domain TEXT NOT NULL,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS password_resets (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    code_hash TEXT NOT NULL,
    attempts INTEGER NOT NULL DEFAULT 0,
    expires_at INTEGER NOT NULL,
    used INTEGER NOT NULL DEFAULT 0,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS transactions (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    description TEXT NOT NULL,
    amount REAL NOT NULL,
    payment_method TEXT NOT NULL,
    type TEXT NOT NULL,
    date_key TEXT NOT NULL,
    created_at TEXT NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_transactions_user_created
    ON transactions (user_id, created_at DESC);

  CREATE TABLE IF NOT EXISTS saved_descriptions (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    text TEXT NOT NULL,
    last_used_at TEXT NOT NULL,
    usage_count INTEGER NOT NULL DEFAULT 1,
    UNIQUE(user_id, text),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_descriptions_user_used
    ON saved_descriptions (user_id, last_used_at DESC);
`);

interface AuthenticatedUser {
  id: string;
  email: string;
  mxDomain: string;
}

interface RequestWithUser extends Request {
  authUser?: AuthenticatedUser;
}

const BLOCKED_DISPOSABLE_DOMAINS = new Set([
  'mailinator.com',
  'tempmail.com',
  'temp-mail.org',
  '10minutemail.com',
  'guerrillamail.com',
  'yopmail.com',
  'throwawaymail.com',
  'trashmail.com',
  'fake.com',
  'teste.com',
  'test.com',
  'example.com',
  'example.org',
  'example.net',
  'invalid.com',
  'localhost',
]);

const EMAIL_REGEX = /^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/;
const VALID_PAYMENT_METHODS = new Set(['pix', 'moeda', 'debito', 'credito', 'boleto']);
const VALID_TYPES = new Set(['entrada', 'saida']);
const DATE_KEY_REGEX = /^\d{4}-\d{2}-\d{2}$/;

function normalizeEmail(raw: unknown): string {
  return typeof raw === 'string' ? raw.trim().toLowerCase() : '';
}

async function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return await Promise.race([
    promise,
    new Promise<T>((_, reject) => {
      setTimeout(() => reject(new Error('DNS_TIMEOUT')), ms);
    }),
  ]);
}

async function verifyEmailVirtually(rawEmail: unknown): Promise<{
  valid: boolean;
  email: string;
  domain: string;
  mxHost?: string;
  reason?: string;
}> {
  const email = normalizeEmail(rawEmail);
  if (!email || email.length > 254 || !EMAIL_REGEX.test(email)) {
    return {
      valid: false,
      email,
      domain: '',
      reason: 'Formato de e-mail inválido.',
    };
  }

  const parts = email.split('@');
  const domain = parts[1] ?? '';
  if (!domain || domain.includes('..') || domain.startsWith('.') || domain.endsWith('.')) {
    return {
      valid: false,
      email,
      domain,
      reason: 'Domínio de e-mail inválido.',
    };
  }

  if (BLOCKED_DISPOSABLE_DOMAINS.has(domain)) {
    return {
      valid: false,
      email,
      domain,
      reason: 'E-mails temporários ou fictícios não são permitidos.',
    };
  }

  try {
    const mxRecords = await withTimeout(dns.resolveMx(domain), 3500);
    if (Array.isArray(mxRecords) && mxRecords.length > 0) {
      const sorted = [...mxRecords].sort((a, b) => a.priority - b.priority);
      return {
        valid: true,
        email,
        domain,
        mxHost: sorted[0].exchange,
      };
    }
  } catch (err) {
    const code = err instanceof Error && 'code' in err ? String((err as NodeJS.ErrnoException).code) : '';
    if (code === 'ENOTFOUND' || code === 'ENODATA') {
      try {
        const ipv4 = await withTimeout(dns.resolve4(domain), 2500);
        if (Array.isArray(ipv4) && ipv4.length > 0) {
          return {
            valid: true,
            email,
            domain,
            mxHost: domain,
          };
        }
      } catch {
        return {
          valid: false,
          email,
          domain,
          reason: 'Domínio de e-mail inexistente ou sem servidor de e-mail.',
        };
      }
    }
    if (err instanceof Error && err.message === 'DNS_TIMEOUT') {
      return {
        valid: true,
        email,
        domain,
        mxHost: domain,
      };
    }
  }

  return {
    valid: false,
    email,
    domain,
    reason: 'Domínio de e-mail sem registros válidos.',
  };
}

async function verifyGoogleAccessToken(accessToken: string): Promise<{
  ok: boolean;
  email?: string;
  domain?: string;
  reason?: string;
}> {
  if (!accessToken || accessToken.length > 4096) {
    return { ok: false, reason: 'Token do Google inválido.' };
  }

  try {
    const tokenInfoUrl = `https://oauth2.googleapis.com/tokeninfo?access_token=${encodeURIComponent(accessToken)}`;
    const tokenInfoRes = await fetch(tokenInfoUrl);
    if (!tokenInfoRes.ok) {
      return { ok: false, reason: 'Não foi possível validar o token com a Google.' };
    }

    const tokenInfo = (await tokenInfoRes.json()) as {
      aud?: string;
      azp?: string;
      email?: string;
      email_verified?: string | boolean;
    };

    if (GOOGLE_OAUTH_CLIENT_ID || GOOGLE_PROJECT_NUMBER) {
      const aud = tokenInfo.aud || '';
      const azp = tokenInfo.azp || '';
      const matchesClient =
        (GOOGLE_OAUTH_CLIENT_ID && (aud === GOOGLE_OAUTH_CLIENT_ID || azp === GOOGLE_OAUTH_CLIENT_ID)) ||
        (GOOGLE_PROJECT_NUMBER &&
          (aud.startsWith(`${GOOGLE_PROJECT_NUMBER}-`) || azp.startsWith(`${GOOGLE_PROJECT_NUMBER}-`)));
      if (!matchesClient) {
        return { ok: false, reason: 'Token não pertence a este aplicativo.' };
      }
    }

    const userInfoRes = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!userInfoRes.ok) {
      return { ok: false, reason: 'Falha ao consultar dados do e-mail na Google.' };
    }

    const userInfo = (await userInfoRes.json()) as {
      email?: string;
      email_verified?: boolean;
    };

    const email = normalizeEmail(userInfo.email || tokenInfo.email);
    const verified =
      userInfo.email_verified === true ||
      tokenInfo.email_verified === true ||
      tokenInfo.email_verified === 'true';

    if (!email || !verified) {
      return { ok: false, reason: 'E-mail não verificado na conta Google.' };
    }

    const domain = email.split('@')[1] || 'gmail.com';
    return { ok: true, email, domain };
  } catch {
    return { ok: false, reason: 'Erro ao se comunicar com os servidores da Google.' };
  }
}

function signGoogleVerificationProof(email: string, domain: string): string {
  const payload = {
    purpose: 'google_email_verified',
    email,
    domain,
    exp: Date.now() + 15 * 60 * 1000,
  };
  const encodedPayload = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  const signature = crypto
    .createHmac('sha256', SESSION_SECRET)
    .update(encodedPayload)
    .digest('base64url');
  return `${encodedPayload}.${signature}`;
}

function verifyGoogleVerificationProof(proof: string): { email: string; domain: string } | null {
  const parts = proof.split('.');
  if (parts.length !== 2) return null;
  const [encodedPayload, providedSig] = parts;
  if (!encodedPayload || !providedSig) return null;

  const expectedSig = crypto
    .createHmac('sha256', SESSION_SECRET)
    .update(encodedPayload)
    .digest('base64url');

  const a = Buffer.from(providedSig, 'utf8');
  const b = Buffer.from(expectedSig, 'utf8');
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return null;
  }

  try {
    const decoded = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString('utf8')) as {
      purpose?: string;
      email?: string;
      domain?: string;
      exp?: number;
    };
    if (
      decoded.purpose !== 'google_email_verified' ||
      !decoded.email ||
      !decoded.domain ||
      !decoded.exp ||
      decoded.exp < Date.now()
    ) {
      return null;
    }
    return { email: decoded.email, domain: decoded.domain };
  } catch {
    return null;
  }
}

function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${derived}`;
}

function verifyPassword(password: string, storedHash: string): boolean {
  const [salt, keyHex] = storedHash.split(':');
  if (!salt || !keyHex) return false;
  const expected = Buffer.from(keyHex, 'hex');
  const derived = crypto.scryptSync(password, salt, 64);
  if (expected.length !== derived.length) return false;
  return crypto.timingSafeEqual(expected, derived);
}

function hashRecoveryCode(userId: string, code: string): string {
  return crypto
    .createHmac('sha256', SESSION_SECRET)
    .update(`${userId}:${code}`)
    .digest('hex');
}

function signAuthToken(user: AuthenticatedUser): string {
  const payload = {
    sub: user.id,
    email: user.email,
    mxDomain: user.mxDomain,
    exp: Date.now() + 7 * 24 * 60 * 60 * 1000,
  };
  const encodedPayload = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  const signature = crypto
    .createHmac('sha256', SESSION_SECRET)
    .update(encodedPayload)
    .digest('base64url');
  return `${encodedPayload}.${signature}`;
}

function verifyAuthToken(token: string): AuthenticatedUser | null {
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [encodedPayload, providedSig] = parts;
  if (!encodedPayload || !providedSig) return null;

  const expectedSig = crypto
    .createHmac('sha256', SESSION_SECRET)
    .update(encodedPayload)
    .digest('base64url');

  const a = Buffer.from(providedSig, 'utf8');
  const b = Buffer.from(expectedSig, 'utf8');
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return null;
  }

  try {
    const decoded = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString('utf8')) as {
      sub?: string;
      email?: string;
      mxDomain?: string;
      exp?: number;
    };
    if (!decoded.sub || !decoded.email || !decoded.exp || decoded.exp < Date.now()) {
      return null;
    }
    const userRow = db
      .prepare('SELECT id, email, mx_domain FROM users WHERE id = ?')
      .get(decoded.sub) as { id: string; email: string; mx_domain: string } | undefined;
    if (!userRow) return null;
    return {
      id: userRow.id,
      email: userRow.email,
      mxDomain: userRow.mx_domain,
    };
  } catch {
    return null;
  }
}

const rateLimitStore = new Map<string, { count: number; resetAt: number }>();

function authRateLimiter(req: Request, res: Response, next: NextFunction): void {
  const key = req.ip || req.socket.remoteAddress || 'unknown';
  const now = Date.now();
  const entry = rateLimitStore.get(key);
  if (!entry || entry.resetAt <= now) {
    rateLimitStore.set(key, { count: 1, resetAt: now + 60_000 });
    next();
    return;
  }
  if (entry.count >= 30) {
    res.status(429).json({ error: 'Muitas tentativas. Aguarde um minuto.' });
    return;
  }
  entry.count += 1;
  next();
}

function requireAuth(req: RequestWithUser, res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Sessão não autenticada.' });
    return;
  }
  const token = header.slice('Bearer '.length).trim();
  const user = verifyAuthToken(token);
  if (!user) {
    res.status(401).json({ error: 'Sessão inválida ou expirada.' });
    return;
  }
  req.authUser = user;
  next();
}

async function sendRecoveryEmailViaResend(email: string, code: string): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const from = process.env.RESEND_FROM_EMAIL?.trim() || 'CrisFinance <onboarding@resend.dev>';
  if (!apiKey) return false;

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from,
      to: [email],
      subject: 'CrisFinance - Código de recuperação de senha',
      text: `Seu código de recuperação de senha da CrisFinance é: ${code}. Ele expira em 15 minutos.`,
    }),
  });

  return response.ok;
}

function getServerLocalDateKey(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

async function startServer() {
  const app = express();
  app.set('trust proxy', 1);
  app.use(express.json({ limit: '64kb' }));

  app.get('/api/auth/google-config', (_req: Request, res: Response) => {
    res.json({ clientId: GOOGLE_OAUTH_CLIENT_ID });
  });

  // Verifica e-mail diretamente com Google OAuth e emite prova assinada
  app.post('/api/auth/verify-google', authRateLimiter, async (req: Request, res: Response) => {
    const accessToken = typeof req.body?.accessToken === 'string' ? req.body.accessToken.trim() : '';
    const check = await verifyGoogleAccessToken(accessToken);
    if (!check.ok || !check.email || !check.domain) {
      res.status(400).json({ error: check.reason || 'Falha na verificação com a Google.' });
      return;
    }

    const existing = db
      .prepare('SELECT id FROM users WHERE email = ?')
      .get(check.email) as { id: string } | undefined;

    const verificationProof = signGoogleVerificationProof(check.email, check.domain);
    res.json({
      email: check.email,
      domain: check.domain,
      alreadyRegistered: Boolean(existing),
      verificationProof,
    });
  });

  app.post('/api/auth/register', authRateLimiter, (req: Request, res: Response) => {
    const email = normalizeEmail(req.body?.email);
    const password = typeof req.body?.password === 'string' ? req.body.password : '';
    const verificationProof =
      typeof req.body?.verificationProof === 'string' ? req.body.verificationProof.trim() : '';

    const verifiedGoogle = verifyGoogleVerificationProof(verificationProof);
    if (!verifiedGoogle || verifiedGoogle.email !== email) {
      res.status(403).json({
        error: 'É obrigatório validar o e-mail na conta Google antes de cadastrar.',
      });
      return;
    }

    if (password.length < 6 || password.length > 128) {
      res.status(400).json({ error: 'A senha deve ter entre 6 e 128 caracteres.' });
      return;
    }

    const existing = db
      .prepare('SELECT id FROM users WHERE email = ?')
      .get(verifiedGoogle.email) as { id: string } | undefined;
    if (existing) {
      res.status(409).json({ error: 'Este e-mail já está cadastrado. Use a aba Entrar.' });
      return;
    }

    const userId = crypto.randomUUID();
    const passwordHash = hashPassword(password);
    const createdAt = new Date().toISOString();

    db.prepare(
      'INSERT INTO users (id, email, password_hash, email_verified, mx_domain, created_at) VALUES (?, ?, ?, 1, ?, ?)'
    ).run(userId, verifiedGoogle.email, passwordHash, verifiedGoogle.domain, createdAt);

    const user: AuthenticatedUser = {
      id: userId,
      email: verifiedGoogle.email,
      mxDomain: verifiedGoogle.domain,
    };
    const token = signAuthToken(user);
    res.status(201).json({ token, user });
  });

  app.post('/api/auth/login', authRateLimiter, (req: Request, res: Response) => {
    const email = normalizeEmail(req.body?.email);
    const password = typeof req.body?.password === 'string' ? req.body.password : '';
    if (!email || !password) {
      res.status(400).json({ error: 'Informe e-mail e senha.' });
      return;
    }

    const row = db
      .prepare('SELECT id, email, password_hash, mx_domain FROM users WHERE email = ?')
      .get(email) as { id: string; email: string; password_hash: string; mx_domain: string } | undefined;

    if (!row || !verifyPassword(password, row.password_hash)) {
      res.status(401).json({ error: 'E-mail ou senha inválidos.' });
      return;
    }

    const user: AuthenticatedUser = {
      id: row.id,
      email: row.email,
      mxDomain: row.mx_domain,
    };
    const token = signAuthToken(user);
    res.json({ token, user });
  });

  app.post('/api/auth/google-login', authRateLimiter, async (req: Request, res: Response) => {
    const accessToken = typeof req.body?.accessToken === 'string' ? req.body.accessToken.trim() : '';
    const check = await verifyGoogleAccessToken(accessToken);
    if (!check.ok || !check.email) {
      res.status(401).json({ error: check.reason || 'Conta Google inválida.' });
      return;
    }

    const row = db
      .prepare('SELECT id, email, mx_domain FROM users WHERE email = ?')
      .get(check.email) as { id: string; email: string; mx_domain: string } | undefined;

    if (!row) {
      res.status(404).json({
        error: 'E-mail ainda não cadastrado. Crie sua senha na aba Criar conta.',
      });
      return;
    }

    const user: AuthenticatedUser = {
      id: row.id,
      email: row.email,
      mxDomain: row.mx_domain,
    };
    const token = signAuthToken(user);
    res.json({ token, user });
  });

  app.post('/api/auth/reset-password-google', authRateLimiter, async (req: Request, res: Response) => {
    const accessToken = typeof req.body?.accessToken === 'string' ? req.body.accessToken.trim() : '';
    const newPassword = typeof req.body?.newPassword === 'string' ? req.body.newPassword : '';

    if (newPassword.length < 6 || newPassword.length > 128) {
      res.status(400).json({ error: 'A nova senha deve ter entre 6 e 128 caracteres.' });
      return;
    }

    const check = await verifyGoogleAccessToken(accessToken);
    if (!check.ok || !check.email) {
      res.status(401).json({ error: check.reason || 'Falha ao validar a conta Google.' });
      return;
    }

    const row = db
      .prepare('SELECT id, email, mx_domain FROM users WHERE email = ?')
      .get(check.email) as { id: string; email: string; mx_domain: string } | undefined;

    if (!row) {
      res.status(404).json({ error: 'Conta não encontrada para este e-mail Google.' });
      return;
    }

    const newHash = hashPassword(newPassword);
    db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(newHash, row.id);

    const user: AuthenticatedUser = {
      id: row.id,
      email: row.email,
      mxDomain: row.mx_domain,
    };
    const token = signAuthToken(user);
    res.json({ ok: true, token, user });
  });

  app.get('/api/auth/me', requireAuth, (req: RequestWithUser, res: Response) => {
    res.json({ user: req.authUser });
  });

  app.post('/api/auth/forgot-password', authRateLimiter, async (req: Request, res: Response) => {
    const emailCheck = await verifyEmailVirtually(req.body?.email);
    if (!emailCheck.valid) {
      res.status(400).json({ error: emailCheck.reason || 'E-mail inválido.' });
      return;
    }

    const userRow = db
      .prepare('SELECT id, email FROM users WHERE email = ?')
      .get(emailCheck.email) as { id: string; email: string } | undefined;

    if (!userRow) {
      res.status(404).json({ error: 'E-mail não encontrado.' });
      return;
    }

    const hasResend = Boolean(process.env.RESEND_API_KEY?.trim());
    if (!hasResend) {
      res.status(400).json({
        error: 'Use a confirmação direta com a conta Google para redefinir sua senha.',
      });
      return;
    }

    const code = String(crypto.randomInt(100000, 1000000));
    const resetId = crypto.randomUUID();
    const codeHash = hashRecoveryCode(userRow.id, code);
    const expiresAt = Date.now() + 15 * 60 * 1000;

    db.prepare('UPDATE password_resets SET used = 1 WHERE user_id = ? AND used = 0').run(userRow.id);
    db.prepare(
      'INSERT INTO password_resets (id, user_id, code_hash, attempts, expires_at, used) VALUES (?, ?, ?, 0, ?, 0)'
    ).run(resetId, userRow.id, codeHash, expiresAt);

    const sent = await sendRecoveryEmailViaResend(userRow.email, code);
    if (!sent) {
      res.status(502).json({ error: 'Falha ao enviar o e-mail de recuperação.' });
      return;
    }
    res.json({ ok: true, delivery: 'email', email: userRow.email });
  });

  app.post('/api/auth/reset-password', authRateLimiter, (req: Request, res: Response) => {
    const email = normalizeEmail(req.body?.email);
    const code = typeof req.body?.code === 'string' ? req.body.code.trim() : '';
    const newPassword = typeof req.body?.newPassword === 'string' ? req.body.newPassword : '';

    if (!email || !/^\d{6}$/.test(code)) {
      res.status(400).json({ error: 'Informe o e-mail e o código de 6 dígitos.' });
      return;
    }
    if (newPassword.length < 6 || newPassword.length > 128) {
      res.status(400).json({ error: 'A nova senha deve ter entre 6 e 128 caracteres.' });
      return;
    }

    const userRow = db
      .prepare('SELECT id, email, mx_domain FROM users WHERE email = ?')
      .get(email) as { id: string; email: string; mx_domain: string } | undefined;

    if (!userRow) {
      res.status(400).json({ error: 'Código inválido ou expirado.' });
      return;
    }

    const resetRow = db
      .prepare(
        'SELECT id, code_hash, attempts, expires_at FROM password_resets WHERE user_id = ? AND used = 0 ORDER BY expires_at DESC LIMIT 1'
      )
      .get(userRow.id) as
      | { id: string; code_hash: string; attempts: number; expires_at: number }
      | undefined;

    if (!resetRow || resetRow.expires_at < Date.now() || resetRow.attempts >= 5) {
      res.status(400).json({ error: 'Código inválido ou expirado.' });
      return;
    }

    const expectedHash = Buffer.from(resetRow.code_hash, 'hex');
    const providedHash = Buffer.from(hashRecoveryCode(userRow.id, code), 'hex');
    if (expectedHash.length !== providedHash.length || !crypto.timingSafeEqual(expectedHash, providedHash)) {
      const nextAttempts = resetRow.attempts + 1;
      db.prepare('UPDATE password_resets SET attempts = ?, used = ? WHERE id = ?').run(
        nextAttempts,
        nextAttempts >= 5 ? 1 : 0,
        resetRow.id
      );
      res.status(400).json({ error: 'Código incorreto.' });
      return;
    }

    const newHash = hashPassword(newPassword);
    db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(newHash, userRow.id);
    db.prepare('UPDATE password_resets SET used = 1 WHERE id = ?').run(resetRow.id);

    const user: AuthenticatedUser = {
      id: userRow.id,
      email: userRow.email,
      mxDomain: userRow.mx_domain,
    };
    const token = signAuthToken(user);
    res.json({ ok: true, token, user });
  });

  // Protected financial data routes
  app.get('/api/transactions', requireAuth, (req: RequestWithUser, res: Response) => {
    const userId = req.authUser!.id;
    const rows = db
      .prepare(
        'SELECT id, user_id, description, amount, payment_method, type, date_key, created_at FROM transactions WHERE user_id = ? ORDER BY created_at DESC'
      )
      .all(userId) as Array<{
      id: string;
      user_id: string;
      description: string;
      amount: number;
      payment_method: string;
      type: string;
      date_key: string;
      created_at: string;
    }>;

    res.json({
      items: rows.map((row) => ({
        id: row.id,
        userId: row.user_id,
        description: row.description,
        amount: row.amount,
        paymentMethod: row.payment_method,
        type: row.type,
        dateKey: row.date_key,
        createdAt: row.created_at,
      })),
    });
  });

  app.post('/api/transactions', requireAuth, (req: RequestWithUser, res: Response) => {
    const userId = req.authUser!.id;
    const rawDescription = typeof req.body?.description === 'string' ? req.body.description.trim() : '';
    const amount = Number(req.body?.amount);
    const paymentMethod = typeof req.body?.paymentMethod === 'string' ? req.body.paymentMethod : '';
    const type = typeof req.body?.type === 'string' ? req.body.type : '';
    const clientDateKey = typeof req.body?.dateKey === 'string' ? req.body.dateKey.trim() : '';

    if (!rawDescription || rawDescription.length > 120) {
      res.status(400).json({ error: 'Descrição inválida.' });
      return;
    }
    if (!Number.isFinite(amount) || amount <= 0 || amount > 999999999) {
      res.status(400).json({ error: 'Valor inválido.' });
      return;
    }
    if (!VALID_PAYMENT_METHODS.has(paymentMethod)) {
      res.status(400).json({ error: 'Forma de pagamento inválida.' });
      return;
    }
    if (!VALID_TYPES.has(type)) {
      res.status(400).json({ error: 'Tipo de lançamento inválido.' });
      return;
    }

    const dateKey = DATE_KEY_REGEX.test(clientDateKey) ? clientDateKey : getServerLocalDateKey();
    const createdAt = new Date().toISOString();
    const roundedAmount = Math.round(amount * 100) / 100;
    const txId = crypto.randomUUID();

    db.prepare(
      'INSERT INTO transactions (id, user_id, description, amount, payment_method, type, date_key, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
    ).run(txId, userId, rawDescription, roundedAmount, paymentMethod, type, dateKey, createdAt);

    const existingDesc = db
      .prepare('SELECT id, usage_count FROM saved_descriptions WHERE user_id = ? AND text = ?')
      .get(userId, rawDescription) as { id: string; usage_count: number } | undefined;

    if (existingDesc) {
      db.prepare('UPDATE saved_descriptions SET last_used_at = ?, usage_count = ? WHERE id = ?').run(
        createdAt,
        existingDesc.usage_count + 1,
        existingDesc.id
      );
    } else {
      db.prepare(
        'INSERT INTO saved_descriptions (id, user_id, text, last_used_at, usage_count) VALUES (?, ?, ?, ?, 1)'
      ).run(crypto.randomUUID(), userId, rawDescription, createdAt);
    }

    res.status(201).json({
      item: {
        id: txId,
        userId,
        description: rawDescription,
        amount: roundedAmount,
        paymentMethod,
        type,
        dateKey,
        createdAt,
      },
    });
  });

  app.delete('/api/transactions/:id', requireAuth, (req: RequestWithUser, res: Response) => {
    const userId = req.authUser!.id;
    const id = typeof req.params.id === 'string' ? req.params.id : '';
    db.prepare('DELETE FROM transactions WHERE id = ? AND user_id = ?').run(id, userId);
    res.json({ ok: true });
  });

  app.get('/api/descriptions', requireAuth, (req: RequestWithUser, res: Response) => {
    const userId = req.authUser!.id;
    const rows = db
      .prepare(
        'SELECT id, user_id, text, last_used_at, usage_count FROM saved_descriptions WHERE user_id = ? ORDER BY last_used_at DESC'
      )
      .all(userId) as Array<{
      id: string;
      user_id: string;
      text: string;
      last_used_at: string;
      usage_count: number;
    }>;

    res.json({
      items: rows.map((row) => ({
        id: row.id,
        userId: row.user_id,
        text: row.text,
        lastUsedAt: row.last_used_at,
        usageCount: row.usage_count,
      })),
    });
  });

  app.delete('/api/descriptions/:id', requireAuth, (req: RequestWithUser, res: Response) => {
    const userId = req.authUser!.id;
    const id = typeof req.params.id === 'string' ? req.params.id : '';
    db.prepare('DELETE FROM saved_descriptions WHERE id = ? AND user_id = ?').run(id, userId);
    res.json({ ok: true });
  });

  if (!IS_PROD) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`CrisFinance server listening on http://0.0.0.0:${PORT}`);
  });
}

void startServer();
