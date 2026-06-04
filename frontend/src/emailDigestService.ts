export type DigestStatus = 'Draft' | 'Ready' | 'Sent';

export type EmailRecipientGroup = {
  department: string;
  groupName: string;
  placeholderEmail: string;
  deliveryChannel: 'Email';
};

export type Digest = {
  id: string;
  createdAt: string;
  department: string;
  digestType: string;
  subject: string;
  htmlBody: string;
  textBody: string;
  itemIds: string[];
  status: DigestStatus;
  sentAt: string | null;
  simulatedSentAt: string | null;
};

export type DigestInput = {
  department: string;
  digestType: string;
  subject: string;
  htmlBody: string;
  textBody: string;
  itemIds: string[];
  status?: DigestStatus;
};

const slug = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

export function createDigest(input: DigestInput): Digest {
  return {
    id: `digest-${slug(input.department)}-${slug(input.digestType)}-${Date.now()}`,
    createdAt: new Date().toISOString(),
    department: input.department,
    digestType: input.digestType,
    subject: input.subject,
    htmlBody: input.htmlBody,
    textBody: input.textBody,
    itemIds: input.itemIds,
    status: input.status || 'Ready',
    sentAt: null,
    simulatedSentAt: null,
  };
}

export const recipientGroups: Record<string, EmailRecipientGroup> = {
  product: {
    department: 'PAL (Practice Area Lead)',
    groupName: 'PAL Intelligence',
    placeholderEmail: 'product-intelligence@example.invalid',
    deliveryChannel: 'Email',
  },
  legislation: {
    department: 'Legislation Team',
    groupName: 'Legislation Monitoring Desk',
    placeholderEmail: 'legislation-intelligence@example.invalid',
    deliveryChannel: 'Email',
  },
  sales: {
    department: 'SLT',
    groupName: 'Sales Leadership / SLTs',
    placeholderEmail: 'slt-intelligence@example.invalid',
    deliveryChannel: 'Email',
  },
  editorial: {
    department: 'Editorial Teams',
    groupName: 'Editorial Intelligence Desk',
    placeholderEmail: 'editorial-intelligence@example.invalid',
    deliveryChannel: 'Email',
  },
};
