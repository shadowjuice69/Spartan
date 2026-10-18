'use strict';

const DEFAULT_REPOSITORY = 'shadowjuice69/Spartan';
const DEFAULT_BRANCH = 'main';
const WIKI_PATHS = ['utopia-wiki.html', 'lib/spartan/knowledge/utopia-reference.html'];

async function commitWikiHtmlToGitHub({
  html,
  ageNumber,
  token = process.env.SPARTAN_GITHUB_TOKEN || process.env.GITHUB_TOKEN,
  repository = process.env.SPARTAN_GITHUB_REPOSITORY || DEFAULT_REPOSITORY,
  branch = process.env.SPARTAN_GITHUB_BRANCH || DEFAULT_BRANCH,
  fetchImpl = globalThis.fetch
} = {}) {
  if (!token) return { ok: false, error: 'github_token_missing' };
  const age = Number(ageNumber);
  const content = String(html || '');
  if (!Number.isInteger(age) || age <= 0 ||
      !/<html[\s>]/i.test(content) ||
      !new RegExp('id="page-age' + age + '"').test(content) ||
      !new RegExp('Age\\s+' + age + '\\s+—\\s+Final Changes').test(content) ||
      !/<\/html>\s*$/i.test(content)) {
    return { ok: false, error: 'wiki_html_validation_failed' };
  }
  if (typeof fetchImpl !== 'function') return { ok: false, error: 'fetch_unavailable' };

  const api = 'https://api.github.com/repos/' + repository;
  const headers = {
    Accept: 'application/vnd.github+json',
    Authorization: 'Bearer ' + token,
    'X-GitHub-Api-Version': '2022-11-28',
    'Content-Type': 'application/json'
  };
  async function request(url, method = 'GET', body) {
    const response = await fetchImpl(url, {
      method,
      headers,
      ...(body === undefined ? {} : { body: JSON.stringify(body) })
    });
    let data = {};
    try { data = await response.json(); } catch {}
    if (!response.ok) {
      const error = new Error('github_http_' + response.status);
      error.status = response.status;
      throw error;
    }
    return data;
  }

  try {
    const ref = await request(api + '/git/ref/heads/' + encodeURIComponent(branch));
    const parentSha = ref?.object?.sha;
    if (!parentSha) return { ok: false, error: 'github_branch_not_found' };
    const parent = await request(api + '/git/commits/' + parentSha);
    const baseTreeSha = parent?.tree?.sha;
    if (!baseTreeSha) return { ok: false, error: 'github_base_tree_missing' };

    const blob = await request(api + '/git/blobs', 'POST', {
      content: Buffer.from(content, 'utf8').toString('base64'),
      encoding: 'base64'
    });
    if (!blob?.sha) return { ok: false, error: 'github_blob_create_failed' };

    const tree = await request(api + '/git/trees', 'POST', {
      base_tree: baseTreeSha,
      tree: WIKI_PATHS.map(path => ({
        path, mode: '100644', type: 'blob', sha: blob.sha
      }))
    });
    if (!tree?.sha) return { ok: false, error: 'github_tree_create_failed' };

    const commit = await request(api + '/git/commits', 'POST', {
      message: 'Sync approved Age ' + age + ' wiki HTML',
      tree: tree.sha,
      parents: [parentSha]
    });
    if (!commit?.sha) return { ok: false, error: 'github_commit_create_failed' };

    await request(api + '/git/refs/heads/' + encodeURIComponent(branch), 'PATCH', {
      sha: commit.sha,
      force: false
    });
    return { ok: true, age_number: age, commit_sha: commit.sha, files: WIKI_PATHS.slice() };
  } catch (error) {
    const status = Number(error?.status);
    const code = status === 401 || status === 403 ? 'github_permission_denied'
      : status === 404 ? 'github_repository_or_branch_not_found'
      : status === 409 || status === 422 ? 'github_branch_changed_retry_required'
      : status ? 'github_http_error'
      : 'github_request_failed';
    return { ok: false, error: code };
  }
}

module.exports = { commitWikiHtmlToGitHub, WIKI_PATHS };
