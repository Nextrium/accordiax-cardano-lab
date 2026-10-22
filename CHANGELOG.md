# Changelog

All notable changes are listed here, one section per release. Add your change under **Unreleased** in your pull request.

## Unreleased

### Added
- Contributor guide, handbook, security policy, code of conduct and agent rules.
- CI at the repo root: typecheck, contract format/tests/build with a blueprint check, and a secret scan.

### Changed
- Aiken sources formatted with `aiken fmt`. The compiled validator is unchanged.

### Removed
- The nested `accordiax-escrow/.github` workflow, which GitHub never ran.

## 0.1.0 – 2026-08-19

- Plutus V3 escrow validator; funding and release confirmed on Preprod with evidence artifacts.
- Architecture document and decision records.
