const APP_CONFIG = window.APAC_LEGAL_UPDATES_CONFIG || {};
const IS_LOCAL_HOST = ['localhost', '127.0.0.1', '::1'].includes(window.location.hostname);
const IS_GITHUB_PAGES = window.location.hostname.endsWith('github.io');
const API_BASE =
  (IS_LOCAL_HOST
    ? (APP_CONFIG.localApiBaseUrl || 'http://127.0.0.1:8005')
    : IS_GITHUB_PAGES
      ? APP_CONFIG.apiBaseUrl
    : (
      localStorage.getItem('apacLegalUpdatesApiBase') ||
      localStorage.getItem('legalUpdatesApiBase') ||
      APP_CONFIG.apiBaseUrl ||
      (window.location.protocol === 'https:' || window.location.port === '5175' ? window.location.origin : null) ||
      'http://127.0.0.1:8005'
    ));
const PUBLISH_API_BASE = APP_CONFIG.publishApiBaseUrl || API_BASE;
const PUBLIC_MODE = Boolean(APP_CONFIG.publicMode);
const DEFAULT_COUNTRIES = ['Malaysia', 'Singapore', 'Hong Kong', 'Australia', 'New Zealand', 'India'];
const CATEGORY_ORDER = [
  'Press Release/Judiciary Updates',
  'Case Summary',
  'Recent Judgments',
  'Legal News',
  'Legislation News',
];
const jurisdictionTone = {
  Malaysia: 'my',
  Singapore: 'sg',
  'Hong Kong': 'hk',
  Australia: 'au',
  'New Zealand': 'nz',
  India: 'in',
};
const LEGAL_UPDATES_PAGE = {
  eyebrow: 'Daily legal radar for six jurisdictions',
  title: 'APAC Legal Updates',
  description: 'Court, case, judiciary and legislation signals across Malaysia, Singapore, Hong Kong, Australia, New Zealand and India.',
};
const LEGAL_AI_PAGE = {
  eyebrow: 'Global AI and legal technology intelligence',
  title: 'Legal AI News',
  description: 'Global legal AI, legal technology, AI regulation, and legal industry intelligence.',
};
const RISK_HEATMAP_PAGE = {
  eyebrow: 'Regional legal risk intelligence',
  title: 'APAC Legal Risk Heatmap',
  description: 'Track litigation spikes, AI regulation, cyber/privacy developments, employment law movement, and sanctions/trade restrictions across APAC.',
};
const ROUTING_ENGINE_PAGE = {
  eyebrow: 'Core APAC Legal Intelligence',
  title: 'Legal News Routing Engine',
  description: 'Route curated intelligence from Singapore, Hong Kong, India, Australia and Malaysia to PAL, Legislation, SLT and Editorial teams.',
};
const WEEKLY_DIGEST_PAGE = {
  eyebrow: 'Published APAC legal intelligence',
  title: 'Weekly Digest',
  description: 'Published weekly legal intelligence digests generated from the local APAC Legal Updates workflow.',
};
const JUDGE_TOOL_PAGE = {
  eyebrow: 'Human-reviewed judicial outreach workflow',
  title: 'Email Drafting Tool',
  description: 'Detect judicial appointments, elevations, retirements, and honours, then generate formal congratulatory drafts for human review.',
};
const LEGAL_AI_TOPIC_LABELS = {
  ai_ethics: 'AI Ethics',
  ai_governance: 'AI Governance',
  ai_regulation: 'AI Regulation',
  competitor_intelligence: 'Competitor Intelligence',
  judiciary_ai: 'Judiciary AI',
  legal_ai: 'Legal AI',
  legal_market: 'Legal Market',
  legal_tech: 'Legal Tech',
};
const LEGAL_AI_REGION_LABELS = {
  apac: 'APAC',
  eu: 'EU',
  global: 'Global',
  singapore: 'Singapore',
  uk: 'UK',
  us: 'US',
};
const RISK_LEVELS = ['No Signals', 'Low', 'Watch', 'Active', 'Elevated', 'Critical'];
const RISK_DATE_RANGES = [
  { id: 'All', label: 'All' },
  { id: '7d', label: 'Last 7 days' },
  { id: '30d', label: 'Last 30 days' },
  { id: '90d', label: 'Last 90 days' },
];
const DIGEST_TYPES = [
  'Daily Operational Digest',
  'Weekly Executive Digest',
  'Strategic Alert',
  'Editorial Watchlist',
];
const RECIPIENT_GROUPS = {
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
const STRATEGIC_SIGNAL_THRESHOLD = 72;
const JUDGE_MOVEMENT_TYPES = ['appointment', 'elevation', 'retirement', 'honour', 'leadership_change', 'unknown'];
const JUDGE_STATUSES = ['detected', 'needs_review', 'draft_generated', 'approved', 'rejected', 'exported'];
const JUDGE_TONES = ['Formal judiciary', 'Warm professional', 'Executive concise', 'Ceremonial'];
const JUDGE_OUTPUT_TYPES = ['Email', 'Formal letter', 'LinkedIn/internal post', 'Short executive note'];
const JUDGE_ALLOWED_JURISDICTIONS = ['Malaysia', 'Singapore', 'India'];

let activeCountries = new Set(['All']);
let activeCategory = 'All';
let activePage = 'legal-updates';
let activeAiRegion = 'All';
let activeAiSourceType = 'All';
let activeAiTopic = 'All';
let activeRiskJurisdiction = 'All';
let activeRiskDomain = 'All';
let activeRiskLevel = 'All';
let activeRiskDateRange = 'All';
let activeRiskCell = null;
let activeRoutingTab = 'dashboard';
let activeRoutingJurisdiction = 'All';
let selectedRoutingItemId = window.RoutingMockData?.intelligenceItems?.[0]?.id || null;
let selectedRoutingDepartmentId = 'product';
let selectedDigestType = 'Weekly Executive Digest';
let routingMaxItems = 6;
let digestJurisdictionFilters = new Set(['All']);
let digestTopicFilter = 'All';
let digestIncludeApprovedOnly = false;
let plainTextPreviewOpen = false;
let digestSummaryLoading = false;
let digestSummaryProgress = { completed: 0, total: 0, currentTitle: '' };
let digestContentSummaryResults = {};
let digestSummaryErrors = [];
let digestSummaryErrorsOpen = false;
let selectedDigestItemIds = new Set();
let routingGeneratedCount = Number(localStorage.getItem('routingGeneratedCount') || 0);
let routingDepartmentProfiles = JSON.parse(JSON.stringify(window.RoutingMockData?.departments || []));
let currentRoutingDigest = null;
let routingFeedback = JSON.parse(localStorage.getItem('routingFeedback') || '[]')
  .map((entry) => ({
    ...entry,
    topics: (entry.topics || []).filter((topic) => (window.RoutingMockData?.topics || []).includes(topic)),
  }))
  .filter((entry) => (entry.topics || []).length || !entry.topics);
let routingLegalUpdates = [];
let routingSourceRows = [];
let routingLegalAiRows = [];
let routingLegalAiSourceRows = [];
let routingLoadedFromApi = false;
let digestHistory = JSON.parse(localStorage.getItem('routingDigestHistory') || '[]');
let judgeUpdates = [];
let judgeMovements = [];
let activeJudgeMovementId = null;
let activeJudgeJurisdiction = 'All';
let activeJudgeMovementType = 'All';
let activeJudgeConfidence = 'All';
let activeJudgeStatus = 'All';
let judgeTone = 'Formal judiciary';
let judgeOutputType = 'Email';
let judgeWorkflow = JSON.parse(localStorage.getItem('judgeCongratulationWorkflow') || '{}');
let stats = null;
let sources = [];
let updates = [];
let newsletters = [];
let weeklyDigests = [];
let selectedWeeklyDigestId = null;
let legalAiSources = [];
let legalAiUpdates = [];
let allLegalAiUpdates = [];
let riskHeatmap = null;
let searchTimer = null;
let aiSearchTimer = null;

const els = {
  alert: document.querySelector('#alert'),
  pageEyebrow: document.querySelector('#pageEyebrow'),
  pageTitle: document.querySelector('#pageTitle'),
  pageDescription: document.querySelector('#pageDescription'),
  pageLinks: document.querySelectorAll('[data-page-link]'),
  legalStats: document.querySelector('#legalStats'),
  legalUpdatesPage: document.querySelector('#legalUpdatesPage'),
  legalAiPage: document.querySelector('#legalAiPage'),
  riskHeatmapPage: document.querySelector('#riskHeatmapPage'),
  routingEnginePage: document.querySelector('#routingEnginePage'),
  weeklyDigestPage: document.querySelector('#weeklyDigestPage'),
  weeklyDigestList: document.querySelector('#weeklyDigestList'),
  weeklyDigestDetail: document.querySelector('#weeklyDigestDetail'),
  weeklyDigestCount: document.querySelector('#weeklyDigestCount'),
  judgeToolPage: document.querySelector('#judgeToolPage'),
  themeToggle: document.querySelector('#themeToggle'),
  themeToggleText: document.querySelector('#themeToggleText'),
  reload: document.querySelector('#reload'),
  scan: document.querySelector('#scan'),
  totalCount: document.querySelector('#totalCount'),
  newCount: document.querySelector('#newCount'),
  jurisdictionCount: document.querySelector('#jurisdictionCount'),
  sourceCount: document.querySelector('#sourceCount'),
  officialCount: document.querySelector('#officialCount'),
  lastScan: document.querySelector('#lastScan'),
  search: document.querySelector('#search'),
  countryFilters: document.querySelector('#countryFilters'),
  categoryFilters: document.querySelector('#categoryFilters'),
  shownCount: document.querySelector('#shownCount'),
  updates: document.querySelector('#updates'),
  sourceWatch: document.querySelector('#sourceWatch'),
  sourceWatchCount: document.querySelector('#sourceWatchCount'),
  countryMix: document.querySelector('#countryMix'),
  aiSearch: document.querySelector('#aiSearch'),
  aiRegionFilters: document.querySelector('#aiRegionFilters'),
  aiSourceTypeFilters: document.querySelector('#aiSourceTypeFilters'),
  aiTopicFilters: document.querySelector('#aiTopicFilters'),
  aiShownCount: document.querySelector('#aiShownCount'),
  legalAiUpdates: document.querySelector('#legalAiUpdates'),
  legalAiSources: document.querySelector('#legalAiSources'),
  legalAiSourceCount: document.querySelector('#legalAiSourceCount'),
  riskJurisdictionFilters: document.querySelector('#riskJurisdictionFilters'),
  riskDomainFilters: document.querySelector('#riskDomainFilters'),
  riskLevelFilters: document.querySelector('#riskLevelFilters'),
  riskDateRangeFilters: document.querySelector('#riskDateRangeFilters'),
  riskKpis: document.querySelector('#riskKpis'),
  riskHighestJurisdiction: document.querySelector('#riskHighestJurisdiction'),
  riskHighestJurisdictionDetail: document.querySelector('#riskHighestJurisdictionDetail'),
  riskFastestRising: document.querySelector('#riskFastestRising'),
  riskFastestRisingDetail: document.querySelector('#riskFastestRisingDetail'),
  riskHottestDomain: document.querySelector('#riskHottestDomain'),
  riskHottestDomainDetail: document.querySelector('#riskHottestDomainDetail'),
  riskSignalsWeek: document.querySelector('#riskSignalsWeek'),
  riskSignalsWeekDetail: document.querySelector('#riskSignalsWeekDetail'),
  riskHeatmapCount: document.querySelector('#riskHeatmapCount'),
  riskHeatmapGrid: document.querySelector('#riskHeatmapGrid'),
  riskDetailScore: document.querySelector('#riskDetailScore'),
  riskCellDetail: document.querySelector('#riskCellDetail'),
  routingTabs: document.querySelectorAll('[data-routing-tab]'),
  routingMain: document.querySelector('#routingMain'),
  routingComparison: document.querySelector('#routingComparison'),
  routingSelectedScore: document.querySelector('#routingSelectedScore'),
  judgeDetectedCount: document.querySelector('#judgeDetectedCount'),
  judgeNeedsReviewCount: document.querySelector('#judgeNeedsReviewCount'),
  judgeDraftsCount: document.querySelector('#judgeDraftsCount'),
  judgeApprovedCount: document.querySelector('#judgeApprovedCount'),
  judgeJurisdictionFilters: document.querySelector('#judgeJurisdictionFilters'),
  judgeMovementFilters: document.querySelector('#judgeMovementFilters'),
  judgeConfidenceFilters: document.querySelector('#judgeConfidenceFilters'),
  judgeStatusFilters: document.querySelector('#judgeStatusFilters'),
  judgeShownCount: document.querySelector('#judgeShownCount'),
  judgeMovementList: document.querySelector('#judgeMovementList'),
  judgeDetailStatus: document.querySelector('#judgeDetailStatus'),
  judgeDetail: document.querySelector('#judgeDetail'),
};

function currentTheme() {
  return document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light';
}

function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  localStorage.setItem('apacLegalUpdatesTheme', theme);
  const isDark = theme === 'dark';
  els.themeToggle.setAttribute('aria-pressed', String(isDark));
  els.themeToggleText.textContent = isDark ? 'Light' : 'Dark';
}

function formatDate(value) {
  if (!value) return 'Date pending';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(undefined, { day: '2-digit', month: 'short', year: 'numeric' }).format(date);
}

function timeAgo(value) {
  if (!value) return 'No scan yet';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'No scan yet';
  const minutes = Math.max(1, Math.round((Date.now() - date.getTime()) / 60000));
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours}h ago`;
  return formatDate(value);
}

function setAlert(message) {
  els.alert.textContent = message;
  els.alert.classList.toggle('hidden', !message);
}

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

async function api(path, options) {
  return apiAt(API_BASE, path, options);
}

async function apiAt(baseUrl, path, options) {
  const response = await fetch(`${baseUrl}${path}`, options);
  if (!response.ok) {
    let message = `${path} returned ${response.status}`;
    try {
      const errorBody = await response.json();
      if (errorBody?.detail) message = errorBody.detail;
    } catch (_) {
      // Keep the status-based message when the API does not return JSON.
    }
    throw new Error(message);
  }
  return response.json();
}

async function fetchAllPages(pathOrBuilder, { limit = 200, maxItems = 1200 } = {}) {
  const rows = [];
  for (let offset = 0; offset < maxItems; offset += limit) {
    const path = typeof pathOrBuilder === 'function'
      ? pathOrBuilder({ limit, offset })
      : `${pathOrBuilder}${pathOrBuilder.includes('?') ? '&' : '?'}limit=${limit}&offset=${offset}`;
    const page = await api(path);
    rows.push(...page);
    if (page.length < limit) break;
  }
  return rows;
}

function titleCase(value) {
  return String(value)
    .replace(/[_/]+/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function labelForTopic(value) {
  return value === 'All' ? 'All' : LEGAL_AI_TOPIC_LABELS[value] || titleCase(value);
}

function labelForRegion(value) {
  return value === 'All' ? 'All' : LEGAL_AI_REGION_LABELS[value] || value;
}

function labelForSourceType(value) {
  if (value === 'All') return 'All';
  if (String(value).toLowerCase() === 'html') return 'HTML';
  if (String(value).toLowerCase() === 'rss') return 'RSS';
  return String(value)
    .split('/')
    .map((part) => titleCase(part))
    .join(' / ');
}

function pageCopy(page) {
  if (page === 'legal-ai-news') return LEGAL_AI_PAGE;
  if (page === 'apac-risk-heatmap') return RISK_HEATMAP_PAGE;
  if (page === 'routing-engine') return ROUTING_ENGINE_PAGE;
  if (page === 'weekly-digest') return WEEKLY_DIGEST_PAGE;
  if (page === 'judge-congratulation-tool') return JUDGE_TOOL_PAGE;
  return LEGAL_UPDATES_PAGE;
}

function normalizePage(page) {
  if (PUBLIC_MODE) return 'legal-updates';
  if (page === 'routing-engine' && IS_LOCAL_HOST) return page;
  if (page === 'weekly-digest' && IS_GITHUB_PAGES) return page;
  if (page === 'legal-ai-news' || page === 'apac-risk-heatmap' || page === 'judge-congratulation-tool') return page;
  return 'legal-updates';
}

function renderFilters(container, values, active, onSelect, labelFor = (value) => value) {
  container.innerHTML = '';
  const select = el('select', 'filter-select');
  select.setAttribute('aria-label', container.getAttribute('aria-label') || 'Filter');
  values.forEach((value) => {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = labelFor(value);
    option.selected = value === active;
    select.appendChild(option);
  });
  select.addEventListener('change', () => onSelect(select.value));
  container.appendChild(select);
}

function selectedCountryList() {
  if (activeCountries.has('All')) return [];
  return Array.from(activeCountries);
}

function countryFilterLabel(values) {
  const selected = selectedCountryList();
  if (!selected.length || selected.length === values.length - 1) return 'All jurisdictions';
  if (selected.length === 1) return selected[0];
  return `${selected.length} jurisdictions`;
}

function setCountrySelection(value, checked, values) {
  if (value === 'All') {
    activeCountries = new Set(['All']);
    return;
  }
  const next = new Set(activeCountries);
  next.delete('All');
  if (checked) next.add(value);
  else next.delete(value);
  const countries = values.filter((item) => item !== 'All');
  activeCountries = !next.size || countries.every((country) => next.has(country)) ? new Set(['All']) : next;
}

function renderMultiSelectFilter(container, values, selectedSet, onChange, labelFor = (value) => value) {
  container.innerHTML = '';
  const wrapper = el('details', 'filter-multiselect');
  const summary = el('summary', 'filter-multiselect-summary');
  summary.textContent = countryFilterLabel(values);
  wrapper.appendChild(summary);

  const menu = el('div', 'filter-multiselect-menu');
  values.forEach((value) => {
    const label = el('label', 'filter-multiselect-option');
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.value = value;
    checkbox.checked = value === 'All' ? selectedSet.has('All') : !selectedSet.has('All') && selectedSet.has(value);
    checkbox.addEventListener('change', () => {
      onChange(value, checkbox.checked);
      summary.textContent = countryFilterLabel(values);
      menu.querySelectorAll('input[type="checkbox"]').forEach((input) => {
        input.checked = input.value === 'All' ? activeCountries.has('All') : !activeCountries.has('All') && activeCountries.has(input.value);
      });
    });
    label.append(checkbox, el('span', '', labelFor(value)));
    menu.appendChild(label);
  });
  wrapper.appendChild(menu);
  container.appendChild(wrapper);
}

function setPage(page) {
  activePage = normalizePage(page);
  const copy = pageCopy(activePage);
  els.pageEyebrow.textContent = copy.eyebrow;
  els.pageTitle.textContent = copy.title;
  els.pageDescription.textContent = copy.description;
  els.legalStats.classList.toggle('hidden', activePage !== 'legal-updates');
  els.legalUpdatesPage.classList.toggle('hidden', activePage !== 'legal-updates');
  els.legalAiPage.classList.toggle('hidden', activePage !== 'legal-ai-news');
  els.riskHeatmapPage.classList.toggle('hidden', activePage !== 'apac-risk-heatmap');
  els.routingEnginePage.classList.toggle('hidden', activePage !== 'routing-engine');
  els.weeklyDigestPage.classList.toggle('hidden', activePage !== 'weekly-digest');
  els.judgeToolPage.classList.toggle('hidden', activePage !== 'judge-congratulation-tool');
  els.pageLinks.forEach((link) => {
    link.classList.toggle(
      'hidden',
      (PUBLIC_MODE && link.dataset.pageLink !== 'legal-updates')
        || (link.dataset.pageLink === 'routing-engine' && !IS_LOCAL_HOST)
        || (link.dataset.pageLink === 'weekly-digest' && !IS_GITHUB_PAGES),
    );
    const active = link.dataset.pageLink === activePage;
    link.classList.toggle('active', active);
    link.setAttribute('aria-current', active ? 'page' : 'false');
  });
  if (window.location.hash !== `#${activePage}`) {
    window.history.replaceState(null, '', `#${activePage}`);
  }
  if (activePage === 'legal-ai-news') {
    loadLegalAi().catch((error) => setAlert(error instanceof Error ? error.message : 'Unable to load Legal AI News'));
  } else if (activePage === 'apac-risk-heatmap') {
    loadRiskHeatmap().catch((error) => setAlert(error instanceof Error ? error.message : 'Unable to load APAC Legal Risk Heatmap'));
  } else if (activePage === 'routing-engine') {
    loadRoutingIntelligence().catch((error) => setAlert(error instanceof Error ? error.message : 'Unable to load routing intelligence'));
  } else if (activePage === 'weekly-digest') {
    loadWeeklyDigests().catch((error) => setAlert(error instanceof Error ? error.message : 'Unable to load Weekly Digest'));
  } else if (activePage === 'judge-congratulation-tool') {
    loadJudgeTool().catch((error) => setAlert(error instanceof Error ? error.message : 'Unable to load Email Drafting Tool'));
  } else {
    loadAll();
  }
}

