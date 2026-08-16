/**
 * Central configuration loader.
 *
 * Loading order (highest priority first):
 *   1. Environment variables  (GitHub Actions secrets / local .env)
 *   2. config/settings.json   (optional, gitignored)
 *   3. Built-in defaults
 *
 * All file paths are resolved relative to this repository, so the project
 * works from any machine / CI runner without hardcoded absolute paths.
 */

const fs = require('fs');
const path = require('path');

// Load local .env when present (does nothing in CI, where real env vars exist).
require('dotenv').config();

const ROOT_DIR = path.join(__dirname, '..');

const DAY_MAP = {
  sunday: 0,
  monday: 1,
  tuesday: 2,
  wednesday: 3,
  thursday: 4,
  friday: 5,
  saturday: 6,
};

const DEFAULTS = {
  timezone: 'UTC',
  scheduleDays: ['monday', 'wednesday'],
  topics: {
    monday: 'Your Monday Topic',
    wednesday: 'Your Wednesday Topic',
  },
  requiredHashtags: ['#LearningInPublic'],
  postMinWords: 50,
  postMaxWords: 250,
  maxEmojis: 5,
  maxHashtags: 10,
  maxRewriteAttempts: 3,
  similarityThreshold: 0.7,
};

/** Read a JSON file safely; returns null on any error. */
function readJsonSafe(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

/** Read a text file safely; returns trimmed content or null. */
function readTextSafe(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf8').trim();
    return content.length > 0 ? content : null;
  } catch {
    return null;
  }
}

function loadSettings() {
  const file = readJsonSafe(path.join(ROOT_DIR, 'config', 'settings.json')) || {};

  const topics = {
    monday: process.env.MONDAY_TOPIC || file.topics?.monday || DEFAULTS.topics.monday,
    wednesday: process.env.WEDNESDAY_TOPIC || file.topics?.wednesday || DEFAULTS.topics.wednesday,
  };

  const scheduleDays = (
    process.env.SCHEDULE_DAYS ||
    (Array.isArray(file.scheduleDays) ? file.scheduleDays.join(',') : null) ||
    DEFAULTS.scheduleDays.join(',')
  )
    .split(',')
    .map((day) => day.trim().toLowerCase())
    .filter((day) => day in DAY_MAP);

  const requiredHashtags = process.env.REQUIRED_HASHTAGS
    ? process.env.REQUIRED_HASHTAGS.split(',').map((h) => h.trim()).filter(Boolean)
    : file.requiredHashtags || DEFAULTS.requiredHashtags;

  return {
    timezone: process.env.POST_TIMEZONE || file.timezone || DEFAULTS.timezone,
    scheduleDays: scheduleDays.length > 0 ? scheduleDays : DEFAULTS.scheduleDays,
    topics,
    requiredHashtags,
    postMinWords: Number(file.postMinWords ?? DEFAULTS.postMinWords),
    postMaxWords: Number(file.postMaxWords ?? DEFAULTS.postMaxWords),
    maxEmojis: Number(file.maxEmojis ?? DEFAULTS.maxEmojis),
    maxHashtags: Number(file.maxHashtags ?? DEFAULTS.maxHashtags),
    maxRewriteAttempts: Number(file.maxRewriteAttempts ?? DEFAULTS.maxRewriteAttempts),
    similarityThreshold: Number(file.similarityThreshold ?? DEFAULTS.similarityThreshold),
  };
}

/** The person the posts are written as. From config/identity.txt or a generic default. */
function loadIdentity() {
  return (
    readTextSafe(path.join(ROOT_DIR, 'config', 'identity.txt')) ||
    'A developer who shares what they are currently learning, one honest update at a time.'
  );
}

module.exports = {
  ROOT_DIR,
  DAY_MAP,
  DEFAULTS,
  loadSettings,
  loadIdentity,
  readJsonSafe,
  readTextSafe,
  file: {
    notes: path.join(ROOT_DIR, 'config', 'today_notes.txt'),
    syllabus: path.join(ROOT_DIR, 'config', 'syllabus.txt'),
    rules: path.join(ROOT_DIR, 'config', 'rules.txt'),
    archiveDir: path.join(ROOT_DIR, 'archive'),
    logFile: path.join(ROOT_DIR, 'post-automation.log'),
  },
};
