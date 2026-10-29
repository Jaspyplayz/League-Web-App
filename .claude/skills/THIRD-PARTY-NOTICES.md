# Third-party skills

Most skills in this folder come from other people's open-source repos. Jasper installed the first eight in the table on his computer with `npx skills add`, and they were copied here unchanged so that project threads in the Claude app, subagents such as the [reviewer](../agents/reviewer.md), and Claude Code on any computer can load them. Each of those eight folders still matches the `computedHash` recorded for it in the `skills-lock.json` on Jasper's computer, except that the Supabase skill's line endings were changed from Windows ones (CRLF) back to the LF its source repo uses, which makes it identical to the source file for file. `explain-back` is Turnpoint's own.

| Skill | Source | License |
|---|---|---|
| code-review-and-quality | [addyosmani/agent-skills](https://github.com/addyosmani/agent-skills) | MIT, Addy Osmani |
| debugging-and-error-recovery | addyosmani/agent-skills | MIT, Addy Osmani |
| documentation-and-adrs | addyosmani/agent-skills | MIT, Addy Osmani |
| doubt-driven-development | addyosmani/agent-skills | MIT, Addy Osmani |
| frontend-ui-engineering | addyosmani/agent-skills | MIT, Addy Osmani |
| security-and-hardening | addyosmani/agent-skills | MIT, Addy Osmani |
| test-driven-development | addyosmani/agent-skills | MIT, Addy Osmani |
| supabase-postgres-best-practices | [supabase/agent-skills](https://github.com/supabase/agent-skills) | MIT, Supabase |
| pstack 0.9.102: its 65 skills (`poteto-mode`, `how`, `why`, `interrogate`, the `principle-*` skills and the rest) and its 4 agents in [`../agents/`](../agents/) (`poteto-agent`, `comment-sicko` and the two `thermo-nuclear` reviewers) | [michael-denyer/pstack-claude](https://github.com/michael-denyer/pstack-claude), commit `356c6e0`, the folder `plugins/pstack/` | MIT, Lauren Tan and Michael Denyer; some skills and agents MIT, Cursor |
| Matt Pocock's skills: the 22 that cloud sessions download at start (none committed; see below) | [mattpocock/skills](https://github.com/mattpocock/skills), the commit Anthropic's marketplace pins (`49dd158` on 2026-10-29) | MIT, Matt Pocock |

pstack came in differently from the eight above: it was a Claude Code plugin on Jasper's computer, and its `skills/` and `agents/` folders were copied from the installed plugin (decision record [0014](../../docs/adr/0014-pstack-lives-in-the-repo.md)). Git stores them with the same bytes as pstack's repo at that commit, and [`pstack-manifest.txt`](pstack-manifest.txt) lists every file, which `pstack-manifest.test.mjs` checks. Its startup text is copied too, as [`../hooks/pstack-session-start-context.md`](../hooks/pstack-session-start-context.md). Its license texts stay where pstack keeps them, in [`poteto-mode/references/licenses/`](poteto-mode/references/licenses/): `LICENSE` (Lauren Tan and Michael Denyer), `LICENSE-cursor-team-kit` and `LICENSE-thermos` (Cursor), and `NOTICE.md`, which says which skills and agents each one covers.

## Matt Pocock's skills, in cloud sessions only

Cloud sessions also get Matt Pocock's skills from [mattpocock/skills](https://github.com/mattpocock/skills), MIT license, Matt Pocock. None of their files are committed here. The startup hook [`pocock-skills.mjs`](../hooks/pocock-skills.mjs) fetches them when a cloud session starts, at the commit Anthropic's official marketplace pins for `mattpocock-skills` (`49dd158`, version 1.3.1, on 2026-10-29), and puts them in the cloud machine's `~/.claude/skills/`, outside the repo. Their license text is below. Decision record [0015](../../docs/adr/0015-cloud-sessions-get-pocock-skills-at-anthropics-pin.md) has the details.

## How they fit this repo

- They are general advice. Where one disagrees with [CLAUDE.md](../../CLAUDE.md) or [docs/workflow.md](../../docs/workflow.md), the repo's rules win: Claude merges only its own tiny and normal PRs, through `npm run can-merge`, migrations come from `npm run db:generate`, decision records use the sections in docs/workflow.md, and colors come from the tokens in `src/app/globals.css`.
- Some link to `../../references/*.md`. Those files live in the source repo and aren't installed by `npx skills add`, so the links lead nowhere here; skip them.
- Edit nothing inside these folders, so they stay identical to their source. To update one, copy the newer folder from its source repo in a PR of its own. pstack's steps are in [docs/workflow.md](../../docs/workflow.md#pstack).
- poteto-mode's code (`poteto-mode/scripts/`) is tested with Bun in pstack's own repo, so `npm run lint`, `npm run typecheck` and `npm test` skip that folder.

## Licenses

### addyosmani/agent-skills

```
MIT License

Copyright (c) 2025 Addy Osmani

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

### supabase/agent-skills

```
MIT License

Copyright (c) 2026 Supabase

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

### mattpocock/skills

```
MIT License

Copyright (c) 2026 Matt Pocock

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```
