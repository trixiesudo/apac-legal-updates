(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  } else {
    root.EmailDraft = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  function localDateKey(value) {
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) return null;
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  function updateDateKey(value) {
    if (!value) return null;
    if (typeof value === 'string') {
      const match = value.match(/^(\d{4}-\d{2}-\d{2})$/);
      if (match) return match[1];
    }
    return localDateKey(value);
  }

  function formatEmailDate(now = new Date()) {
    return new Intl.DateTimeFormat('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    }).format(now);
  }

  function clean(value) {
    return String(value || '').replace(/\s+/g, ' ').trim();
  }

  function truncateSummary(value) {
    const summary = clean(value);
    if (summary.length <= 320) return summary;
    return `${summary.slice(0, 319).trim()}...`;
  }

  function collectTodaysUpdates(updates, now = new Date()) {
    const today = localDateKey(now);
    return (updates || [])
      .filter((update) =>
        [update.date, update.first_seen_at, update.last_seen_at].some((value) => updateDateKey(value) === today),
      )
      .map((update) => ({
        country: clean(update.country),
        category: clean(update.category),
        source: clean(update.source),
        source_tab: clean(update.source_tab),
        title: clean(update.title),
        summary: truncateSummary(update.summary),
        date: clean(update.date),
        link: clean(update.link),
      }))
      .filter((update) => update.title && update.link);
  }

  function composeUpdatesEmail(items, now = new Date()) {
    const dateLabel = formatEmailDate(now);
    const subject = `APAC Legal Updates - ${dateLabel}`;
    const count = items.length;
    const intro =
      count === 1
        ? `Please find today's legal update below.`
        : `Please find today's ${count} legal updates below.`;
    const sections = items.map((item, index) => {
      const meta = [item.country, item.category, item.source].filter(Boolean).join(' / ');
      return [
        `${index + 1}. ${item.title}`,
        meta ? `   ${meta}` : '',
        item.summary ? `   Summary: ${item.summary}` : '',
        `   Link: ${item.link}`,
      ]
        .filter(Boolean)
        .join('\n');
    });

    return {
      subject,
      body: ['Dear team,', '', intro, '', ...sections, '', 'Best regards,'].join('\n'),
    };
  }

  function buildMailtoLink(draft) {
    const subject = encodeURIComponent(draft.subject || '');
    const body = encodeURIComponent(draft.body || '');
    return `mailto:?subject=${subject}&body=${body}`;
  }

  function buildDraftLaunch(draft, options = {}) {
    const maxMailtoLength = options.maxMailtoLength || 1800;
    const fullMailto = buildMailtoLink(draft);
    if (fullMailto.length <= maxMailtoLength) {
      return {
        clipboardText: '',
        fullMailtoLength: fullMailto.length,
        mailtoLink: fullMailto,
        requiresClipboard: false,
      };
    }

    const compactBody = [
      'Dear team,',
      '',
      'The full update email body has been copied to your clipboard.',
      'Please paste it here before sending.',
      '',
      'Best regards,',
    ].join('\n');

    return {
      clipboardText: draft.body || '',
      fullMailtoLength: fullMailto.length,
      mailtoLink: buildMailtoLink({ subject: draft.subject, body: compactBody }),
      requiresClipboard: true,
    };
  }

  return {
    buildDraftLaunch,
    buildMailtoLink,
    collectTodaysUpdates,
    composeUpdatesEmail,
    formatEmailDate,
    localDateKey,
    updateDateKey,
  };
});
