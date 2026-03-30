import type { Database } from "bun:sqlite";
import { sendEmail } from "./email";
import { HTML_TAG_PATTERN } from "../constants";
const MAX_MESSAGE_LENGTH = 2_000;
const CONTACT_RATE_LIMIT = 3;

type SendContactInput = {
  fromUserId: number;
  toOqId: number;
  message: string;
};

type ContactTargetRow = {
  user_id: number;
  contactable: number;
  email: string;
};

type UserEmailRow = {
  email: string;
};

type CountRow = {
  count: number;
};

function getContactTarget(db: Database, toOqId: number): ContactTargetRow | null {
  return db
    .query(`
      SELECT oq_profiles.user_id, oq_profiles.contactable, users.email
      FROM oq_profiles
      JOIN users ON users.id = oq_profiles.user_id
      WHERE oq_profiles.id = ?
    `)
    .get(toOqId) as ContactTargetRow | null;
}

function getUserEmail(db: Database, userId: number): string {
  const row = db
    .query("SELECT email FROM users WHERE id = ?")
    .get(userId) as UserEmailRow | null;

  if (!row) {
    throw new Error("user_not_found");
  }

  return row.email;
}

function sanitizeMessage(message: string): string {
  return message.replace(new RegExp(HTML_TAG_PATTERN.source, "g"), "").trim();
}

function getRecentContactCount(db: Database, fromUserId: number, toOqId: number): number {
  const row = db
    .query(`
      SELECT COUNT(*) AS count
      FROM contacts
      WHERE from_user_id = ?
        AND to_oq_id = ?
        AND sent_at > datetime('now', '-24 hours')
    `)
    .get(fromUserId, toOqId) as CountRow;

  return row.count;
}

export async function sendContact(
  db: Database,
  input: SendContactInput,
): Promise<{ ok: true }> {
  const sanitizedMessage = sanitizeMessage(input.message);

  if (sanitizedMessage.length === 0) {
    throw new Error("message_required");
  }

  if (sanitizedMessage.length > MAX_MESSAGE_LENGTH) {
    throw new Error("message_too_long");
  }

  const target = getContactTarget(db, input.toOqId);

  if (!target) {
    throw new Error("oq_not_found");
  }

  if (target.contactable !== 1) {
    throw new Error("not_contactable");
  }

  if (target.user_id === input.fromUserId) {
    throw new Error("cannot_contact_self");
  }

  if (getRecentContactCount(db, input.fromUserId, input.toOqId) >= CONTACT_RATE_LIMIT) {
    throw new Error("contact_rate_limit");
  }

  const fromEmail = getUserEmail(db, input.fromUserId);
  const insertResult = db
    .query(`
      INSERT INTO contacts (from_user_id, to_oq_id, message, status)
      VALUES (?, ?, ?, 'failed')
    `)
    .run(input.fromUserId, input.toOqId, sanitizedMessage);
  const contactId = Number(insertResult.lastInsertRowid);

  try {
    await sendEmail(target.email, "[OQ] 有人想聯絡你", `${sanitizedMessage}\n\n${fromEmail}`);
    db.query("UPDATE contacts SET status = 'sent' WHERE id = ?").run(contactId);

    return { ok: true };
  } catch (error) {
    db.query("UPDATE contacts SET status = 'failed' WHERE id = ?").run(contactId);
    throw error;
  }
}
