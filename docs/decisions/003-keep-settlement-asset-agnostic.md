# ADR-003: Keep Settlement Asset Handling Asset-Agnostic

## Status

**DECIDED**

## Context

The laboratory used NXTEST to validate native-asset escrow.

NXTEST is a controlled test asset and is not intended to become the permanent production settlement asset.

Accordiax may need to support multiple verified settlement assets.

## Decision

The Cardano settlement layer should remain asset-agnostic.

The escrow mechanism should validate supported policies/assets rather than hardcoding NXTEST-specific business logic.

## Rationale

This keeps the trust layer reusable across different commerce contexts and avoids coupling Accordiax to a single experimental token.

It also allows the production system to integrate verified stablecoins without rewriting the agreement-and-escrow model.

## Consequences

- Policy/asset validation becomes part of settlement setup.
- Supported assets require explicit configuration and due diligence.
- Test assets remain isolated from production assumptions.

## Revisit

Update when production supported assets and issuer arrangements are finalized.