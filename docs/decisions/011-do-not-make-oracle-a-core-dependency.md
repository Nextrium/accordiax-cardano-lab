# ADR-011: Do Not Make an Oracle a Core Pilot Dependency

## Status

**DECIDED FOR CURRENT SCOPE**

## Context

An oracle could provide external price information to Cardano smart contracts.

However, Accordiax is not responsible for operating the fiat on/off-ramp in the current production direction, and the core escrow contract does not require exchange-rate information merely to hold and release a verified settlement asset.

## Decision

Do not make an oracle integration a core dependency of the current Accordiax pilot scope.

## Rationale

Adding an oracle solely because it is available in the ecosystem would increase architecture, testing and adoption complexity without a proven requirement in the current transaction lifecycle.

The pilot should reward integrations that solve a real product requirement.

## Consequences

The current architecture focuses on:

- verified stablecoin settlement;
- non-custodial escrow;
- CIP-0170 identity;
- transaction abstraction;
- Dune/standardized measurement.

The system remains extensible for a future oracle where pricing, FX conversion, valuation or other external-data requirements justify one.

## Revisit

Add an oracle only after a concrete production requirement is established and an appropriate provider/feed and on-chain consumption pattern are validated.