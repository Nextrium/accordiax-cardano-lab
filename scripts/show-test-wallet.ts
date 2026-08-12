import { config } from "dotenv";
import { Blockfrost, Lucid } from "@lucid-evolution/lucid";

config({ path: ".env.local" });

const BLOCKFROST_PREPROD_URL =
  "https://cardano-preprod.blockfrost.io/api/v0";

function requireEnv(name: string): string {
  const value = process.env[name];

  if (!value || value.trim() === "") {
    throw new Error(`Missing environment variable: ${name}`);
  }

  return value.trim();
}

async function main(): Promise<void> {
  const projectId = requireEnv("BLOCKFROST_PREPROD_PROJECT_ID");
  const senderSeed = requireEnv("TEST_SENDER_SEED");
  const recipientSeed = requireEnv("TEST_RECIPIENT_SEED");

  const lucid = await Lucid(
    new Blockfrost(BLOCKFROST_PREPROD_URL, projectId),
    "Preprod",
  );

  lucid.selectWallet.fromSeed(senderSeed);

  const senderAddress = await lucid.wallet().address();

  lucid.selectWallet.fromSeed(recipientSeed);

  const recipientAddress = await lucid.wallet().address();

  console.log("\n=== ACCORDIAX CARDANO PREPROD TEST WALLETS ===");
  console.log(`Sender:    ${senderAddress}`);
  console.log(`Recipient: ${recipientAddress}`);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
