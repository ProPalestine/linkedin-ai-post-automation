# Security Policy

## Reporting a Vulnerability

If you discover a security issue in this project, **do not open a public issue**.

Please report it privately by opening a GitHub Security Advisory
(`Security` tab → `Report a vulnerability`) or by emailing the repository
maintainer. Include:

- A description of the issue and its impact
- Steps to reproduce (if possible)
- Any relevant configuration

You will receive a response as soon as possible.

## Secret Handling

This project intentionally contains **zero credentials in the repository**.
Every secret is supplied at runtime via environment variables / GitHub Secrets.

### What must NEVER be committed

- `.env` files (real values)
- `GEMINI_API_KEY`
- `LINKEDIN_ACCESS_TOKEN` (any LinkedIn OAuth token)
- `LINKEDIN_CLIENT_ID` / `LINKEDIN_CLIENT_SECRET`
- MCP credentials, token JSON files, cookies, session files
- Private config: `config/today_notes.txt`, `config/syllabus.txt`,
  `config/rules.txt`, `config/identity.txt`, `config/settings.json`
- Private archives (`archive/*.md`) and personal drafts
- SSH keys, certificates, or any other private key material

If you maintain a fork with private content, use a **private** repository for
that fork, or supply private files via GitHub Secrets (base64-encoded) as
described in the README.

### API keys

- Get a Gemini key from https://aistudio.google.com/app/apikey.
- Rotate it in GitHub Actions Secrets if it is ever exposed.
- Treat it like a password — never put it in code, logs, or issues.

### LinkedIn OAuth tokens

- Tokens are generated per-user with the script `npm run auth` (standard
  OAuth 2.0 Authorization Code flow).
- Member tokens are short-lived (~60 days). Regenerate them when LinkedIn
  starts returning `401 Unauthorized`.
- Anyone holding your token can post to your LinkedIn account. Revoke access
  at any time in your LinkedIn settings or by deleting the developer app.

### GitHub Actions secrets

- Store all credentials as repository **Secrets** (`Settings → Secrets and
  variables → Actions`), never in the workflow file.
- The workflow references them as `${{ secrets.NAME }}` only.

## What to do if a secret is accidentally committed

1. **Revoke/rotate the secret immediately.** For LinkedIn, reset the client
   secret in the developer app and generate a new access token.
2. **Assume the secret is compromised even after deletion.** Deleting a file
   from the latest commit is NOT sufficient — the secret may still exist in
   Git history and in the logs of any system that had access.
3. **Rewrite history** (e.g., `git filter-repo`) on the affected branch and
   force-push, or — for a small private project — delete the repository and
   create a fresh one with no history. This project is designed to be
   re-initialized cleanly.
4. If the secret was ever exposed on GitHub, GitHub's secret scanning may
   flag it; treat any notification as serious and rotate immediately.

## Reporting

For anything urgent, contact the maintainer via the security channels above.
