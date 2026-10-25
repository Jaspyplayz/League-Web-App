# Third-party skills

Eight skills in this folder come from other people's open-source repos. Jasper installed them on his computer with `npx skills add`, and they were copied here unchanged so that project threads in the Claude app, subagents such as the [reviewer](../agents/reviewer.md), and Claude Code on any computer can load them. Each folder still matches the `computedHash` recorded for it in the `skills-lock.json` on Jasper's computer, except that the Supabase skill's line endings were changed from Windows ones (CRLF) back to the LF its source repo uses, which makes it identical to the source file for file. `explain-back` is Turnpoint's own.

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

## How they fit this repo

- They are general advice. Where one disagrees with [CLAUDE.md](../../CLAUDE.md) or [docs/workflow.md](../../docs/workflow.md), the repo's rules win: Claude merges only its own tiny and normal PRs, through `npm run can-merge`, migrations come from `npm run db:generate`, decision records use the sections in docs/workflow.md, and colors come from the tokens in `src/app/globals.css`.
- Some link to `../../references/*.md`. Those files live in the source repo and aren't installed by `npx skills add`, so the links lead nowhere here; skip them.
- Edit nothing inside these folders, so they stay identical to their source. To update one, copy the newer folder from its source repo in a PR of its own.

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
