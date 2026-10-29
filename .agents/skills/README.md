# Project skills

This directory is the shared source for Codex and Claude Code skills in this
repository. `.claude/skills` points here through a relative symlink. Keep the
skill files and the symlink in Git so a fresh checkout has the same skills.
No installation in a user's home directory is required.

Both agents discover skill names and descriptions automatically and load the
full instructions when a task matches or the user invokes a skill. If a skill
does not appear after a change, start a new agent session. See the
[Codex documentation](https://developers.openai.com/codex/skills/) and
[Claude Code documentation](https://code.claude.com/docs/en/skills).

## Included skills

- `write-article` is maintained in this repository. Its `scripts/` directory
  contains the site's SVG helpers and diagram screenshot tool.
- `diagram-design` is copied from `skills/diagram-design/` in
  [cathrynlavery/diagram-design](https://github.com/cathrynlavery/diagram-design/tree/0cf73c3fcc56667ad91a9a04c439ac6ccfabc9d1/skills/diagram-design),
  commit `0cf73c3fcc56667ad91a9a04c439ac6ccfabc9d1` (skill version 2.6).
  The complete skill directory is included, plus the repository's MIT license.
- `humanizer` is copied from
  [blader/humanizer](https://github.com/blader/humanizer/tree/0ef9fe5bc3572734fd3ae6c448fe00a30cd5dcf0),
  commit `0ef9fe5bc3572734fd3ae6c448fe00a30cd5dcf0` (skill version 3.1.0).
  The installed files are `SKILL.md`, `agents/openai.yaml`, and `LICENSE`.
  Marketplace manifests and repository maintenance files are omitted.

The third-party skill files are kept unchanged. Follow WRITING.md for site
content, prose, and diagram output when upstream defaults differ.

## Update an upstream skill

1. Choose and review a commit in the source repository linked above.
2. Replace `diagram-design/` with that commit's complete
   `skills/diagram-design/` directory and copy its root `LICENSE` into it.
   For `humanizer/`, replace the three installed files listed above.
3. Update the source commit and skill version in this file.
4. Check that each skill's local references resolve through both
   `.agents/skills/` and `.claude/skills/`, then run `bun run build`.

Updates are reviewed repository changes. These skills do not use Claude Code
marketplace auto-updates. Do not also enable their Claude Code plugins in the
project: that would load another copy of each skill.
