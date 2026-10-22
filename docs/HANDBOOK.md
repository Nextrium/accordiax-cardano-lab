# Accordiax Cardano Lab handbook

Shared context for people and AI agents working on this repo.

## What this repo is

The settlement research for Accordiax: a Plutus V3 escrow contract written in Aiken, and TypeScript scripts that fund, release and verify it on Cardano Preprod. Every confirmed experiment leaves a JSON evidence file in `artifacts/`.

Status: Preprod prototype. Nothing here is on mainnet, and nothing here has been audited.

## Layout

| Path | What lives there |
|---|---|
| `accordiax-escrow/validators/` | The escrow contract and its tests |
| `accordiax-escrow/plutus.json` | The compiled blueprint (committed) |
| `scripts/` | Wallet, minting and escrow fund/release/verify scripts |
| `experiments/` | Isolated transaction experiments |
| `artifacts/` | Machine-readable evidence of on-chain results |
| `docs/architecture/`, `docs/decisions/` | Design and recorded decisions |

Tools: Aiken v1.1.21, Node 22, Lucid Evolution, Blockfrost (Preprod).

## How work flows

Tasks come from the contributors portal. Branch from `develop`, open a pull request into `develop`, pass CI and get a code-owner review. Releases go from `develop` to `main` with a merge commit.

## Standards

- **Contract:** every rule has a passing test and a refused-path test. Count every asset and the locked ADA exactly. Note any change to the validator hash.
- **Evidence:** keep "confirmed", "experimental", "deferred" and "proposed" separate, as the README does. Preprod results are never described as mainnet readiness.
- **Secrets:** seeds, keys and the Blockfrost project ID live only in `.env.local`. Scripts never print them.
- **Decisions:** record important choices in `docs/decisions/` as a new numbered file.

## Checks

`npm run typecheck`, then in `accordiax-escrow/`: `aiken fmt --check`, `aiken check -D`, `aiken build`. CI also runs a secret scan over the full history.

## Definition of done

Checks pass, the blueprint is rebuilt if the contract changed, new behaviour has tests, and the pull request says what was verified on Preprod (with transaction hashes) and what wasn't.
