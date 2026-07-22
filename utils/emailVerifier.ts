import { ImapFlow } from 'imapflow';
import { simpleParser } from 'mailparser';

export interface WaitForEmailOptions {
  host: string;
  port?: number;
  user: string;
  pass: string;
  mailbox?: string;          // default: 'INBOX'
  fromContains?: string;     // e.g. 'noreply@glcredentials.com'
  subjectContains?: string;  // e.g. 'shared'
  since: Date;               // only look at mail received after this time
  timeoutMs?: number;        // total time to keep polling
  pollIntervalMs?: number;   // gap between polls
}

export interface FoundEmail {
  subject: string;
  from: string;
  text: string;
  html: string;
  date?: Date;
  attachments?: any[];
}

export interface ShareLinks {
  downloadUrl: string | null;
  alternativeDownloadUrl: string | null;
  verifyUrl: string | null;
  trackId: string | null;
}

/**
 * Pulls the "Download Transcript" link, the alternative download link,
 * the verification page link, and the shared trackId (GUID) out of the
 * GreenLight Credentials share email body.
 *
 * Expected patterns (from the real email template):
 *   Download button URL:
 *     https://lockerdev.glcredentials.com/report/api/share-credentials/view/{trackId}
 *   Verification page URL:
 *     https://lockerdev.glcredentials.com/verify-credentials?type=HS&trackId={trackId}
 */
export function extractShareLinks(body: string): ShareLinks {
  const downloadMatches = [
    ...body.matchAll(
      /https:\/\/[a-z0-9-]+\.glcredentials\.com\/report\/api\/share-credentials\/view\/([a-f0-9-]{36})/gi
    ),
  ];
  const verifyMatch = body.match(
    /https:\/\/[a-z0-9-]+\.glcredentials\.com\/verify-credentials\?[^\s"'<)]+/i
  );

  const downloadUrl = downloadMatches[0]?.[0] ?? null;
  const alternativeDownloadUrl = downloadMatches[1]?.[0] ?? downloadMatches[0]?.[0] ?? null;
  const verifyUrl = verifyMatch?.[0] ?? null;

  const trackIdFromDownload = downloadMatches[0]?.[1];
  const trackIdFromVerify = verifyUrl?.match(/trackId=([a-f0-9-]{36})/i)?.[1];
  const trackId = trackIdFromDownload ?? trackIdFromVerify ?? null;

  return { downloadUrl, alternativeDownloadUrl, verifyUrl, trackId };
}

/**
 * Connects to an IMAP mailbox and polls it until an email matching the
 * given criteria shows up, or the timeout is reached.
 */
export async function waitForShareEmail(options: WaitForEmailOptions): Promise<FoundEmail> {
  const {
    host,
    port = 993,
    user,
    pass,
    mailbox = 'INBOX',
    fromContains,
    subjectContains,
    since,
    timeoutMs = 90_000,
    pollIntervalMs = 5_000,
  } = options;

  const client = new ImapFlow({
    host,
    port,
    secure: true,
    auth: { user, pass },
    logger: false,
  });

  const deadline = Date.now() + timeoutMs;

  await client.connect();

  try {
    while (Date.now() < deadline) {
      const lock = await client.getMailboxLock(mailbox);
      try {
        const searchCriteria: Record<string, unknown> = { since };
        if (fromContains) searchCriteria.from = fromContains;

        const uids = await client.search(searchCriteria, { uid: true });

        if (uids && uids.length > 0) {
          // Check newest messages first
          const sortedUids = [...uids].sort((a, b) => b - a);

          for (const uid of sortedUids) {
            const message = await client.fetchOne(uid, { source: true }, { uid: true });
            if (!message || !message.source) continue;

            const parsed = await simpleParser(message.source as Buffer);
            const subject = parsed.subject || '';

            const subjectMatches =
              !subjectContains || subject.toLowerCase().includes(subjectContains.toLowerCase());

            if (subjectMatches) {
              return {
                subject,
                from: parsed.from?.text || '',
                text: parsed.text || '',
                html: (parsed.html as string) || '',
                date: parsed.date,
                attachments: parsed.attachments || [],
              };
            }
          }
        }
      } finally {
        lock.release();
      }

      if (Date.now() + pollIntervalMs < deadline) {
        await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
      } else {
        break;
      }
    }

    throw new Error(
      `Timed out after ${timeoutMs}ms waiting for an email matching subject:"${subjectContains}"` +
        (fromContains ? ` from:"${fromContains}"` : '') +
        ` since ${since.toISOString()}`
    );
  } finally {
    await client.logout();
  }
}