# Rules for AI agents in this repo

Read [docs/HANDBOOK.md](docs/HANDBOOK.md) first.

- **Branches:** branch from `develop`; pull requests go into `develop`, never `main`.
- **Commits:** short messages, one task per pull request, no AI signature or co-author lines.
- **Secrets:** never print, commit or paste seeds, keys or the Blockfrost project ID. They live in `.env.local`.
- **Networks:** Preprod only. Never build or submit a mainnet transaction.
- **Contract:** add tests for allowed and refused paths; rebuild and commit `plutus.json` when the validator changes.
- **CI config** (`.github/`, `.gitleaks.toml`) changes only when a task asks for it.
- **Done means:** typecheck and Aiken checks pass; say plainly what you couldn't verify.
