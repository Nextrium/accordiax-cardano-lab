import "dotenv/config";
import { generateSeedPhrase } from "@lucid-evolution/lucid";
import { appendFile, access, readFile } from "node:fs/promises";
import { constants } from "node:fs";

const ENV_FILE = ".env.local";

async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

async function main(): Promise<void> {
  const exists = await fileExists(ENV_FILE);

  if (!exists) {
    throw new Error(
      `${ENV_FILE} does not exist. Create it first with your Blockfrost configuration.`,
    );
  }

  const existing = await readFile(ENV_FILE, "utf8");

  const hasSender = /^TEST_SENDER_SEED=/m.test(existing);
  const hasRecipient = /^TEST_RECIPIENT_SEED=/m.test(existing);

  if (hasSender && hasRecipient) {
    console.log("Test wallets already exist in .env.local.");
    console.log("No new wallet credentials were generated.");
    return;
  }

  if (hasSender || hasRecipient) {
    throw new Error(
      "Only one test wallet seed exists in .env.local. Refusing to create an inconsistent wallet set.",
    );
  }

  const senderSeed = generateSeedPhrase();
  const recipientSeed = generateSeedPhrase();

  await appendFile(
    ENV_FILE,
    `\n# Local Cardano Preprod test wallets — NEVER COMMIT\nTEST_SENDER_SEED=${senderSeed}\nTEST_RECIPIENT_SEED=${recipientSeed}\n`,
    "utf8",
  );

  console.log("Two persistent Preprod test wallets were created.");
  console.log("Credentials were written only to .env.local.");
  console.log("Seed phrases were NOT printed.");
}

main().catch((error: unknown) => {
  console.error("Wallet generation failed.");

  if (error instanceof Error) {
    console.error(error.message);
  } else {
    console.error(error);
  }

  process.exit(1);
});