function renderStats() {
  if (PUBLIC_MODE) {
    els.totalCount.textContent = newsletters.length || stats?.total || 0;
    els.newCount.textContent = 'published briefings';
    els.jurisdictionCount.textContent = DEFAULT_COUNTRIES.length;
    els.sourceCount.textContent = 'Public';
    els.officialCount.textContent = 'published newsletters only';
    els.lastScan.textContent = newsletters[0]?.published_at ? formatDate(newsletters[0].published_at) : 'No published newsletters';
    return;
  }
  const countries = stats?.countries?.length ? stats.countries : DEFAULT_COUNTRIES;
  const officialCount = sources.filter((source) => source.official).length;
  els.totalCount.textContent = stats?.total ?? 0;
  els.newCount.textContent = `${stats?.new_24h ?? 0} new in 24h`;
  els.jurisdictionCount.textContent = countries.length;
  els.sourceCount.textContent = sources.length;
  els.officialCount.textContent = `${officialCount} official sources`;
  els.lastScan.textContent = timeAgo(stats?.last_scan_at);
}

function renderFilterBars() {
  if (PUBLIC_MODE) {
    els.countryFilters.innerHTML = '';
    els.categoryFilters.innerHTML = '';
    return;
  }
  const countries = ['All', ...(stats?.countries?.length ? stats.countries : DEFAULT_COUNTRIES)];
  const foundCategories = stats?.categories?.length ? stats.categories : Object.keys(stats?.by_category || {});
  const ordered = CATEGORY_ORDER.filter((item) => foundCategories.includes(item));
  const rest = foundCategories.filter((item) => !CATEGORY_ORDER.includes(item)).sort();
  const categories = ['All', ...ordered, ...rest];

  renderMultiSelectFilter(els.countryFilters, countries, activeCountries, (value, checked) => {
    setCountrySelection(value, checked, countries);
    loadUpdates();
  });
  renderFilters(els.categoryFilters, categories, activeCategory, (value) => {
    activeCategory = value;
    renderFilterBars();
    loadUpdates();
  });
}

function updateCard(item) {
  const card = el('article', 'update-card');
  const meta = el('div', 'update-meta');
  meta.appendChild(el('span', `jurisdiction ${jurisdictionTone[item.country] || 'default'}`, item.country));
  meta.appendChild(el('span', 'category', item.category));
  if (item.source_tab) meta.appendChild(el('span', 'category source-tab', item.source_tab));
  if (item.is_new) meta.appendChild(el('span', 'new-marker', 'New'));
  meta.appendChild(el('span', 'date', formatDate(item.date)));

  const title = el('a', 'update-title', item.title);
  title.href = item.link;
  title.target = '_blank';
  title.rel = 'noreferrer';

  card.append(meta, title);
  if (item.summary) card.appendChild(el('p', 'summary', item.summary));

  const sourceLine = el('div', 'source-line');
  sourceLine.appendChild(el('span', '', item.source));
  sourceLine.appendChild(el('span', '', `Seen ${timeAgo(item.first_seen_at)}`));
  card.appendChild(sourceLine);
  return card;
}

function renderUpdates() {
  els.updates.innerHTML = '';
  els.shownCount.textContent = `${updates.length} shown`;
  if (!updates.length) {
    els.updates.appendChild(el('div', 'empty-state', 'No matching updates yet. Run a scan or loosen the filters.'));
    return;
  }
  updates.forEach((item) => els.updates.appendChild(updateCard(item)));
}

function sourceHealth(run) {
  const node = el('li', 'source-health');
  node.appendChild(el('span', `status-dot ${run.status || 'idle'}`));
  const body = el('div');
  const source = sources.find((item) => item.id === run.source_id);
  body.appendChild(el('strong', '', run.source || run.name));
  body.appendChild(el('span', '', `${run.country} / ${run.item_count || 0} items / ${timeAgo(run.fetched_at)}`));
  if (source?.access_basis) body.appendChild(el('span', 'access-basis', source.access_basis));
  if (run.error) body.appendChild(el('small', '', run.error));
  node.appendChild(body);
  return node;
}

function sourceIdle(source) {
  const node = el('li', 'source-health');
  node.appendChild(el('span', 'status-dot idle'));
  const body = el('div');
  body.appendChild(el('strong', '', source.name));
  body.appendChild(el('span', '', `${source.country} / ${source.source_type.toUpperCase()}`));
  if (source.access_basis) body.appendChild(el('span', 'access-basis', source.access_basis));
  node.appendChild(body);
  return node;
}

function legalAiSourceItem(source) {
  const node = el('li', 'source-health');
  node.appendChild(el('span', 'status-dot idle'));
  const body = el('div');
  body.appendChild(el('strong', '', source.name));
  body.appendChild(el('span', '', `${labelForRegion(source.region)} / ${source.category} / ${source.ingestion_method.toUpperCase()}`));
  body.appendChild(el('span', 'access-basis', labelForSourceType(source.source_type)));
  body.appendChild(el('span', 'source-tags', source.tags.map(labelForTopic).join(', ')));
  node.appendChild(body);
  return node;
}

function renderSourceWatch() {
  if (PUBLIC_MODE) {
    els.sourceWatchCount.textContent = newsletters.length;
    els.sourceWatch.innerHTML = '<li class="source-health"><span class="status-dot ok"></span><div><strong>Published newsletters</strong><span>Raw source feeds are hidden on the public website</span></div></li>';
    return;
  }
  const runs = stats?.source_runs || [];
  const visible = runs.length ? runs.slice(0, 9) : sources.slice(0, 9);
  els.sourceWatchCount.textContent = visible.length;
  els.sourceWatch.innerHTML = '';
  visible.forEach((item) => els.sourceWatch.appendChild(runs.length ? sourceHealth(item) : sourceIdle(item)));
}

function renderLegalAiFilters() {
  const optionSource = allLegalAiUpdates.length ? allLegalAiUpdates : legalAiSources;
  const regions = ['All', ...Array.from(new Set(optionSource.map((item) => item.region))).filter(Boolean).sort()];
  const sourceTypes = ['All', ...Array.from(new Set(optionSource.map((item) => item.category))).filter(Boolean).sort()];
  const topics = ['All', ...Array.from(new Set(optionSource.flatMap((item) => item.tags || []))).sort()];
  if (!regions.includes(activeAiRegion)) activeAiRegion = 'All';
  if (!sourceTypes.includes(activeAiSourceType)) activeAiSourceType = 'All';
  if (!topics.includes(activeAiTopic)) activeAiTopic = 'All';

  renderFilters(els.aiRegionFilters, regions, activeAiRegion, (value) => {
    activeAiRegion = value;
    renderLegalAiFilters();
    renderLegalAiUpdates();
  }, labelForRegion);
  renderFilters(els.aiSourceTypeFilters, sourceTypes, activeAiSourceType, (value) => {
    activeAiSourceType = value;
    renderLegalAiFilters();
    renderLegalAiUpdates();
  });
  renderFilters(els.aiTopicFilters, topics, activeAiTopic, (value) => {
    activeAiTopic = value;
    renderLegalAiFilters();
    renderLegalAiUpdates();
  }, labelForTopic);
}

function renderLegalAiSources() {
  els.legalAiSourceCount.textContent = legalAiSources.length;
  els.legalAiSources.innerHTML = '';
  legalAiSources.forEach((source) => els.legalAiSources.appendChild(legalAiSourceItem(source)));
}

function legalAiUpdateMatches(item) {
  if (activeAiRegion !== 'All' && item.region !== activeAiRegion) return false;
  if (activeAiSourceType !== 'All' && item.category !== activeAiSourceType) return false;
  if (activeAiTopic !== 'All' && !(item.tags || []).includes(activeAiTopic)) return false;
  const term = els.aiSearch.value.trim().toLowerCase();
  if (!term) return true;
  return [item.title, item.summary, item.source, item.category, item.region, ...(item.tags || [])]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
    .includes(term);
}

function renderLegalAiUpdates() {
  els.legalAiUpdates.innerHTML = '';
  const visible = allLegalAiUpdates.filter(legalAiUpdateMatches);
  els.aiShownCount.textContent = `${visible.length} shown`;
  if (!visible.length) {
    const empty = el('div', 'empty-state action-empty');
    empty.appendChild(el('span', '', allLegalAiUpdates.length ? 'No Legal AI News items matched these filters.' : 'No Legal AI News items have been ingested yet.'));
    if (allLegalAiUpdates.length) {
      const reset = el('button', 'ghost-button compact-button', 'Show all Legal AI News');
      reset.type = 'button';
      reset.addEventListener('click', () => {
        activeAiRegion = 'All';
        activeAiSourceType = 'All';
        activeAiTopic = 'All';
        els.aiSearch.value = '';
        renderLegalAiFilters();
        renderLegalAiUpdates();
      });
      empty.appendChild(reset);
    }
    els.legalAiUpdates.appendChild(empty);
    return;
  }
  visible.forEach((item) => {
    els.legalAiUpdates.appendChild(updateCard({
      ...item,
      country: labelForRegion(item.region || item.country),
    }));
  });
}

function saveJudgeWorkflow() {
  localStorage.setItem('judgeCongratulationWorkflow', JSON.stringify(judgeWorkflow));
}

function judgeWorkflowFor(id) {
  return judgeWorkflow[id] || {};
}

function hydrateJudgeMovement(movement) {
  const workflow = judgeWorkflowFor(movement.id);
  return {
    ...movement,
    ...(workflow.fields || {}),
    status: workflow.status || movement.status,
    draft: workflow.draft || null,
  };
}

function confidenceLabel(score) {
  if (score >= 80) return 'High';
  if (score >= 60) return 'Medium';
  return 'Low';
}

function confidenceMatches(score) {
  if (activeJudgeConfidence === 'All') return true;
  return confidenceLabel(score) === activeJudgeConfidence;
}

function visibleJudgeMovements() {
  return judgeMovements.map(hydrateJudgeMovement).filter((movement) => {
    if (activeJudgeJurisdiction !== 'All' && movement.jurisdiction !== activeJudgeJurisdiction) return false;
    if (activeJudgeMovementType !== 'All' && movement.movementType !== activeJudgeMovementType) return false;
    if (!confidenceMatches(movement.confidenceScore)) return false;
    if (activeJudgeStatus !== 'All' && movement.status !== activeJudgeStatus) return false;
    return true;
  });
}

function selectedJudgeMovement() {
  const hydrated = judgeMovements.map(hydrateJudgeMovement);
  return hydrated.find((movement) => movement.id === activeJudgeMovementId) || hydrated[0] || null;
}

function updateJudgeWorkflow(id, patch) {
  const existing = judgeWorkflowFor(id);
  judgeWorkflow[id] = {
    ...existing,
    ...patch,
    fields: {
      ...(existing.fields || {}),
      ...(patch.fields || {}),
    },
  };
  saveJudgeWorkflow();
}

function renderJudgeKpis() {
  const hydrated = judgeMovements.map(hydrateJudgeMovement);
  els.judgeDetectedCount.textContent = hydrated.length;
  els.judgeNeedsReviewCount.textContent = hydrated.filter((item) => item.status === 'needs_review').length;
  els.judgeDraftsCount.textContent = hydrated.filter((item) => ['draft_generated', 'approved', 'exported'].includes(item.status)).length;
  els.judgeApprovedCount.textContent = hydrated.filter((item) => ['approved', 'exported'].includes(item.status)).length;
}

function renderJudgeFilters() {
  const hydrated = judgeMovements.map(hydrateJudgeMovement);
  const jurisdictions = ['All', ...JUDGE_ALLOWED_JURISDICTIONS];
  const movementTypes = ['All', ...JUDGE_MOVEMENT_TYPES.filter((type) => hydrated.some((item) => item.movementType === type))];
  const statuses = ['All', ...JUDGE_STATUSES.filter((status) => hydrated.some((item) => item.status === status))];
  renderFilters(els.judgeJurisdictionFilters, jurisdictions, activeJudgeJurisdiction, (value) => {
    activeJudgeJurisdiction = value;
    renderJudgeTool();
  });
  renderFilters(els.judgeMovementFilters, movementTypes, activeJudgeMovementType, (value) => {
    activeJudgeMovementType = value;
    renderJudgeTool();
  }, labelForJudgeValue);
  renderFilters(els.judgeConfidenceFilters, ['All', 'High', 'Medium', 'Low'], activeJudgeConfidence, (value) => {
    activeJudgeConfidence = value;
    renderJudgeTool();
  });
  renderFilters(els.judgeStatusFilters, statuses, activeJudgeStatus, (value) => {
    activeJudgeStatus = value;
    renderJudgeTool();
  }, labelForJudgeValue);
}

function labelForJudgeValue(value) {
  return value === 'All' ? 'All' : titleCase(String(value).replace(/_/g, ' '));
}

function renderJudgeTool() {
  if (!window.JudgeCongratulationTool) {
    els.judgeMovementList.innerHTML = '<div class="empty-state">Judge drafting helper is not available. Reload the page and try again.</div>';
    return;
  }
  renderJudgeKpis();
  renderJudgeFilters();
  const visible = visibleJudgeMovements();
  els.judgeShownCount.textContent = `${visible.length} shown`;
  if (!judgeMovements.length) {
    els.judgeMovementList.innerHTML = `
      <div class="empty-state action-empty">
        <span>No judicial appointments or elevations detected yet.</span>
        <p>Judicial movement items will appear here when matching updates are collected from legal news, court, or government sources.</p>
      </div>
    `;
  } else if (!visible.length) {
    els.judgeMovementList.innerHTML = '<div class="empty-state">No detected judicial movement items match these filters.</div>';
  } else {
    els.judgeMovementList.innerHTML = visible.map(renderJudgeMovementRow).join('');
  }
  document.querySelectorAll('[data-judge-movement]').forEach((button) => {
    button.addEventListener('click', () => {
      activeJudgeMovementId = button.dataset.judgeMovement;
      renderJudgeTool();
    });
  });
  renderJudgeDetail();
}

