import { readFile, writeFile } from 'node:fs/promises';

const METRICS_PATH = new URL('../data/metrics.json', import.meta.url);
const GITHUB_OWNER = 'hkustenterprize';
const FORUM_INDEX_URL = 'https://bbs.robomaster.com/article/54254';
const PROJECTS = [
  { articleId: 4812 },
  { articleId: 9452, repository: 'RM2023-SuperCapacitor' },
  { articleId: 54127, repository: 'RM2024-SuperCapacitorController' },
  { articleId: 54121, repository: 'RM2024-PowerModule' },
  { articleId: 760959, repository: 'RM2025-Super-Capacitor-Array' },
  { articleId: 761385, repository: 'RM2025-PowerControlBoard-WirelessCharging' },
  { articleId: 760961, repository: 'RM2025-PowerControlBoard-WirelessCharging' },
  { articleId: 714430 },
  { articleId: 761138, repository: 'RM2025-Radar-Algorithm' },
  { articleId: 48014 },
  { articleId: 803685 },
  { articleId: 20424 },
  { articleId: 764738 },
  { articleId: 766927 },
  { articleId: 54153 },
  { articleId: 760969 },
  { articleId: 761377 },
  { articleId: 54086 },
  { articleId: 55593 },
  { articleId: 53682, repository: 'RM2024-MainControlBoard' },
  { articleId: 760965, repository: 'RM2025-G4-MainControlBoard-V2' },
  { articleId: 760967, repository: 'RM2025-Tiny-JLink' },
  { articleId: 779451, repository: 'RM2025-Wireless-JLink' },
  { articleId: 803683 },
  { articleId: 760956, repository: 'RM2025-LM5145-48to24' },
  { articleId: 760947, repository: 'RM2025-Ethernet-Switch' },
  { articleId: 765552, repository: 'RM2025-Portable-Armor' },
  { articleId: 9656 },
  { articleId: 54087 },
  { articleId: 54198, repository: 'RM2024-SerialDriver-STM32' },
  { articleId: 95847 },
];

const githubHeaders = {
  Accept: 'application/vnd.github+json',
  'User-Agent': 'enterprize-rm2027-metrics-refresh',
  'X-GitHub-Api-Version': '2022-11-28',
};

if (process.env.GITHUB_TOKEN) {
  githubHeaders.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
}

const asNumber = (value) => (Number.isFinite(Number(value)) ? Number(value) : null);
const forumUrlFor = (articleId) => `https://bbs.robomaster.com/article/${articleId}`;

async function fetchJson(url, headers) {
  const response = await fetch(url, { headers, signal: AbortSignal.timeout(20_000) });
  if (!response.ok) throw new Error(`${url} returned ${response.status}`);
  return response.json();
}

