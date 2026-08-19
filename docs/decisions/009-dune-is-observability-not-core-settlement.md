# ADR-009: Treat Dune as an Observability and Measurement Layer

## Status

**DECIDED**

## Context

The pilot requires standardized transaction metadata and Dune tracking from Milestone 1.

Dune does not execute Accordiax transactions and is not the escrow mechanism itself.

## Decision

Keep Dune outside the core settlement execution path.

Use it as the standardized observability/measurement layer for eligible Cardano activity.

## Rationale

This preserves separation between:

- business transaction execution;
- on-chain settlement;
- public analytics and adoption measurement.

## Consequences

The production transaction builder must implement the pilot's required metadata tagging without making Dune a runtime dependency for every settlement decision.

## Revisit

Update when the final tagging specification is published and incorporated into the transaction builder.