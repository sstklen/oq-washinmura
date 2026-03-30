import type { Database } from "bun:sqlite";
import { SignJWT } from "jose";
import { normalizeEmail, sendEmail } from "./email";

const AUTH_CODE_TTL_MS = 10 * 60 * 1000;
const AUTH_TOKEN_TTL = "30d";

type AuthCodeRow = {
  email: string;
  code: string;
  expires_at: string;
};

type UserRow = {
  id: number;
  email: string;
  display_name: string | null;
  role: string;
};

export type AuthUser = UserRow;

export type AuthTokenPayload = {
  user_id: number;
  email: string;
};

function generateCode(): string {
  const buffer = new Uint32Array(1);
  crypto.getRandomValues(buffer);
  return String(buffer[0] % 1_000_000).padStart(6, "0");
}

function getUserByEmail(db: Database, email: string): UserRow | null {
  return db
    .query("SELECT id, email, display_name, role FROM users WHERE email = ?")
    .get(email) as UserRow | null;
}

export function getJwtSecretKey(): Uint8Array {
  const secret = process.env.JWT_SECRET;

  if (!secret) {
    throw new Error("missing_jwt_secret");
  }

  return new TextEncoder().encode(secret);
}

export async function createAuthToken(payload: AuthTokenPayload): Promise<string> {
  return await new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(AUTH_TOKEN_TTL)
    .sign(getJwtSecretKey());
}

export async function sendCode(db: Database, email: string): Promise<void> {
  const normalizedEmail = normalizeEmail(email);
  const code = generateCode();
  const expiresAt = new Date(Date.now() + AUTH_CODE_TTL_MS).toISOString();

  db.query("DELETE FROM auth_codes WHERE email = ?").run(normalizedEmail);
  db.query("INSERT INTO auth_codes (email, code, expires_at) VALUES (?, ?, ?)")
    .run(normalizedEmail, code, expiresAt);

  await sendEmail(normalizedEmail, "OQ 驗證碼", `你的驗證碼：${code}\n\n10 分鐘內有效，請勿分享給他人。`);
}

export async function verifyCode(
  db: Database,
  email: string,
  code: string,
): Promise<{ token: string; user: AuthUser }> {
  const normalizedEmail = normalizeEmail(email);
  const authCode = db
    .query("SELECT email, code, expires_at FROM auth_codes WHERE email = ? AND code = ?")
    .get(normalizedEmail, code) as AuthCodeRow | null;

  if (!authCode) {
    throw new Error("invalid_code");
  }

  if (Date.parse(authCode.expires_at) <= Date.now()) {
    throw new Error("code_expired");
  }

  db.query("DELETE FROM auth_codes WHERE email = ? AND code = ?").run(normalizedEmail, code);

  const lastLoginAt = new Date().toISOString();
  let user = getUserByEmail(db, normalizedEmail);

  if (user) {
    db.query("UPDATE users SET last_login_at = ? WHERE id = ?").run(lastLoginAt, user.id);
  } else {
    db.query("INSERT INTO users (email, last_login_at) VALUES (?, ?)").run(normalizedEmail, lastLoginAt);
  }

  user = getUserByEmail(db, normalizedEmail);

  if (!user) {
    throw new Error("user_not_found");
  }

  const token = await createAuthToken({
    user_id: user.id,
    email: user.email,
  });

  return {
    token,
    user,
  };
}
