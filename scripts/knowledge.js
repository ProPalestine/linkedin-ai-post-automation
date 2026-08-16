/**
 * Knowledge sources for post generation.
 *
 * Priority order (used by the orchestrator):
 *   1. config/today_notes.txt  — today's specific knowledge
 *   2. config/syllabus.txt     — broader subject/topic context
 *   3. archive/*.md            — previous posts (avoid repetition)
 *   4. config/rules.txt        — writing style & quality rules
 *
 * Every source is optional: a missing or empty file returns null / [],
 * and the generator falls back to general knowledge.
 */

const fs = require('fs');
const path = require('path');
const { file } = require('./config');

function readNotesFile() {
  if (!fs.existsSync(file.notes)) return null;
  const content = fs.readFileSync(file.notes, 'utf8').trim();
  return content.length > 0 ? content : null;
}

function readSyllabus() {
  if (!fs.existsSync(file.syllabus)) return null;
  return fs.readFileSync(file.syllabus, 'utf8').trim();
}

function readPostingRules() {
  if (!fs.existsSync(file.rules)) return null;
  return fs.readFileSync(file.rules, 'utf8').trim();
}

/** Read up to `limit` most recent archived posts (newest first). */
function readArchivedPosts(limit = 10) {
  if (!fs.existsSync(file.archiveDir)) return [];
  return fs
    .readdirSync(file.archiveDir)
    .filter((f) => f.endsWith('.md') || f.endsWith('.txt'))
    .sort()
    .reverse()
    .slice(0, limit)
    .map((f) => ({ file: f, content: fs.readFileSync(path.join(file.archiveDir, f), 'utf8') }));
}

/** Extract the "Topic:" line from archived post front-matter, if present. */
function extractTopicsFromArchive(archives) {
  const topics = [];
  for (const a of archives) {
    const match = a.content.match(/Topic:\s*(.+)/i);
    if (match) topics.push(match[1].trim());
  }
  return topics;
}

module.exports = {
  readNotesFile,
  readSyllabus,
  readPostingRules,
  readArchivedPosts,
  extractTopicsFromArchive,
};
