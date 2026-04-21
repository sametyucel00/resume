# GitHub Setup

## Repository Metadata

Suggested repository description:

`AI-powered CV optimization and job application assistant built with Expo, React Native Web, Zustand, and a minimal Node API.`

Suggested topics:

- `expo`
- `react-native`
- `react-native-web`
- `ai`
- `cv`
- `resume`
- `ats`
- `groq`

## GitHub Actions Workflows

This project includes:

- `.github/workflows/validate.yml`
- `.github/workflows/native-build.yml`
- `eas.json`

### Validate workflow

Runs on push and pull request:

- `npm ci`
- `npm run typecheck`
- backend `/health` smoke test

### Native build workflow

Runs manually through `workflow_dispatch`.

It is intentionally designed so native builds happen in GitHub Actions, not locally.

The workflow uses the EAS production profile from `eas.json`.

## Required Secrets

Add these repository secrets before using native CI builds:

- `EXPO_TOKEN`

## Android Signing Secrets

If you choose to manage Android signing credentials yourself, keep these secrets ready:

- `ANDROID_KEYSTORE_BASE64`
- `ANDROID_KEY_ALIAS`
- `ANDROID_KEYSTORE_PASSWORD`
- `ANDROID_KEY_PASSWORD`

Current workflow notes:

- Android builds are triggered in GitHub Actions
- package id is `com.hirvia.ai`
- EAS can manage credentials for you, but the Android signing secrets above are the expected manual equivalents

## Recommended Variables

These are usually configured in Expo/EAS or your deployment platform rather than committed:

- `GROQ_API_KEY`
- `GROQ_MODEL`
- `OPENAI_API_KEY`
- `OPENAI_MODEL`

## Notes

- Do not commit `.env`
- Do not commit native build artifacts
- Do not commit keystore files
- Keep Android and iOS builds in CI only
- Use the validation workflow for routine checks and the native build workflow only when you actually want store-ready binaries