function renderJudgeMovementRow(movement) {
  const selected = movement.id === activeJudgeMovementId;
  return `
    <article class="routing-item-card judge-movement-card ${selected ? 'selected' : ''}">
      <button class="routing-item-main" type="button" data-judge-movement="${escapeHtml(movement.id)}">
        <div class="update-meta">
          <span class="category">${escapeHtml(labelForJudgeValue(movement.movementType))}</span>
          <span class="category">${escapeHtml(movement.jurisdiction || 'Jurisdiction pending')}</span>
          <span class="category">Confidence: ${movement.confidenceScore}</span>
          <span class="${statusClass(movement.status)}">${escapeHtml(labelForJudgeValue(movement.status))}</span>
          <span class="date">${escapeHtml(formatDate(movement.publishedDate))}</span>
        </div>
        <h3>${escapeHtml(movement.judgeName || '[Judge Name]')}</h3>
        <p>${escapeHtml(movement.sourceTitle)}</p>
        <div class="routing-card-footer">
          <span>${escapeHtml(movement.court || 'Court pending')}</span>
          <strong>${escapeHtml(movement.sourceName || 'Source pending')}</strong>
        </div>
      </button>
    </article>
  `;
}

function renderJudgeDetail() {
  const movement = selectedJudgeMovement();
  if (!movement) {
    els.judgeDetailStatus.textContent = 'No item selected';
    els.judgeDetail.className = 'empty-state';
    els.judgeDetail.innerHTML = `
      <span>No judicial appointments or elevations detected yet.</span>
      <p>Judicial movement items will appear here when matching updates are collected from legal news, court, or government sources.</p>
    `;
    return;
  }
  activeJudgeMovementId = movement.id;
  const missing = window.JudgeCongratulationTool.missingRequiredFields(movement);
  const draft = movement.draft;
  const canApprove = window.JudgeCongratulationTool.canApproveDraft(movement, draft);
  els.judgeDetailStatus.textContent = labelForJudgeValue(movement.status);
  els.judgeDetail.className = 'judge-detail';
  els.judgeDetail.innerHTML = `
    <article class="routing-selected-signal">
      <div class="update-meta">
        <span class="category">${escapeHtml(labelForJudgeValue(movement.movementType))}</span>
        <span class="category">Confidence: ${movement.confidenceScore} ${escapeHtml(confidenceLabel(movement.confidenceScore))}</span>
        <span class="${statusClass(movement.status)}">${escapeHtml(labelForJudgeValue(movement.status))}</span>
      </div>
      <h3><a href="${escapeHtml(safeHref(movement.sourceUrl))}" target="_blank" rel="noreferrer">${escapeHtml(movement.sourceTitle)}</a></h3>
      <p>${escapeHtml(movement.summary || 'No source summary available.')}</p>
      <div class="judge-review-labels">
        <span>${movement.sourceUrl ? 'Source verified' : 'Source link missing'}</span>
        <span>Requires human review</span>
        ${missing.length ? `<span>Missing required details: ${escapeHtml(missing.join(', '))}</span>` : '<span>Required details present</span>'}
      </div>
      <p><strong>Matched keywords:</strong> ${escapeHtml((movement.matchedKeywords || []).join(', ') || 'None')}</p>
    </article>
    <div class="judge-edit-grid">
      ${judgeInput('judgeName', 'Judge name', movement.judgeName)}
      ${judgeInput('court', 'Court', movement.court)}
      ${judgeInput('previousRole', 'Previous role', movement.previousRole)}
      ${judgeInput('newRole', 'New role', movement.newRole)}
      ${judgeInput('jurisdiction', 'Jurisdiction', movement.jurisdiction)}
      ${judgeInput('notes', 'Review notes', movement.notes || '', true)}
    </div>
    <div class="digest-controls judge-draft-controls">
      <label>Tone<select id="judgeTone">
        ${JUDGE_TONES.map((tone) => `<option ${judgeTone === tone ? 'selected' : ''}>${escapeHtml(tone)}</option>`).join('')}
      </select></label>
      <label>Draft output<select id="judgeOutputType">
        ${JUDGE_OUTPUT_TYPES.map((type) => `<option ${judgeOutputType === type ? 'selected' : ''}>${escapeHtml(type)}</option>`).join('')}
      </select></label>
    </div>
    <div class="digest-action-row">
      <button class="primary-button" id="generateJudgeDraft" type="button">Generate draft</button>
      <button class="ghost-button" id="approveJudgeDraft" type="button" ${canApprove ? '' : 'disabled'}>Approve</button>
      <button class="ghost-button" id="rejectJudgeDraft" type="button">Reject</button>
      <button class="ghost-button" id="copyJudgeDraft" type="button" ${movement.status === 'approved' || movement.status === 'exported' ? '' : 'disabled'}>Copy/export</button>
    </div>
    <section class="judge-draft-preview">
      <div class="section-heading"><h2>Draft Preview</h2><span>No email will be sent</span></div>
      ${draft ? `<div class="email-subject"><strong>Subject:</strong> ${escapeHtml(draft.subject)}</div><pre>${escapeHtml(draft.body)}</pre>` : '<div class="empty-state">Generate a draft after confirming the detected details. Placeholders may appear until required fields are added.</div>'}
    </section>
  `;
  wireJudgeDetailEvents(movement);
}

function judgeInput(field, label, value, multiline = false) {
  return `
    <label>${escapeHtml(label)}
      ${multiline
        ? `<textarea data-judge-field="${escapeHtml(field)}">${escapeHtml(value || '')}</textarea>`
        : `<input data-judge-field="${escapeHtml(field)}" value="${escapeHtml(value || '')}" />`}
    </label>
  `;
}

function wireJudgeDetailEvents(movement) {
  document.querySelectorAll('[data-judge-field]').forEach((input) => {
    input.addEventListener('change', () => {
      updateJudgeWorkflow(movement.id, { fields: { [input.dataset.judgeField]: input.value } });
      renderJudgeTool();
    });
  });
  document.querySelector('#judgeTone').addEventListener('change', (event) => {
    judgeTone = event.target.value;
  });
  document.querySelector('#judgeOutputType').addEventListener('change', (event) => {
    judgeOutputType = event.target.value;
  });
  document.querySelector('#generateJudgeDraft').addEventListener('click', () => {
    const latest = selectedJudgeMovement();
    const draft = window.JudgeCongratulationTool.generateDraft(latest, {
      tone: judgeTone,
      outputType: judgeOutputType,
      organisation: '[Organisation/Team]',
      sender: '[Sender Name]',
    });
    updateJudgeWorkflow(latest.id, { draft, status: 'draft_generated' });
    setAlert(draft.missingFields.length ? `Draft preview generated with placeholders. Missing: ${draft.missingFields.join(', ')}.` : 'Draft generated for human review.');
    renderJudgeTool();
  });
  document.querySelector('#approveJudgeDraft').addEventListener('click', () => {
    const latest = selectedJudgeMovement();
    if (!window.JudgeCongratulationTool.canApproveDraft(latest, latest.draft)) {
      setAlert('Cannot approve yet. Add missing judge name and role/court details first.');
      return;
    }
    updateJudgeWorkflow(latest.id, { status: 'approved' });
    setAlert('Draft approved locally. No email was sent.');
    renderJudgeTool();
  });
  document.querySelector('#rejectJudgeDraft').addEventListener('click', () => {
    updateJudgeWorkflow(movement.id, { status: 'rejected' });
    setAlert('Detected item marked rejected.');
    renderJudgeTool();
  });
  document.querySelector('#copyJudgeDraft').addEventListener('click', () => {
    const latest = selectedJudgeMovement();
    if (!['approved', 'exported'].includes(latest.status)) return;
    copyToClipboard(`${latest.draft.subject}\n\n${latest.draft.body}`, 'Approved judge congratulation draft');
    updateJudgeWorkflow(latest.id, { status: 'exported' });
    renderJudgeTool();
  });
}

async function loadJudgeTool() {
  setAlert('');
  if (!window.JudgeCongratulationTool) {
    renderJudgeTool();
    return;
  }
  const rowsByJurisdiction = await Promise.all(
    JUDGE_ALLOWED_JURISDICTIONS.map((jurisdiction) => api(`/api/updates?country=${encodeURIComponent(jurisdiction)}&limit=200`)),
  );
  judgeUpdates = rowsByJurisdiction.flat();
  judgeMovements = window.JudgeCongratulationTool.detectMovements(judgeUpdates);
  if (!judgeMovements.some((movement) => movement.id === activeJudgeMovementId)) {
    activeJudgeMovementId = judgeMovements[0]?.id || null;
  }
  renderJudgeTool();
}

function labelForRiskDateRange(value) {
  return RISK_DATE_RANGES.find((range) => range.id === value)?.label || value;
}

function riskDateInRange(value) {
  if (activeRiskDateRange === 'All') return true;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return false;
  const days = Number(activeRiskDateRange.replace('d', ''));
  return Date.now() - date.getTime() <= days * 24 * 60 * 60 * 1000;
}

function riskCellFilteredUpdates(cell) {
  return (cell?.updates || []).filter((item) => {
    if (!riskDateInRange(item.date || item.first_seen_at)) return false;
    return true;
  });
}

function effectiveRiskCell(cell) {
  const updatesForFilters = riskCellFilteredUpdates(cell);
  if (!updatesForFilters.length) {
    return { ...cell, score: 0, level: 'No Signals', signal_count: 0, weighted_signal_count: 0, updates: [] };
  }
  return { ...cell, updates: updatesForFilters };
}

function riskCellPassesFilters(cell) {
  const effective = effectiveRiskCell(cell);
  if (activeRiskLevel !== 'All' && effective.level !== activeRiskLevel) return false;
  return true;
}

function riskDomains() {
  const domains = riskHeatmap?.domains || [];
  return activeRiskDomain === 'All' ? domains : domains.filter((domain) => domain.id === activeRiskDomain);
}

function riskJurisdictions() {
  const jurisdictions = riskHeatmap?.jurisdictions || [];
  return activeRiskJurisdiction === 'All'
    ? jurisdictions
    : jurisdictions.filter((jurisdiction) => jurisdiction === activeRiskJurisdiction);
}

function renderRiskFilters() {
  const jurisdictions = ['All', ...(riskHeatmap?.jurisdictions || [])];
  const domains = ['All', ...(riskHeatmap?.domains || []).map((domain) => domain.id)];
  const domainLabel = (value) => value === 'All' ? 'All' : riskHeatmap.domains.find((domain) => domain.id === value)?.label || titleCase(value);

  renderFilters(els.riskJurisdictionFilters, jurisdictions, activeRiskJurisdiction, (value) => {
    activeRiskJurisdiction = value;
    activeRiskCell = null;
    renderRiskFilters();
    renderRiskHeatmap();
    renderRiskDetail();
  });
  renderFilters(els.riskDomainFilters, domains, activeRiskDomain, (value) => {
    activeRiskDomain = value;
    activeRiskCell = null;
    renderRiskFilters();
    renderRiskHeatmap();
    renderRiskDetail();
  }, domainLabel);
  renderFilters(els.riskLevelFilters, ['All', ...RISK_LEVELS], activeRiskLevel, (value) => {
    activeRiskLevel = value;
    renderRiskFilters();
    renderRiskHeatmap();
    renderRiskDetail();
  });
  renderFilters(els.riskDateRangeFilters, RISK_DATE_RANGES.map((range) => range.id), activeRiskDateRange, (value) => {
    activeRiskDateRange = value;
    renderRiskFilters();
    renderRiskHeatmap();
    renderRiskDetail();
  }, labelForRiskDateRange);
}

function renderRiskKpis() {
  const kpis = riskHeatmap?.kpis || {};
  els.riskHighestJurisdiction.textContent = kpis.highestRiskJurisdiction?.value ?? 'No signals';
  els.riskHighestJurisdictionDetail.textContent = kpis.highestRiskJurisdiction?.detail ?? 'Risk scores will appear as legal updates are collected.';
  els.riskFastestRising.textContent = kpis.fastestRisingRisk?.value ?? 'Insufficient data';
  els.riskFastestRisingDetail.textContent = kpis.fastestRisingRisk?.detail ?? 'No recent signal movement yet.';
  els.riskHottestDomain.textContent = kpis.hottestRiskDomain?.value ?? 'No signals';
  els.riskHottestDomainDetail.textContent = kpis.hottestRiskDomain?.detail ?? 'No matching legal updates yet.';
  els.riskSignalsWeek.textContent = kpis.totalDisplayedSignals?.value ?? 0;
  els.riskSignalsWeekDetail.textContent = kpis.totalDisplayedSignals?.detail ?? 'Mapped from existing updates.';
}

function riskLevelClass(level) {
  return String(level || 'No Signals').toLowerCase().replace(/\s+/g, '-');
}

function trendSummary(cell) {
  const delta = cell.velocity?.delta7 || 0;
  const arrow = delta > 0 ? '↑' : delta < 0 ? '↓' : '→';
  const signalWord = cell.signal_count === 1 ? 'signal' : 'signals';
  return `${cell.signal_count || 0} ${signalWord} · ${arrow} ${delta >= 0 ? '+' : ''}${delta} vs prior 7d`;
}

function renderRiskHeatmap() {
  els.riskHeatmapGrid.innerHTML = '';
  if (!riskHeatmap) {
    els.riskHeatmapGrid.appendChild(el('caption', '', 'No APAC risk signals available yet.'));
    return;
  }
  const domains = riskDomains();
  const jurisdictions = riskJurisdictions();
  const thead = document.createElement('thead');
  const headRow = document.createElement('tr');
  headRow.appendChild(el('th', '', 'Jurisdiction'));
  domains.forEach((domain) => headRow.appendChild(el('th', '', domain.label)));
  thead.appendChild(headRow);
  const tbody = document.createElement('tbody');
  let visibleSignals = 0;

  jurisdictions.forEach((jurisdiction) => {
    const row = document.createElement('tr');
    row.appendChild(el('th', 'risk-row-heading', jurisdiction));
    domains.forEach((domain) => {
      const rawCell = riskHeatmap.cells?.[jurisdiction]?.[domain.id];
      const cell = effectiveRiskCell(rawCell);
      const td = document.createElement('td');
      const button = el('button', `risk-cell risk-${riskLevelClass(cell.level)}`);
      button.type = 'button';
      button.disabled = !riskCellPassesFilters(rawCell);
      button.setAttribute('aria-label', `${jurisdiction} ${domain.label}: ${cell.level} ${cell.score}`);
      button.appendChild(el('strong', '', cell.updates.length ? `${cell.score} ${cell.level}` : 'No Signals'));
      button.appendChild(el('span', '', cell.updates.length ? trendSummary(cell) : 'No signals in selected period'));
      button.addEventListener('click', () => {
        activeRiskCell = { jurisdiction, domain: domain.id };
        renderRiskHeatmap();
        renderRiskDetail();
      });
      if (activeRiskCell?.jurisdiction === jurisdiction && activeRiskCell?.domain === domain.id) {
        button.classList.add('selected');
      }
      if (cell.updates.length && !button.disabled) visibleSignals += cell.signal_count || cell.updates.length;
      td.appendChild(button);
      row.appendChild(td);
    });
    tbody.appendChild(row);
  });

  els.riskHeatmapGrid.append(thead, tbody);
  els.riskHeatmapCount.textContent = visibleSignals ? `Displayed signals: ${visibleSignals}` : 'No signals in selected period';
}

function authorityMixText(cell) {
  const mix = cell.authority_mix || {};
  const entries = Object.entries(mix);
  if (!entries.length) return 'No authority mix yet';
  return entries.map(([label, count]) => `${label}: ${count}`).join(' / ');
}

function renderRiskDetail() {
  if (!activeRiskCell || !riskHeatmap) {
    els.riskDetailScore.textContent = 'Select a cell';
    els.riskCellDetail.className = 'risk-cell-detail empty-state';
    els.riskCellDetail.textContent = 'Select a heatmap cell to see the real legal updates behind the score.';
    return;
  }
  const rawCell = riskHeatmap.cells?.[activeRiskCell.jurisdiction]?.[activeRiskCell.domain];
  const cell = effectiveRiskCell(rawCell);
  els.riskDetailScore.textContent = `${cell.score} ${cell.level}`;
  els.riskCellDetail.className = 'risk-cell-detail';
  els.riskCellDetail.innerHTML = '';

  const heading = el('div', 'risk-detail-heading');
  heading.appendChild(el('h3', '', `${cell.jurisdiction} / ${cell.domain_label}`));
  heading.appendChild(el('p', '', trendSummary(cell)));
  els.riskCellDetail.appendChild(heading);

  if (!cell.updates.length) {
    els.riskCellDetail.appendChild(el('div', 'empty-state', 'No signals in selected period.'));
    return;
  }

  const scoreBox = el('div', 'score-rationale');
  scoreBox.appendChild(el('strong', '', 'Score explanation'));
  scoreBox.appendChild(el('span', '', `${cell.signal_count || 0} raw signals / ${cell.weighted_signal_count || 0} weighted signals used in score.`));
  scoreBox.appendChild(el('span', '', `Authority mix: ${authorityMixText(cell)}.`));
  scoreBox.appendChild(el('span', '', `Trend movement: ${cell.velocity?.trend || 'insufficient historical data'} (${cell.velocity?.delta7 >= 0 ? '+' : ''}${cell.velocity?.delta7 || 0} vs prior 7d).`));
  scoreBox.appendChild(el('strong', '', 'Scoring rationale'));
  scoreBox.appendChild(el('span', '', cell.score_rationale || cell.score_explanation || 'Score is based on severity, authority, recency, volume and trend velocity.'));
  els.riskCellDetail.appendChild(scoreBox);

  cell.updates.slice(0, 3).forEach((item) => {
    const card = el('article', 'risk-update');
    const meta = el('div', 'update-meta');
    meta.appendChild(el('span', 'category', item.category || 'Uncategorised'));
    meta.appendChild(el('span', 'category', `Source: ${labelForSourceType(item.source_type || 'unknown')}`));
    meta.appendChild(el('span', 'category', `Authority: ${item.authority || 'Unknown'}`));
    meta.appendChild(el('span', 'date', formatDate(item.date)));
    const title = el('a', 'update-title', item.title);
    title.href = item.link;
    title.target = '_blank';
    title.rel = 'noreferrer';
    card.append(meta, title);
    if (item.summary) card.appendChild(el('p', 'summary', item.summary));
    const sourceLine = el('div', 'source-line');
    sourceLine.appendChild(el('span', '', item.source || 'Unknown source'));
    sourceLine.appendChild(el('span', '', `${item.authority_tier || 'Authority tier unknown'} / Signal score ${item.score}`));
    card.appendChild(sourceLine);
    els.riskCellDetail.appendChild(card);
  });
}

