import { config } from "dotenv";

import {
  Blockfrost,
  Lucid,
  type ProtocolParameters,
} from "@lucid-evolution/lucid";

config({ path: ".env.local" });

const BLOCKFROST_PREPROD_URL =
  "https://cardano-preprod.blockfrost.io/api/v0";

function requireEnvironmentVariable(name: string): string {
  const value = process.env[name];

  if (!value || value.trim() === "") {
    throw new Error(
      `Missing required environment variable: ${name}`,
    );
  }

  return value.trim();
}

function printProtocolParameters(
  parameters: ProtocolParameters,
): void {
  console.log("\n=== CARDANO PREPROD PROTOCOL PARAMETERS ===");

  console.log(`minFeeA: ${parameters.minFeeA}`);
  console.log(`minFeeB: ${parameters.minFeeB}`);
  console.log(`maxTxSize: ${parameters.maxTxSize}`);

  console.log(
    `coinsPerUtxoByte: ${parameters.coinsPerUtxoByte.toString()}`,
  );

  console.log("\nBaseline linear fee relationship:");
  console.log(
    "fee = minFeeA × transactionSizeBytes + minFeeB",
  );

  console.log("\nFull protocol parameter object:");
  console.dir(parameters, { depth: null });
}

async function main(): Promise<void> {
  const projectId = requireEnvironmentVariable(
    "BLOCKFROST_PREPROD_PROJECT_ID",
  );

  console.log("Connecting to Cardano Preprod...");

  const lucid = await Lucid(
    new Blockfrost(
      BLOCKFROST_PREPROD_URL,
      projectId,
    ),
    "Preprod",
  );

  const protocolParameters = lucid.config().protocolParameters;

  if (!protocolParameters) {
    throw new Error("Lucid did not initialize protocol parameters.");
  }

  printProtocolParameters(protocolParameters);

  console.log("\nCardano Preprod connection: OK");
}

main().catch((error: unknown) => {
  console.error("\nCardano validation failed.");

  if (error instanceof Error) {
    console.error(error.message);
    console.error(error.stack);
  } else {
    console.error(error);
  }

  process.exit(1);
});
