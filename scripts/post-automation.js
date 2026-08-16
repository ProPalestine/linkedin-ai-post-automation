#!/usr/bin/env node
/**
 * LINKEDIN AI POST AUTOMATION — orchestrator
 * ===========================================
 *
 * Modes:
 *   node scripts/post-automation.js scheduled    Full run (cron default; only runs on schedule days)
 *   node scripts/post-automation.js dry-run      Generate + validate + save draft, NEVER publishes
 *   node scripts/post-automation.js test-publish Generate + validate + publish + archive
 *
 * Pipeline: knowledge sources → Gemini generation → self-review → (rewrite up to
 * maxRewriteAttempts) → publish to LinkedIn → archive → clear today's notes.
 *
 * Fail-safe behavior:
 *   - Missing GEMINI_API_KEY  → clear error, no generation.
 *   - Missing LinkedIn token (publish modes) → clear error BEFORE generating.
 *   - Failed validation after rewrites → post is REJECTED, never published.
 *   - Publish failure → post is NOT marked published; today's notes are NOT cleared.
 */

const fs = require('fs');
const path = require('path');
const { ROOT_DIR, DAY_MAP, loadSettings, file } = require('./config');
const {
  readNotesFile,
  readSyllabus,
  readPostingRules,
  readArchivedPosts,
} = require('./knowledge');
const { buildSystemPrompt, callGemini } = require('./generate-post');
const { validatePost } = require('./validate-post');
const { publishToLinkedIn } = require('./linkedin');

const settings = loadSettings();

/** A known, user-actionable configuration problem (shown without a stack trace). */
class ConfigError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ConfigError';
  }
}

function log(msg) {
  const ts = new Date().toLocaleString('en-US', { timeZone: settings.timezone });
  const line = `[${ts}] ${msg}`;
  console.log(line);
  try {
    fs.appendFileSync(file.logFile, line + '\n');
  } catch {
    /* logging must never break the pipeline */
  }
}

/** Current time converted to the configured timezone. */
function nowInTimezone() {
  return new Date(new Date().toLocaleString('en-US', { timeZone: settings.timezone }));
}

/** Determine today's topic from the configured schedule. */
function determineDayTopic() {
  const dayNumber = nowInTimezone().getDay();
  for (const dayName of settings.scheduleDays) {
    if (DAY_MAP[dayName] === dayNumber) {
      return { topic: settings.topics[dayName], label: dayName };
    }
  }
  return null;
}

function assertGeminiKey() {
  if (!process.env.GEMINI_API_KEY) {
    throw new ConfigError(
      'GEMINI_API_KEY is required. Set it in your environment (CI secret) or in a local .env file (see .env.example).'
    );
  }
}

function assertLinkedInToken() {
  if (!process.env.LINKEDIN_ACCESS_TOKEN) {
    throw new ConfigError(
      'LINKEDIN_ACCESS_TOKEN is required for publishing. Generate one with `npm run auth`, then set it in your environment (CI secret) or .env (local).'
    );
  }
}

/** Archive a post (published, rejected, or failed) to archive/*.md. */
function archivePost(postContent, postId, dayInfo, status) {
  if (!fs.existsSync(file.archiveDir)) fs.mkdirSync(file.archiveDir, { recursive: true });
  const dateStr = nowInTimezone().toISOString().split('T')[0];
  const filename = `${dateStr}-${dayInfo.topic.toLowerCase().replace(/\s+/g, '-')}.md`;
  const content = `---
Date: ${dateStr}
Day: ${dayInfo.label}
Topic: ${dayInfo.topic}
PostID: ${postId || 'draft'}
Status: ${status}
---
${postContent}
`;
  fs.writeFileSync(path.join(file.archiveDir, filename), content);
  log(`Archived to: ${filename}`);
}

function clearNotesFile() {
  try {
    fs.writeFileSync(file.notes, '');
    log('today_notes.txt cleared after successful publish.');
  } catch (e) {
    log(`WARNING: could not clear notes file: ${e.message}`);
  }
}

