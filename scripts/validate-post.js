/**
 * Self-review / validation for generated posts.
 *
 * Returns an array of issue strings. An empty array means the post passed.
 * The orchestrator rewrites the post (up to maxRewriteAttempts) when issues
 * are found, and refuses to publish if it still fails.
 */

/** Word count (whitespace-separated tokens). */
function wordCount(text) {
  return text.split(/\s+/).filter(Boolean).length;
}

/** Emoji count using Extended_Pictographic to avoid false positives on digits/punctuation. */
function emojiCount(text) {
  return (text.match(/\p{Extended_Pictographic}/gu) || []).length;
}

/** Hashtag count (#word). */
function hashtagCount(text) {
  return (text.match(/#[A-Za-z0-9]+/g) || []).length;
}

/** Jaccard similarity between two texts (0–1) on normalized word sets. */
function textSimilarity(a, b) {
  const words = (text) =>
    new Set(
      text
        .toLowerCase()
        .replace(/#[a-z0-9]+/g, ' ') // ignore hashtags
        .match(/[a-z0-9']+/g) || []
    );
  const setA = words(a);
  const setB = words(b);
  if (setA.size === 0 || setB.size === 0) return 0;
  let intersection = 0;
  for (const word of setA) if (setB.has(word)) intersection += 1;
  const union = setA.size + setB.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

/** Phrases that read like generic AI hype — flagged for removal. */
const HYPE_PATTERNS = [
  /in the (rapidly|ever[-\s]?)evolving world/i,
  /let['']?s dive (into|deep)/i,
  /game[-\s]?changing/i,
  /revolutionary/i,
  /cutting[-\s]?edge/i,
];

/**
 * Validate a post against quality rules.
 *
 * @param {string} post       Generated post text
 * @param {object} settings   Loaded settings (limits, requiredHashtags, similarityThreshold)
 * @param {Array}  archives   Recent archived posts [{file, content}]
 * @returns {string[]}        Issues; empty when valid
 */
function validatePost(post, settings, archives = []) {
  const issues = [];
  const wc = wordCount(post);
  const ec = emojiCount(post);
  const hc = hashtagCount(post);

  if (wc < settings.postMinWords) {
    issues.push(`Word count ${wc} is below minimum ${settings.postMinWords}`);
  }
  if (wc > settings.postMaxWords) {
    issues.push(`Word count ${wc} exceeds maximum ${settings.postMaxWords}`);
  }
  if (ec > settings.maxEmojis) {
    issues.push(`Emoji count ${ec} exceeds maximum ${settings.maxEmojis}`);
  }
  if (hc > settings.maxHashtags) {
    issues.push(`Hashtag count ${hc} exceeds maximum ${settings.maxHashtags}`);
  }

  for (const tag of settings.requiredHashtags || []) {
    if (tag && !post.includes(tag)) issues.push(`Missing required hashtag ${tag}`);
  }

  // No markdown (hashtags start with #, so only flag # used as a heading).
  for (const line of post.split('\n')) {
    if (/^#{1,6}\s/.test(line)) {
      issues.push('Markdown heading detected (# at start of line)');
      break;
    }
  }
  if (post.includes('`')) issues.push('Backtick detected (no code blocks allowed)');
  if (/\*\*(.+?)\*\*/.test(post)) issues.push('Bold markdown ** detected');
  if (/__(.+?)__/.test(post)) issues.push('Bold markdown __ detected');

  // Hype language.
  for (const re of HYPE_PATTERNS) {
    const match = post.match(re);
    if (match) issues.push(`Hype language detected: "${match[0]}"`);
  }

  // Repetitive opening.
  if (/^Today I learned/i.test(post)) {
    issues.push('Post starts with "Today I learned" — vary your opening style');
  }

  // Duplicate-content prevention: too similar to a recent archived post.
  if (archives.length > 0) {
    for (const archive of archives) {
      const similarity = textSimilarity(post, archive.content);
      if (similarity >= settings.similarityThreshold) {
        issues.push(
          `Too similar to previous post "${archive.file}" (similarity ${similarity.toFixed(2)})`
        );
        break;
      }
    }
  }

  return issues;
}

module.exports = { validatePost, wordCount, emojiCount, hashtagCount, textSimilarity };
