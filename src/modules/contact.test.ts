import { afterEach, describe, expect, test } from "bun:test";
import type { Database } from "bun:sqlite";
import { getDb } from "../db";
import { setEmailSender } from "./email";
import { sendContact } from "./contact";

const databases: Database[] = [];

afterEach(() => {
  setEmailSender(null);

  while (databases.length > 0) {
    const db = databases.pop();

    db?.close();
  }
});

function createTestDb(): Database {
  const db = getDb(":memory:");
  databases.push(db);
  return db;
}

function createUser(db: Database, email: string): number {
  const result = db.query("INSERT INTO users (email) VALUES (?)").run(email);
  return Number(result.lastInsertRowid);
}

function createOqProfile(
  db: Database,
  userId: number,
  options?: {
    id?: number;
    contactable?: number;
  },
): number {
  const hasId = typeof options?.id === "number";
  const contactable = options?.contactable ?? 1;

  if (hasId) {
    db.query(`
      INSERT INTO oq_profiles (
        id,
        user_id,
        oq_value,
        oq_token,
        level,
        contactable,
        tokens_monthly,
        api_cost_monthly
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(options?.id, userId, 88_000, `oq_test_${userId}`, 2, contactable, 300_000_000, 100);

    return options.id as number;
  }

  const result = db.query(`
    INSERT INTO oq_profiles (
      user_id,
      oq_value,
      oq_token,
      level,
      contactable,
      tokens_monthly,
      api_cost_monthly
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(userId, 88_000, `oq_test_${userId}`, 2, contactable, 300_000_000, 100);

  return Number(result.lastInsertRowid);
}

function getContacts(db: Database) {
  return db
    .query("SELECT from_user_id, to_oq_id, message, status FROM contacts ORDER BY id ASC")
    .all() as Array<{
      from_user_id: number;
      to_oq_id: number;
      message: string;
      status: string;
    }>;
}

describe("sendContact", () => {
  test("returns ok, stores a contact row, and sends an email", async () => {
    const db = createTestDb();
    const fromUserId = createUser(db, "from@example.com");
    const toUserId = createUser(db, "to@example.com");
    const toOqId = createOqProfile(db, toUserId);
    const sentEmails: Array<{ to: string; subject: string; body: string }> = [];

    setEmailSender(async (to, subject, body) => {
      sentEmails.push({ to, subject, body });
    });

    const result = await sendContact(db, {
      fromUserId,
      toOqId,
      message: "想合作",
    });
    const contacts = getContacts(db);

    expect(result).toEqual({ ok: true });
    expect(contacts).toEqual([
      {
        from_user_id: fromUserId,
        to_oq_id: toOqId,
        message: "想合作",
        status: "sent",
      },
    ]);
    expect(sentEmails).toEqual([
      {
        to: "to@example.com",
        subject: "[OQ] 有人想聯絡你",
        body: "想合作\n\nfrom@example.com",
      },
    ]);
  });

  test("throws not_contactable when the target profile does not accept contact", async () => {
    const db = createTestDb();
    const fromUserId = createUser(db, "from@example.com");
    const toUserId = createUser(db, "to@example.com");
    const toOqId = createOqProfile(db, toUserId, { contactable: 0 });

    await expect(
      sendContact(db, {
        fromUserId,
        toOqId,
        message: "想合作",
      }),
    ).rejects.toThrow("not_contactable");
  });

  test("throws oq_not_found when the target oq does not exist", async () => {
    const db = createTestDb();
    const fromUserId = createUser(db, "from@example.com");

    await expect(
      sendContact(db, {
        fromUserId,
        toOqId: 999,
        message: "想合作",
      }),
    ).rejects.toThrow("oq_not_found");
  });

  test("throws cannot_contact_self when contacting your own oq", async () => {
    const db = createTestDb();
    const fromUserId = createUser(db, "self@example.com");
    const toOqId = createOqProfile(db, fromUserId);

    await expect(
      sendContact(db, {
        fromUserId,
        toOqId,
        message: "想合作",
      }),
    ).rejects.toThrow("cannot_contact_self");
  });

  test("throws message_required when the message is empty", async () => {
    const db = createTestDb();
    const fromUserId = createUser(db, "from@example.com");
    const toUserId = createUser(db, "to@example.com");
    const toOqId = createOqProfile(db, toUserId);

    await expect(
      sendContact(db, {
        fromUserId,
        toOqId,
        message: "",
      }),
    ).rejects.toThrow("message_required");
  });

  test("throws message_too_long when the message exceeds 2000 characters", async () => {
    const db = createTestDb();
    const fromUserId = createUser(db, "from@example.com");
    const toUserId = createUser(db, "to@example.com");
    const toOqId = createOqProfile(db, toUserId);

    await expect(
      sendContact(db, {
        fromUserId,
        toOqId,
        message: "a".repeat(2001),
      }),
    ).rejects.toThrow("message_too_long");
  });

  test("strips html tags before saving and sending the message", async () => {
    const db = createTestDb();
    const fromUserId = createUser(db, "from@example.com");
    const toUserId = createUser(db, "to@example.com");
    const toOqId = createOqProfile(db, toUserId);
    const sentEmails: Array<{ body: string }> = [];

    setEmailSender(async (_to, _subject, body) => {
      sentEmails.push({ body });
    });

    await sendContact(db, {
      fromUserId,
      toOqId,
      message: "<b>想合作</b>",
    });
    const contacts = getContacts(db);

    expect(contacts[0]?.message).toBe("想合作");
    expect(sentEmails[0]?.body).toBe("想合作\n\nfrom@example.com");
  });

  test("throws contact_rate_limit on the fourth contact within 24 hours", async () => {
    const db = createTestDb();
    const fromUserId = createUser(db, "from@example.com");
    const toUserId = createUser(db, "to@example.com");
    const toOqId = createOqProfile(db, toUserId);

    db.query(`
      INSERT INTO contacts (from_user_id, to_oq_id, message, status, sent_at)
      VALUES (?, ?, ?, 'sent', datetime('now', '-1 hour'))
    `).run(fromUserId, toOqId, "第一次");
    db.query(`
      INSERT INTO contacts (from_user_id, to_oq_id, message, status, sent_at)
      VALUES (?, ?, ?, 'sent', datetime('now', '-2 hours'))
    `).run(fromUserId, toOqId, "第二次");
    db.query(`
      INSERT INTO contacts (from_user_id, to_oq_id, message, status, sent_at)
      VALUES (?, ?, ?, 'sent', datetime('now', '-3 hours'))
    `).run(fromUserId, toOqId, "第三次");

    await expect(
      sendContact(db, {
        fromUserId,
        toOqId,
        message: "第四次",
      }),
    ).rejects.toThrow("contact_rate_limit");
  });
});
