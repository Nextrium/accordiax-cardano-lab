import { generateSeedPhrase } from "@lucid-evolution/lucid";
import { open, type FileHandle } from "node:fs/promises";

const ENV_FILE = ".env.local";

async function main(): Promise<void> {
  // Read and append through one file handle, so the file can't be swapped between the check and the write.
  let file: FileHandle;
  try {
    file = await open(ENV_FILE, "a+");
  } catch {
    throw new Error(`${ENV_FILE} could not be opened.`);
  }
  try {
    await run(file);
  } finally {
    await file.close();
  }
}

async function run(file: FileHandle): Promise<void> {
  if ((await file.stat()).size === 0) {
    throw new Error(`${ENV_FILE} is empty or missing. Create it first with your Blockfrost configuration.`);
  }

  const existing = await file.readFile("utf8");
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

  await file.appendFile(`\n# Local Cardano Preprod test wallets - NEVER COMMIT\n${additions.join("\n")}\n`, "utf8");
  console.log("Persistent Preprod test wallet credentials were updated.");
  console.log("Credentials were written only to .env.local.");
  console.log("Seed phrases were NOT printed.");
}

main().catch((error: unknown) => {
  console.error("Wallet generation failed.");
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
