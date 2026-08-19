# ADR-005: Treat CIP-0170 as a Supporting Identity Layer

## Status

**PROPOSED / SELECTED FOR INTEGRATION PLANNING**

## Context

Accordiax already has an application-level user identity model.

The pilot provides CIP-0170 as an on-chain identity integration area.

## Decision

Use CIP-0170 as a supporting identity/attestation layer rather than making it the sole authorization mechanism for escrow.

## Rationale

The Accordiax application still needs to manage agreements, roles and user-facing workflows.

CIP-0170 can strengthen the link between real participants and Cardano credentials without forcing the entire application identity model onto the blockchain.

## Consequences

The implementation must define:

- what identity claims are anchored;
- who creates attestations;
- privacy boundaries;
- how application accounts map to credentials;
- what actions require on-chain identity.

## Revisit

After validating current CIP-0170 tooling and the exact production user flow.