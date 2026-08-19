# ADR-006: Do Not Make CIP-0113 a Core Pilot Dependency

## Status

**DEFERRED**

## Context

CIP-0113 offers programmable token rules and can support compliance-governed assets.

The supplied pilot guide states that the standard is still evolving and that its reference implementation is not yet production-ready.

## Decision

Do not make CIP-0113 a required dependency of the core Accordiax pilot architecture.

## Rationale

The core Accordiax problem can be solved through verified stablecoin settlement, escrow logic and supporting identity.

Making a moving standard a hard dependency would increase mainnet and audit risk unnecessarily.

## Consequences

Accordiax may investigate CIP-0113 later where a real compliance-governed asset use case justifies it.

## Revisit

Revisit only if a suitable finalized/substandard implementation materially improves a production requirement.