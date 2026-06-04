type BriefingItem = {
  title: string;
  urgency: string;
  jurisdiction: string;
  sourceName: string;
  sourceUrl: string;
  whatHappened: string;
  whyThisMatters: string;
  recommendedAction: string;
  impactedTeams: string;
  confidence: string;
};

export type EmailTemplateInput = {
  subject: string;
  department: string;
  digestType: string;
  recipientGroup: string;
  createdAt: string;
  executiveSummary: string;
  items: BriefingItem[];
};

const escapeHtml = (value: string) =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

export function buildEmailText(input: EmailTemplateInput): string {
  const lines = [
    input.subject,
    `Audience: ${input.recipientGroup}`,
    `Date: ${input.createdAt}`,
    '',
    'Executive summary',
    input.executiveSummary,
    '',
    'Top intelligence signals',
  ];

  input.items.forEach((item, index) => {
    lines.push(
      '',
      `${index + 1}. ${item.title}`,
      `${item.urgency} / ${item.jurisdiction}`,
      `Source: ${item.sourceName}`,
      `Link: ${item.sourceUrl}`,
      `What happened: ${item.whatHappened}`,
      `Why this matters: ${item.whyThisMatters}`,
      `Recommended action: ${item.recommendedAction}`,
      `Impacted teams: ${item.impactedTeams}`,
      `Confidence: ${item.confidence}`,
    );
  });

  lines.push('', 'Feedback: Useful / Strategic / Irrelevant');
  return lines.join('\n');
}

export function buildEmailHtml(input: EmailTemplateInput): string {
  return `
    <div style="background:#0d141a;color:#eef5f8;font-family:Arial,Helvetica,sans-serif;padding:24px;">
      <div style="max-width:780px;margin:0 auto;background:#17222a;border:1px solid #34434c;border-radius:12px;overflow:hidden;">
        <div style="padding:24px;background:#2b2330;">
          <p style="margin:0 0 8px;color:#ff788d;font-size:12px;font-weight:700;text-transform:uppercase;">${escapeHtml(input.digestType)}</p>
          <h1 style="margin:0;color:#fff;font-size:28px;">${escapeHtml(input.department)} Legal Intelligence Briefing</h1>
          <p style="margin:8px 0 0;color:#c9d7df;font-size:13px;">${escapeHtml(input.createdAt)} / ${escapeHtml(input.recipientGroup)}</p>
        </div>
        <div style="padding:20px 24px;border-top:1px solid #34434c;">
          <h2 style="margin:0 0 8px;color:#fff;font-size:16px;">Executive summary</h2>
          <p style="margin:0;color:#c9d7df;font-size:14px;line-height:1.55;">${escapeHtml(input.executiveSummary)}</p>
        </div>
        <div style="padding:0 24px 20px;">
          ${input.items.map((item) => `
            <div style="margin:0 0 12px;padding:16px;background:#1d2a33;border:1px solid #34434c;border-radius:10px;">
              <p style="margin:0 0 8px;color:#ffb0bd;font-size:11px;font-weight:700;">${escapeHtml(item.urgency)} / ${escapeHtml(item.jurisdiction)} / Confidence: ${escapeHtml(item.confidence)}</p>
              <h3 style="margin:0 0 8px;color:#fff;font-size:17px;"><a href="${escapeHtml(item.sourceUrl)}" style="color:#fff;text-decoration:none;">${escapeHtml(item.title)}</a></h3>
              <p style="margin:0 0 8px;color:#7ad7f0;font-size:12px;font-weight:700;">Source: ${escapeHtml(item.sourceName)}</p>
              <p style="margin:0 0 8px;color:#c9d7df;font-size:13px;"><strong>What happened:</strong> ${escapeHtml(item.whatHappened)}</p>
              <p style="margin:0 0 8px;color:#c9d7df;font-size:13px;"><strong>Why this matters:</strong> ${escapeHtml(item.whyThisMatters)}</p>
              <p style="margin:0;color:#c9d7df;font-size:13px;"><strong>Recommended action:</strong> ${escapeHtml(item.recommendedAction)}</p>
            </div>
          `).join('')}
        </div>
      </div>
    </div>
  `;
}