function routingItems() {
  const approved = window.RoutingMockData?.coreJurisdictions || [];
  const liveItems = routingLegalUpdates.map(transformUpdateToRoutingItem).filter((item) => approved.includes(item.jurisdiction));
  return liveItems.length ? liveItems : (window.RoutingMockData?.intelligenceItems || []).filter((item) => approved.includes(item.jurisdiction));
}

function visibleRoutingItems() {
  return routingItems().filter((item) => activeRoutingJurisdiction === 'All' || item.jurisdiction === activeRoutingJurisdiction);
}

function legalAiRoutingItems() {
  return routingLegalAiRows.filter((item) => !isGenericLegalAiIndexItem(item)).map(transformLegalAiToRoutingItem);
}

function routingItemsForDepartment(departmentId) {
  return departmentId === 'sales' && legalAiRoutingItems().length ? legalAiRoutingItems() : routingItems();
}

function routingSourceRegistry() {
  const approved = window.RoutingMockData?.coreJurisdictions || [];
  if (routingSourceRows.length) {
    return routingSourceRows
      .filter((source) => approved.includes(source.country))
      .map((source) => ({
        jurisdiction: source.country,
        name: source.name,
        category: source.category,
        sourceType: source.official ? 'official' : source.source_type || 'publisher',
        url: source.url,
        official: source.official,
        accessBasis: source.access_basis,
      }));
  }
  return (window.RoutingMockData?.sourceRegistry || []).filter((source) => approved.includes(source.jurisdiction) || source.jurisdiction === 'Core APAC');
}

function coreRoutingJurisdictions() {
  return window.RoutingMockData?.coreJurisdictions || ['Singapore', 'Hong Kong', 'India', 'Australia', 'Malaysia'];
}

function legalAiSourceUrlForUpdate(update) {
  const source = routingLegalAiSourceRows.find((row) => row.id === update.source_id)
    || routingLegalAiSourceRows.find((row) => row.name === update.source);
  return source?.url || update.link;
}

function isGenericLegalAiIndexItem(update) {
  const genericTitles = new Set([
    'Law Firm Business',
    'AI & Future Technologies',
    'Legal Technology',
    'Law Firm Profitability',
    'Risk & Compliance',
    'Legal Industry',
  ]);
  return genericTitles.has(String(update.title || '').trim());
}

function textForRouting(update) {
  return [update.title, update.summary, update.category, update.source, update.source_tab]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}

function classifyRoutingTopic(update) {
  const text = textForRouting(update);
  if (/\b(ai|artificial intelligence|machine learning|algorithm|automation|hallucination|model governance|aiverify|meity)\b/i.test(text)) {
    return 'AI Regulation';
  }
  if (/\b(privacy|data protection|personal data|pdpa|gdpr|cyber|breach|cross-border|transfer)\b/i.test(text)) {
    return 'Privacy/Data Protection';
  }
  if (/\b(api|licen[cs]ing|data access|scraping|bulk|database|reuse|metadata)\b/i.test(text)) {
    return 'API/Data Licensing';
  }
  if (/\b(court|judiciar|e-?litigation|ecourt|remote hearing|electronic filing|digital evidence|case management|judgment metadata)\b/i.test(text)) {
    return 'Judiciary Modernization';
  }
  if (/\b(judgment|appeal|court of appeal|supreme court|high court|tribunal|case summary|precedent|ruling)\b/i.test(text) || update.category === 'Recent Judgments' || update.category === 'Case Summary') {
    return 'Precedent-Setting Judgment';
  }
  if (/\b(citation|cited|annotation|appellate courts highlights)\b/i.test(text)) {
    return 'Citation Spike';
  }
  if (/\b(bill|act|gazette|legislation|regulation|rules|parliament|consultation|notification|rbi|sebi|cci|ibbi)\b/i.test(text) || update.category === 'Legislation News') {
    return 'Legislative Development';
  }
  if (/\b(legal tech|competitor|product|platform|vendor|launch|market)\b/i.test(text)) {
    return 'Legal Tech Market Intelligence';
  }
  if (update.category === 'Press Release/Judiciary Updates') return 'Judiciary Modernization';
  return 'Legislative Development';
}

function inferRoutingUrgency(update, topic) {
  const text = textForRouting(update);
  if (/\b(deadline|consultation|mandatory|required|enforcement|penalt|sanction|breach|notification|gazette|rules)\b/i.test(text)) {
    return 'ACTION REQUIRED';
  }
  if (['AI Regulation', 'API/Data Licensing', 'Legal Tech Market Intelligence', 'Precedent-Setting Judgment'].includes(topic)) {
    return 'STRATEGIC';
  }
  if (update.category === 'Legislation News' || update.category === 'Recent Judgments') return 'WATCH';
  if (update.category === 'Legal News') return 'INFORMATIONAL';
  return 'WATCH';
}

function inferRoutingImpact(update, topic, urgency) {
  let score = 52;
  if (urgency === 'ACTION REQUIRED') score += 28;
  if (urgency === 'STRATEGIC') score += 20;
  if (urgency === 'WATCH') score += 10;
  if (['AI Regulation', 'Privacy/Data Protection', 'API/Data Licensing'].includes(topic)) score += 10;
  if (['Recent Judgments', 'Legislation News', 'Case Summary'].includes(update.category)) score += 8;
  if (update.is_new) score += 5;
  if (/official|judiciary|court|ministry|gazette|supreme|rbi|sebi|cci|ibbi/i.test([update.source, update.source_tab].filter(Boolean).join(' '))) score += 4;
  return Math.max(35, Math.min(98, score));
}

function sourceUrlForUpdate(update) {
  const source = routingSourceRows.find((row) => row.name === update.source)
    || routingSourceRows.find((row) => row.country === update.country && row.category === update.category);
  return source?.url || update.link;
}

function transformUpdateToRoutingItem(update) {
  const topic = classifyRoutingTopic(update);
  const urgency = inferRoutingUrgency(update, topic);
  return {
    id: `update-${update.id}`,
    sourceUpdateId: update.id,
    title: update.title,
    source: update.source,
    sourceTab: update.source_tab,
    jurisdiction: update.country,
    date: update.date || update.first_seen_at,
    topic,
    summary: update.summary || update.title,
    urgency,
    impactScore: inferRoutingImpact(update, topic, urgency),
    status: update.is_new ? 'New' : 'Reviewed',
    tags: [topic.toLowerCase().replace(/[^a-z0-9]+/g, '_'), update.category, update.source_tab].filter(Boolean),
    link: update.link,
    sourceUrl: sourceUrlForUpdate(update),
    category: update.category,
    fromLegalUpdatesDb: true,
  };
}

function topicFromLegalAi(update) {
  const tags = update.tags || [];
  const text = [update.title, update.summary, update.source_type, update.category, ...tags].filter(Boolean).join(' ').toLowerCase();
  if (/competitor|vendor|harvey|vlex|openai|clio|imanage|launch|platform|market/.test(text)) return 'Legal Tech Market Intelligence';
  if (/regulation|governance|policy|act|official|dsit|oecd|imda|verify/.test(text)) return 'AI Regulation';
  if (/privacy|security|risk|ethics|hallucination|assurance/.test(text)) return 'Privacy/Data Protection';
  if (/api|data|licen[cs]/.test(text)) return 'API/Data Licensing';
  return 'Legal Tech Market Intelligence';
}

function transformLegalAiToRoutingItem(update) {
  const topic = topicFromLegalAi(update);
  const urgency = ['Official', 'Vendor', 'Market Intelligence'].includes(update.category) ? 'STRATEGIC' : 'WATCH';
  const impactScore = update.category === 'Vendor' || update.tags?.includes('competitor_intelligence') ? 88 : update.category === 'Official' ? 84 : 76;
  return {
    id: `legal-ai-${update.id}`,
    sourceUpdateId: update.id,
    title: update.title,
    source: update.source,
    sourceTab: 'Legal AI News',
    jurisdiction: update.region ? labelForRegion(update.region) : 'Global',
    date: update.date || update.first_seen_at,
    topic,
    summary: update.summary || update.title,
    urgency,
    impactScore,
    status: update.is_new ? 'New' : 'Reviewed',
    tags: [topic.toLowerCase().replace(/[^a-z0-9]+/g, '_'), ...(update.tags || [])],
    link: update.link,
    sourceUrl: legalAiSourceUrlForUpdate(update),
    category: update.category || update.source_type,
    fromLegalAiDb: true,
  };
}

function routingTopics() {
  return window.RoutingMockData?.topics || [];
}

function routingDepartment(id) {
  return routingDepartmentProfiles.find((department) => department.id === id) || routingDepartmentProfiles[0];
}

