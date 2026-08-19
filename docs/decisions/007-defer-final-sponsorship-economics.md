# ADR-007: Defer Final Transaction-Resource Sponsorship Economics

## Status

**DEFERRED**

## Context

Prototype experiments established that:

- minimum ADA can be calculated dynamically;
- transaction fees are measurable;
- explicit wallet inputs can make prototype construction reliable;
- a production user may not have ADA available for execution resources.

## Decision

Do not finalize the production sponsorship/economic mechanism during the current prototype milestone.

## Rationale

Several viable designs exist and they have different legal, operational and economic implications.

Choosing prematurely could lock the proposal into a mechanism that has not yet been tested or commercially evaluated.

## Current UX Requirement

The seller should not be expected to acquire ADA solely to release an escrowed supported asset.

## Consequences

The production architecture must later define:

- source of execution ADA;
- collateral policy;
- resource replenishment;
- cost recovery;
- failure handling;
- sponsorship-account controls.

## Revisit

Production transaction-resource architecture and business-model implementation.