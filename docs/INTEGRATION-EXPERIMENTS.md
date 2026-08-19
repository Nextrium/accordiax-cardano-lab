# Accordiax Cardano Integration — Experiment Log

**Status:** Preprod validation / integration research
**Product:** Accordiax — Trust Infrastructure for Commerce
**Repository:** Nextrium/accordiax-cardano-lab
**Last updated:** 2026-08-19

---

## 1. Purpose

This document records the engineering work completed so far while evaluating a Cardano-based settlement layer for Accordiax. It deliberately distinguishes validated experiments from proposed production work.

Accordiax already operates an MVP around structured commercial agreements, escrow, delivery confirmation and dispute resolution. Its current traditional escrow flow is custodial because Accordiax controls funds while an agreement is active. The proposed Cardano work is intended to replace that custody-dependent settlement path with user-controlled, non-custodial on-chain settlement while preserving Accordiax's agreement and dispute logic.

The proposed integration is asset-agnostic: ADA and verified Cardano stablecoins can be settlement assets rather than making Accordiax dependent on a single native asset.

## 2. Current integration status

The repository contains a working Cardano Preprod research implementation using:

- Aiken / Plutus V3 escrow validator.
- `@lucid-evolution/lucid` for transaction construction and submission.
- Blockfrost Preprod for chain interaction and verification.
- A controlled native test asset (NXTEST) for escrow experiments.
- Inline datums and redeemers.
- Escrow funding and release transaction flows.
- Transaction accounting and post-confirmation verification artifacts.
- Experiments for ADA transfer, native-asset transfer, fee sponsorship and sponsored funding.

## 3. Confirmed escrow funding

A Preprod escrow funding transaction was successfully submitted and independently verified on-chain.

**Transaction:** `1c5f64b6ebea6b5a79eb6eab4dcc9ba84ce288a6e31418e4b46ec8b5c80d3cdd`

The confirmed escrow output contained:

- 3,000,000 lovelace (3 ADA)
- 1,000 NXTEST
- The expected Plutus V3 escrow script address
- An inline datum containing buyer key hash, seller key hash, policy ID, asset name and quantity

The verification artifact checks transaction confirmation, script address, exact ADA amount, exact NXTEST amount and an exact match between expected and decoded on-chain datum CBOR.

The confirmed funding transaction was 361 bytes and had a 175,929 lovelace fee.

## 4. Confirmed escrow release

A separate release experiment successfully spent the confirmed escrow UTxO and transferred the escrowed NXTEST to the seller beneficiary address.

**Transaction:** `7b320d74f0b48c4199a44ba0f309004aa8c54577dc28652c625e78a81b705f5e`

The release experiment verified:

- The escrow funding transaction was confirmed.
- The input matched the expected escrow script address.
- The validator was Plutus V3 with the expected script hash.
- The Release redeemer was constructed and accepted.
- 1,000 NXTEST entered and exactly 1,000 NXTEST left the transaction.
- The seller beneficiary received exactly 1,000 NXTEST.
- Lovelace accounting balanced exactly against outputs plus the transaction fee.
- The resulting transaction was submitted and confirmed on Preprod.

The release transaction was 1,427 bytes and incurred a 232,094 lovelace fee (0.232094 ADA).

The experiment generated a machine-readable evidence artifact containing validator data, inputs, outputs, datum data, accounting checks, transaction size, fee and transaction hash.

## 5. Native asset experiments

The repository separately tested ordinary native-asset movement before introducing validator logic. The transfer experiment uses an already-issued NXTEST asset and sends it between Preprod wallets while accounting for the ADA required by a native-asset output.

This separation established that the asset could be transferred independently before introducing escrow validation.

## 6. Transaction and fee experiments

The repository contains dedicated experiments for:

- Ordinary ADA transfers.
- Native-asset transfers.
- Fee sponsorship.
- Sponsored user funding.

The fee-sponsorship work is relevant to the proposed production architecture because the programme measures fees paid by wallets other than the team's declared wallets. The experiments therefore explore transaction topologies in which a user remains the transaction participant while another party can provide funding where necessary, rather than moving all activity into an Accordiax-controlled wallet.

These experiments are research work and are not the final production fee model.

## 7. What has worked

### Validator deployment and address derivation

The Plutus V3 escrow validator compiles into the expected blueprint and derives the expected Preprod script address. The release script explicitly checks the validator hash and derived address before proceeding.

### Escrow funding

The implementation can construct an escrow funding transaction containing ADA and a native asset, attach the expected inline datum, balance the transaction and submit it to Preprod.

### On-chain verification

Blockfrost and Lucid/CML can independently inspect the confirmed transaction, resolve UTxOs and decode transaction CBOR for verification.

### Escrow release

The validator can consume the funded escrow UTxO using the release redeemer and direct the escrowed asset to the beneficiary while preserving exact asset accounting.

### Evidence generation

The experiments produce JSON artifacts rather than relying only on terminal output. Transaction hashes, addresses, assets, fees, datum data and accounting checks are therefore reproducible and reviewable.

## 8. Constraints and lessons learned

### Native assets require ADA

A Cardano output containing a native asset also requires ADA to satisfy the minimum-ADA requirement. The experiments explicitly account for this instead of treating an asset transfer as token-only.

