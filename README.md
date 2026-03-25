# KOZA

KOZA is a Next.js-based AI production studio workspace for screenplay, board, timeline, and image-assisted creative workflows.

## Source of Truth

The GitHub repository is the single source of truth for this project.

- Local working folder: `/Users/macbookbpm/Desktop/KOZA`
- Git remote: `origin -> https://github.com/lelekovtv-ops/koza.git`
- Main production branch: `main`
- Vercel should deploy from `main`

Do not maintain parallel copies of the project outside this folder.

## Local Setup

Install dependencies:

```bash
npm install
```

Create local environment variables:

```bash
cp .env.example .env.local
```

Run development server:

```bash
npm run dev
```

Check managed dev server health:

```bash
npm run dev:status
```

The app runs on:

```bash
http://localhost:3001
```

You can also use:

```bash
./start-dev.sh
```

## Environment Variables

Current app integrations use these keys:

- `OPENAI_API_KEY`
- `GOOGLE_API_KEY`
- `ANTHROPIC_API_KEY` for Claude models

Supabase is scaffolded but not active yet, so `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` are not required right now.

Rules:

- Keep real secrets only in `.env.local` and Vercel project settings
- Never commit `.env.local`
- Keep `.env.example` updated when required keys change

## GitHub-First Workflow

If you want the repository to stay current at all times, work from Git first, not from loose local copies.

### First clone

```bash
git clone https://github.com/lelekovtv-ops/koza.git /Users/macbookbpm/Desktop/KOZA
cd /Users/macbookbpm/Desktop/KOZA
npm install
cp .env.example .env.local
```

### Start every work session

```bash
cd /Users/macbookbpm/Desktop/KOZA
git pull origin main
```

Then start the app:

```bash
npm run dev
```

### Publish your latest work to GitHub

```bash
git status
git add .
git commit -m "Describe the change"
git push origin main
```

### Minimal safe routine

Use this exact order every time:

1. `git pull origin main`
2. make changes
3. `npm run build` if the change is significant
4. `git add .`
5. `git commit -m "..."`
6. `git push origin main`

That is the simplest way to keep GitHub always current.

## Vercel Setup

Recommended deployment model:

- GitHub hosts the code
- Vercel pulls from GitHub
- Production deploys from `main`

### One-time Vercel setup

1. Import the repository in Vercel
2. Choose the `koza` GitHub repository
3. Framework preset: Next.js
4. Root directory: project root
5. Build command: `npm run build`
6. Install command: `npm install`
7. Add required environment variables in Vercel

### Recommended Vercel env

- `OPENAI_API_KEY`
- `GOOGLE_API_KEY`
- `ANTHROPIC_API_KEY` if Claude is enabled

If you install the Vercel CLI later, sync env down to local like this:

```bash
npm i -g vercel
vercel login
cd /Users/macbookbpm/Desktop/KOZA
vercel link
vercel env pull .env.local
```

## Recommended Repo Discipline

To avoid drift and confusion:

- Work only inside `/Users/macbookbpm/Desktop/KOZA`
- Push to GitHub at the end of each focused task
- Pull from GitHub before starting new work
- Do not store secrets in git
- Do not use multiple local copies of the same project

## Quick Commands

Install:

```bash
npm install
```

Dev:

```bash
npm run dev
```

Build:

```bash
npm run build
```

Safe build that restarts the managed dev server if it was already running:

```bash
npm run build:safe
```

Pull latest:

```bash
git pull origin main
```

Push latest:

```bash
git add .
git commit -m "Update KOZA"
git push origin main
```