async function main() {
  const mode = process.argv[2] || 'scheduled';
  const validModes = ['scheduled', 'dry-run', 'test-publish'];
  if (!validModes.includes(mode)) {
    console.error(`Invalid mode: ${mode}. Use: scheduled | dry-run | test-publish`);
    process.exit(1);
  }

  log(`════ LINKEDIN AI POST AUTOMATION — ${mode.toUpperCase()} ════`);

  // ── Step 1: Check schedule day (scheduled mode only) ──
  const dayInfo = determineDayTopic();
  if (mode === 'scheduled' && !dayInfo) {
    log(`Today is not a schedule day (${settings.scheduleDays.join(', ')}). No post needed. Exiting.`);
    process.exit(0);
  }
  if (mode === 'dry-run' || mode === 'test-publish') {
    // Dry-run / test-publish always generate, regardless of the day,
    // so users can test any time.
    log(`Mode ignores schedule day; using topic: ${dayInfo ? dayInfo.topic : 'default'}`);
  }
  const topicInfo = dayInfo || { topic: 'General topic', label: 'test' };

  assertGeminiKey();

  // ── Step 2: Load knowledge sources (all optional) ──
  log('Loading knowledge sources...');
  const notes = readNotesFile();
  const syllabus = readSyllabus();
  const archives = readArchivedPosts();
  const rulesContent = readPostingRules();
  log(
    `Knowledge: notes=${notes ? 'yes' : 'no'}, syllabus=${syllabus ? 'yes' : 'no'}, ` +
      `archives=${archives.length}, rules=${rulesContent ? 'yes' : 'no'}`
  );

  // ── Step 3: Generate ──
  log('Generating post with Gemini...');
  let postContent;
  try {
    const prompt = buildSystemPrompt(topicInfo, settings, notes, syllabus, archives, rulesContent);
    postContent = await callGemini(prompt, process.env.GEMINI_API_KEY);
  } catch (err) {
    log(`FAILED: ${err.message}`);
    archivePost(`[GENERATION FAILED] ${err.message}`, null, topicInfo, 'failed');
    process.exit(1);
  }

  // ── Step 4: Self-review with rewrite loop ──
  let issues = validatePost(postContent, settings, archives);
  let attempt = 0;
  while (issues.length > 0 && attempt < settings.maxRewriteAttempts) {
    attempt += 1;
    log(`Self-review failed (${issues.length} issue(s)): ${issues.join('; ')}`);
    log(`  Rewriting (${attempt}/${settings.maxRewriteAttempts})...`);

    const fixPrompt = `${buildSystemPrompt(topicInfo, settings, notes, syllabus, archives, rulesContent)}

## CRITICAL: YOUR PREVIOUS POST WAS REJECTED
The post you generated has these issues that MUST be fixed:
${issues.map((issue, i) => `${i + 1}. ${issue}`).join('\n')}

## REQUIREMENTS
- Fix EVERY issue listed above.
- Vary the structure — do not repeat the last attempt.
- Output ONLY the final LinkedIn-ready post. No explanations, no markdown.`;

    try {
      postContent = await callGemini(fixPrompt, process.env.GEMINI_API_KEY);
      issues = validatePost(postContent, settings, archives);
      log(`  Rewrite ${attempt} re-validated (${issues.length} remaining issue(s)).`);
    } catch (err) {
      log(`Rewrite failed: ${err.message}`);
      break;
    }
  }

  if (issues.length > 0) {
    // Strict: never publish a post that fails quality checks.
    log(`Post REJECTED after ${settings.maxRewriteAttempts} rewrite attempts. Issues: ${issues.join('; ')}`);
    archivePost(
      `[REJECTED - Quality Check Failed]\nIssues: ${issues.join('; ')}\n\n---\n\n${postContent}`,
      null,
      topicInfo,
      'rejected'
    );
    log('No post was published.');
    process.exit(1);
  }
  log('Self-review passed.');

  // ── Step 5: Dry-run — save draft, print, exit ──
  if (mode === 'dry-run') {
    const draftsDir = path.join(file.archiveDir, 'drafts');
    fs.mkdirSync(draftsDir, { recursive: true });
    const draftPath = path.join(draftsDir, `draft-${nowInTimezone().toISOString().split('T')[0]}.md`);
    fs.writeFileSync(draftPath, postContent);
    log(`Dry run: draft saved to ${draftPath}`);
    log('');
    log('=== POST CONTENT (not published) ===');
    console.log(postContent);
    log('=== END DRAFT ===');
    log('Dry run complete. Nothing was published, and today_notes.txt was NOT cleared.');
    process.exit(0);
  }

  // ── Step 6: Publish (test-publish / scheduled) ──
  assertLinkedInToken();
  log('Publishing to LinkedIn...');
  let postId;
  try {
    postId = await publishToLinkedIn(postContent, process.env.LINKEDIN_ACCESS_TOKEN);
    log(`POST PUBLISHED! ID: ${postId}`);
  } catch (err) {
    log(`FAILED: ${err.message}`);
    archivePost(`[PUBLISH FAILED] ${err.message}\n\n---\n\n${postContent}`, null, topicInfo, 'publish-failed');
    log('The post was NOT published successfully. today_notes.txt was NOT cleared.');
    process.exit(1);
  }

  // ── Step 7: Archive + clear notes only after success ──
  archivePost(postContent, postId, topicInfo, 'published');
  if (notes) clearNotesFile();

  log('');
  log('=== POST CONTENT (published) ===');
  console.log(postContent);
  log('=== END ===');
  log(`Automation complete. Post ID: ${postId}`);
  process.exit(0);
}

main().catch((err) => {
  if (err instanceof ConfigError) {
    console.error(`\n✗ ${err.message}\n`);
    process.exit(1);
  }
  log(`UNEXPECTED ERROR: ${err.message}`);
  if (err.stack) log(err.stack);
  process.exit(1);
});
