---
name: spartan-approval-review
description: Review Jeeves proposals for Spartan before any build, code change, or deployment. Use at the start of every Spartan work session and whenever a Jeeves proposal is mentioned.
---

# Spartan Approval Review

## Non-negotiable rule

**Nothing gets built, modified, merged, or deployed from a Jeeves proposal until ChatGPT has reviewed the exact proposal and explicitly approved it.** A proposal is not approval. Tests passing is not approval. Jeeves cannot approve its own work. Silence or ChatGPT being offline means the proposal stays pending.

This skill is a review procedure; it is not itself a technical enforcement gate. Never claim that Jeeves is blocked until repository/runtime enforcement has been implemented and tested.

## At the start of every Spartan work session

1. Connect to the current Spartan GitHub repository and inspect open pull requests and issues for pending Jeeves proposals. Look for the `[JEEVES PROPOSAL]` title prefix and/or `jeeves-proposal` label. If no proposals are discoverable, report that rather than assuming there are none.
2. Check the current `main` commit and the latest Render production deployment before proposing or applying any change.
3. Read the proposal, complete changed-file list, and exact diff. Never approve a vague summary alone.
4. Identify which working systems are affected, including (where relevant) Intel capture/ingestion/projection, the Backlog Steward, Discord commands, province/account identity, Supabase/RLS, age rules/reset, builds/science calculators, and wiki sync.
5. Compare the proposal with current production behavior and existing implementation. Preserve working behavior; do not redesign or replace working parts unnecessarily.

## Required proposal contents

A proposal must state:
- Problem and evidence/reproduction steps.
- Intended behavior and acceptance criteria.
- Exact files, database objects, services, and workflows to change.
- Complete diff or an isolated draft pull request.
- Tests run and results, including relevant regression tests.
- Data migration/backfill impact, if any.
- Security and permission impact.
- Rollback plan and how production health will be verified.
- Whether the proposal changes existing working behavior or only adds an isolated capability.

If these are missing, return the proposal for details; do not approve or build it.

## Review decision

Give each proposal one of these decisions:

- **APPROVE** — the exact reviewed diff is sufficiently scoped, justified, tested, and safe to implement.
- **CHANGES REQUIRED** — explain the specific revisions needed; no implementation yet.
- **REJECT** — explain the risk or why the change is unnecessary; do not implement.
- **PENDING** — evidence or access is missing.

Treat changes to existing working systems, data deletion, schema/RLS/auth changes, Intel source/capture behavior, bot commands, age reset/rules, account linkage, and production deployment as high-risk. Require focused regression evidence and a rollback plan. Never authorize destructive cleanup or historical Intel deletion unless the user separately gives explicit, informed permission.

## After approval

1. Bind approval to the exact PR head commit/diff and listed files. Any changed diff or expanded scope requires another review.
2. Apply only the approved proposal. Do not bundle unrelated fixes or opportunistic refactors.
3. Run the relevant tests and review the final diff.
4. Deploy through **Render only** after the required approval and tests. Do not use Vercel.
5. Verify the Render deploy status and relevant logs/health behavior. Report the commit, deployment result, tests, remaining risks, and any rollback taken.
6. If tests fail, the diff changes unexpectedly, or production behavior is uncertain, stop and report; do not push ahead.

## When ChatGPT is offline

Jeeves may collect evidence and prepare a proposal, but must not build, modify, merge, or deploy it. Keep the proposal pending. Do not treat a local instruction file or a prompt as a technical security boundary: before relying on this rule, verify that the agent's write tools, GitHub merge path, database mutation path, and Render deployment path are actually gated.

## Session report format

For each session, report:
- Current GitHub `main` commit and Render production deployment.
- Pending proposals found (or state that the search could not be completed).
- For each proposal: decision, evidence reviewed, impacted systems, missing checks, and next action.
- Any changes actually made, tests run, and deployment verification.
