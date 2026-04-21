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

### Validate workflow

Runs on push and pull request:

- `npm ci`
- `npm run typecheck`
- backend `/health` smoke test

### Native build workflow

Runs manually through `workflow_dispatch`.

It is intentionally designed so native builds happen in GitHub Actions, not locally.

## Required Secrets

Add these repository secrets before using native CI builds:

- `EXPO_TOKEN`

## Recommended Variables

These are usually configured in Expo/EAS or your deployment platform rather than committed:

- `GROQ_API_KEY`
- `GROQ_MODEL`
- `OPENAI_API_KEY`
- `OPENAI_MODEL`

## Notes

- Do not commit `.env`
- Do not commit native build artifacts
- Keep Android and iOS builds in CI only
- Use the validation workflow for routine checks and the native build workflow only when you actually want store-ready binaries
