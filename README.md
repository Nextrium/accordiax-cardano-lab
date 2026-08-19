# Accordiax Cardano Lab

Research and integration laboratory for bringing Cardano settlement infrastructure into Accordiax — Trust Infrastructure for Commerce.

## Purpose

This repository contains the engineering work used to evaluate, prototype and validate Cardano integrations for Accordiax.

Accordiax is an existing agreement-and-escrow platform. The Cardano work focuses on replacing the current custody-dependent settlement path with non-custodial on-chain settlement while preserving the application-level agreement, delivery and dispute workflows.

The integration is intended to support verified Cardano settlement assets rather than depend on a single native asset.

## Current status

**Integration stage:** Experimental prototype / Preprod validation

The core escrow mechanism has been validated on Cardano Preprod.

Confirmed work includes:

- Plutus V3 escrow validator
- Escrow funding with ADA + native asset
- Inline datum validation
- Escrow release
- Exact asset conservation checks
- Lovelace conservation checks
- On-chain transaction verification
- Machine-readable evidence artifacts
- Native-asset transfer experiments
- Transaction and fee-sponsorship experiments

The complete product integration is not yet production-ready.

Stablecoin settlement and CIP-0170 identity are proposed next-stage integrations.

## Repository Structure

```text
accordiax-cardano-lab/
├── accordiax-escrow/       # Aiken/Plutus escrow validator and blueprint
├── artifacts/              # Machine-readable experiment evidence
├── docs/
│   ├── architecture/       # System and integration architecture
│   ├── decisions/          # Recorded architectural decisions
│   └── INTEGRATION-EXPERIMENTS.md
├── experiments/            # Isolated Cardano transaction experiments
├── scripts/                # Integration and verification scripts
├── LICENSE                 # MIT License
├── package.json
└── README.md
```

## Experiment Record

The detailed engineering history is maintained in:

[docs/INTEGRATION-EXPERIMENTS.md](docs/INTEGRATION-EXPERIMENTS.md)

That document records:

- experiments performed;
- confirmed results;
- failed approaches;
- constraints discovered;
- workarounds used for prototype validation;
- evidence artifacts; and
- remaining integration work.

Architectural designs are maintained under `docs/architecture/`, while important architectural choices and deferred decisions are recorded under `docs/decisions/`.

The experiment log is intentionally cumulative. New experiments should be appended there rather than rewriting historical results.

## Confirmed Preprod evidence

### Escrow funding

Confirmed Preprod transaction:

`1c5f64b6ebea6b5a79eb6eab4dcc9ba84ce288a6e31418e4b46ec8b5c80d3cdd`

Evidence:

`artifacts/escrow-funding-confirmed-1c5f64b6ebea6b5a79eb6eab4dcc9ba84ce288a6e31418e4b46ec8b5c80d3cdd.json`

The confirmed escrow output contained 3 ADA and 1,000 NXTEST with the expected script address and inline datum.

### Escrow release

Confirmed Preprod transaction:

`7b320d74f0b48c4199a44ba0f309004aa8c54577dc28652c625e78a81b705f5e`

Evidence:

`artifacts/escrow-release-7b320d74f0b48c4199a44ba0f309004aa8c54577dc28652c625e78a81b705f5e.json`

The release transaction successfully spent the escrow UTxO and delivered exactly 1,000 NXTEST to the beneficiary while passing asset and ADA accounting checks.

## Development principle

This repository distinguishes clearly between:

- **Confirmed** — executed and verified on Cardano.
- **Experimental** — tested to investigate feasibility or behavior.
- **Deferred** — intentionally postponed production design decisions.
- **Proposed** — planned future implementation.
- **Not yet validated** — identified work requiring further testing.

Prototype success must not be represented as production readiness.

Preprod evidence must not be represented as mainnet evidence.

NXTEST is a controlled test asset and is not the production settlement asset.

## Production direction

The intended production architecture is to keep Accordiax as the agreement and trust layer while moving settlement to Cardano.

The final production settlement asset, issuer arrangements, transaction sponsorship model and other external dependencies remain subject to further technical, regulatory and partner validation.

The target integration includes:

- non-custodial Cardano escrow;
- verified stablecoin settlement;
- asset-agnostic settlement handling;
- CIP-0170 identity integration;
- production wallet/signing flows;
- agreement-driven settlement states;
- dispute/refund handling;
- security review and audit;
- mainnet deployment; and
- measurable external-user adoption.

## Testing

Install dependencies:

```bash
npm install
```

Run type checking:

```bash
npm run typecheck
```

Individual experiment commands are documented in `package.json` and in the relevant experiment source files.

## Networks

Current engineering validation uses:

- Cardano Preprod
- Blockfrost Preprod
- Lucid Evolution
- Aiken / Plutus V3

Mainnet deployment is future work.

## Evidence

Machine-readable evidence is stored under:

```text
artifacts/
```

Each confirmed experiment should produce or reference an artifact containing enough information to reproduce or independently inspect the result.

## Security and production disclaimer

This repository contains research and integration work.

Successful Preprod execution does not constitute a security audit, production approval, economic guarantee or mainnet readiness.

Production deployment requires additional security review, testing, operational controls and validation of all external integrations.

## License

MIT License.

Copyright (c) 2026 Nextrium.
