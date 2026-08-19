import { generateSeedPhrase } from "@lucid-evolution/lucid";
import { appendFile, access, readFile } from "node:fs/promises";
import { constants } from "node:fs";

const ENV_FILE = ".env.local";

async function main(): Promise<void> {
  try {
    await access(ENV_FILE, constants.F_OK);
  } catch {
    throw new Error(`${ENV_FILE} does not exist. Create it first with your Blockfrost configuration.`);
  }

  const existing = await readFile(ENV_FILE, "utf8");
  const hasSender = /^TEST_SENDER_SEED=/m.test(existing);
  const hasRecipient = /^TEST_RECIPIENT_SEED=/m.test(existing);
  const hasSponsor = /^TEST_SPONSOR_SEED=/m.test(existing);

  if (hasSender !== hasRecipient) {
    throw new Error("Only one of TEST_SENDER_SEED and TEST_RECIPIENT_SEED exists in .env.local.");
  }

  const additions: string[] = [];
  if (!hasSender) additions.push(`TEST_SENDER_SEED=${generateSeedPhrase()}`);
  if (!hasRecipient) additions.push(`TEST_RECIPIENT_SEED=${generateSeedPhrase()}`);
  if (!hasSponsor) additions.push(`TEST_SPONSOR_SEED=${generateSeedPhrase()}`);

  if (additions.length === 0) {
    console.log("Test wallets already exist in .env.local.");
    return;
  }

  await appendFile(ENV_FILE, `\n# Local Cardano Preprod test wallets - NEVER COMMIT\n${additions.join("\n")}\n`, "utf8");
  console.log("Persistent Preprod test wallet credentials were updated.");
  console.log("Credentials were written only to .env.local.");
  console.log("Seed phrases were NOT printed.");
}

main().catch((error: unknown) => {
  console.error("Wallet generation failed.");
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
