# CV Optimizer AI Architecture

## Goal

CV Optimizer AI is a local-first job application optimization tool built with one Expo codebase for mobile and web, plus a minimal Node.js API for AI provider access, rate limiting, and logging.

The product flow is:

`Profile -> CV -> Bullet Rewrite -> Job Description -> Optimization -> ATS Check -> Export -> Interview Prep`

## Frontend

- Expo + React Native
- React Native Web from the same codebase
- Zustand for app state
- AsyncStorage for local persistence

### UI structure

The primary app shell lives in [App.tsx](./App.tsx).

It adapts to viewport size:

- Web and mobile: bottom step navigation
- Single-purpose screens with 2-3 primary actions

Reusable UI primitives live in [src/components/ui.tsx](./src/components/ui.tsx).

## State Model

The persisted local model is defined in [src/types.ts](./src/types.ts) and managed by [src/store/useAppStore.ts](./src/store/useAppStore.ts).

```json
{
  "profile": {},
  "cvs": [],
  "history": [],
  "settings": {}
}
```

Additional persisted fields support:

- schema versioning
- local credit transactions
- backup import merge or replace
- CV section ordering

## AI Layer

The client AI entry point is [src/services/ai.ts](./src/services/ai.ts).

Core contract rules live in [src/services/aiContracts.ts](./src/services/aiContracts.ts):

- stable prompt version
- task-specific validation
- output normalization
- fallback responses
- cache key generation

The API layer is intentionally small:

- [server/index.js](./server/index.js)
- [server/aiProviders.js](./server/aiProviders.js)
- [server/prompts.js](./server/prompts.js)

Supported providers:

- Groq
- OpenAI

Provider switching is done through one abstraction:

```ts
generateAIResponse(input, provider = "groq")
```

## Import and Export

### Import

The backend import endpoint accepts PDF, DOCX, and TXT and normalizes the result to UTF-8 NFC before returning parsed text.

### Export

Export helpers live in [src/services/exporter.ts](./src/services/exporter.ts) and [src/services/templates.ts](./src/services/templates.ts).

Supported export formats:

- PDF
- TXT
- JSON backup

CV rendering supports:

- 3 ATS-safe templates
- 2 visual templates
- ATS mode
- Human mode
- spacing variants
- typography and section-order variants

## Payments

Purchase logic lives in [src/services/purchases.ts](./src/services/purchases.ts).

- Native targets use direct store billing through `react-native-iap`
- Web and Expo preview use safe local fallbacks so development mode works without native builds

## Reliability Notes

- No auth
- No cloud user storage
- Local-first persistence only
- AI calls have timeout handling and guarded fallbacks
- Provider test endpoint available through `/api/provider-test`
- Health endpoint available through `/health`
- Turkish text is normalized with UTF-8 NFC and export filenames safely transliterate Turkish characters

## Runbook

### Development

1. Copy `.env.example` to `.env`
2. Add `GROQ_API_KEY` and optionally `OPENAI_API_KEY`
3. Start the API and web app with `npm run dev`
4. Start Expo preview with `npm run start` for mobile development mode

### Production direction

This repository is prepared for development-first delivery:

- web runs on localhost without a build step
- Expo mobile runs in development mode
- native store builds should be produced later in CI or GitHub Actions, not locally
- GitHub Actions includes a validation workflow plus a manual native build workflow skeleton
