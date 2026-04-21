# QA Checklist

## Core Flow

- [x] Create or edit profile
- [x] Create, duplicate, and delete CVs
- [x] Import CV from PDF, DOCX, or text
- [x] Rewrite experience bullets with AI
- [x] Analyze a job description
- [x] Optimize CV against a job description
- [x] Run ATS compatibility review
- [x] Export PDF, TXT, and JSON backup
- [x] Generate interview questions and answers
- [x] Review local history and settings

## Platform Support

- [x] Same codebase works on web and Expo mobile preview
- [x] No local Android or iOS build required for development
- [x] Local API only handles AI, rate limiting, and logging

## Resilience

- [x] Empty AI output falls back to safe defaults
- [x] Invalid AI output is normalized
- [x] Network failures show non-breaking messages
- [x] Import endpoint validates file type and normalizes errors
- [x] Local persistence migration path exists
- [x] Corrupt AsyncStorage recovery clears broken payloads

## Turkish Character Support

- [x] UTF-8 text normalization uses NFC
- [x] Turkish characters render without forced ASCII conversion
- [x] Search and comparison logic keeps locale-aware handling where needed
- [x] Export filenames transliterate Turkish characters safely

## Developer Checks

- [x] `npm run typecheck`
- [x] API health endpoint responds
- [x] Web dev server responds
