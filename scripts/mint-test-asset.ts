import { config } from "dotenv";
import {
  Blockfrost,
  Lucid,
  fromText,
  mintingPolicyToId,
  paymentCredentialOf,
  scriptFromNative,
  unixTimeToSlot,
} from "@lucid-evolution/lucid";
import { mkdir, writeFile } from "node:fs/promises";

config({ path: [".env.local", ".env"] });

const BLOCKFROST_PREPROD_URL =
  "https://cardano-preprod.blockfrost.io/api/v0";

const ASSET_NAME = "NXTEST";
const MINT_QUANTITY = 1_000_000n;

function requireEnv(name: string): string {
  const value = process.env[name];

  if (!value || value.trim() === "") {
    throw new Error(`Missing environment variable: ${name}`);
  }

  return value.trim();
}

async function main(): Promise<void> {
  const projectId = requireEnv(
    "BLOCKFROST_PREPROD_PROJECT_ID",
  );

  const senderSeed = requireEnv("TEST_SENDER_SEED");

  const lucid = await Lucid(
    new Blockfrost(
      BLOCKFROST_PREPROD_URL,
      projectId,
    ),
    "Preprod",
  );

  lucid.selectWallet.fromSeed(senderSeed);

  const issuerAddress = await lucid.wallet().address();

  /*
   * Test-only policy:
   * The current sender must sign the minting transaction.
   *
   * A native-script signature policy is useful here because it lets
   * us demonstrate issuer-controlled minting without introducing
   * Plutus complexity prematurely.
   */
  const issuerCredential =
    paymentCredentialOf(issuerAddress);

  const mintingPolicy = scriptFromNative({
    type: "sig",
    keyHash: issuerCredential.hash,
  });

  const policyId =
    mintingPolicyToId(mintingPolicy);

  const assetUnit =
    `${policyId}${fromText(ASSET_NAME)}`;

  console.log("\n=== TEST NATIVE ASSET ===");
  console.log(`Issuer address: ${issuerAddress}`);
  console.log(`Policy ID:      ${policyId}`);
  console.log(`Asset name:     ${ASSET_NAME}`);
  console.log(`Asset unit:     ${assetUnit}`);
  console.log(`Mint quantity:  ${MINT_QUANTITY}`);

  const validityWindowMs = 15 * 60 * 1000;

  const validTo =
    Date.now() + validityWindowMs;

  const network = lucid.config().network;

  if (!network) {
    throw new Error("Lucid did not initialize the network configuration.");
  }

  const validToSlot =
    unixTimeToSlot(
      network,
      validTo,
    );

  console.log(`Valid-to slot:  ${validToSlot}`);

  console.log("\nBuilding mint transaction...");

  const tx = await lucid
    .newTx()
    .mintAssets({
      [assetUnit]: MINT_QUANTITY,
    })
    .pay.ToAddress(
      issuerAddress,
      {
        [assetUnit]: MINT_QUANTITY,
      },
    )
    .validTo(validTo)
    .attach.MintingPolicy(mintingPolicy)
    .complete();

  const transaction =
    tx.toTransaction();

  const transactionSizeBytes =
    transaction.to_cbor_bytes().length;

  const feeLovelace =
    transaction.body().fee();

  console.log("\n=== TRANSACTION METRICS ===");
  console.log(
    `Transaction size: ${transactionSizeBytes} bytes`,
  );
  console.log(
    `Fee: ${feeLovelace} lovelace`,
  );
  console.log(
    `Fee: ${Number(feeLovelace) / 1_000_000} ADA`,
  );

  console.log("\nSigning...");

  const signedTx =
    await tx.sign.withWallet().complete();

  console.log("Submitting...");

  const txHash =
    await signedTx.submit();

  console.log(`Transaction ID: ${txHash}`);

  console.log("\nWaiting for confirmation...");

  await lucid.awaitTxConfirmation(txHash, {
    checkInterval: 3_000,
    timeout: 120_000,
    minimumConfirmations: 1,
  });

  console.log("\nNative asset mint confirmed.");

  await mkdir("artifacts", {
    recursive: true,
  });

  const artifact = {
    experiment: "native-asset-mint",
    network: "Preprod",

    issuerAddress,

    policyId,
    assetName: ASSET_NAME,
    assetUnit,

    quantity: MINT_QUANTITY.toString(),

    transactionHash: txHash,
    transactionSizeBytes,

    feeLovelace:
      feeLovelace.toString(),

    feeAda:
      Number(feeLovelace) / 1_000_000,

    protocolParameters:
      lucid.config().protocolParameters,

    createdAt:
      new Date().toISOString(),
  };

  const artifactPath =
    `artifacts/native-asset-mint-${txHash}.json`;

  await writeFile(
    artifactPath,
    JSON.stringify(
      artifact,
      (_, value) =>
        typeof value === "bigint"
          ? value.toString()
          : value,
      2,
    ),
    "utf8",
  );

  console.log(
    `\nEvidence artifact: ${artifactPath}`,
  );
}

main().catch((error: unknown) => {
  console.error("\nNative asset experiment failed.");

  if (error instanceof Error) {
    console.error(error.message);
    console.error(error.stack);
  } else {
    console.error(error);
  }

  process.exit(1);
});