function selectedRoutingItem() {
  return routingItems().find((item) => item.id === selectedRoutingItemId) || routingItems()[0];
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function safeHref(value) {
  const text = String(value || '');
  return /^https?:\/\/[^\s<>"']+$/i.test(text) ? text : '#';
}

function sourceForItem(item) {
  if (item.link || item.sourceUrl) {
    return {
      name: item.source || 'Collected legal update',
      url: item.link || item.sourceUrl,
      sourceType: item.category || 'update',
    };
  }
  const registry = routingSourceRegistry();
  return registry.find((source) => source.name === item.source)
    || registry.find((source) => source.jurisdiction === item.jurisdiction && source.category.toLowerCase() === item.topic.toLowerCase())
    || registry.find((source) => source.jurisdiction === item.jurisdiction)
    || { name: item.source || 'Source registry', url: '#', sourceType: 'source' };
}

function sourceLinkForItem(item, label = 'Open source') {
  const source = sourceForItem(item);
  const href = safeHref(source.url);
  return `<a class="source-link" href="${escapeHtml(href)}" target="_blank" rel="noreferrer">${escapeHtml(label)}: ${escapeHtml(source.name)}</a>`;
}

function urgencyClass(value) {
  return `urgency-${String(value || 'LOW PRIORITY').toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
}

function statusClass(value) {
  return `status-${String(value || 'New').toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
}

function routingResultsFor(item) {
  return window.RoutingEngine.routeItem(item, routingDepartmentProfiles);
}

function routedDepartmentsFor(item) {
  return routingResultsFor(item).filter((result) => result.routed && (item.fromLegalAiDb || result.departmentId !== 'sales'));
}

function strategicText(item) {
  return [item.title, item.summary, item.topic, item.category, item.source, item.sourceTab, ...(item.tags || [])]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}

function isDigestAlertableItem(item) {
  const title = String(item.title || '');
  const text = strategicText(item);
  if (/\b(opinion|commentary|viewpoint|perspective|editorial)\b/i.test(title)) return false;
  if (/\b(?:analysis|explainer|feature)\b/i.test(title) && !/\b(bill|act|gazette|regulation|rules|judgment|ruling|appointment|consultation|guidance|notification|commencement|published|issued)\b/.test(text)) {
    return false;
  }
  if (isRoutineIntakeItem(item) || isRoutineJudgmentItem(item)) return false;
  return true;
}

function productDigestCategoryPriority() {
  return ['Legislation News', 'Recent Judgments', 'Legal News'];
}

function routingUpdateRequestPaths(pageSize) {
  return productDigestCategoryPriority().map((category) => `/api/updates?category=${encodeURIComponent(category)}&limit=${pageSize}`);
}

function digestCategoryRankForDepartment(departmentId, item) {
  if (departmentId !== 'product') return 0;
  const rank = productDigestCategoryPriority().indexOf(item.category);
  return rank === -1 ? Number.POSITIVE_INFINITY : rank;
}

function isDigestSourceCategoryForDepartment(departmentId, item) {
  return digestCategoryRankForDepartment(departmentId, item) !== Number.POSITIVE_INFINITY;
}

function isRoutineIntakeItem(item) {
  const text = strategicText(item);
  return [
    /department of publication/,
    /gazette id download/,
    /ministry subject publish date/,
    /recent extra ordinary gazettes/,
    /ordinary gazettes/,
    /publication of gazette notification/,
    /state gazettes important links/,
    /directorate of printing/,
    /(?:agms and egms|in memoriam)$/i,
    /\bdownload ministry\b/,
  ].some((pattern) => pattern.test(text));
}

function isRoutineJudgmentItem(item) {
  const text = strategicText(item);
  const hasStrategicCourtMarker = /\b(landmark|precedent|constitutional|public interest|test case|novel|privacy|ai|data protection|regulatory|competition|sanction|trade|employment)\b/.test(text);
  const looksLikeCauseList = /\b(diary number|crl\.?a\.?|c\.?a\.?\s+no|s\.?l\.?p\.?|w\.?p\.?|civil appeal|criminal appeal|vs\.?)\b|\sv\.?\s/.test(text);
  const looksLikeRoutineOutcome = /\b(acquitted|dismissed|quash|inquest|trafficking charge|sentenced|convicted|appeal dismissed|high court rules|court rules)\b/.test(text);
  const courtTopic = ['Precedent-Setting Judgment', 'Judiciary Modernization'].includes(item.topic)
    || /\b(supreme court|high court|court of appeal|judgment|appeal)\b/.test(text);
  return courtTopic && (looksLikeCauseList || looksLikeRoutineOutcome) && !hasStrategicCourtMarker;
}

function strategicSignalScore(item) {
  const routes = routedDepartmentsFor(item);
  const text = strategicText(item);
  let score = 0;
  const reasons = [];

  if (routes.length >= 3) {
    score += 24;
    reasons.push('multi-department relevance');
  } else if (routes.length === 2) {
    score += 14;
    reasons.push('cross-team relevance');
  } else if (routes.length === 1) {
    score += 6;
  }

  if (/\b(ai|artificial intelligence|machine learning|algorithm|model governance|aiverify|automation)\b/.test(text) || item.topic === 'AI Regulation') {
    score += 20;
    reasons.push('AI relevance');
  }
  if (/\b(privacy|data protection|personal data|pdpa|gdpr|cyber|breach|cross-border transfer)\b/.test(text) || item.topic === 'Privacy/Data Protection') {
    score += 18;
    reasons.push('privacy/data protection relevance');
  }
  if (item.topic === 'Judiciary Modernization' || /\b(e-?filing|remote hearing|case management|court digit|electronic bundle|online filing)\b/.test(text)) {
    score += 14;
    reasons.push('judiciary modernization significance');
  }
  if (item.topic === 'Legal Tech Market Intelligence' || item.topic === 'API/Data Licensing' || /\b(api|licen[cs]ing|competitor|platform|vendor|launch|commercial|enterprise)\b/.test(text)) {
    score += 16;
    reasons.push('market/commercial impact');
  }
  if (item.topic === 'Precedent-Setting Judgment' || /\b(landmark|precedent|constitutional|court of appeal|supreme court|high court|test case|seminal)\b/.test(text)) {
    score += 15;
    reasons.push('precedent importance');
  }
  if (/\b(bill|act|draft|rules|regulation|consultation|mandatory|required|enforcement|commencement|guidance|reform|amendment)\b/.test(text) || item.topic === 'Legislative Development') {
    score += 18;
    reasons.push('regulatory change magnitude');
  }

  if (item.urgency === 'ACTION REQUIRED') {
    score += 18;
    reasons.push('action required');
  } else if (item.urgency === 'STRATEGIC') {
    score += 14;
    reasons.push('strategic urgency');
  } else if (item.urgency === 'WATCH') {
    score += 6;
  }

  score += Math.min(10, Math.max(0, Math.round((Number(item.impactScore) - 65) / 3)));

  if (isRoutineIntakeItem(item)) {
    score = Math.min(score, 38);
    reasons.push('suppressed routine intake item');
  }
  if (item.topic === 'Precedent-Setting Judgment' && !/\b(landmark|precedent|constitutional|court of appeal|supreme court|test case|public interest|novel)\b/.test(text)) {
    score = Math.min(score, 64);
    reasons.push('ordinary judgment without clear strategic significance');
  }
  if (isRoutineJudgmentItem(item)) {
    score = Math.min(score, 58);
    reasons.push('ordinary judgment/procedural item without strategic significance');
  }
  if (/\b(announcement|notice|appointment|holiday|opening hours|publication list)\b/.test(text) && !/\b(ai|privacy|data protection|reform|mandatory|enforcement|bill|act|regulation)\b/.test(text)) {
    score = Math.min(score, 45);
    reasons.push('low-impact administrative notice');
  }

  return {
    score: Math.max(0, Math.min(100, score)),
    reasons: Array.from(new Set(reasons)),
    routes,
  };
}

function normalizeExecutiveTitle(item) {
  const cleaned = String(item.title || '')
    .replace(/\s+/g, ' ')
    .replace(/\bDownload\b.*$/i, '')
    .replace(/\bGazette ID\b.*$/i, '')
    .replace(/\s*[-|]\s*(Latest|News|Update)$/i, '')
    .trim();
  const letters = cleaned.replace(/[^a-z]/gi, '');
  const upperRatio = letters ? (letters.replace(/[^A-Z]/g, '').length / letters.length) : 0;
  const readable = upperRatio > 0.72
    ? cleaned.toLowerCase().replace(/\b[a-z]/g, (letter) => letter.toUpperCase()).replace(/\bVs\.?\b/g, 'v.')
    : cleaned;
  if (readable.length <= 118) return readable;
  return `${readable.slice(0, 115).replace(/\s+\S*$/, '')}...`;
}

function executiveSummaryForSignal(item) {
  const summary = String(item.summary || item.title || '').replace(/\s+/g, ' ').trim();
  const readable = summary && summary !== item.title ? summary : `${item.source || 'A monitored source'} reported a ${String(item.topic || 'legal intelligence').toLowerCase()} development in ${item.jurisdiction}.`;
  if (readable.length <= 185) return readable;
  return `${readable.slice(0, 182).replace(/\s+\S*$/, '')}...`;
}

function strategicSignals() {
  return routingItems()
    .map((item) => {
      const assessment = strategicSignalScore(item);
      return {
        item,
        score: assessment.score,
        reasons: assessment.reasons,
        routes: assessment.routes,
        title: normalizeExecutiveTitle(item),
        summary: executiveSummaryForSignal(item),
      };
    })
    .filter((signal) => signal.score >= STRATEGIC_SIGNAL_THRESHOLD)
    .sort((a, b) => b.score - a.score || b.item.impactScore - a.item.impactScore || new Date(b.item.date) - new Date(a.item.date));
}

function digestItemsForDepartment(departmentId) {
  return routingItemsForDepartment(departmentId)
    .map((item) => ({
      item,
      route: window.RoutingEngine.scoreDepartment(item, routingDepartment(departmentId)),
      signal: strategicSignalScore(item),
    }))
    .filter((entry) => isDigestSourceCategoryForDepartment(departmentId, entry.item) && isDigestAlertableItem(entry.item) && entry.route.score >= 52)
    .sort((a, b) => (
      digestCategoryRankForDepartment(departmentId, a.item) - digestCategoryRankForDepartment(departmentId, b.item)
      || b.signal.score - a.signal.score
      || b.route.score - a.route.score
      || b.item.impactScore - a.item.impactScore
    ));
}

function digestJurisdictionMatches(item) {
  if (!digestJurisdictionFilters || digestJurisdictionFilters.size === 0 || digestJurisdictionFilters.has('All')) return true;
  return digestJurisdictionFilters.has(item.jurisdiction);
}

function normalizeDigestJurisdictionFilters(jurisdictions) {
  const available = new Set(jurisdictions);
  const selected = Array.from(digestJurisdictionFilters || []).filter((value) => available.has(value));
  if (!selected.length || selected.includes('All')) {
    digestJurisdictionFilters = new Set(['All']);
    return;
  }
  digestJurisdictionFilters = new Set(selected);
}

function isDigestJurisdictionSelected(jurisdiction) {
  return digestJurisdictionFilters.has('All') ? jurisdiction === 'All' : digestJurisdictionFilters.has(jurisdiction);
}

function toggleDigestJurisdictionFilter(jurisdiction) {
  if (jurisdiction === 'All') {
    digestJurisdictionFilters = new Set(['All']);
    return;
  }
  const next = new Set(digestJurisdictionFilters);
  next.delete('All');
  if (next.has(jurisdiction)) next.delete(jurisdiction);
  else next.add(jurisdiction);
  digestJurisdictionFilters = next.size ? next : new Set(['All']);
}

function digestCandidateEntries() {
  return digestItemsForDepartment(selectedRoutingDepartmentId).filter((entry) => {
    if (digestIncludeApprovedOnly && entry.item.status !== 'Approved') return false;
    if (!digestJurisdictionMatches(entry.item)) return false;
    if (digestTopicFilter !== 'All' && entry.item.topic !== digestTopicFilter) return false;
    return true;
  });
}

function balancedDigestEntries(entries, maxItems) {
  const remaining = [...entries];
  const selected = [];
  let usedJurisdictions = new Set();
  while (remaining.length && selected.length < maxItems) {
    let index = remaining.findIndex((entry) => !usedJurisdictions.has(entry.item.jurisdiction));
    if (index === -1) {
      usedJurisdictions = new Set();
      index = 0;
    }
    const [entry] = remaining.splice(index, 1);
    selected.push(entry);
    if (entry.item.jurisdiction) usedJurisdictions.add(entry.item.jurisdiction);
  }
  return selected;
}

function selectedDigestEntries() {
  const candidates = digestCandidateEntries();
  const candidatesById = new Map(candidates.map((entry) => [entry.item.id, entry]));
  const selected = Array.from(selectedDigestItemIds, (id) => candidatesById.get(id)).filter(Boolean);
  return (selected.length ? selected : balancedDigestEntries(candidates, routingMaxItems)).slice(0, routingMaxItems);
}

function contentSummaryResultForEntry(entry) {
  if (!entry?.item?.id) return null;
  if (typeof digestContentSummaryResults === 'undefined') return null;
  return digestContentSummaryResults?.[entry.item.id] || null;
}

function contentSummaryForEntry(entry) {
  const result = contentSummaryResultForEntry(entry);
  if (result && result.status !== 'ok') return '';
  return String(entry?.item?.contentSummary || result?.summary || '').trim();
}

function contentSummaryPayloadForEntries(entries) {
  return entries.map((entry) => {
    const source = sourceForItem(entry.item);
    return {
      item_id: entry.item.id,
      title: entry.item.title,
      summary: entry.item.summary,
      link: source.url,
      source: source.name,
      jurisdiction: entry.item.jurisdiction,
      category: entry.item.category,
    };
  }).filter((item) => safeHref(item.link) !== '#');
}

function applyDigestContentSummaryResults(results, options = {}) {
  const { openErrors = true } = options;
  digestContentSummaryResults = {
    ...digestContentSummaryResults,
    ...Object.fromEntries((results || []).map((result) => [result.item_id, result])),
  };
  digestSummaryErrors = Object.values(digestContentSummaryResults).filter((result) => result.status !== 'ok');
  digestSummaryErrorsOpen = openErrors && digestSummaryErrors.length > 0;
}

function digestSummaryProgressPercent(progress = digestSummaryProgress) {
  const total = Math.max(0, Number(progress?.total) || 0);
  if (!total) return 0;
  const completed = Math.max(0, Math.min(total, Number(progress?.completed) || 0));
  return Math.round((completed / total) * 100);
}

function renderDigestSummaryProgress() {
  if (!digestSummaryLoading && !digestSummaryProgress.total) return '';
  const percent = digestSummaryProgressPercent();
  const total = Math.max(0, Number(digestSummaryProgress.total) || 0);
  const completed = Math.max(0, Math.min(total, Number(digestSummaryProgress.completed) || 0));
  const currentTitle = digestSummaryProgress.currentTitle || 'Preparing selected updates';
  return `
    <div class="digest-summary-progress" role="status" aria-live="polite">
      <div class="digest-summary-progress-copy">
        <strong>Summarizing selected updates</strong>
        <span>${completed}/${total} complete</span>
      </div>
      <div class="digest-summary-progress-track" aria-label="AI summary progress" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${percent}" role="progressbar">
        <span style="width:${percent}%"></span>
      </div>
      <p>${escapeHtml(currentTitle)}</p>
    </div>
  `;
}

function refreshCurrentDigestBodies() {
  if (!currentRoutingDigest) return;
  const replacement = createDigest(currentRoutingDigest.status || 'Ready');
  currentRoutingDigest = {
    ...replacement,
    id: currentRoutingDigest.id,
    createdAt: currentRoutingDigest.createdAt,
    status: currentRoutingDigest.status,
    sentAt: currentRoutingDigest.sentAt,
    simulatedSentAt: currentRoutingDigest.simulatedSentAt,
  };
}

async function summarizeSelectedDigestSources() {
  const entries = selectedDigestEntries();
  const payloadItems = contentSummaryPayloadForEntries(entries);
  if (!payloadItems.length) {
    setAlert('No selected source links are available to summarize.');
    return;
  }
  digestSummaryLoading = true;
  digestSummaryProgress = { completed: 0, total: payloadItems.length, currentTitle: payloadItems[0]?.title || '' };
  digestSummaryErrors = [];
  digestSummaryErrorsOpen = false;
  renderRoutingEngine();
  const results = [];
  try {
    for (const [index, item] of payloadItems.entries()) {
      digestSummaryProgress = { completed: index, total: payloadItems.length, currentTitle: item.title || item.source || 'Selected update' };
      renderRoutingEngine();
      const itemResults = await api('/api/digest/source-summaries', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: [item] }),
      });
      results.push(...itemResults);
      applyDigestContentSummaryResults(itemResults, { openErrors: false });
      refreshCurrentDigestBodies();
      digestSummaryProgress = { completed: index + 1, total: payloadItems.length, currentTitle: item.title || item.source || 'Selected update' };
      renderRoutingEngine();
    }
    const ok = results.filter((result) => result.status === 'ok').length;
    const failed = results.length - ok;
    digestSummaryErrors = results.filter((result) => result.status !== 'ok');
    digestSummaryErrorsOpen = failed > 0;
    setAlert(
      failed
        ? `Added AI summaries for ${ok}/${results.length} selected item${results.length === 1 ? '' : 's'}. ${failed} source${failed === 1 ? '' : 's'} could not be summarized.`
        : `Added AI summaries for ${ok}/${results.length} selected item${results.length === 1 ? '' : 's'}.`,
    );
  } catch (error) {
    setAlert(error instanceof Error ? error.message : 'Unable to generate AI summaries for selected source pages.');
  } finally {
    digestSummaryLoading = false;
    digestSummaryProgress = { completed: 0, total: 0, currentTitle: '' };
    renderRoutingEngine();
  }
}

function ensureDigestSelection() {
  const candidates = digestCandidateEntries();
  const candidateIds = new Set(candidates.map((entry) => entry.item.id));
  const retained = Array.from(selectedDigestItemIds).filter((id) => candidateIds.has(id));
  const nextSelection = retained.length
    ? retained.slice(0, routingMaxItems)
    : balancedDigestEntries(candidates, routingMaxItems).map((entry) => entry.item.id);
  selectedDigestItemIds = new Set(nextSelection);
}

function saveDigestHistory() {
  localStorage.setItem('routingDigestHistory', JSON.stringify(digestHistory.slice(0, 30)));
}

function selectedRecipientGroup(departmentId = selectedRoutingDepartmentId) {
  const department = routingDepartment(departmentId);
  return RECIPIENT_GROUPS[departmentId] || {
    department: department.name,
    groupName: `${department.name} Intelligence`,
    placeholderEmail: `${department.id || 'team'}-intelligence@example.invalid`,
    deliveryChannel: 'Email',
  };
}

function digestTypeSlug(value) {
  return String(value || 'digest').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function digestSubject(department, digestType) {
  return `${digestType}: ${department.name} Legal Intelligence Briefing`;
}

function digestExecutiveSummary(entries, department, digestType) {
  if (!entries.length) {
    return `No selected intelligence signals are currently available for ${department.name}.`;
  }
  const topics = Array.from(new Set(entries.map((entry) => entry.item.topic))).slice(0, 3).join(', ');
  const urgent = entries.filter((entry) => ['ACTION REQUIRED', 'STRATEGIC'].includes(entry.item.urgency)).length;
  return `${entries.length} selected ${digestType.toLowerCase()} signal${entries.length === 1 ? '' : 's'} for ${department.name}, led by ${topics || 'core APAC intelligence'}. ${urgent} high-priority item${urgent === 1 ? '' : 's'} should be reviewed before wider distribution.`;
}

function buildDigestHtml(digestDraft) {
  const feedbackUrl = '#feedback';
  return `
    <div style="margin:0;padding:0;background:#0d141a;color:#eef5f8;font-family:Arial,Helvetica,sans-serif;">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;background:#0d141a;">
        <tr>
          <td style="padding:24px;">
            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:780px;margin:0 auto;border-collapse:collapse;background:#17222a;border:1px solid #34434c;border-radius:12px;overflow:hidden;">
              <tr>
                <td style="padding:24px;background:#2b2330;">
                  <p style="margin:0 0 8px;color:#ff788d;font-size:12px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;">${escapeHtml(digestDraft.digestType)}</p>
                  <h1 style="margin:0;color:#ffffff;font-size:28px;line-height:1.18;">${escapeHtml(digestDraft.department)} Legal Intelligence Briefing</h1>
                  <p style="margin:8px 0 0;color:#c9d7df;font-size:13px;">${escapeHtml(formatDate(digestDraft.createdAt))} / Audience: ${escapeHtml(digestDraft.recipientGroup.groupName)} / ${escapeHtml(digestDraft.recipientGroup.deliveryChannel)}</p>
                </td>
              </tr>
              <tr>
                <td style="padding:20px 24px;border-top:1px solid #34434c;">
                  <h2 style="margin:0 0 8px;color:#ffffff;font-size:16px;">Executive summary</h2>
                  <p style="margin:0;color:#c9d7df;font-size:14px;line-height:1.55;">${escapeHtml(digestDraft.executiveSummary)}</p>
                </td>
              </tr>
              <tr>
                <td style="padding:0 24px 8px;">
                  <h2 style="margin:0 0 12px;color:#ffffff;font-size:16px;">Top intelligence signals</h2>
                  ${digestDraft.entries.map((entry) => buildDigestItemHtml(entry)).join('')}
                </td>
              </tr>
              <tr>
                <td style="padding:18px 24px 24px;border-top:1px solid #34434c;">
                  <p style="margin:0 0 10px;color:#c9d7df;font-size:13px;font-weight:700;">Was this briefing relevant?</p>
                  <a href="${feedbackUrl}?value=useful" style="display:inline-block;margin-right:8px;padding:8px 12px;border-radius:999px;background:#22313a;color:#ffffff;text-decoration:none;font-size:12px;font-weight:700;">Useful</a>
                  <a href="${feedbackUrl}?value=strategic" style="display:inline-block;margin-right:8px;padding:8px 12px;border-radius:999px;background:#22313a;color:#ffffff;text-decoration:none;font-size:12px;font-weight:700;">Strategic</a>
                  <a href="${feedbackUrl}?value=irrelevant" style="display:inline-block;padding:8px 12px;border-radius:999px;background:#22313a;color:#ffffff;text-decoration:none;font-size:12px;font-weight:700;">Irrelevant</a>
                  <p style="margin:14px 0 0;color:#91a2ad;font-size:11px;">No real email was sent from this local preview.</p>
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    </div>
  `;
}

function buildDigestItemHtml(entry) {
  const source = sourceForItem(entry.item);
  const contentSummary = contentSummaryForEntry(entry);
  return `
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;margin:0 0 12px;background:#1d2a33;border:1px solid #34434c;border-radius:10px;">
      <tr>
        <td style="padding:16px;">
          <p style="margin:0 0 8px;">
            <span style="display:inline-block;margin-right:6px;padding:5px 9px;border-radius:999px;background:#b21f38;color:#ffffff;font-size:11px;font-weight:700;">${escapeHtml(entry.item.urgency)}</span>
            <span style="display:inline-block;margin-right:6px;padding:5px 9px;border-radius:999px;background:#263742;color:#dce9ee;font-size:11px;font-weight:700;">${escapeHtml(entry.item.jurisdiction)}</span>
            <span style="display:inline-block;padding:5px 9px;border-radius:999px;background:#263742;color:#dce9ee;font-size:11px;font-weight:700;">Confidence: ${escapeHtml(entry.route.confidence)}</span>
          </p>
          <h3 style="margin:0 0 8px;color:#ffffff;font-size:17px;line-height:1.3;"><a href="${escapeHtml(safeHref(source.url))}" style="color:#ffffff;text-decoration:none;">${escapeHtml(entry.item.title)}</a></h3>
          <p style="margin:0 0 8px;color:#7ad7f0;font-size:12px;font-weight:700;">Source: <a href="${escapeHtml(safeHref(source.url))}" style="color:#7ad7f0;text-decoration:none;">${escapeHtml(source.name)}</a></p>
          <p style="margin:0 0 8px;color:#c9d7df;font-size:13px;line-height:1.5;"><strong style="color:#ffffff;">What happened:</strong> ${escapeHtml(entry.item.summary)}</p>
          ${contentSummary ? `<p style="margin:0 0 8px;color:#c9d7df;font-size:13px;line-height:1.5;"><strong style="color:#ffffff;">AI summary:</strong> ${escapeHtml(contentSummary)}</p>` : ''}
          <p style="margin:0 0 8px;color:#c9d7df;font-size:13px;line-height:1.5;"><strong style="color:#ffffff;">Why this matters:</strong> ${escapeHtml(entry.route.whyThisMatters)}</p>
          <p style="margin:0 0 8px;color:#c9d7df;font-size:13px;line-height:1.5;"><strong style="color:#ffffff;">Recommended action:</strong> ${escapeHtml(entry.route.recommendedAction)}</p>
          <p style="margin:0;color:#91a2ad;font-size:12px;">Impacted teams: ${escapeHtml(routedDepartmentsFor(entry.item).map((route) => route.departmentShortName).join(', ') || entry.route.departmentShortName)}</p>
        </td>
      </tr>
    </table>
  `;
}

function buildDigestText(digestDraft) {
  const lines = [
    digestDraft.subject,
    `Audience: ${digestDraft.recipientGroup.groupName} <${digestDraft.recipientGroup.placeholderEmail}>`,
    `Date: ${formatDate(digestDraft.createdAt)}`,
    '',
    'Executive summary',
    digestDraft.executiveSummary,
    '',
    'Top intelligence signals',
  ];
  digestDraft.entries.forEach((entry, index) => {
    const source = sourceForItem(entry.item);
    const contentSummary = contentSummaryForEntry(entry);
    lines.push(
      '',
      `${index + 1}. ${entry.item.title}`,
      `${entry.item.urgency} / ${entry.item.jurisdiction} / ${entry.item.topic}`,
      `Source: ${source.name}`,
      `Link: ${safeHref(source.url)}`,
      `What happened: ${entry.item.summary}`,
      ...(contentSummary ? [`AI summary: ${contentSummary}`] : []),
      `Why this matters: ${entry.route.whyThisMatters}`,
      `Recommended action: ${entry.route.recommendedAction}`,
      `Impacted teams: ${routedDepartmentsFor(entry.item).map((route) => route.departmentShortName).join(', ') || entry.route.departmentShortName}`,
      `Confidence: ${entry.route.confidence}`,
    );
  });
  lines.push('', 'Feedback: Useful / Strategic / Irrelevant', 'No real email was sent from this local preview.');
  return lines.join('\n');
}

function createDigest(status = 'Ready') {
  const department = routingDepartment(selectedRoutingDepartmentId);
  const recipientGroup = selectedRecipientGroup(department.id);
  const entries = selectedDigestEntries();
  const createdAt = new Date().toISOString();
  const base = {
    id: `digest-${department.id}-${digestTypeSlug(selectedDigestType)}-${Date.now()}`,
    createdAt,
    department: department.name,
    departmentId: department.id,
    digestType: selectedDigestType,
    subject: digestSubject(department, selectedDigestType),
    itemIds: entries.map((entry) => entry.item.id),
    status,
    sentAt: null,
    recipientGroup,
    entries,
    executiveSummary: digestExecutiveSummary(entries, department, selectedDigestType),
  };
  return {
    ...base,
    htmlBody: buildDigestHtml(base),
    textBody: buildDigestText(base),
  };
}

function upsertDigestHistory(digest) {
  const existing = digestHistory.filter((item) => item.id !== digest.id);
  digestHistory = [digest, ...existing].slice(0, 30);
  saveDigestHistory();
}

function openDigestFromHistory(id) {
  const digest = digestHistory.find((item) => item.id === id);
  if (!digest) return;
  currentRoutingDigest = digest;
  activeRoutingTab = 'email';
  renderRoutingEngine();
}

async function copyToClipboard(text, label) {
  try {
    await navigator.clipboard.writeText(text);
    setAlert(`${label} copied to clipboard.`);
  } catch (error) {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.setAttribute('readonly', '');
    textarea.style.position = 'fixed';
    textarea.style.left = '-9999px';
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand('copy');
    textarea.remove();
    setAlert(`${label} copied to clipboard.`);
  }
}

function sendCurrentDigest() {
  if (!currentRoutingDigest) currentRoutingDigest = createDigest('Ready');
  currentRoutingDigest = {
    ...currentRoutingDigest,
    status: 'Sent',
    sentAt: new Date().toISOString(),
  };
  upsertDigestHistory(currentRoutingDigest);
  setAlert('Send recorded locally. No real email was sent.');
  renderRoutingEngine();
}

function weeklyDigestPublishPayload(digest) {
  return {
    digest_id: digest.id,
    title: digest.subject,
    summary: digest.executiveSummary,
    html_body: digest.htmlBody,
    text_body: digest.textBody,
    status: 'published',
    item_count: digest.itemIds?.length || digest.entries?.length || 0,
    department: digest.department,
    digest_type: digest.digestType,
    entries: (digest.entries || []).map((entry) => ({
      title: entry.item.title,
      summary: entry.item.summary,
      link: entry.item.link,
      source: entry.item.source,
      jurisdiction: entry.item.jurisdiction,
      topic: entry.item.topic,
      urgency: entry.item.urgency,
      why_this_matters: entry.route.whyThisMatters,
      recommended_action: entry.route.recommendedAction,
      confidence: entry.route.confidence,
    })),
  };
}

async function publishCurrentDigest() {
  if (!currentRoutingDigest) currentRoutingDigest = createDigest('Ready');
  const published = await apiAt(PUBLISH_API_BASE, '/api/admin/weekly-digests/publish', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(weeklyDigestPublishPayload(currentRoutingDigest)),
  });
  currentRoutingDigest = {
    ...currentRoutingDigest,
    status: 'Published',
    publishedAt: published.published_at,
  };
  upsertDigestHistory(currentRoutingDigest);
  setAlert('Weekly digest published to the public Weekly Digest tab.');
  renderRoutingEngine();
}

