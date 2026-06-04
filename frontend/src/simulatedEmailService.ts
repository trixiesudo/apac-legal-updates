import type { Digest } from './emailDigestService';

export type SimulatedSendResult = {
  digest: Digest;
  message: string;
};

export function simulateSend(digest: Digest): SimulatedSendResult {
  const sentAt = new Date().toISOString();

  // Future integration point:
  // - Microsoft Graph: POST /users/{sender}/sendMail with digest.htmlBody
  // - Outlook desktop: create a draft item instead of sending automatically
  // - SendGrid / AWS SES: pass subject, placeholder recipient group and HTML body
  return {
    digest: {
      ...digest,
      status: 'Sent',
      sentAt,
      simulatedSentAt: sentAt,
    },
    message: 'Send recorded locally. No real email was sent.',
  };
}
