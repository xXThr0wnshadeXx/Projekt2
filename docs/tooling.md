# Tooling

One setup so all three of us work the same way (issue #51). `CONTRIBUTING.md`
stays the source of truth for the rules; this file only lists the tools.

Runtime libraries the app ships with are credited in the README. This file
covers what we **use to build, test, deploy and present** it.

## Everyone

| Tool | What for | Licence |
|---|---|---|
| [Git](https://git-scm.com/) | Version control. Hooks installed by `bash scripts/setup.sh` | GPL-2.0 (tool only, not shipped) |
| [GitHub CLI](https://cli.github.com/) (`gh`) | Issues, PRs, board | MIT |
| [GitHub Projects](https://github.com/users/shreev2703/projects/3) | The board | Service |
| [Python 3.11](https://www.python.org/) | Back end, tests, eval runners | PSF-2.0 |
| [Node.js 20+](https://nodejs.org/) and npm | Front end, Playwright | MIT / Artistic-2.0 |
| [curl](https://curl.se/) | `scripts/preflight.sh`, `scripts/keep_warm.sh` | curl (MIT-style) |

**Board access:** each of us runs this once so `gh` can move cards:

```bash
gh auth refresh -s project
```

- [ ] nicolashlam
- [ ] xXThr0wnshadeXx
- [x] shreev2703 — board reads and card updates verified November 15, 2026

## Back end

| Tool | What for | Licence |
|---|---|---|
| [pytest](https://pytest.org/) | `python -m pytest` | MIT |
| [Uvicorn](https://www.uvicorn.org/) | Local server: `uvicorn app.main:app --reload` from `backend/` | BSD-3-Clause |
| [Railway](https://railway.com/) | Back-end hosting (#67) | Service |
| [Render](https://render.com/) | Backup host, via `render.yaml` | Service |

## Front end and accessibility

| Tool | What for | Licence |
|---|---|---|
| [Vite](https://vite.dev/) | Dev server and build | MIT |
| [TypeScript](https://www.typescriptlang.org/) | `npx tsc --noEmit` | Apache-2.0 |
| [Playwright](https://playwright.dev/) | End-to-end tests: `npx playwright test` | Apache-2.0 |
| [axe-core](https://github.com/dequelabs/axe-core) with `@axe-core/playwright` | Accessibility checks on every screen (#31) | MPL-2.0 |
| VoiceOver (macOS, iOS) | Manual screen-reader pass (#32) | Built in |
| [NVDA](https://www.nvaccess.org/) with Braille Viewer | Manual screen-reader and Nemeth check (#32) | GPL-2.0 (tool only, not shipped) |
| [Vercel](https://vercel.com/) | Front-end hosting | Service |

## Pitch and demo video

| Tool | What for | Licence / terms | Chosen by |
|---|---|---|---|
| Screen recording (QuickTime on macOS, or OBS) | Demo video (#37, #52) | Built in / GPL-2.0 (OBS) | |
| *To choose:* any tool for generated video, images or music | Pitch assets | **Record the licence here before using it** | |

Before using any media tool for pitch assets:

- [ ] Its terms allow use in a public hackathon submission, without a watermark
- [ ] The tool and licence are recorded in the table above
- [ ] Anything it generated is credited in the README (DESIGN.md §8)

## No tool writes keys into the repo

Keys live only in `backend/.env` locally and in the host's variables (Railway,
Vercel). Three things stop one being committed by any tool:

- `.gitignore` ignores `.env` and `.env.*` (except `.env.example`)
- the `pre-commit` hook refuses env files and key-shaped strings
- the **Secret scan** workflow checks every pull request

If a tool asks for an API key, give it the key at runtime (an environment
variable or its own settings), never by writing it into a file in the repo.
