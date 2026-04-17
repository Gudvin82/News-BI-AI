# Publish Checklist

## Before push

1. Run sanitization:
   - `../tools/redact_showcase.sh`
2. Run leak scan:
   - `../tools/scan_leaks.sh`
3. Manually verify:
   - no real webhook URLs
   - no real bot tokens
   - no private keys/certs
   - no runtime logs/personal data

## Repository quality

1. README has:
   - product value
   - architecture summary
   - demo setup
2. LICENSE present (`All Rights Reserved`)
3. docs include:
   - architecture
   - API examples
   - legal notes

## GitHub publishing

1. Create public repo under `Gudvin82` (showcase only).
2. Push only `showcase-repo`.
3. Keep full source in separate private repository.

