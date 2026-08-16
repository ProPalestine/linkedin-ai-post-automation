/**
 * Post generation via the Gemini API.
 *
 * The system prompt is deliberately generic. The only personal element is
 * config/identity.txt (optional) which users fill in with their own words.
 * Randomization (length, opening, layout, tone) keeps posts from all looking
 * the same; this is honest "varied post generation", not "undetectable AI".
 */

const axios = require('axios');
const { loadIdentity } = require('./config');
const { extractTopicsFromArchive } = require('./knowledge');

const GEMINI_MODEL = 'gemini-2.5-flash';
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;
const MAX_RETRIES = 3;

/** Random length tier for variety. */
function pickPostLength() {
  const tiers = [
    { label: 'SHORT', min: 50, max: 80 },
    { label: 'MEDIUM-SHORT', min: 80, max: 110 },
    { label: 'MEDIUM', min: 110, max: 150 },
    { label: 'MEDIUM-LONG', min: 150, max: 200 },
    { label: 'LONG', min: 200, max: 250 },
  ];
  return tiers[Math.floor(Math.random() * tiers.length)];
}

function pickOpeningStyle() {
  const styles = [
    'question',
    'surprising-fact',
    'mid-story',
    'bold-statement',
    'mistake-or-confusion',
    'comparison',
    'before-vs-now',
  ];
  return styles[Math.floor(Math.random() * styles.length)];
}

function pickParagraphLayout() {
  const layouts = [
    '2-short-paragraphs',
    '1-big-block',
    'bullets-mixed',
    'long-then-short',
    '3-short-paragraphs',
    'single-flowing',
  ];
  return layouts[Math.floor(Math.random() * layouts.length)];
}

function pickTone() {
  const tones = [
    'casual-conversational',
    'reflective-thoughtful',
    'excited-energized',
    'calm-factual',
  ];
  return tones[Math.floor(Math.random() * tones.length)];
}

/**
 * Build the system prompt for a given schedule day.
 *
 * @param {object} dayInfo    { topic, label } from determineDayTopic()
 * @param {object} settings   Loaded settings (topics, requiredHashtags, limits)
 * @param {string|null} notes      today_notes.txt content
 * @param {string|null} syllabus   syllabus.txt content
 * @param {Array} archives        recent archived posts
 * @param {string|null} rules     rules.txt content
 */
function buildSystemPrompt(dayInfo, settings, notes, syllabus, archives, rulesContent) {
  const todayDate = new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: settings.timezone,
  });

  const lengthTier = pickPostLength();
  const openingStyle = pickOpeningStyle();
  const paragraphLayout = pickParagraphLayout();
  const tone = pickTone();
  const identity = loadIdentity();

  const archiveTopics = extractTopicsFromArchive(archives);
  const archiveBlock =
    archiveTopics.length > 0
      ? `\nAlready covered topics (DO NOT repeat): ${archiveTopics.join(', ')}`
      : '\nNo previous posts found.';

  const recentPostsBlock =
    archives.length > 0
      ? `\n\nRecent posts for reference (DO NOT copy their structure or opening pattern):\n${archives
          .slice(0, 3)
          .map((a) => `--- ${a.file} ---\n${a.content.substring(0, 300)}...`)
          .join('\n\n')}`
      : '';

  let sourceBlock;
  if (notes) {
    sourceBlock = `\n## TODAY'S NOTES (Primary Source)\n${notes}`;
  } else if (syllabus) {
    sourceBlock = `\n## SYLLABUS (Use to determine the next topic)\n${syllabus}`;
  } else {
    sourceBlock = '\n## No specific notes or syllabus available. Use general knowledge.';
  }

  const hashtagList = (settings.requiredHashtags || []).join(' ');

  return `You are an autonomous LinkedIn Post Generator. Your job is to generate ONE LinkedIn post that sounds like a REAL PERSON wrote it — not an AI.

## YOUR IDENTITY
${identity}

## TODAY
- Date: ${todayDate}
- Topic: ${dayInfo.topic}
- This is a ${dayInfo.label} post

## POST LENGTH (MUST FOLLOW)
- This post MUST be ${lengthTier.label}: ${lengthTier.min}-${lengthTier.max} words
- Match the length to the topic — simple ideas = short, complex ideas = long
- Do NOT pad with filler to hit a word count — write naturally

## OPENING STYLE (MUST FOLLOW)
- Start with a: ${openingStyle.replace(/-/g, ' ')}
- Do NOT start with "Today I learned..." — use a different approach this time
- Vary your opening from the archived posts shown below

## PARAGRAPH LAYOUT (MUST FOLLOW)
- Use this layout: ${paragraphLayout.replace(/-/g, ' ')}
- Do NOT use the same 4-paragraph structure every time

## TONE (MUST FOLLOW)
- Write in a ${tone.replace(/-/g, ' ')} tone
- Use casual phrasing: "honestly", "turns out", "so apparently", "kind of wild"

## KNOWLEDGE SOURCES${sourceBlock}${archiveBlock}${recentPostsBlock}

## RULES${rulesContent ? '\n' + rulesContent : ''}

## TRUTH POLICY
- NEVER lie, exaggerate, or invent projects/experiences
- NEVER write "I built..." or "I implemented..." unless notes explicitly confirm it
- If uncertain about a fact, leave it out
- Use honest language: "Today I learned...", "I'm exploring...", "I'm currently studying..."

## POST STYLE — BE HUMAN
- Write like a real developer typing a casual update, not a blog post
- Natural, professional, friendly, educational
- First-person perspective
- Specific and concrete — no vague statements
- No marketing language, no hype words ("game-changing", "revolutionary", "cutting-edge", "let's dive into")
- No generic inspirational quotes
- Maximum ONE question per post (optional — not every post needs one)
- Do NOT use perfect paragraph structure every time
- Sometimes a sentence stands alone. Sometimes it flows into the next.

## FORMAT (Strict)
- Plain LinkedIn text ONLY
- NO Markdown: no *, **, __, #, \`, >
- Use paragraphs and line breaks for readability
- ${settings.maxEmojis} emojis maximum, placed naturally (not on every line)

## HASHTAGS
- ALWAYS include: ${hashtagList}
- Add up to ${settings.maxHashtags} total hashtags
- Put hashtags at the very end of the post

## OUTPUT
Output ONLY the final LinkedIn-ready post. No explanations. No reasoning. No extra text.
No markdown. No formatting. Just the post.`;
}

/**
 * Call Gemini with retry/backoff.
 * @param {string} prompt   System prompt
 * @param {string} apiKey   GEMINI_API_KEY
 */
async function callGemini(prompt, apiKey, retries = MAX_RETRIES) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const response = await axios.post(
        GEMINI_URL,
        {
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.7, maxOutputTokens: 8192, topP: 0.95, topK: 40 },
        },
        {
          // Key in a header (not the URL) so it never lands in logs.
          headers: { 'x-goog-api-key': apiKey, 'Content-Type': 'application/json' },
          timeout: 60000,
        }
      );
      const text = response.data?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!text) throw new Error('Empty response from Gemini');
      return text.trim();
    } catch (err) {
      const detail = err.response?.data?.error?.message || err.message;
      if (attempt < retries) {
        const wait = attempt * 5000;
        console.log(`Gemini attempt ${attempt}/${retries} failed: ${detail}. Retrying in ${wait / 1000}s...`);
        await new Promise((r) => setTimeout(r, wait));
      } else {
        throw new Error(`Gemini API failed after ${retries} attempts: ${detail}`);
      }
    }
  }
}

module.exports = { buildSystemPrompt, callGemini, pickPostLength };
