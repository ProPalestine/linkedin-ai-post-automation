/**
 * Unit tests for scripts/validate-post.js
 * Run with: npm test
 */

const { test } = require('node:test');
const assert = require('node:assert');
const {
  validatePost,
  wordCount,
  emojiCount,
  hashtagCount,
  textSimilarity,
} = require('../scripts/validate-post');

const SETTINGS = {
  postMinWords: 50,
  postMaxWords: 250,
  maxEmojis: 5,
  maxHashtags: 10,
  requiredHashtags: ['#LearningInPublic'],
  similarityThreshold: 0.7,
};

function makeValidPost() {
  return (
    'This week I finally understood why tool calling matters for AI agents. ' +
    'The model does not just answer a question; it decides which tool to invoke and what to pass in. ' +
    'That shift from text-only answers to taking real actions changes what we can build. ' +
    'I am exploring this by building a small agent that checks the weather, sums a list, and reports back. ' +
    'The honest part is that making it reliable is much harder than making it work once. ' +
    'Still, this one concept alone changed how I think about APIs. ' +
    '#LearningInPublic'
  );
}

test('valid post passes with no issues', () => {
  assert.deepStrictEqual(validatePost(makeValidPost(), SETTINGS), []);
});

test('word count helpers', () => {
  assert.strictEqual(wordCount('one two three'), 3);
  assert.strictEqual(wordCount(''), 0);
});

test('emoji count helper', () => {
  assert.strictEqual(emojiCount('no emojis here'), 0);
  assert.strictEqual(emojiCount('😀 👍 🎉 🚀 💡'), 5);
});

test('hashtag count helper', () => {
  assert.strictEqual(hashtagCount('#A #B plain'), 2);
  assert.strictEqual(hashtagCount('none'), 0);
});

test('word count below minimum is flagged', () => {
  const post = '#LearningInPublic'; // 1 word
  const issues = validatePost(post, SETTINGS);
  assert.ok(issues.some((i) => i.includes('below minimum')));
});

test('word count above maximum is flagged', () => {
  const words = Array.from({ length: 300 }, (_, i) => `word${i}`).join(' ');
  const issues = validatePost(words, SETTINGS);
  assert.ok(issues.some((i) => i.includes('exceeds maximum')));
});

test('too many emojis are flagged', () => {
  const post = '😀 👍 🎉 🚀 💡 ✨ ⚡ ' + '#LearningInPublic';
  const issues = validatePost(post, SETTINGS);
  assert.ok(issues.some((i) => i.includes('Emoji count')));
});

test('too many hashtags are flagged', () => {
  const hashtags = Array.from({ length: 12 }, (_, i) => `#Tag${i}`).join(' ');
  const issues = validatePost(makeValidPost() + ' ' + hashtags, SETTINGS);
  assert.ok(issues.some((i) => i.includes('hashtag count') || i.includes('Hashtag count')));
});

test('missing required hashtag is flagged', () => {
  const post = 'This is a perfectly normal post that is long enough to pass other checks for sure.';
  const issues = validatePost(post, SETTINGS);
  assert.ok(issues.some((i) => i.includes('Missing required hashtag #LearningInPublic')));
});

test('markdown bold and headings are flagged', () => {
  const bold = validatePost('This is **bold** text ' + '#LearningInPublic', SETTINGS);
  assert.ok(bold.some((i) => i.includes('Bold markdown')));

  const heading = validatePost('# Heading\nplain text ' + '#LearningInPublic', SETTINGS);
  assert.ok(heading.some((i) => i.includes('Markdown heading')));
});

test('hype language is flagged', () => {
  const post = 'This is a revolutionary way to work in the rapidly evolving world of tech ' + '#LearningInPublic';
  const issues = validatePost(post, SETTINGS);
  assert.ok(issues.some((i) => i.includes('Hype language')));
});

test('repetitive opening is flagged', () => {
  const post = 'Today I learned about agents and how they work with tools and APIs. ' + '#LearningInPublic';
  const issues = validatePost(post, SETTINGS);
  assert.ok(issues.some((i) => i.includes('Today I learned')));
});

test('too similar to an archived post is flagged', () => {
  const post = makeValidPost();
  const archives = [{ file: '2026-01-01-example.md', content: post }];
  const issues = validatePost(post, SETTINGS, archives);
  assert.ok(issues.some((i) => i.includes('Too similar')));
});

test('text similarity returns 0 for unrelated texts', () => {
  assert.strictEqual(textSimilarity('apple banana cherry', 'x y z'), 0);
});

test('text similarity returns 1 for identical texts', () => {
  assert.strictEqual(textSimilarity('same words here', 'same words here'), 1);
});

test('empty archive list never triggers similarity issues', () => {
  assert.deepStrictEqual(validatePost(makeValidPost(), SETTINGS, []), []);
});
