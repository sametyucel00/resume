# Release Checklist

## Product Readiness

- [ ] Run the full flow with a real CV and job description
- [ ] Run the same flow with Turkish content
- [ ] Verify credits decrease and history entries are created
- [ ] Verify fallback behavior when the AI provider is unavailable

## Import

- [ ] Import TXT
- [ ] Import PDF
- [ ] Import DOCX
- [ ] Verify encrypted or broken files return a safe message

## Export

- [ ] Export TXT
- [ ] Export JSON backup
- [ ] Export PDF on web
- [ ] Export PDF on Expo preview or native test device
- [ ] Verify Turkish characters render correctly in content
- [ ] Verify export filenames remain stable and readable

## Web And Mobile

- [ ] Verify the app loads on web without a blank screen
- [ ] Verify the bottom step bar behaves consistently on web
- [ ] Verify the same flow works in Expo development mode
- [ ] Verify keyboard, scrolling, and multiline inputs on mobile

## AI Provider

- [ ] Confirm `/health` reports the expected provider configuration
- [ ] Confirm `/api/provider-test` succeeds with the release provider
- [ ] Confirm rate limiting and timeout behavior return safe errors

## Purchases

- [ ] Verify demo credits on web
- [ ] Verify native product ids for Apple and Google stores
- [ ] Verify restore purchases behavior on native builds

## Release Ops

- [ ] Fill GitHub secrets for native CI builds
- [ ] Confirm GitHub Actions validation workflow passes
- [ ] Confirm manual native build workflow is configured
- [ ] Do not run local Android or iOS builds