async function fetchText(url) {
  const response = await fetch(url, {
    headers: { 'User-Agent': 'enterprize-rm2027-metrics-refresh' },
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) throw new Error(`${url} returned ${response.status}`);
  return response.text();
}

function splitArguments(source) {
  const tokens = [];
  let buffer = '';
  let quote = null;
  let escaped = false;
  let nesting = 0;

  for (const character of source) {
    if (quote) {
      buffer += character;
      if (escaped) escaped = false;
      else if (character === '\\') escaped = true;
      else if (character === quote) quote = null;
      continue;
    }

    if (character === '"' || character === "'") {
      quote = character;
      buffer += character;
    } else if ('([{'.includes(character)) {
      nesting += 1;
      buffer += character;
    } else if (')]}'.includes(character)) {
      nesting -= 1;
      buffer += character;
    } else if (character === ',' && nesting === 0) {
      tokens.push(buffer.trim());
      buffer = '';
    } else {
      buffer += character;
    }
  }

  if (buffer.trim()) tokens.push(buffer.trim());
  return tokens;
}

function decodePrimitive(token) {
  if (token === 'null') return null;
  if (token === 'true') return true;
  if (token === 'false') return false;
  if (/^-?\d+(?:\.\d+)?$/.test(token)) return Number(token);
  if (token.startsWith('"')) return JSON.parse(token);
  if (token.startsWith("'")) return JSON.parse(`"${token.slice(1, -1).replaceAll('"', '\\"')}"`);
  return token;
}

function resolveNuxtValue(html, field) {
  const scriptStart = html.indexOf('window.__NUXT__=(function(');
  if (scriptStart === -1) throw new Error('Nuxt payload is unavailable');

  const scriptEnd = html.indexOf('</script>', scriptStart);
  const payload = html.slice(scriptStart, scriptEnd);
  const parameterMatch = payload.match(/window\.__NUXT__=\(function\(([^)]*)\)/);
  const fieldMatch = payload.match(new RegExp(`${field}:([A-Za-z_$][\\w$]*|-?\\d+)`));
  const invocationStart = payload.indexOf('}(', payload.indexOf('return '));
  const invocationEnd = payload.lastIndexOf('));');

  if (!parameterMatch || !fieldMatch || invocationStart === -1 || invocationEnd === -1) {
    throw new Error(`Forum ${field} field is unavailable`);
  }

  const parameterNames = parameterMatch[1].split(',');
  const values = splitArguments(payload.slice(invocationStart + 2, invocationEnd)).map(decodePrimitive);
  const value = fieldMatch[1];
  if (/^-?\d+$/.test(value)) return Number(value);

  const position = parameterNames.indexOf(value);
  return asNumber(position === -1 ? null : values[position]);
}

function parseVisibleForumMetric(html, className) {
  const match = html.match(new RegExp(
    `<div class="${className}"[^>]*>[\\s\\S]*?<div class="articleInfo__number"[^>]*>\\s*(\\d+)\\s*<`,
  ));
  return asNumber(match?.[1]);
}

function parseForumIndex(html) {
  return {
    sourceUrl: FORUM_INDEX_URL,
    articleId: 54254,
    citations: resolveNuxtValue(html, 'timesCited'),
    references: resolveNuxtValue(html, 'timesCiting'),
    views: parseVisibleForumMetric(html, 'articleInfo__views'),
    approvals: parseVisibleForumMetric(html, 'articleInfo__approvals'),
    comments: parseVisibleForumMetric(html, 'articleInfo__comments'),
    observedAt: new Date().toISOString(),
  };
}

function parseForumProject(html, articleId) {
  return {
    sourceUrl: forumUrlFor(articleId),
    articleId,
    citations: resolveNuxtValue(html, 'timesCited'),
    observedAt: new Date().toISOString(),
  };
}

function hasDataChanged(previous, next) {
  const normalized = structuredClone(next);
  delete normalized.generatedAt;
  delete normalized.errors;
  normalized.forum?.archive && delete normalized.forum.archive.observedAt;
  Object.values(normalized.forum?.projects ?? {}).forEach((project) => delete project.observedAt);

  const previousNormalized = structuredClone(previous);
  delete previousNormalized.generatedAt;
  delete previousNormalized.errors;
  previousNormalized.forum?.archive && delete previousNormalized.forum.archive.observedAt;
  Object.values(previousNormalized.forum?.projects ?? {}).forEach((project) => delete project.observedAt);

  return JSON.stringify(previousNormalized) !== JSON.stringify(normalized);
}

async function readExistingMetrics() {
  try {
    return JSON.parse(await readFile(METRICS_PATH, 'utf8'));
  } catch {
    return { version: 1, github: { repositories: {} }, forum: { archive: {}, projects: {} }, errors: [] };
  }
}

const existing = await readExistingMetrics();
const next = structuredClone(existing);
next.version = 1;
next.github ??= { repositories: {} };
next.github.repositories ??= {};
next.forum ??= { archive: {}, projects: {} };
next.forum.projects ??= {};
const errors = [];

for (const repository of [...new Set(PROJECTS.map(({ repository }) => repository).filter(Boolean))]) {
  try {
    const data = await fetchJson(`https://api.github.com/repos/${GITHUB_OWNER}/${repository}`, githubHeaders);
    next.github.repositories[repository] = {
      stars: data.stargazers_count,
      forks: data.forks_count,
      archived: data.archived,
      updatedAt: data.updated_at,
      sourceUrl: data.html_url,
    };
  } catch (error) {
    errors.push(`GitHub ${repository}: ${error.message}`);
  }
}

try {
  next.forum.archive = parseForumIndex(await fetchText(FORUM_INDEX_URL));
} catch (error) {
  errors.push(`Forum index: ${error.message}`);
}

for (const { articleId } of PROJECTS) {
  try {
    next.forum.projects[articleId] = parseForumProject(await fetchText(forumUrlFor(articleId)), articleId);
  } catch (error) {
    errors.push(`Forum ${articleId}: ${error.message}`);
  }
}

next.github.totalTrackedStars = Object.values(next.github.repositories)
  .map((repository) => asNumber(repository.stars) ?? 0)
  .reduce((total, stars) => total + stars, 0);
next.errors = errors;

if (hasDataChanged(existing, next)) {
  next.generatedAt = new Date().toISOString();
  await writeFile(METRICS_PATH, `${JSON.stringify(next, null, 2)}\n`);
  console.log(`Metrics changed: refreshed ${new Set(PROJECTS.map(({ repository }) => repository).filter(Boolean)).size} GitHub repositories and ${PROJECTS.length} forum records.`);
} else {
  console.log('Metrics are unchanged; keeping the existing generated data timestamp.');
}

if (errors.length) {
  console.warn(`Metric refresh completed with ${errors.length} warning(s):\n${errors.join('\n')}`);
}