function digestStatusStep() {
  if (currentRoutingDigest?.status === 'Sent' || currentRoutingDigest?.status === 'Simulated Sent') return 'Sent';
  if (currentRoutingDigest?.status === 'Draft') return 'Draft Saved';
  if (currentRoutingDigest?.status === 'Ready') return 'Preview';
  return selectedDigestItemIds.size ? 'Generate' : 'Select';
}

function renderDigestSteps() {
  const steps = ['Select', 'Generate', 'Preview', 'Draft Saved', 'Sent'];
  const active = digestStatusStep();
  const activeIndex = Math.max(0, steps.indexOf(active));
  return `<div class="digest-steps">${steps.map((step, index) => `<span class="${index <= activeIndex ? 'active' : ''}">${escapeHtml(step)}</span>`).join('')}</div>`;
}

function routingKpis() {
  const items = routingItems();
  const signals = strategicSignals();
  const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const routedThisWeek = signals
    .filter((signal) => new Date(signal.item.date).getTime() >= weekAgo)
    .reduce((count, signal) => count + signal.routes.length, 0);
  const urgencyBreakdown = signals.reduce((acc, signal) => {
    acc[signal.item.urgency] = (acc[signal.item.urgency] || 0) + 1;
    return acc;
  }, {});
  const topJurisdictions = Object.entries(signals.reduce((acc, signal) => {
    acc[signal.item.jurisdiction] = (acc[signal.item.jurisdiction] || 0) + 1;
    return acc;
  }, {})).sort((a, b) => b[1] - a[1]);
  const topTopics = Object.entries(signals.reduce((acc, signal) => {
    acc[signal.item.topic] = (acc[signal.item.topic] || 0) + 1;
    return acc;
  }, {})).sort((a, b) => b[1] - a[1]);
  const highPrioritySignals = signals.slice(0, 7);
  const suppressedCount = Math.max(0, items.length - signals.length);
  return { items, signals, suppressedCount, routedThisWeek, urgencyBreakdown, topJurisdictions, topTopics, highPrioritySignals };
}

function renderMetricCard(label, value, detail = '') {
  return `<section class="stat-card"><div class="stat-label">${escapeHtml(label)}</div><div class="stat-value compact">${escapeHtml(value)}</div><div class="stat-detail">${escapeHtml(detail)}</div></section>`;
}

function renderRoutingEngine() {
  els.routingTabs.forEach((button) => {
    const active = button.dataset.routingTab === activeRoutingTab;
    button.classList.toggle('active', active);
    button.setAttribute('aria-pressed', String(active));
  });
  if (activeRoutingTab === 'dashboard') renderRoutingDashboard();
  if (activeRoutingTab === 'items') renderRoutingItems();
  if (activeRoutingTab === 'profiles') renderRoutingProfiles();
  if (activeRoutingTab === 'digest') renderDigestBuilder();
  if (activeRoutingTab === 'email') renderEmailPreview();
  if (activeRoutingTab === 'history') renderDigestHistory();
  if (activeRoutingTab === 'analytics') renderFeedbackAnalytics();
  renderRoutingComparison();
}

function renderRoutingDashboard() {
  const kpis = routingKpis();
  els.routingMain.innerHTML = `
    <section class="stats-grid routing-stats">
      ${renderMetricCard('Executive Signals', kpis.signals.length, `Strategic score ${STRATEGIC_SIGNAL_THRESHOLD}+ only`)}
      ${renderMetricCard('Source Intake Items', kpis.items.length, routingLoadedFromApi ? 'Raw legal source ingestion' : 'Curated five-market fallback set')}
      ${renderMetricCard('Suppressed Intake', kpis.suppressedCount, 'Routine gazettes, notices and low-impact updates hidden')}
      ${renderMetricCard('Routes This Week', kpis.routedThisWeek, 'Strategic signals routed across departments')}
      ${renderMetricCard('Department Digests Generated', routingGeneratedCount, 'Local demo digest count')}
    </section>
    <section class="routing-dashboard-grid">
      <article class="panel">
        <div class="section-heading"><h2>Strategic Urgency Breakdown</h2></div>
        <div class="routing-breakdown">
          ${Object.entries(kpis.urgencyBreakdown).length ? Object.entries(kpis.urgencyBreakdown).map(([urgency, count]) => `
            <div class="routing-bar-row">
              <span class="urgency-badge ${urgencyClass(urgency)}">${escapeHtml(urgency)}</span>
              <strong>${count}</strong>
              <i style="width:${Math.max(8, count * 18)}%"></i>
            </div>
          `).join('') : '<div class="empty-state">No strategic signals meet the current threshold.</div>'}
        </div>
      </article>
      <article class="panel">
        <div class="section-heading"><h2>Top Signal Jurisdictions</h2></div>
        <div class="routing-chip-cloud">
          ${coreRoutingJurisdictions().map((jurisdiction) => `<span>${escapeHtml(jurisdiction)} <strong>${kpis.topJurisdictions.find(([name]) => name === jurisdiction)?.[1] || 0}</strong></span>`).join('')}
        </div>
      </article>
      <article class="panel">
        <div class="section-heading"><h2>Top Strategic Topics</h2></div>
        <div class="routing-chip-cloud">
          ${kpis.topTopics.length ? kpis.topTopics.slice(0, 6).map(([topic, count]) => `<span>${escapeHtml(topic)} <strong>${count}</strong></span>`).join('') : '<span>No signals yet</span>'}
        </div>
      </article>
      <article class="panel routing-wide-panel">
        <div class="section-heading"><h2>High-Signal Developments</h2><span>${kpis.highPrioritySignals.length} shown</span></div>
        <div class="routing-signal-list">
          ${kpis.highPrioritySignals.length ? kpis.highPrioritySignals.map((signal) => renderStrategicSignalRow(signal)).join('') : '<div class="empty-state">No strategic intelligence signals yet. Raw source items remain available in Source Intake Queue.</div>'}
        </div>
      </article>
      <article class="panel routing-wide-panel">
        <div class="section-heading"><h2>Strategic Signal Filter</h2><span>Raw intake -> executive intelligence</span></div>
        <ul class="routing-recommendations">
          <li>Suppress routine gazette uploads, administrative publication notices, generic ministry notifications and repetitive metadata.</li>
          <li>Promote signals with multi-department relevance, AI/privacy impact, judiciary modernization, market/commercial value, precedent importance or regulatory change magnitude.</li>
          <li>Normalize titles and summaries so dashboard items read like executive intelligence, while the raw source record remains available in the Source Intake Queue.</li>
        </ul>
      </article>
    </section>
  `;
  wireRoutingItemButtons();
}

function renderRoutingSignalRow(item) {
  const topRoute = routingResultsFor(item)[0];
  return `
    <button class="routing-signal-row" type="button" data-routing-item="${escapeHtml(item.id)}">
      <span class="urgency-badge ${urgencyClass(item.urgency)}">${escapeHtml(item.urgency)}</span>
      <strong>${escapeHtml(item.title)}</strong>
      <span>${escapeHtml(item.jurisdiction)} / ${escapeHtml(item.topic)}</span>
      <em>${topRoute.score} ${escapeHtml(topRoute.departmentShortName)}</em>
    </button>
  `;
}

function renderStrategicSignalRow(signal) {
  const item = signal.item;
  const topRoute = signal.routes[0] || routingResultsFor(item)[0];
  return `
    <button class="routing-signal-row strategic-signal-row" type="button" data-routing-item="${escapeHtml(item.id)}">
      <span class="urgency-badge ${urgencyClass(item.urgency)}">${escapeHtml(item.urgency)}</span>
      <div>
        <strong>${escapeHtml(signal.title)}</strong>
        <p>${escapeHtml(signal.summary)}</p>
        <small>${escapeHtml(signal.reasons.slice(0, 3).join(' / ') || 'strategic relevance')}</small>
      </div>
      <span>${escapeHtml(item.jurisdiction)} / ${escapeHtml(item.topic)}</span>
      <em>${signal.score} signal</em>
    </button>
  `;
}

function renderRoutingItems() {
  const visible = visibleRoutingItems();
  els.routingMain.innerHTML = `
    <section class="panel">
      <div class="section-heading">
        <h2>Source Intake Queue</h2>
        <span>${visible.length} raw ${routingLoadedFromApi ? 'source-backed items' : 'fallback items'}</span>
      </div>
      <p class="section-note">Raw legal source ingestion is retained here for audit and triage. The Strategic Intelligence Dashboard shows only items that pass the executive signal filter.</p>
      <div class="filter-group compact-filters routing-jurisdiction-filter" id="routingJurisdictionFilters" aria-label="Routing jurisdiction filter"></div>
      <div class="routing-table">
        ${visible.map((item) => renderRoutingItemCard(item)).join('')}
      </div>
    </section>
  `;
  renderFilters(document.querySelector('#routingJurisdictionFilters'), ['All', ...coreRoutingJurisdictions()], activeRoutingJurisdiction, (value) => {
    activeRoutingJurisdiction = value;
    renderRoutingItems();
  });
  wireRoutingItemButtons();
}

function renderRoutingItemCard(item) {
  const routes = routingResultsFor(item);
  const departments = routes.filter((route) => route.score >= 52).map((route) => route.departmentShortName).join(', ') || 'No route';
  return `
    <article class="routing-item-card ${item.id === selectedRoutingItemId ? 'selected' : ''}">
      <div class="routing-item-content">
        <button class="routing-item-main" type="button" data-routing-item="${escapeHtml(item.id)}">
          <div class="update-meta">
            <span class="urgency-badge ${urgencyClass(item.urgency)}">${escapeHtml(item.urgency)}</span>
            <span class="category">${escapeHtml(item.topic)}</span>
            <span class="category">${escapeHtml(item.jurisdiction)}</span>
            <span class="date">${formatDate(item.date)}</span>
          </div>
          <h3>${escapeHtml(item.title)}</h3>
          <p>${escapeHtml(item.summary)}</p>
          <div class="routing-card-footer">
            <span class="${statusClass(item.status)}">${escapeHtml(item.status)}</span>
            <strong>Impact ${item.impactScore}</strong>
            <span>Departments: ${escapeHtml(departments)}</span>
          </div>
        </button>
        ${sourceLinkForItem(item)}
      </div>
      <div class="routing-score-stack">
        ${routes.map((route) => `
          <div class="routing-score-line">
            <span>${escapeHtml(route.departmentShortName)}</span>
            <i><b style="width:${route.score}%"></b></i>
            <strong>${route.score}</strong>
          </div>
        `).join('')}
      </div>
    </article>
  `;
}

function renderRoutingProfiles() {
  els.routingMain.innerHTML = `
    <section class="routing-profile-grid">
      ${routingDepartmentProfiles.map((department) => renderProfileEditor(department)).join('')}
    </section>
  `;
  document.querySelectorAll('[data-profile-field]').forEach((input) => {
    input.addEventListener('change', () => {
      const department = routingDepartment(input.dataset.department);
      department[input.dataset.profileField] = input.value;
      renderRoutingEngine();
    });
  });
  document.querySelectorAll('[data-topic-weight]').forEach((input) => {
    input.addEventListener('input', () => {
      const department = routingDepartment(input.dataset.department);
      department.priorityTopics[input.dataset.topicWeight] = Number(input.value);
      input.closest('.topic-weight-row').querySelector('strong').textContent = input.value;
      renderRoutingComparison();
    });
  });
  document.querySelectorAll('[data-jurisdiction-toggle]').forEach((button) => {
    button.addEventListener('click', () => {
      const department = routingDepartment(button.dataset.department);
      const jurisdiction = button.dataset.jurisdictionToggle;
      if (department.priorityJurisdictions.includes(jurisdiction)) {
        department.priorityJurisdictions = department.priorityJurisdictions.filter((item) => item !== jurisdiction);
      } else {
        department.priorityJurisdictions.push(jurisdiction);
      }
      renderRoutingEngine();
    });
  });
}

