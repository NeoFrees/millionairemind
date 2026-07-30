# Pushing this to GitHub as MILLIONAIREMIND

The repo is already a git repository with one commit on `main`. It just needs a
remote. Pick either route.

## Option A — GitHub CLI (one command)

```bash
cd millionairemind
gh repo create MILLIONAIREMIND --public --source=. --remote=origin --push
```

## Option B — web UI + git

1. Create a new **empty** repo at <https://github.com/new> named `MILLIONAIREMIND`.
   Do *not* add a README, .gitignore or license — this repo already has all three.
2. Then:

```bash
cd millionairemind
git remote add origin https://github.com/<your-username>/MILLIONAIREMIND.git
git push -u origin main
```

## Verify the commit is intact

```bash
git log --stat -1        # 74 files
git status              # clean
```

## Then run it

```bash
npm run setup   # creates backend/.venv, installs both sides
npm run api     # terminal 1 → http://127.0.0.1:8000
npm run dev     # terminal 2 → http://localhost:5173
npm test        # 72 backend tests
```
