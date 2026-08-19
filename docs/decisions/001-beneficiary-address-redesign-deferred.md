# ADR-001: Defer Beneficiary Address Redesign

## Status

**DEFERRED**

## Context

The current Plutus V3 escrow validator constructs the seller beneficiary using the seller payment credential.

During release integration, the resulting beneficiary address was distinct from the full seller wallet address because only the payment credential was used.

A more generalized beneficiary architecture was considered to better support Accordiax's future wallet abstraction and user identity model.

## Decision

Keep the current beneficiary model unchanged for the current prototype milestone.

Do not modify the validator solely to solve the generalized beneficiary design before submission.

## Rationale

Changing the beneficiary semantics requires a contract-level redesign and additional testing.

The current model is sufficient to prove the core escrow funding and release mechanics on Preprod.

Expanding the contract scope at this stage would introduce unnecessary risk to an already validated prototype.

## Consequences

### Positive

- Preserves the confirmed validator behavior.
- Avoids unnecessary contract churn.
- Keeps the current technical milestone stable.

### Negative

- The current beneficiary representation is not the final production abstraction.
- Production wallet/user identity mapping remains unresolved.

## Revisit

Revisit during production architecture and security review.