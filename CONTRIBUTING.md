# Contributing to Accordiax Cardano Lab

This repo holds the Cardano escrow contract and the scripts that test it on Preprod. Thanks for helping.

## Before you start

- **Pick a task from the contributors portal:** <https://contribute.nextrium.org/>.
- **Found a bug or a docs problem?** Open a finding with the issue form.
- **Found a security problem,** especially in the contract? Don't open an issue. Follow [SECURITY.md](SECURITY.md).
- Read the [handbook](docs/HANDBOOK.md).

## How to contribute

1. Fork the repo and clone your fork.
2. Branch from `develop`: `git switch -c fix/short-name origin/develop`.
3. Keep each pull request to one task.
4. Run the checks below.
5. Open a pull request **into `develop`**, fill in the template and link the task or finding.

`main` only receives release pull requests from `develop`.

## Checks to run before you push

```bash
npm ci
npm run typecheck
cd accordiax-escrow
aiken fmt --check
aiken check -D
aiken build      # commit plutus.json if the contract changed
```

Use Aiken v1.1.21. CI also runs a secret scan over the full history.

## Contract changes

- Every change to `validators/` needs tests for both the allowed path and the refused paths.
- Rebuild and commit `plutus.json` in the same pull request. CI fails if it doesn't match the source.
- Say in the pull request whether the validator hash changes. A new hash means a new script address.

## Wallets and keys

- Use **Preprod test wallets only**. Never use a wallet that holds real funds.
- Seeds and keys stay in `.env.local` (git-ignored). Never commit, print or paste them.
- Evidence files in `artifacts/` must not contain seeds, private keys or API keys.

## What gets a pull request closed

- No linked task or finding, or unrelated changes bundled together.
- Failing checks left unfixed.
- Secrets or seeds in any form.

By contributing you agree that your contribution is licensed under the [MIT License](LICENSE).