function renderProfileEditor(department) {
  const jurisdictions = coreRoutingJurisdictions();
  return `
    <article class="panel profile-card">
      <div class="section-heading"><h2>${escapeHtml(department.name)}</h2><span>${escapeHtml(department.tone)}</span></div>
      <div class="profile-controls">
        <label>Digest frequency<select data-profile-field="frequency" data-department="${department.id}">
          ${['Daily', 'Weekly'].map((value) => `<option ${department.frequency === value ? 'selected' : ''}>${value}</option>`).join('')}
        </select></label>
        <label>Delivery channel<select data-profile-field="channel" data-department="${department.id}">
          ${['Email', 'Teams', 'Dashboard'].map((value) => `<option ${department.channel === value ? 'selected' : ''}>${value}</option>`).join('')}
        </select></label>
        <label>Tone<select data-profile-field="tone" data-department="${department.id}">
          ${['Executive', 'Operational', 'Editorial', 'Technical'].map((value) => `<option ${department.tone === value ? 'selected' : ''}>${value}</option>`).join('')}
        </select></label>
      </div>
      <h3>Priority topics</h3>
      <div class="topic-weight-list">
        ${routingTopics().map((topic) => `
          <label class="topic-weight-row">
            <span>${escapeHtml(topic)}</span>
            <input type="range" min="0" max="100" value="${department.priorityTopics[topic] || 0}" data-topic-weight="${escapeHtml(topic)}" data-department="${department.id}" />
            <strong>${department.priorityTopics[topic] || 0}</strong>
          </label>
        `).join('')}
      </div>
      <h3>Priority jurisdictions</h3>
      <div class="routing-chip-cloud compact">
        ${jurisdictions.map((jurisdiction) => `
          <button class="${department.priorityJurisdictions.includes(jurisdiction) ? 'active' : ''}" type="button" data-jurisdiction-toggle="${escapeHtml(jurisdiction)}" data-department="${department.id}">${escapeHtml(jurisdiction)}</button>
        `).join('')}
      </div>
    </article>
  `;
}

function renderDigestBuilder() {
  const department = routingDepartment(selectedRoutingDepartmentId);
  const departmentItems = routingItemsForDepartment(department.id);
  const jurisdictions = department.id === 'sales'
    ? ['All', ...Array.from(new Set(departmentItems.map((item) => item.jurisdiction))).sort()]
    : ['All', ...coreRoutingJurisdictions()];
  normalizeDigestJurisdictionFilters(jurisdictions);
  ensureDigestSelection();
  const candidates = digestCandidateEntries();
  const selectedEntries = selectedDigestEntries();
  const sourceLabel = department.id === 'sales' && legalAiRoutingItems().length ? 'Legal AI News database' : 'Legal Updates database';
  const digestSourceItems = digestItemsForDepartment(department.id).map((entry) => entry.item);
  const topics = ['All', ...Array.from(new Set(digestSourceItems.map((item) => item.topic))).sort()];
  els.routingMain.innerHTML = `
    <section class="panel digest-builder">
      <div class="section-heading"><h2>Digest Builder</h2><span>${selectedEntries.length} selected / ${candidates.length} available / ${sourceLabel}</span></div>
      ${renderDigestSteps()}
      <div class="digest-controls">
        <label>Department<select id="digestDepartment">
          ${routingDepartmentProfiles.map((item) => `<option value="${item.id}" ${item.id === department.id ? 'selected' : ''}>${escapeHtml(item.name)}</option>`).join('')}
        </select></label>
        <label>Digest type<select id="digestType">
          ${DIGEST_TYPES.map((value) => `<option ${selectedDigestType === value ? 'selected' : ''}>${escapeHtml(value)}</option>`).join('')}
        </select></label>
        <label>Maximum items<input id="digestMaxItems" type="number" min="3" max="12" value="${routingMaxItems}" /></label>
        <div class="digest-field digest-jurisdiction-field">
          <span class="digest-field-label">Jurisdictions</span>
          <div class="routing-chip-cloud compact digest-jurisdiction-options">
            ${jurisdictions.map((value) => `
              <button class="${isDigestJurisdictionSelected(value) ? 'active' : ''}" type="button" data-digest-jurisdiction="${escapeHtml(value)}" aria-pressed="${isDigestJurisdictionSelected(value) ? 'true' : 'false'}">${escapeHtml(value)}</button>
            `).join('')}
          </div>
        </div>
        <label>Topic<select id="digestTopic">
          ${topics.map((value) => `<option ${digestTopicFilter === value ? 'selected' : ''}>${escapeHtml(value)}</option>`).join('')}
        </select></label>
        <label class="toggle-label"><input id="digestApprovedOnly" type="checkbox" ${digestIncludeApprovedOnly ? 'checked' : ''} /><span>Approved only</span></label>
      </div>
      <div class="digest-action-row">
        <button class="primary-button" id="generateDigest" type="button">Generate digest</button>
        <button class="ghost-button" id="summarizeDigestSources" type="button" ${digestSummaryLoading ? 'disabled' : ''}>${digestSummaryLoading ? 'Summarizing...' : 'Generate AI summaries'}</button>
        <button class="ghost-button" id="saveDigestDraft" type="button">Save draft</button>
        <button class="ghost-button" id="sendDigest" type="button">Send</button>
        <button class="ghost-button" id="publishDigest" type="button">Publish to Weekly Digest</button>
        <button class="ghost-button" id="viewDigestHistory" type="button">View history</button>
        <span class="simulated-note">No real email is sent from this local preview.</span>
      </div>
      ${renderDigestSummaryProgress()}
      <div class="routing-signal-list">
        ${candidates.map((entry) => renderDigestCandidate(entry)).join('')}
      </div>
    </section>
    ${renderDigestSummaryErrorsModal()}
  `;
  document.querySelector('#digestDepartment').addEventListener('change', (event) => {
    selectedRoutingDepartmentId = event.target.value;
    selectedDigestItemIds = new Set();
    currentRoutingDigest = null;
    renderRoutingEngine();
  });
  document.querySelector('#digestType').addEventListener('change', (event) => {
    selectedDigestType = event.target.value;
    currentRoutingDigest = null;
    renderRoutingEngine();
  });
  document.querySelector('#digestMaxItems').addEventListener('change', (event) => {
    routingMaxItems = Math.max(3, Math.min(12, Number(event.target.value) || 6));
    currentRoutingDigest = null;
    renderRoutingEngine();
  });
  document.querySelectorAll('[data-digest-jurisdiction]').forEach((button) => {
    button.addEventListener('click', () => {
      toggleDigestJurisdictionFilter(button.dataset.digestJurisdiction);
      selectedDigestItemIds = new Set();
      currentRoutingDigest = null;
      renderRoutingEngine();
    });
  });
  document.querySelector('#digestTopic').addEventListener('change', (event) => {
    digestTopicFilter = event.target.value;
    selectedDigestItemIds = new Set();
    currentRoutingDigest = null;
    renderRoutingEngine();
  });
  document.querySelector('#digestApprovedOnly').addEventListener('change', (event) => {
    digestIncludeApprovedOnly = event.target.checked;
    selectedDigestItemIds = new Set();
    currentRoutingDigest = null;
    renderRoutingEngine();
  });
  document.querySelectorAll('[data-digest-item]').forEach((input) => {
    input.addEventListener('change', () => {
      if (input.checked) selectedDigestItemIds.add(input.dataset.digestItem);
      else selectedDigestItemIds.delete(input.dataset.digestItem);
      currentRoutingDigest = null;
      renderRoutingEngine();
    });
  });
  document.querySelector('#generateDigest').addEventListener('click', () => {
    currentRoutingDigest = createDigest('Ready');
    routingGeneratedCount += 1;
    localStorage.setItem('routingGeneratedCount', String(routingGeneratedCount));
    upsertDigestHistory(currentRoutingDigest);
    activeRoutingTab = 'email';
    renderRoutingEngine();
  });
  document.querySelector('#summarizeDigestSources').addEventListener('click', summarizeSelectedDigestSources);
  document.querySelector('#saveDigestDraft').addEventListener('click', () => {
    currentRoutingDigest = createDigest('Draft');
    upsertDigestHistory(currentRoutingDigest);
    setAlert('Digest draft saved locally.');
    renderRoutingEngine();
  });
  document.querySelector('#sendDigest').addEventListener('click', () => {
    currentRoutingDigest = createDigest('Ready');
    sendCurrentDigest();
    activeRoutingTab = 'history';
    renderRoutingEngine();
  });
  document.querySelector('#publishDigest').addEventListener('click', () => {
    publishCurrentDigest().catch((error) => setAlert(error instanceof Error ? error.message : 'Unable to publish Weekly Digest'));
  });
  document.querySelector('#viewDigestHistory').addEventListener('click', () => {
    activeRoutingTab = 'history';
    renderRoutingEngine();
  });
  wireDigestSummaryErrorsModal();
}

function renderDigestCandidate(entry) {
  return `
    <article class="digest-candidate">
      <input type="checkbox" data-digest-item="${escapeHtml(entry.item.id)}" ${selectedDigestItemIds.has(entry.item.id) ? 'checked' : ''} aria-label="Select ${escapeHtml(entry.item.title)}" />
      <span class="urgency-badge ${urgencyClass(entry.item.urgency)}">${escapeHtml(entry.item.urgency)}</span>
      <div>
        <strong>${escapeHtml(entry.item.title)}</strong>
        <p>${escapeHtml(entry.item.jurisdiction)} / ${escapeHtml(entry.item.source)} / ${escapeHtml(entry.route.whyThisMatters)}</p>
      </div>
      <em>${entry.route.score}</em>
    </article>
  `;
}

function ensureDigest() {
  if (!currentRoutingDigest) {
    ensureDigestSelection();
    currentRoutingDigest = createDigest('Ready');
  }
  return currentRoutingDigest;
}

function renderPlainTextPreviewModal(digest) {
  if (!plainTextPreviewOpen) return '';
  return `
    <div class="modal-backdrop" data-close-plain-text="true">
      <section class="plain-text-modal" role="dialog" aria-modal="true" aria-labelledby="plainTextPreviewTitle">
        <div class="section-heading">
          <h2 id="plainTextPreviewTitle">Plain Text Preview</h2>
          <span>${digest.itemIds.length} items</span>
        </div>
        <pre>${escapeHtml(digest.textBody)}</pre>
        <div class="digest-action-row">
          <button class="ghost-button compact-button" type="button" id="copyDigestText">Copy plain text</button>
          <button class="primary-button compact-button" type="button" data-close-plain-text="true">Close</button>
        </div>
      </section>
    </div>
  `;
}

function renderDigestSummaryErrorsModal() {
  if (!digestSummaryErrorsOpen || !digestSummaryErrors.length) return '';
  return `
    <div class="modal-backdrop" data-close-summary-errors="true">
      <section class="plain-text-modal" role="dialog" aria-modal="true" aria-labelledby="summaryErrorTitle">
        <div class="section-heading">
          <h2 id="summaryErrorTitle">AI Summary Errors</h2>
          <span>${digestSummaryErrors.length} item${digestSummaryErrors.length === 1 ? '' : 's'}</span>
        </div>
        <div class="summary-error-list">
          ${digestSummaryErrors.map((item) => `
            <article class="summary-error-row">
              <strong>${escapeHtml(item.title || item.item_id || 'Selected source')}</strong>
              <p>${escapeHtml(item.error || 'Unable to summarize this source.')}</p>
            </article>
          `).join('')}
        </div>
        <div class="digest-action-row">
          <button class="primary-button compact-button" type="button" data-close-summary-errors="true">Close</button>
        </div>
      </section>
    </div>
  `;
}

function wireDigestSummaryErrorsModal() {
  document.querySelectorAll('[data-close-summary-errors]').forEach((node) => {
    node.addEventListener('click', (event) => {
      if (event.target !== node && node.classList.contains('modal-backdrop')) return;
      digestSummaryErrorsOpen = false;
      renderRoutingEngine();
    });
  });
}

function renderEmailPreview() {
  const digest = ensureDigest();
  const statusDetail = ['Sent', 'Simulated Sent'].includes(digest.status)
    ? `Sent ${formatDate(digest.sentAt || digest.simulatedSentAt)}`
    : digest.status === 'Draft'
      ? 'Draft saved locally'
      : 'Ready for review';
  // Future email integration hook: send digest.htmlBody through Microsoft Graph, Outlook desktop automation, SendGrid or AWS SES.
  els.routingMain.innerHTML = `
    <section class="email-preview-shell">
      ${renderDigestSteps()}
      <div class="email-preview-toolbar">
        <div class="email-subject">
          <strong>Subject:</strong> ${escapeHtml(digest.subject)}
          <span>Recipient group: ${escapeHtml(digest.recipientGroup.groupName)} &lt;${escapeHtml(digest.recipientGroup.placeholderEmail)}&gt;</span>
          <span>Status: ${escapeHtml(statusDetail)}</span>
        </div>
        <div class="email-preview-actions">
          <button class="ghost-button compact-button" type="button" id="copyDigestHtml">Copy HTML</button>
          <button class="ghost-button compact-button" type="button" id="viewDigestPlainText">View plain text</button>
          <button class="ghost-button compact-button" type="button" id="summarizePreviewSources" ${digestSummaryLoading ? 'disabled' : ''}>${digestSummaryLoading ? 'Summarizing...' : 'Generate AI summaries'}</button>
          <button class="ghost-button compact-button" type="button" id="publishPreviewDigest">Publish to Weekly Digest</button>
          <button class="primary-button compact-button" type="button" id="sendPreviewDigest">Send</button>
        </div>
      </div>
      ${renderDigestSummaryProgress()}
      <div class="email-preview-grid">
        <article class="email-preview-card">
          <div class="email-render-frame">${digest.htmlBody}</div>
        </article>
      </div>
      <footer class="feedback-box">
        <strong>Was this briefing relevant?</strong>
        <div>
          <button class="ghost-button compact-button" type="button" data-feedback="Useful">Useful</button>
          <button class="ghost-button compact-button" type="button" data-feedback="Strategic">Strategic</button>
          <button class="ghost-button compact-button" type="button" data-feedback="Irrelevant">Irrelevant</button>
        </div>
      </footer>
      ${renderPlainTextPreviewModal(digest)}
      ${renderDigestSummaryErrorsModal()}
    </section>
  `;
  document.querySelector('#copyDigestHtml').addEventListener('click', () => copyToClipboard(digest.htmlBody, 'Email HTML'));
  document.querySelector('#viewDigestPlainText').addEventListener('click', () => {
    plainTextPreviewOpen = true;
    renderRoutingEngine();
  });
  document.querySelector('#summarizePreviewSources').addEventListener('click', summarizeSelectedDigestSources);
  document.querySelector('#publishPreviewDigest').addEventListener('click', () => {
    publishCurrentDigest().catch((error) => setAlert(error instanceof Error ? error.message : 'Unable to publish Weekly Digest'));
  });
  document.querySelector('#sendPreviewDigest').addEventListener('click', sendCurrentDigest);
  document.querySelector('#copyDigestText')?.addEventListener('click', () => copyToClipboard(digest.textBody, 'Plain text email'));
  document.querySelectorAll('[data-close-plain-text]').forEach((node) => {
    node.addEventListener('click', (event) => {
      if (event.target !== node && node.classList.contains('modal-backdrop')) return;
      plainTextPreviewOpen = false;
      renderRoutingEngine();
    });
  });
  wireDigestSummaryErrorsModal();
  document.querySelectorAll('[data-feedback]').forEach((button) => {
    button.addEventListener('click', () => {
      routingFeedback.push({
        value: button.dataset.feedback,
        department: digest.departmentId,
        topics: digest.entries.map((entry) => entry.item.topic),
        at: new Date().toISOString(),
      });
      localStorage.setItem('routingFeedback', JSON.stringify(routingFeedback));
      setAlert(`Feedback recorded: ${button.dataset.feedback}. Analytics updated.`);
      activeRoutingTab = 'analytics';
      renderRoutingEngine();
    });
  });
}

function renderDigestHistory() {
  els.routingMain.innerHTML = `
    <section class="panel digest-history-panel">
      <div class="section-heading"><h2>Sent Digests / Digest History</h2><span>${digestHistory.length} saved locally</span></div>
      ${digestHistory.length ? `
        <div class="digest-history-list">
          ${digestHistory.map((digest) => `
            <article class="digest-history-row">
              <div>
                <strong>${escapeHtml(digest.subject)}</strong>
                <p>${escapeHtml(formatDate(digest.createdAt))} / ${escapeHtml(digest.department)} / ${escapeHtml(digest.digestType)} / ${digest.itemIds?.length || 0} items</p>
              </div>
              <span class="digest-status ${digestStatusClass(digest.status)}">${escapeHtml(digest.status)}</span>
              <button class="ghost-button compact-button" type="button" data-open-digest="${escapeHtml(digest.id)}">Open preview</button>
            </article>
          `).join('')}
        </div>
      ` : '<div class="empty-state">No digests saved yet. Generate or save a draft from Digest Builder.</div>'}
    </section>
  `;
  document.querySelectorAll('[data-open-digest]').forEach((button) => {
    button.addEventListener('click', () => openDigestFromHistory(button.dataset.openDigest));
  });
}

