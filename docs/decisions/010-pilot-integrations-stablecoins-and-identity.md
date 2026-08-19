# ADR-010: Pilot Integration Scope — Stablecoins and CIP-0170 Identity

## Status

**DECIDED FOR PROPOSAL SCOPE**

## Context

The Catalyst Pilot requires at least one Area of Interest.

The Accordiax design can use multiple Cardano primitives, but each additional integration adds implementation and adoption obligations.

The current product need is to support:

- verifiable settlement with existing stablecoins;
- stronger linkage between Accordiax participants and Cardano credentials.

## Decision

The current proposal scope selects:

1. **Stablecoins**
2. **On-chain identity (CIP-0170)**

Oracle integration is not included as a required pilot dependency at this stage.

## Rationale

The escrow use case does not itself require Accordiax to operate an on/off-ramp.

External regulated conversion/on-ramp providers can handle fiat-to-asset conversion where necessary. Accordiax can then operate on supported settlement assets without making an oracle a core dependency of the escrow primitive.

CIP-0170 has a direct role in connecting participants to verifiable Cardano identity/attestation capabilities.

## Consequences

The proposal and architecture should:

- make verified stablecoin settlement a central integration;
- treat CIP-0170 as the supporting identity layer;
- avoid claiming an oracle is required for the core escrow flow;
- preserve the architecture for future oracle integration if a concrete requirement emerges.

## Revisit

Revisit oracle integration if future pricing, valuation, FX or settlement requirements demonstrate a concrete need for an on-chain oracle.