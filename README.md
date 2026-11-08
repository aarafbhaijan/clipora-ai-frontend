# Clipora AI: frontend

Web app for Clipora AI: chat with an agent to turn long videos into shorts. Built with Next.js and Ant Design in a
GitHub-dark, VS Code-style editor, with a live agent progress view, a timeline editor, a speaker-aware transcript,
crop and aspect controls, one-click portrait conversion, YouTube import and export.

The API and workers live in [clipora-ai-backend](https://github.com/aarafbhaijan/clipora-ai-backend).

## Run

```bash
npm install
npm run dev -- --port 3001   # API_ORIGIN defaults to http://localhost:8000 (the backend API)
```

## Checks

```bash
npx tsc --noEmit
npm run lint
npm test
```

`npm run gen:api` regenerates `src/api/schema.d.ts` from the backend's OpenAPI file.