### Transaction balancing matters

Escrow spending can require additional wallet inputs for fees and minimum-ADA requirements. The release experiment deliberately uses wallet inputs/collateral and performs explicit input/output conservation checks.

### Beneficiary representation needs production redesign

The current prototype derives the beneficiary using the seller's payment verification key and places an escrow output-reference datum on the beneficiary output. This was sufficient to validate the prototype, but the implementation explicitly marks this as compatibility logic to be redesigned for production.

The production model must connect beneficiary identity, wallet/account, agreement state and selected asset without relying on the prototype representation.

### Prototype asset is not a production settlement asset

NXTEST exists for controlled experiments. It is not intended to be the production settlement asset. Production work will use verified Cardano assets, including appropriate stablecoins, without requiring Accordiax to issue its own stablecoin.

### Preprod is validation, not production readiness

The confirmed integration experiments are Preprod experiments. They demonstrate technical feasibility of the core escrow mechanism, not production security, audit completion, mainnet deployment or general-user readiness.

## 9. What is not yet complete

The following remain proposed integration work:

- Mainnet deployment of the Accordiax escrow validator.
- Production integration into the Accordiax application.
- Verified stablecoin settlement and supported policy handling.
- Asset-agnostic settlement rules across ADA and supported stablecoins.
- CIP-0170 identity integration and wallet-to-user identity/attestation mapping.
- Production wallet connection and signing flows for both agreement parties.
- Production dispute/refund state transitions enforced by the on-chain agreement model.
- Security review/audit of the final validator and integration.
- Mainnet adoption and real-user transaction measurement.

## 10. Proposed production direction

The target architecture keeps Accordiax as the trust and agreement layer while moving custody-sensitive settlement to Cardano.

- Parties create and accept a structured agreement in Accordiax.
- The agreement records scope, amount, deadline, deliverables and settlement terms.
- Parties connect their own wallets and identify themselves through the proposed identity layer.
- The payer deposits the selected supported Cardano settlement asset into the escrow contract.
- Accordiax records the transaction and agreement state without taking custody of the funds.
- Completion releases the asset to the beneficiary according to the on-chain rules.
- A dispute pauses normal release and follows the defined dispute/refund path.
- On-chain activity is tagged for programme analytics and independently measurable adoption.

## 11. Stablecoin direction

This is not a stablecoin trading product. Stablecoins are settlement instruments for commerce agreements.

The objective is to allow parties to settle agreements using verified existing Cardano stablecoins where appropriate, alongside ADA, so the trust layer is not tied to one asset. Accordiax would not issue a new stablecoin as part of this integration.

Production implementation will validate asset policy handling, denomination, minimum-ADA requirements, escrow accounting, release/refund paths and user-paid transaction flows for supported assets.

## 12. Identity direction

The proposed CIP-0170 integration is intended to connect a verifiable identity/attestation with the party and their Cardano wallet rather than treating a raw wallet address as the complete user identity.

The prototype currently demonstrates wallet credentials and beneficiary key hashes at smart-contract level. This is useful groundwork, but it is not yet a CIP-0170 implementation. Production work will define how identity attestation is associated with the Accordiax account, agreement party and wallet without making Accordiax a centralized identity registry.

## 13. Integration readiness assessment

The existing Accordiax product is separately assessed at TRL 5 for the application. The Cardano integration is new work.

The integration has progressed beyond an idea: the escrow validator, transaction builders and verification tooling exist, and the core funding/release path has been executed successfully on public Preprod. However, the complete product integration is not yet production-ready and stablecoin and CIP-0170 components remain to be built.

Accordingly, the evidence supports describing the proposed integration as an experimentally validated prototype rather than claiming mainnet readiness.

## 14. Evidence index

### Confirmed funding

- **Transaction:** `1c5f64b6ebea6b5a79eb6eab4dcc9ba84ce288a6e31418e4b46ec8b5c80d3cdd`
- **Artifact:** `artifacts/escrow-funding-confirmed-1c5f64b6ebea6b5a79eb6eab4dcc9ba84ce288a6e31418e4b46ec8b5c80d3cdd.json`

### Confirmed release

- **Transaction:** `7b320d74f0b48c4199a44ba0f309004aa8c54577dc28652c625e78a81b705f5e`
- **Artifact:** `artifacts/escrow-release-7b320d74f0b48c4199a44ba0f309004aa8c54577dc28652c625e78a81b705f5e.json`

### Experiment source files

- `experiments/transactions/ada-transfer.ts`
- `experiments/transactions/native-asset-transfer.ts`
- `experiments/transactions/fee-sponsor.ts`
- `experiments/transactions/fund-sponsor.ts`
- `scripts/escrow/fund-escrow.ts`
- `scripts/escrow/release-escrow.ts`

## 15. Evidence integrity note

This record intentionally distinguishes confirmed results from planned work. A transaction hash is treated as evidence only for what that transaction actually demonstrates. Preprod success is not represented as mainnet readiness, and prototype NXTEST usage is not represented as stablecoin adoption.

The next stage is to turn the validated escrow primitive into the complete Accordiax settlement integration, with supported verified stablecoins, CIP-0170 identity, production wallet flows, security review and mainnet deployment.
