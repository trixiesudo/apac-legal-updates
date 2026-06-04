(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  } else {
    root.JudgeCongratulationTool = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const MOVEMENT_KEYWORDS = {
    retirement: ['retirement of judge', 'retires from', 'retired from', 'judicial retirement'],
    honour: ['judicial award', 'judicial honour', 'judicial honor', 'honoured', 'honored', 'senior counsel appointed'],
    leadership_change: [
      'assumes office',
      'takes office',
      'court leadership',
    ],
    elevation: ['elevated to', 'elevation', 'promoted to', 'promotion to higher court'],
    appointment: [
      'judge appointed',
      'justice appointed',
      'appointed as judge',
      'appointed to',
      'sworn in',
      'oath of office',
      'judicial appointment',
      'court appointment',
      'bench appointment',
      'judicial commissioner',
    ],
  };

  const COURT_PATTERNS = [
    'Supreme Court',
    'Federal Court',
    'Court of Appeal',
    'High Court',
    'District Court',
    'Family Court',
    'Magistrates Court',
    'Constitutional Court',
    'Commercial Court',
    'Syariah Court',
  ];

  function clean(value) {
    return String(value || '').replace(/\s+/g, ' ').trim();
  }

  function escapeRegExp(value) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  function textForUpdate(update) {
    return clean([
      update.title,
      update.summary,
      update.content,
      update.country,
      update.jurisdiction,
      update.category,
      update.source,
      update.sourceName,
      update.source_tab,
      ...(update.tags || []),
    ].filter(Boolean).join(' '));
  }

  function matchKeywords(text) {
    const lower = text.toLowerCase();
    const matches = [];
    Object.entries(MOVEMENT_KEYWORDS).forEach(([type, keywords]) => {
      keywords.forEach((keyword) => {
        if (lower.includes(keyword)) matches.push({ type, keyword });
      });
    });
    return matches;
  }

  function isJudicialSpeech(text) {
    const lower = text.toLowerCase();
    const hasJudgeReference = /\b(chief justice|justice|judge|judicial commissioner)\b/.test(lower);
    const hasSpeechSignal = /\b(speech|speaks|remarks|address|lecture|keynote|message|dialogue|conference|forum|interview|commentary|opinion)\b/.test(lower);
    const hasMovementSignal = /\b(appoint|appointed|appointment|elevated|elevation|promoted|promotion|sworn in|oath of office|assumes office|takes office|retires|retirement|honour|honor|award)\b/.test(lower);
    return hasJudgeReference && hasSpeechSignal && !hasMovementSignal;
  }

  function movementTypeFor(matches) {
    const priority = ['retirement', 'leadership_change', 'elevation', 'appointment', 'honour'];
    return priority.find((type) => matches.some((match) => match.type === type)) || 'unknown';
  }

  function detectCourt(text) {
    return COURT_PATTERNS.find((court) => new RegExp(`\\b${escapeRegExp(court)}\\b`, 'i').test(text)) || '';
  }

  function detectJudgeName(text) {
    const patterns = [
      /\b(?:Justice|Judge|Judicial Commissioner|Chief Justice)\s+([A-Z][A-Za-z.'-]+(?:\s+[A-Z][A-Za-z.'-]+){0,4})\b/,
      /\b([A-Z][A-Za-z.'-]+(?:\s+[A-Z][A-Za-z.'-]+){1,4})\s+(?:has been|was|is)\s+(?:appointed|elevated|promoted|sworn in)\b/,
      /\bappointment of\s+(?:Justice|Judge)?\s*([A-Z][A-Za-z.'-]+(?:\s+[A-Z][A-Za-z.'-]+){1,4})\b/i,
    ];
    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match?.[1]) {
        const name = cleanJudgeName(match[1]);
        if (name.split(/\s+/).length <= 5 && !/Court|Justice$|Judge$|President$/.test(name)) return name;
      }
    }
    return '';
  }

  function cleanJudgeName(value) {
    return clean(value)
      .split(/[.;:,]\s+/)[0]
      .replace(/[.;:,]+$/g, '')
      .replace(/\b(?:Singapore|Malaysia|India|Australia|Hong Kong|New Zealand)?\s*(?:Legal News|News Sources|Judiciary Updates|Press Release).*$/i, '')
      .replace(/\b(?:as|to|at|of|the|court)\b.*$/i, '')
      .trim();
  }

  function detectNewRole(text, movementType) {
    const rolePatterns = [
      /\bappointed as\s+([^.,;]+?)(?:\s+at|\s+of|\.|,|;|$)/i,
      /\bappointed to\s+([^.,;]+?)(?:\s+at|\s+of|\.|,|;|$)/i,
      /\belevated to\s+([^.,;]+?)(?:\s+at|\s+of|\.|,|;|$)/i,
      /\bpromoted to\s+([^.,;]+?)(?:\s+at|\s+of|\.|,|;|$)/i,
      /\bassumes office as\s+([^.,;]+?)(?:\s+at|\s+of|\.|,|;|$)/i,
      /\btakes office as\s+([^.,;]+?)(?:\s+at|\s+of|\.|,|;|$)/i,
    ];
    for (const pattern of rolePatterns) {
      const match = text.match(pattern);
      if (match?.[1]) return clean(match[1]);
    }
    if (movementType === 'leadership_change') {
      const leadership = text.match(/\b(Chief Justice|President of the Court|Deputy President)\b/i);
      if (leadership?.[1]) return clean(leadership[1]);
    }
    if (movementType === 'elevation') return 'Elevation';
    return '';
  }

  function confidenceFor(update, matches, judgeName, court, newRole) {
    if (!matches.length) return 0;
    let score = 28 + Math.min(26, matches.length * 8);
    const movementType = movementTypeFor(matches);
    if (['appointment', 'elevation', 'leadership_change', 'retirement'].includes(movementType)) score += 10;
    if (judgeName) score += 14;
    if (court) score += 10;
    if (newRole) score += 10;
    const sourceText = clean(`${update.source || ''} ${update.sourceName || ''} ${update.source_tab || ''} ${update.category || ''}`).toLowerCase();
    if (/court|judiciar|ministry|government|gazette|bar|law society/.test(sourceText)) score += 8;
    if (/press release|judiciary updates/.test(sourceText)) score += 8;
    if (!judgeName && /elevation/.test(clean(`${update.title || ''} ${update.summary || ''}`).toLowerCase())) score += 10;
    if (/news|legal news/.test(sourceText)) score += 4;
    return Math.max(0, Math.min(100, score));
  }

  function classifyUpdate(update) {
    const text = textForUpdate(update);
    if (isJudicialSpeech(text)) {
      return {
        isJudicialMovement: false,
        movementType: 'unknown',
        confidenceScore: 0,
        matchedKeywords: [],
        detectedJurisdiction: update.country || update.jurisdiction || detectJurisdiction(text) || '',
        detectedCourt: detectCourt(text),
        detectedJudgeName: detectJudgeName(text),
        detectedNewRole: '',
      };
    }
    const matches = matchKeywords(text);
    const movementType = movementTypeFor(matches);
    const court = detectCourt(text);
    const judgeName = detectJudgeName(text);
    const newRole = detectNewRole(text, movementType);
    const confidenceScore = confidenceFor(update, matches, judgeName, court, newRole);
    const isJudicialMovement = confidenceScore >= 42;
    const jurisdiction = update.country || update.jurisdiction || detectJurisdiction(text) || '';
    return {
      isJudicialMovement,
      movementType,
      confidenceScore,
      matchedKeywords: [...new Set(matches.map((match) => match.keyword))],
      detectedJurisdiction: jurisdiction,
      detectedCourt: court,
      detectedJudgeName: judgeName,
      detectedNewRole: newRole,
    };
  }

  function detectJurisdiction(text) {
    return ['Singapore', 'Hong Kong', 'India', 'Australia', 'Malaysia', 'New Zealand'].find((jurisdiction) =>
      new RegExp(`\\b${escapeRegExp(jurisdiction)}\\b`, 'i').test(text)
    ) || '';
  }

  function toJudicialMovement(update) {
    const detection = classifyUpdate(update);
    if (!detection.isJudicialMovement) return null;
    return {
      id: `judicial-${update.id || update.sourceUpdateId || hashText(update.title || update.link || Math.random())}`,
      sourceUpdateId: String(update.id || update.sourceUpdateId || ''),
      judgeName: detection.detectedJudgeName,
      jurisdiction: detection.detectedJurisdiction,
      court: detection.detectedCourt,
      previousRole: '',
      newRole: detection.detectedNewRole,
      movementType: detection.movementType,
      sourceTitle: clean(update.title),
      sourceName: update.source || update.sourceName || '',
      sourceUrl: update.link || update.url || update.sourceUrl || '',
      publishedDate: update.date || update.publishedDate || update.first_seen_at || '',
      summary: clean(update.summary || update.content || ''),
      confidenceScore: detection.confidenceScore,
      status: detection.confidenceScore >= 70 && detection.detectedJudgeName && (detection.detectedNewRole || detection.detectedCourt)
        ? 'detected'
        : 'needs_review',
      matchedKeywords: detection.matchedKeywords,
    };
  }

  function detectMovements(updates) {
    return (updates || []).map(toJudicialMovement).filter(Boolean);
  }

  function hashText(value) {
    let hash = 0;
    for (let index = 0; index < String(value).length; index += 1) {
      hash = ((hash << 5) - hash + String(value).charCodeAt(index)) | 0;
    }
    return Math.abs(hash).toString(36);
  }

  function displayName(movement, allowPlaceholders = true) {
    return movement.judgeName || (allowPlaceholders ? '[Judge Name]' : '');
  }

  function displayRole(movement, allowPlaceholders = true) {
    return movement.newRole || roleFromType(movement.movementType) || (allowPlaceholders ? '[New Role]' : '');
  }

  function roleFromType(type) {
    if (type === 'retirement') return 'your judicial service';
    if (type === 'honour') return 'this honour';
    return '';
  }

  function missingRequiredFields(movement) {
    const missing = [];
    if (!movement.judgeName) missing.push('judge name');
    if (!movement.newRole && !movement.court && movement.movementType !== 'retirement' && movement.movementType !== 'honour') {
      missing.push('new role or court');
    }
    return missing;
  }

  function subjectFor(movement, outputType) {
    const role = displayRole(movement, true);
    if (outputType === 'Short executive note') return `Judicial movement note: ${displayName(movement, true)}`;
    if (movement.movementType === 'retirement') return `Congratulations on your judicial service`;
    return `Congratulations on your appointment as ${role}`;
  }

  function toneSentence(tone) {
    if (tone === 'Warm professional') return 'Please accept our warmest congratulations on this important milestone.';
    if (tone === 'Executive concise') return 'Congratulations on this significant appointment.';
    if (tone === 'Ceremonial') return 'It is a privilege to mark this distinguished milestone in your judicial career.';
    return 'I would like to extend our sincere congratulations on this important appointment.';
  }

  function generateDraft(movement, options = {}) {
    const tone = options.tone || 'Formal judiciary';
    const outputType = options.outputType || 'Email';
    const organisation = options.organisation || '[Organisation/Team]';
    const sender = options.sender || '[Sender Name]';
    const name = displayName(movement, true);
    const role = displayRole(movement, true);
    const courtPhrase = movement.court ? ` at ${movement.court}` : '';
    const jurisdictionPhrase = movement.jurisdiction ? ` in ${movement.jurisdiction}` : '';
    const previousRole = movement.previousRole
      ? ` Your prior service as ${movement.previousRole} has been noted with respect.`
      : '';
    const reviewLabel = 'AI-generated draft. Requires human review before use.';

    if (outputType === 'LinkedIn/internal post') {
      return {
        subject: subjectFor(movement, outputType),
        body: [
          reviewLabel,
          '',
          `${organisation} congratulates ${name} on ${movement.movementType === 'retirement' ? 'their judicial service' : `their ${role}${courtPhrase}`}.`,
          `We wish ${name} every success and continued contribution to the administration of justice${jurisdictionPhrase}.`,
          '',
          'Human review required before posting.',
        ].join('\n'),
        missingFields: missingRequiredFields(movement),
      };
    }

    if (outputType === 'Short executive note') {
      return {
        subject: subjectFor(movement, outputType),
        body: [
          reviewLabel,
          '',
          `${name} has been identified from source reporting for ${movement.movementType.replace(/_/g, ' ')}${role ? `: ${role}` : ''}${courtPhrase}.`,
          `Recommended action: review details against the original source before any congratulatory outreach.`,
        ].join('\n'),
        missingFields: missingRequiredFields(movement),
      };
    }

    const greeting = outputType === 'Formal letter' ? `Dear ${name},` : `Dear ${name},`;
    return {
      subject: subjectFor(movement, outputType),
      body: [
        reviewLabel,
        '',
        greeting,
        '',
        `On behalf of ${organisation}, ${toneSentence(tone).replace('this important appointment', `your appointment as ${role}${courtPhrase}`)}`,
        previousRole,
        '',
        `We wish you every success in this important role and look forward to following your continued contribution to the administration of justice${jurisdictionPhrase}.`,
        '',
        outputType === 'Formal letter' ? 'Yours sincerely,' : 'Yours sincerely,',
        sender,
      ].filter((line) => line !== undefined).join('\n'),
      missingFields: missingRequiredFields(movement),
    };
  }

  function canApproveDraft(movement, draft) {
    return Boolean(draft?.body) && missingRequiredFields(movement).length === 0;
  }

  return {
    classifyUpdate,
    detectMovements,
    generateDraft,
    missingRequiredFields,
    canApproveDraft,
    MOVEMENT_KEYWORDS,
  };
});