function digestStatusClass(value) {
  return `digest-status-${String(value || 'Draft').toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
}

function renderWeeklyDigestCard(digest) {
  const selected = digest.digest_id === selectedWeeklyDigestId;
  return `
    <article class="update-card ${selected ? 'selected' : ''}">
      <button class="routing-item-main" type="button" data-weekly-digest="${escapeHtml(digest.digest_id)}">
        <div class="update-meta">
          <span class="category">Weekly Digest</span>
          <span>${escapeHtml(formatDate(digest.published_at || digest.created_at))}</span>
        </div>
        <h3>${escapeHtml(digest.title)}</h3>
        <p>${escapeHtml(digest.summary || digest.text_body || '')}</p>
        <div class="update-footer">
          <strong>${escapeHtml(digest.department || 'APAC Legal Updates')}</strong>
          <span>${escapeHtml(digest.item_count || 0)} item${Number(digest.item_count || 0) === 1 ? '' : 's'}</span>
        </div>
      </button>
    </article>
  `;
}

function renderWeeklyDigestDetail(digest) {
  if (!digest) {
    els.weeklyDigestDetail.innerHTML = '<div class="empty-state">Select a published weekly digest to preview it.</div>';
    return;
  }
  els.weeklyDigestDetail.innerHTML = `
    <div class="weekly-digest-detail">
      <div class="section-heading">
        <h2>${escapeHtml(digest.title)}</h2>
        <span>${escapeHtml(formatDate(digest.published_at || digest.created_at))}</span>
      </div>
      <p>${escapeHtml(digest.summary || '')}</p>
      <div class="email-render-frame">${digest.html_body || `<pre>${escapeHtml(digest.text_body || '')}</pre>`}</div>
    </div>
  `;
}

function renderWeeklyDigests() {
  els.weeklyDigestCount.textContent = `${weeklyDigests.length} published`;
  if (!weeklyDigests.length) {
    els.weeklyDigestList.innerHTML = '<div class="empty-state">No weekly digests have been published yet.</div>';
    renderWeeklyDigestDetail(null);
    return;
  }
  if (!weeklyDigests.some((digest) => digest.digest_id === selectedWeeklyDigestId)) {
    selectedWeeklyDigestId = weeklyDigests[0].digest_id;
  }
  els.weeklyDigestList.innerHTML = weeklyDigests.map(renderWeeklyDigestCard).join('');
  renderWeeklyDigestDetail(weeklyDigests.find((digest) => digest.digest_id === selectedWeeklyDigestId));
  document.querySelectorAll('[data-weekly-digest]').forEach((button) => {
    button.addEventListener('click', () => {
      selectedWeeklyDigestId = button.dataset.weeklyDigest;
      renderWeeklyDigests();
    });
  });
}

async function loadWeeklyDigests() {
  weeklyDigests = await fetchAllPages('/api/weekly-digests', { limit: 100, maxItems: 300 });
  renderWeeklyDigests();
}

function renderEmailItem(entry) {
  return `
    <article class="email-intel-card">
      <div class="update-meta">
        <span class="urgency-badge ${urgencyClass(entry.item.urgency)}">${escapeHtml(entry.item.urgency)}</span>
        <span class="category">${escapeHtml(entry.item.jurisdiction)}</span>
        <span class="category">Confidence: ${escapeHtml(entry.route.confidence)}</span>
      </div>
      <h3><a href="${escapeHtml(safeHref(sourceForItem(entry.item).url))}" target="_blank" rel="noreferrer">${escapeHtml(entry.item.title)}</a></h3>
      ${sourceLinkForItem(entry.item)}
      <p><strong>What happened:</strong> ${escapeHtml(entry.item.summary)}</p>
      <p><strong>Why this matters:</strong> ${escapeHtml(entry.route.whyThisMatters)}</p>
      <p><strong>Recommended action:</strong> ${escapeHtml(entry.route.recommendedAction)}</p>
      <p><strong>Impacted teams:</strong> ${escapeHtml(routedDepartmentsFor(entry.item).map((route) => route.departmentShortName).join(', ') || entry.route.departmentShortName)}</p>
    </article>
  `;
}

function renderFeedbackAnalytics() {
  const counts = routingFeedback.reduce((acc, item) => {
    acc[item.value] = (acc[item.value] || 0) + 1;
    return acc;
  }, {});
  const byDepartment = routingFeedback.reduce((acc, item) => {
    acc[item.department] = (acc[item.department] || 0) + 1;
    return acc;
  }, {});
  const topicCounts = routingFeedback.flatMap((item) => item.topics || []).reduce((acc, topic) => {
    acc[topic] = (acc[topic] || 0) + 1;
    return acc;
  }, {});
  const valuedTopics = Object.entries(topicCounts).sort((a, b) => b[1] - a[1]).slice(0, 5);
  const ignoredTopics = routingTopics().filter((topic) => !topicCounts[topic]).slice(0, 5);
  els.routingMain.innerHTML = `
    <section class="stats-grid routing-stats">
      ${renderMetricCard('Total Feedback Responses', routingFeedback.length, 'Mock email preview feedback')}
      ${renderMetricCard('Useful', counts.Useful || 0, 'Operationally relevant')}
      ${renderMetricCard('Strategic', counts.Strategic || 0, 'Leadership-worthy')}
      ${renderMetricCard('Irrelevant', counts.Irrelevant || 0, 'Routing needs tuning')}
    </section>
    <section class="routing-dashboard-grid">
      <article class="panel">
        <div class="section-heading"><h2>Relevance by Department</h2></div>
        <div class="routing-chip-cloud">
          ${routingDepartmentProfiles.map((department) => `<span>${escapeHtml(department.shortName)} <strong>${byDepartment[department.id] || 0}</strong></span>`).join('')}
        </div>
      </article>
      <article class="panel">
        <div class="section-heading"><h2>Most Valued Topics</h2></div>
        <div class="routing-chip-cloud">${valuedTopics.length ? valuedTopics.map(([topic, count]) => `<span>${escapeHtml(topic)} <strong>${count}</strong></span>`).join('') : '<span>No feedback yet</span>'}</div>
      </article>
      <article class="panel">
        <div class="section-heading"><h2>Ignored Topics</h2></div>
        <div class="routing-chip-cloud">${ignoredTopics.map((topic) => `<span>${escapeHtml(topic)}</span>`).join('')}</div>
      </article>
      <article class="panel routing-wide-panel">
        <div class="section-heading"><h2>Recommendations</h2></div>
        <ul class="routing-recommendations">
          <li>Increase topic weights where feedback is consistently Strategic or Useful.</li>
          <li>Lower routing threshold for departments with low volume but high relevance needs.</li>
          <li>Review Irrelevant feedback against jurisdiction preferences and urgency tags.</li>
          <li>Future API hook: send feedback events to analytics storage and retrain ranking weights.</li>
        </ul>
      </article>
    </section>
  `;
}

function renderRoutingComparison() {
  const item = selectedRoutingItem();
  if (!item) {
    els.routingComparison.innerHTML = '<div class="empty-state">No intelligence item selected.</div>';
    return;
  }
  const implications = window.RoutingEngine.generateDepartmentImplications(item, routingDepartmentProfiles);
  els.routingSelectedScore.textContent = `${item.topic} / ${item.jurisdiction}`;
  els.routingComparison.innerHTML = `
    <article class="routing-selected-signal">
      <span class="urgency-badge ${urgencyClass(item.urgency)}">${escapeHtml(item.urgency)}</span>
      <h3><a href="${escapeHtml(safeHref(sourceForItem(item).url))}" target="_blank" rel="noreferrer">${escapeHtml(item.title)}</a></h3>
      <p>${escapeHtml(item.summary)}</p>
      ${sourceLinkForItem(item)}
    </article>
    <div class="implication-grid">
      ${implications.map((entry) => `
        <article class="implication-card">
          <strong>${escapeHtml(entry.department.shortName)}</strong>
          <em>${entry.score} relevance / ${escapeHtml(entry.confidence)}</em>
          <p>${escapeHtml(entry.whyThisMatters)}</p>
        </article>
      `).join('')}
    </div>
  `;
}

function wireRoutingItemButtons() {
  document.querySelectorAll('[data-routing-item]').forEach((button) => {
    button.addEventListener('click', () => {
      selectedRoutingItemId = button.dataset.routingItem;
      renderRoutingEngine();
    });
  });
}

async function loadRiskHeatmap() {
  setAlert('');
  try {
    riskHeatmap = await api('/api/risk-heatmap');
    renderRiskKpis();
    renderRiskFilters();
    renderRiskHeatmap();
    renderRiskDetail();
  } catch (error) {
    setAlert(error instanceof Error ? error.message : 'Unable to load APAC Legal Risk Heatmap');
  }
}

async function loadRoutingIntelligence({ force = false } = {}) {
  setAlert('');
  if (routingLoadedFromApi && !force) {
    renderRoutingEngine();
    return;
  }
  try {
    const pageSize = 200;
    const [sourceRows, updateRows, legalAiSourceRows, legalAiRows] = await Promise.all([
      api('/api/sources'),
      loadRoutingUpdateRows(pageSize),
      api('/api/legal-ai/sources'),
      api('/api/legal-ai/updates?limit=200'),
    ]);
    routingSourceRows = sourceRows;
    routingLegalUpdates = updateRows;
    routingLegalAiSourceRows = legalAiSourceRows;
    routingLegalAiRows = legalAiRows;
    routingLoadedFromApi = true;
    currentRoutingDigest = null;
    const currentIds = new Set(routingItems().map((item) => item.id));
    if (!currentIds.has(selectedRoutingItemId)) selectedRoutingItemId = routingItems()[0]?.id || null;
    renderRoutingEngine();
  } catch (error) {
    routingLoadedFromApi = false;
    renderRoutingEngine();
    throw error;
  }
}

function dedupeRoutingUpdates(rows) {
  const seen = new Set();
  return rows.filter((row) => {
    const key = row.id || `${row.country}|${row.source}|${row.title}|${row.link}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

async function loadRoutingUpdateRows(pageSize) {
  const priorityRows = await Promise.all(routingUpdateRequestPaths(pageSize).map((path) => fetchAllPages(path, { limit: pageSize, maxItems: 1200 })));
  const mixedRows = await fetchAllPages('/api/updates', { limit: pageSize, maxItems: 1200 });
  return dedupeRoutingUpdates([...priorityRows.flat(), ...mixedRows]);
}

function renderCountryMix() {
  if (PUBLIC_MODE) {
    els.countryMix.innerHTML = '<div class="empty-state">Public website shows sent and published newsletters only.</div>';
    return;
  }
  const counts = stats?.by_country || {};
  const max = Math.max(1, ...Object.values(counts));
  els.countryMix.innerHTML = '';
  DEFAULT_COUNTRIES.forEach((country) => {
    const count = counts[country] || 0;
    const button = el('button', 'country-row');
    button.type = 'button';
    button.addEventListener('click', () => {
      activeCountries = new Set([country]);
      renderFilterBars();
      loadUpdates();
    });
    button.appendChild(el('span', '', country));
    button.appendChild(el('strong', '', count));
    const bar = el('i');
    bar.style.width = `${Math.max(8, (count / max) * 100)}%`;
    button.appendChild(bar);
    els.countryMix.appendChild(button);
  });
}

function newsletterToUpdate(newsletter) {
  return {
    id: `newsletter-${newsletter.id}`,
    country: 'APAC',
    source: 'APAC Legal Updates',
    source_tab: 'Published Newsletter',
    title: newsletter.title,
    summary: newsletter.summary || newsletter.text_body || '',
    date: newsletter.published_at || newsletter.updated_at,
    link: '#',
    category: 'Published Newsletter',
    first_seen_at: newsletter.published_at || newsletter.created_at,
    last_seen_at: newsletter.updated_at,
    is_new: false,
    html_body: newsletter.html_body || '',
    text_body: newsletter.text_body || '',
  };
}

async function loadNewsletters() {
  newsletters = await api('/api/newsletters?limit=80');
  const term = els.search.value.trim().toLowerCase();
  updates = newsletters
    .map(newsletterToUpdate)
    .filter((item) => !term || [item.title, item.summary, item.text_body].some((value) => String(value || '').toLowerCase().includes(term)));
  renderStats();
  renderFilterBars();
  renderSourceWatch();
  renderCountryMix();
  renderUpdates();
}

async function loadUpdates() {
  if (PUBLIC_MODE) {
    await loadNewsletters();
    return;
  }
  const selectedCountries = selectedCountryList();
  const buildPath = (country) => ({ limit, offset }) => {
    const params = new URLSearchParams({ limit: String(limit), offset: String(offset) });
    if (country) params.set('country', country);
    if (activeCategory !== 'All') params.set('category', activeCategory);
    if (els.search.value.trim()) params.set('q', els.search.value.trim());
    return `/api/updates?${params}`;
  };
  if (selectedCountries.length <= 1) {
    updates = await fetchAllPages(buildPath(selectedCountries[0]), { limit: 200, maxItems: 1200 });
  } else {
    const rows = await Promise.all(selectedCountries.map((country) => fetchAllPages(buildPath(country), { limit: 200, maxItems: 1200 })));
    const byId = new Map(rows.flat().map((item) => [item.id, item]));
    updates = Array.from(byId.values()).sort((a, b) => {
      const dateDiff = new Date(b.date || b.first_seen_at || 0) - new Date(a.date || a.first_seen_at || 0);
      if (dateDiff) return dateDiff;
      return new Date(b.first_seen_at || 0) - new Date(a.first_seen_at || 0);
    });
  }
  renderUpdates();
}

async function loadAll() {
  setAlert('');
  try {
    if (PUBLIC_MODE) {
      stats = await api('/api/stats');
      sources = [];
      await loadNewsletters();
      return;
    }
    [stats, sources] = await Promise.all([api('/api/stats'), api('/api/sources')]);
    renderStats();
    renderFilterBars();
    renderSourceWatch();
    renderCountryMix();
    await loadUpdates();
  } catch (error) {
    setAlert(error instanceof Error ? error.message : 'Unable to reach the APAC Legal Updates API');
  }
}

async function loadLegalAi() {
  setAlert('');
  try {
    [legalAiSources, allLegalAiUpdates] = await Promise.all([
      api('/api/legal-ai/sources'),
      fetchAllPages('/api/legal-ai/updates', { limit: 200, maxItems: 1200 }),
    ]);
    legalAiUpdates = allLegalAiUpdates;
    renderLegalAiSources();
    renderLegalAiFilters();
    renderLegalAiUpdates();
  } catch (error) {
    setAlert(error instanceof Error ? error.message : 'Unable to load Legal AI News');
  }
}

async function loadLegalAiUpdates() {
  allLegalAiUpdates = await fetchAllPages('/api/legal-ai/updates', { limit: 200, maxItems: 1200 });
  legalAiUpdates = allLegalAiUpdates;
  renderLegalAiFilters();
  renderLegalAiUpdates();
}

async function scanNow() {
  if (PUBLIC_MODE) {
    setAlert('Public website shows newsletters that have already been published.');
    await loadNewsletters();
    return;
  }
  setAlert('');
  els.scan.disabled = true;
  els.scan.textContent = 'Scanning...';
  try {
    if (activePage === 'legal-ai-news') {
      await api('/api/legal-ai/refresh', { method: 'POST' });
      await loadLegalAi();
    } else if (activePage === 'apac-risk-heatmap') {
      await api('/api/refresh', { method: 'POST' });
      await loadRiskHeatmap();
    } else if (activePage === 'routing-engine') {
      await api('/api/refresh', { method: 'POST' });
      await loadRoutingIntelligence({ force: true });
      setAlert('Core APAC routing intelligence refreshed from the Legal Updates database.');
    } else if (activePage === 'weekly-digest') {
      await loadWeeklyDigests();
      setAlert('Weekly Digest refreshed.');
    } else if (activePage === 'judge-congratulation-tool') {
      await api('/api/refresh', { method: 'POST' });
      await loadJudgeTool();
      setAlert('Email Drafting Tool refreshed from existing legal updates.');
    } else {
      await api('/api/refresh', { method: 'POST' });
      await loadAll();
    }
  } catch (error) {
    setAlert(error instanceof Error ? error.message : 'Scan failed');
  } finally {
    els.scan.disabled = false;
    els.scan.textContent = 'Scan now';
  }
}

els.reload.addEventListener('click', () => {
  if (PUBLIC_MODE) {
    loadNewsletters().catch((error) => setAlert(error instanceof Error ? error.message : 'Unable to load published newsletters'));
    return;
  }
  if (activePage === 'legal-ai-news') {
    loadLegalAi();
  } else if (activePage === 'apac-risk-heatmap') {
    loadRiskHeatmap();
  } else if (activePage === 'routing-engine') {
    loadRoutingIntelligence({ force: true }).catch((error) => setAlert(error instanceof Error ? error.message : 'Unable to load routing intelligence'));
  } else if (activePage === 'weekly-digest') {
    loadWeeklyDigests().catch((error) => setAlert(error instanceof Error ? error.message : 'Unable to load Weekly Digest'));
  } else if (activePage === 'judge-congratulation-tool') {
    loadJudgeTool().catch((error) => setAlert(error instanceof Error ? error.message : 'Unable to load Email Drafting Tool'));
  } else {
    loadAll();
  }
});
els.scan.addEventListener('click', scanNow);
els.themeToggle.addEventListener('click', () => {
  applyTheme(currentTheme() === 'dark' ? 'light' : 'dark');
});
els.search.addEventListener('input', () => {
  window.clearTimeout(searchTimer);
  searchTimer = window.setTimeout(() => {
    loadUpdates().catch((error) => setAlert(error instanceof Error ? error.message : 'Unable to load updates'));
  }, 180);
});
els.aiSearch.addEventListener('input', () => {
  window.clearTimeout(aiSearchTimer);
  aiSearchTimer = window.setTimeout(() => {
    loadLegalAiUpdates().catch((error) => setAlert(error instanceof Error ? error.message : 'Unable to load Legal AI News'));
  }, 180);
});
els.pageLinks.forEach((link) => {
  link.addEventListener('click', (event) => {
    event.preventDefault();
    setPage(link.dataset.pageLink);
  });
});
els.routingTabs.forEach((button) => {
  button.addEventListener('click', () => {
    activeRoutingTab = button.dataset.routingTab;
    renderRoutingEngine();
  });
});
window.addEventListener('hashchange', () => setPage(window.location.hash.replace('#', '')));

applyTheme(currentTheme());
setPage(window.location.hash.replace('#', '') || 'legal-updates');
