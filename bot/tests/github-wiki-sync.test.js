'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { commitWikiHtmlToGitHub, WIKI_PATHS } = require('../services/githubWikiSync');

const HTML = '<!DOCTYPE html><html><body><div id="page-age117" class="page"><h2>Age 117 — Final Changes</h2></div></body></html>';

test('refuses to sync when the GitHub token is not configured', async () => {
  const result = await commitWikiHtmlToGitHub({ html: HTML, ageNumber: 117, token: '' });
  assert.deepEqual(result, { ok: false, error: 'github_token_missing' });
});

test('updates both downloadable HTML paths in one GitHub commit', async () => {
  const calls = [];
  const replies = [
    { object: { sha: 'head-sha' } },
    { tree: { sha: 'base-tree-sha' } },
    { sha: 'blob-sha' },
    { sha: 'tree-sha' },
    { sha: 'new-commit-sha' },
    { ref: 'refs/heads/main', object: { sha: 'new-commit-sha' } }
  ];
  const fetchImpl = async (url, options = {}) => {
    calls.push({ url, options });
    const payload = replies.shift();
    return { ok: true, status: 200, json: async () => payload };
  };
  const result = await commitWikiHtmlToGitHub({
    html: HTML, ageNumber: 117, token: 'test-token', fetchImpl
  });
  assert.equal(result.ok, true);
  assert.equal(result.commit_sha, 'new-commit-sha');
  assert.deepEqual(result.files, WIKI_PATHS);
  assert.equal(calls.length, 6);
  const treeBody = JSON.parse(calls[3].options.body);
  assert.deepEqual(treeBody.tree.map(item => item.path), WIKI_PATHS);
  assert.equal(treeBody.tree[0].sha, treeBody.tree[1].sha);
  assert.equal(JSON.parse(calls[4].options.body).parents[0], 'head-sha');
  assert.equal(JSON.parse(calls[5].options.body).force, false);
});

test('rejects HTML that does not contain the approved age page', async () => {
  const result = await commitWikiHtmlToGitHub({
    html: '<html><body><h1>Age 116</h1></body></html>',
    ageNumber: 117,
    token: 'test-token',
    fetchImpl: async () => { throw new Error('must not call GitHub'); }
  });
  assert.deepEqual(result, { ok: false, error: 'wiki_html_validation_failed' });
});

test('reports permission failures without exposing response details', async () => {
  const result = await commitWikiHtmlToGitHub({
    html: HTML, ageNumber: 117, token: 'test-token',
    fetchImpl: async () => ({ ok: false, status: 403, json: async () => ({ message: 'private detail' }) })
  });
  assert.deepEqual(result, { ok: false, error: 'github_permission_denied' });
});
