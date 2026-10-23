# Changelog

All notable changes are listed here, one section per release. Add your change under **Unreleased** in your pull request.

## Unreleased

## 0.1.0 – 2026-10-23

First release from this repository.

### Added
- Plutus V3 escrow validator with tests; funding and release confirmed on Preprod with evidence artifacts.
- Architecture document and decision records.
- Contributor guide, handbook, security policy, code of conduct and agent rules.
- CI at the repo root: typecheck, contract format/tests/build with a blueprint check, and a secret scan.

### Changed
- Aiken sources formatted with `aiken fmt`. The compiled validator is unchanged.
- The test-wallet script reads and writes `.env.local` through one file handle.

### Removed
- The nested `accordiax-escrow/.github` workflow, which GitHub never ran.
