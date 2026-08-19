# ADR-002: Seller Collateral Is Not a Production UX Requirement

## Status

**DECIDED**

## Context

The Cardano transaction model can require collateral for smart-contract transactions. During the prototype, Lucid transaction completion was tested with explicit collateral and wallet inputs.

Accordiax is intended for users who should not need prior blockchain knowledge.

## Decision

The production Accordiax UX will not require the seller to manually acquire or maintain ADA solely to release an escrowed supported asset.

## Rationale

Requiring a seller to learn about collateral before receiving payment would undermine the intended trust-layer abstraction.

The resource requirement should instead be handled by the production transaction architecture.

## Important Distinction

This decision does not mean Accordiax has already selected the technical or economic mechanism for providing collateral.

It means only that the **user-facing responsibility should not fall on the seller**.

## Revisit

The exact resource-sponsorship and cost-recovery architecture remains a production design task.