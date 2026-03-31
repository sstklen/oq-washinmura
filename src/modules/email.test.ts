import { afterEach, describe, expect, test } from "bun:test";
import { sendEmail, setEmailSender, setSesModuleLoader } from "./email";

const originalConsoleLog = console.log;
const originalAccessKey = process.env.OQ_AWS_ACCESS_KEY_ID;
const originalSecretKey = process.env.OQ_AWS_SECRET_ACCESS_KEY;
const originalRegion = process.env.OQ_AWS_REGION;

afterEach(() => {
  console.log = originalConsoleLog;
  setEmailSender(null);
  setSesModuleLoader(null);

  if (originalAccessKey === undefined) {
    delete process.env.OQ_AWS_ACCESS_KEY_ID;
  } else {
    process.env.OQ_AWS_ACCESS_KEY_ID = originalAccessKey;
  }

  if (originalSecretKey === undefined) {
    delete process.env.OQ_AWS_SECRET_ACCESS_KEY;
  } else {
    process.env.OQ_AWS_SECRET_ACCESS_KEY = originalSecretKey;
  }

  if (originalRegion === undefined) {
    delete process.env.OQ_AWS_REGION;
  } else {
    process.env.OQ_AWS_REGION = originalRegion;
  }
});

describe("sendEmail", () => {
  test("falls back to console.warn (no body) when no transport configured", async () => {
    const warns: string[] = [];

    delete process.env.OQ_AWS_ACCESS_KEY_ID;
    delete process.env.OQ_AWS_SECRET_ACCESS_KEY;
    delete process.env.OQ_RESEND_API_KEY;
    console.warn = (...args) => {
      warns.push(args.join(" "));
    };

    await expect(sendEmail("to@example.com", "Subject", "Body")).resolves.toBeUndefined();
    expect(warns[0]).toContain("[email-dev]");
    expect(warns[0]).toContain("to=to@example.com");
    expect(warns[0]).not.toContain("Body"); // 不 log 敏感內容
  });

  test("returns void when using an injected email sender", async () => {
    const calls: Array<{ to: string; subject: string; body: string }> = [];

    setEmailSender(async (to, subject, body) => {
      calls.push({ to, subject, body });
    });

    await expect(sendEmail("to@example.com", "Subject", "Body")).resolves.toBeUndefined();
    expect(calls).toEqual([
      {
        to: "to@example.com",
        subject: "Subject",
        body: "Body",
      },
    ]);
  });

  test("retries once when SES send fails the first time", async () => {
    const commands: Array<{ input: unknown }> = [];
    let sendCount = 0;

    process.env.OQ_AWS_ACCESS_KEY_ID = "key";
    process.env.OQ_AWS_SECRET_ACCESS_KEY = "secret";
    process.env.OQ_AWS_REGION = "ap-northeast-1";

    class FakeSendEmailCommand {
      input: unknown;

      constructor(input: unknown) {
        this.input = input;
      }
    }

    class FakeSESClient {
      async send(command: { input: unknown }) {
        commands.push(command);
        sendCount += 1;

        if (sendCount === 1) {
          throw new Error("temporary_ses_failure");
        }
      }
    }

    setSesModuleLoader(async () => ({
      SESClient: FakeSESClient,
      SendEmailCommand: FakeSendEmailCommand,
    }));

    await expect(sendEmail("to@example.com", "Subject", "Body")).resolves.toBeUndefined();
    expect(sendCount).toBe(2);
    expect(commands).toHaveLength(2);
    expect(commands[0]?.input).toEqual({
      Source: "noreply@oq.washinmura.jp",
      Destination: {
        ToAddresses: ["to@example.com"],
      },
      Message: {
        Subject: {
          Data: "Subject",
          Charset: "UTF-8",
        },
        Body: {
          Text: {
            Data: "Body",
            Charset: "UTF-8",
          },
        },
      },
    });
  });
});
