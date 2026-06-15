# Huggy

Huggy is an AI-assisted full-stack web application builder. Provider calls,
system prompts, privileged tools, and private credentials remain server-side.

## Run Locally

**Prerequisites:** Node.js

1. Install dependencies:
   `npm install`
2. Copy `.env.example` to `.env.local` and configure at least one backend AI
   provider credential, usually `OPENROUTER_API_KEY` or `ANTHROPIC_API_KEY`.
   Never prefix provider credentials with `VITE_`.
3. Configure the matching Supabase frontend and backend variables.
4. Run the app:
   `npm run dev`

## Validation

Before publishing changes:

```sh
npm run lint
npm run test
npm run build
```
