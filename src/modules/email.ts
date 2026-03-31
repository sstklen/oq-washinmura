const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DEFAULT_FROM_EMAIL = "noreply@oq.washinmura.jp";
const DEFAULT_AWS_REGION = "ap-northeast-1";
const SES_MODULE_NAME = "@aws-sdk/client-ses";

type EmailSender = (to: string, subject: string, body: string) => Promise<void>;
type SesModule = {
  SESClient: new (config: {
    region: string;
    credentials: {
      accessKeyId: string;
      secretAccessKey: string;
      sessionToken?: string;
    };
  }) => {
    send(command: unknown): Promise<unknown>;
  };
  SendEmailCommand: new (input: unknown) => unknown;
};
type SesModuleLoader = () => Promise<SesModule>;

let customEmailSender: EmailSender | null = null;
let sesModuleLoader: SesModuleLoader | null = null;

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function isValidEmail(email: string): boolean {
  const normalized = normalizeEmail(email);
  return normalized.length <= 254 && EMAIL_PATTERN.test(normalized);
}

export function setEmailSender(sender: EmailSender | null): void {
  customEmailSender = sender;
}

export function setSesModuleLoader(loader: SesModuleLoader | null): void {
  sesModuleLoader = loader;
}

function shouldUseResend(): boolean {
  return Boolean(process.env.OQ_RESEND_API_KEY);
}

function shouldUseSes(): boolean {
  return Boolean(process.env.OQ_AWS_ACCESS_KEY_ID);
}

function getSesConfig() {
  return {
    region: process.env.OQ_AWS_REGION ?? DEFAULT_AWS_REGION,
    credentials: {
      accessKeyId: process.env.OQ_AWS_ACCESS_KEY_ID ?? "",
      secretAccessKey: process.env.OQ_AWS_SECRET_ACCESS_KEY ?? "",
      sessionToken: process.env.OQ_AWS_SESSION_TOKEN,
    },
  };
}

function createSesInput(to: string, subject: string, body: string) {
  return {
    Source: DEFAULT_FROM_EMAIL,
    Destination: {
      ToAddresses: [to],
    },
    Message: {
      Subject: {
        Data: subject,
        Charset: "UTF-8",
      },
      Body: {
        Text: {
          Data: body,
          Charset: "UTF-8",
        },
      },
    },
  };
}

async function loadSesModule(): Promise<SesModule> {
  if (sesModuleLoader) {
    return await sesModuleLoader();
  }

  const moduleName = SES_MODULE_NAME;
  return (await import(moduleName)) as SesModule;
}

// SES client singleton（避免每次 email 重建 client）
let cachedSesClient: InstanceType<SesModule["SESClient"]> | null = null;

async function getSesClient() {
  if (!cachedSesClient) {
    const { SESClient } = await loadSesModule();
    cachedSesClient = new SESClient(getSesConfig());
  }
  return cachedSesClient;
}

async function sendWithSes(to: string, subject: string, body: string): Promise<void> {
  const { SendEmailCommand } = await loadSesModule();
  const client = await getSesClient();
  const commandInput = createSesInput(to, subject, body);

  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      await client.send(new SendEmailCommand(commandInput));
      return;
    } catch (error) {
      if (attempt === 1) {
        throw error;
      }
    }
  }
}

async function sendWithResend(to: string, subject: string, body: string): Promise<void> {
  const apiKey = process.env.OQ_RESEND_API_KEY;
  const from = process.env.OQ_RESEND_FROM ?? DEFAULT_FROM_EMAIL;

  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ from, to: [to], subject, text: body }),
      });

      if (!res.ok) {
        const err = await res.text();
        throw new Error(`Resend ${res.status}: ${err}`);
      }
      return;
    } catch (error) {
      if (attempt === 1) throw error;
    }
  }
}

export async function sendEmail(to: string, subject: string, body: string): Promise<void> {
  if (customEmailSender) {
    await customEmailSender(to, subject, body);
    return;
  }

  if (shouldUseResend()) {
    await sendWithResend(to, subject, body);
    return;
  }

  if (shouldUseSes()) {
    await sendWithSes(to, subject, body);
    return;
  }

  // 開發模式：log 但不 log 敏感內容（驗證碼/訊息）
  console.warn(`[email-dev] no transport configured. to=${to} subject=${subject} (body hidden)`);
}
