# ADR-008: Do Not Encode Unconfirmed Partners as Architectural Dependencies

## Status

**DECIDED**

## Context

Potential integrations may involve stablecoin issuers, ecosystem providers, universities, creators, on-ramp providers or other organizations.

A technical dependency is not automatically a commercial partnership.

## Decision

Architecture documents may identify categories of external dependencies without claiming a partnership unless a real relationship exists.

## Rationale

This avoids unsupported claims and keeps the architecture valid if a provider or partner changes.

## Consequences

The architecture should describe:

- required interface;
- required capability;
- provider examples where useful;
- validation requirements.

Named partnerships belong in the proposal only when they are actually established and evidenced.