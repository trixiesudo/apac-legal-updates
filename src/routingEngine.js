window.RoutingEngine = (() => {
  const urgencyWeights = {
    'ACTION REQUIRED': 100,
    STRATEGIC: 86,
    WATCH: 62,
    INFORMATIONAL: 38,
    'LOW PRIORITY': 18,
  };

  const implicationMatrix = {
    product: {
      'AI Regulation': 'May affect AI explainability, audit trail, model governance and post-deployment monitoring features.',
      'Privacy/Data Protection': 'May require tighter data minimisation, consent, retention and cross-border transfer controls in product workflows.',
      'Judiciary Modernization': 'Can inform court workflow integrations, filing metadata and user-facing litigation productivity features.',
      'Legal Tech Market Intelligence': 'Signals product gaps, packaging moves or benchmark claims that may need roadmap response.',
      'Legislative Development': 'May create new workflow requirements, alerts or statutory-tracking product opportunities.',
      'Precedent-Setting Judgment': 'Could require updating legal research signals, classification models or practice-area content surfaces.',
      'Citation Spike': 'May indicate rising demand for citation analytics, alerting and research relevance tuning.',
      'API/Data Licensing': 'Could affect ingestion strategy, API rights, caching, downstream use and data-product architecture.',
    },
    sales: {
      'AI Regulation': 'Creates a client conversation opportunity around trusted legal AI, governance controls and defensible adoption.',
      'Privacy/Data Protection': 'Supports board-level conversations about compliant data handling, privacy readiness and risk reduction.',
      'Judiciary Modernization': 'Can position workflow automation and litigation efficiency as practical client value drivers.',
      'Legal Tech Market Intelligence': 'Requires updated objection handling, competitor positioning and executive account messaging.',
      'Legislative Development': 'Creates timely outreach themes for clients exposed to regulatory change.',
      'Precedent-Setting Judgment': 'May create account-specific advisory moments for clients in affected sectors.',
      'Citation Spike': 'Can support renewal and upsell conversations around authoritative research and litigation analytics.',
      'API/Data Licensing': 'Highlights client demand for compliant legal data access and enterprise integration options.',
    },
    legislation: {
      'AI Regulation': 'Requires monitoring for consultation deadlines, draft instruments, gazette developments and implementation guidance.',
      'Privacy/Data Protection': 'Needs tracking across bills, regulator guidance, commencement dates and compliance obligations.',
      'Judiciary Modernization': 'May affect rules of court, procedural amendments and official practice directions.',
      'Legal Tech Market Intelligence': 'Useful market context, but should be checked for legal information coverage implications.',
      'Legislative Development': 'Requires legislative tracking, version comparison, commencement monitoring and stakeholder briefing.',
      'Precedent-Setting Judgment': 'May alter interpretation notes or require linkage to relevant statutory materials.',
      'Citation Spike': 'May indicate an emerging interpretive issue requiring deeper statutory analysis.',
      'API/Data Licensing': 'Could affect official-source access, reuse permissions, data availability and update cadence.',
    },
    editorial: {
      'AI Regulation': 'May signal future demand for AI governance explainers, annotations, practical guidance and issue trackers.',
      'Privacy/Data Protection': 'May need practical explainers, comparative notes and compliance checklists for affected users.',
      'Judiciary Modernization': 'Can generate workflow explainers and practical court procedure notes for practitioners.',
      'Legal Tech Market Intelligence': 'Useful for market awareness and potential legal technology trend coverage.',
      'Legislative Development': 'May require explainers, amendment trackers, commencement notes and jurisdiction comparison content.',
      'Precedent-Setting Judgment': 'Likely requires case note, annotation updates and downstream precedent monitoring.',
      'Citation Spike': 'Strong signal for annotation priority, legal research explainers and related-content surfacing.',
      'API/Data Licensing': 'May support coverage of legal-data access, public legal information and platform policy issues.',
    },
  };

  const recommendedActions = {
    product: {
      default: 'Assess roadmap impact and identify any feature, governance or data-dependency changes.',
      'ACTION REQUIRED': 'Open a product-risk review and confirm whether roadmap or controls need adjustment.',
    },
    sales: {
      default: 'Prepare account messaging and note client segments likely to ask about this issue.',
      STRATEGIC: 'Create an executive talking point for senior leadership and priority client conversations.',
    },
    legislation: {
      default: 'Track source developments and map deadlines, affected instruments and amendment status.',
      'ACTION REQUIRED': 'Escalate for monitoring calendar entry and owner assignment.',
    },
    editorial: {
      default: 'Assess whether the signal warrants an explainer, annotation update or watchlist item.',
      STRATEGIC: 'Prioritise editorial triage and check related content for update opportunities.',
    },
  };

  function clamp(value, min = 0, max = 100) {
    return Math.max(min, Math.min(max, Math.round(value)));
  }

  function scoreDepartment(item, department) {
    const topicWeight = department.priorityTopics[item.topic] || 0;
    const topicScore = topicWeight * 0.45;
    const jurisdictionScore = department.priorityJurisdictions.includes(item.jurisdiction) ? 18 : 5;
    const urgencyScore = (urgencyWeights[item.urgency] || 20) * 0.18;
    const impactScore = item.impactScore * 0.19;
    const score = clamp(topicScore + jurisdictionScore + urgencyScore + impactScore);
    return {
      departmentId: department.id,
      departmentName: department.name,
      departmentShortName: department.shortName,
      score,
      matchedTopicWeight: topicWeight,
      jurisdictionMatch: department.priorityJurisdictions.includes(item.jurisdiction),
      routed: score >= 58,
      confidence: score >= 82 ? 'High' : score >= 66 ? 'Medium-High' : score >= 48 ? 'Medium' : 'Low',
      whyThisMatters: whyThisMatters(item, department),
      recommendedAction: recommendedAction(item, department),
    };
  }

  function routeItem(item, departments) {
    return departments
      .map((department) => scoreDepartment(item, department))
      .sort((a, b) => b.score - a.score);
  }

  function whyThisMatters(item, department) {
    return implicationMatrix[department.id]?.[item.topic] || 'May require review for team-specific workflow, content or client impact.';
  }

  function recommendedAction(item, department) {
    return recommendedActions[department.id]?.[item.urgency] || recommendedActions[department.id]?.default || 'Review and route to the responsible owner.';
  }

  function generateDigest({ departmentId, cadence, maxItems }, items, departments) {
    const department = departments.find((item) => item.id === departmentId) || departments[0];
    const routed = items
      .map((item) => ({
        item,
        route: scoreDepartment(item, department),
      }))
      .filter((entry) => entry.route.score >= 52)
      .sort((a, b) => b.route.score - a.route.score || b.item.impactScore - a.item.impactScore)
      .slice(0, Number(maxItems) || 6);
    const date = new Intl.DateTimeFormat(undefined, { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date());
    const topTopics = Array.from(new Set(routed.map((entry) => entry.item.topic))).slice(0, 3).join(', ') || 'No priority topics';
    const summary = routed.length
      ? `${routed.length} priority signals for ${department.name}, led by ${topTopics}. Highest urgency items should be reviewed before external or leadership distribution.`
      : `No priority signals currently meet the routing threshold for ${department.name}.`;
    return {
      id: `digest-${department.id}-${Date.now()}`,
      subject: `${cadence} Legal Intelligence Briefing - ${department.name}`,
      title: `${department.shortName} Legal Intelligence Briefing`,
      date,
      cadence,
      department,
      executiveSummary: summary,
      items: routed,
    };
  }

  // Future replacement point: call a real LLM/API here to generate grounded, source-linked implications.
  function generateDepartmentImplications(item, departments) {
    return departments.map((department) => ({
      department,
      ...scoreDepartment(item, department),
    }));
  }

  return {
    urgencyWeights,
    scoreDepartment,
    routeItem,
    whyThisMatters,
    recommendedAction,
    generateDigest,
    generateDepartmentImplications,
  };
})();
