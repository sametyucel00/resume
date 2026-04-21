# CV Optimizer AI

A production-oriented Expo + React Native Web application for fast CV optimization and job application assistance.

## What it is

This is not a generic CV template builder. It is a focused AI-assisted workflow for improving an existing CV against a target job posting, checking ATS fit, exporting clean versions, and preparing for interviews.

## Run locally

1. Install dependencies:

```bash
npm install
```

2. Copy `.env.example` to `.env` and set `GROQ_API_KEY`.

3. Start the API and web app:

```bash
npm run dev
```

API runs on `http://localhost:8787` and web opens through Expo on localhost. Mobile preview works with Expo development mode:

```bash
npm run start
```

No Android or iOS build is required for development.

## Key capabilities

- AI-assisted CV editing
- PDF, DOCX, and text import
- job description analysis
- CV optimization by role
- ATS compatibility scoring
- PDF, TXT, and JSON export
- interview question and answer generation
- local history and provider settings
- local credit system with guarded purchase hooks

## Product Flow

Profile -> CV -> Bullet Rewrite -> Job Description -> Optimization -> ATS Check -> Export -> Interview Prep

Data stays local in AsyncStorage:

```json
{
  "profile": {},
  "cvs": [],
  "history": [],
  "settings": {}
}
```

## AI Provider

The backend exposes a small `/api/ai` endpoint and uses:

```ts
generateAIResponse(input, provider = "groq")
```

The provider layer is isolated in `server/aiProviders.js`, and both Groq and OpenAI adapters are wired through the same client contract so the app screens do not need provider-specific logic.

## Backup And Exports

The app supports JSON backup import/export, plain text CV export, and HTML-based PDF export through `expo-print` with a web print fallback.

Export filenames preserve Turkish input safely by transliterating Turkish-specific letters into stable ASCII filenames while keeping in-app content in UTF-8.

## Mobile + Web UX

The same Expo codebase runs on web and mobile preview. Web and mobile both use the same focused bottom step navigation and single-column editing model so the app behaves like one product, not separate desktop and mobile experiences.

## Payments

The credit system is implemented locally. Native purchases use direct Apple IAP / Google Play Billing through `react-native-iap` when available. Expo preview and web use guarded fallbacks so development mode remains runnable without native builds.

## More docs

- [Architecture](./ARCHITECTURE.md)
- [QA Checklist](./QA_CHECKLIST.md)
- [Release Checklist](./RELEASE_CHECKLIST.md)
- [GitHub Setup](./GITHUB_SETUP.md)
