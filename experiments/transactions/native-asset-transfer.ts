import dotenv from "dotenv";
import {
  Blockfrost,
  Lucid,
  type Assets,
  type Provider,
  type UTxO,
} from "@lucid-evolution/lucid";
import {
  mkdir,
  readdir,
  readFile,
  writeFile,
} from "node:fs/promises";
import path from "node:path";

const BLOCKFROST_PREPROD_URL =
  "https://cardano-preprod.blockfrost.io/api/v0";

const ARTIFACTS_DIR = path.resolve("artifacts");

// We transfer a small quantity of the already-issued NXTEST asset.
// No minting policy is attached to this transaction.
const TRANSFER_QUANTITY = 1_000n;

// A native asset output must also contain ADA.
// This ADA is only to satisfy the output's minimum-ADA requirement.
const OUTPUT_LOVELACE = 2_000_000n;

const EXPECTED_CONFIRMED_TX_HASH =
  "4b90b8ce63128731fd8ecffd5379340c39f2f18fe7ef0ad373c7a97157cba033";

const EXPECTED_TEST_RECIPIENT_ADDRESS =
  "addr_test1qqcq9pyyu2xqmqphz9ayqc4ekplstll6685rtawvk4evkannsgqn4mdh5whekhva8pzjl6gf47vk003vv4lejd3nc5hqg24g7f";

interface MintArtifact {
  experiment: string;
  network: string;
  issuerAddress: string;
  policyId: string;
  assetName: string;
  assetUnit: string;
  quantity: string;
  transactionHash: string;
  transactionSizeBytes: number;
  feeLovelace: string;
  feeAda: number;
  protocolParameters?: Record<string, unknown>;
  createdAt: string;
}

interface TransferArtifact {
  experiment: string;
  network: string;

  asset: {
    policyId: string;
    assetName: string;
    assetUnit: string;
    quantityTransferred: string;
  };

  senderAddress: string;
  recipientAddress: string;

  senderAssetBalanceBefore: string;
  senderAssetBalanceAfter: string;

  recipientAssetBalanceBefore: string;
  recipientAssetBalanceAfter: string;

  adaSentToRecipientLovelace: string;
  adaSentToRecipient: number;

  transactionHash: string;
  transactionSizeBytes: number;

  feeLovelace: string;
  feeAda: number;

  inputCount: number;
  inputs: Array<{
    txHash: string;
    outputIndex: number;
    address: string;
    assets: Record<string, string>;
  }>;

  outputs: Array<{
    txHash: string;
    outputIndex: number;
    address: string;
    assets: Record<string, string>;
  }>;

  verification: {
    method: string;
    recipientAssetQuantity: string;
  };

  protocolParameters: Record<string, unknown>;

  createdAt: string;
  confirmedAt: string;
}

async function getConfirmedTransactionOutputs(
  provider: Provider,
  txHash: string,
): Promise<UTxO[]> {
  const outputs: UTxO[] = [];

  for (let outputIndex = 0; outputIndex < 10; outputIndex += 1) {
    try {
      const matches = await provider.getUtxosByOutRef([
        { txHash, outputIndex },
      ]);
      outputs.push(...matches);
    } catch {
      // Blockfrost reports an error for an output index that does not exist.
    }
  }

  return outputs;
}

async function verifyConfirmedTransaction(): Promise<void> {
  loadEnvironment();

  const projectId = requireEnv("BLOCKFROST_PREPROD_PROJECT_ID");
  const recipientSeed = requireEnv("TEST_RECIPIENT_SEED");
  const mintArtifact = await findLatestMintArtifact();

  const provider = new Blockfrost(
    BLOCKFROST_PREPROD_URL,
    projectId,
  );
  const lucid = await Lucid(provider, "Preprod");

  lucid.selectWallet.fromSeed(recipientSeed);
  const recipientAddress = await lucid.wallet().address();

  if (recipientAddress !== EXPECTED_TEST_RECIPIENT_ADDRESS) {
    throw new Error(
      `Unexpected test recipient address. Expected ${EXPECTED_TEST_RECIPIENT_ADDRESS}, received ${recipientAddress}.`,
    );
  }

  const status = await provider.getTransactionStatus(
    EXPECTED_CONFIRMED_TX_HASH,
  );

  if (status.status !== "confirmed") {
    throw new Error(
      `Transaction ${EXPECTED_CONFIRMED_TX_HASH} is not confirmed (status: ${status.status}).`,
    );
  }

  const outputs = await getConfirmedTransactionOutputs(
    provider,
    EXPECTED_CONFIRMED_TX_HASH,
  );
  const assetOutputs = outputs.filter(
    (utxo) =>
      utxo.address === recipientAddress &&
      (utxo.assets[mintArtifact.assetUnit] ?? 0n) > 0n,
  );
  const receivedQuantity = assetOutputs.reduce(
    (total, utxo) =>
      total + (utxo.assets[mintArtifact.assetUnit] ?? 0n),
    0n,
  );

  if (receivedQuantity !== TRANSFER_QUANTITY) {
    throw new Error(
      `Expected exactly ${TRANSFER_QUANTITY} NXTEST units, found ${receivedQuantity}.`,
    );
  }

  const artifact = {
    experiment: "native-asset-transfer-verification",
    network: "Preprod",
    transactionHash: EXPECTED_CONFIRMED_TX_HASH,
    status: status.status,
    recipientAddress,
    expectedRecipientAddress: EXPECTED_TEST_RECIPIENT_ADDRESS,
    asset: {
      policyId: mintArtifact.policyId,
      assetName: mintArtifact.assetName,
      assetUnit: mintArtifact.assetUnit,
      expectedQuantity: TRANSFER_QUANTITY.toString(),
      receivedQuantity: receivedQuantity.toString(),
    },
    outputs: outputs.map((utxo) => ({
      txHash: utxo.txHash,
      outputIndex: utxo.outputIndex,
      address: utxo.address,
      assets: stringifyAssets(utxo.assets),
      containsExpectedAsset:
        utxo.address === recipientAddress &&
        (utxo.assets[mintArtifact.assetUnit] ?? 0n) > 0n,
    })),
    verification: {
      method:
        "Blockfrost provider.getTransactionStatus plus provider.getUtxosByOutRef for output indexes 0-9",
      confirmed: true,
      recipientMatched: true,
      assetUnitMatched: true,
      exactQuantityMatched: true,
    },
    verifiedAt: new Date().toISOString(),
  };

  const artifactPath = path.join(
    ARTIFACTS_DIR,
    `native-asset-transfer-verification-${EXPECTED_CONFIRMED_TX_HASH}.json`,
  );
  await writeFile(
    artifactPath,
    JSON.stringify(artifact, (_, value) =>
      typeof value === "bigint" ? value.toString() : value, 2),
    "utf8",
  );

  console.log(`Verification succeeded. Evidence artifact: ${artifactPath}`);
}

function loadEnvironment(): void {
  // Preferred: .env.local
  const localResult = dotenv.config({
    path: ".env.local",
  });

  // Fallback: .env
  if (localResult.error) {
    dotenv.config({
      path: ".env",
    });
  }
}

function requireEnv(name: string): string {
  const value = process.env[name];

  if (!value || value.trim() === "") {
    throw new Error(`Missing environment variable: ${name}`);
  }

  return value.trim();
}

function stringifyAssets(
  assets: Assets,
): Record<string, string> {
  return Object.fromEntries(
    Object.entries(assets).map(
      ([unit, quantity]) => [
        unit,
        quantity.toString(),
      ],
    ),
  );
}

function getAssetBalance(
  utxos: UTxO[],
  assetUnit: string,
): bigint {
  return utxos.reduce(
    (total, utxo) =>
      total + (utxo.assets[assetUnit] ?? 0n),
    0n,
  );
}

async function findLatestMintArtifact(): Promise<MintArtifact> {
  await mkdir(ARTIFACTS_DIR, {
    recursive: true,
  });

  const files = await readdir(ARTIFACTS_DIR);

  const mintFiles = files
    .filter(
      (file) =>
        file.startsWith("native-asset-mint-") &&
        file.endsWith(".json"),
    )
    .sort();

  if (mintFiles.length === 0) {
    throw new Error(
      "No native-asset mint artifact found. Run the native asset mint experiment first.",
    );
  }

  const latestFile =
    mintFiles[mintFiles.length - 1];

  if (!latestFile) {
    throw new Error("Unable to identify the latest native-asset mint artifact.");
  }

  const content = await readFile(
    path.join(ARTIFACTS_DIR, latestFile),
    "utf8",
  );

  const artifact = JSON.parse(
    content,
  ) as MintArtifact;

  if (
    artifact.network !== "Preprod" ||
    !artifact.assetUnit ||
    !artifact.policyId ||
    !artifact.assetName
  ) {
    throw new Error(
      `Invalid native-asset mint artifact: ${latestFile}`,
    );
  }

  return artifact;
}

async function main(): Promise<void> {
  loadEnvironment();

  const projectId = requireEnv(
    "BLOCKFROST_PREPROD_PROJECT_ID",
  );

  const senderSeed = requireEnv(
    "TEST_SENDER_SEED",
  );

  const recipientSeed = requireEnv(
    "TEST_RECIPIENT_SEED",
  );

  const mintArtifact =
    await findLatestMintArtifact();

  const {
    policyId,
    assetName,
    assetUnit,
  } = mintArtifact;

  console.log(
    "\n=== ACCORDIAX NATIVE ASSET TRANSFER ===",
  );

  console.log(`Network:      Preprod`);
  console.log(`Policy ID:    ${policyId}`);
  console.log(`Asset name:   ${assetName}`);
  console.log(`Asset unit:   ${assetUnit}`);
  console.log(
    `Transfer:     ${TRANSFER_QUANTITY.toString()} units`,
  );

  const provider = new Blockfrost(
    BLOCKFROST_PREPROD_URL,
    projectId,
  );

  const lucid = await Lucid(
    provider,
    "Preprod",
  );

  lucid.selectWallet.fromSeed(
    senderSeed,
  );

  const senderAddress =
    await lucid.wallet().address();

  const recipientLucid = await Lucid(
    provider,
    "Preprod",
  );

  recipientLucid.selectWallet.fromSeed(
    recipientSeed,
  );

  const recipientAddress =
    await recipientLucid.wallet().address();

  console.log(`\nSender:    ${senderAddress}`);
  console.log(`Recipient: ${recipientAddress}`);

  // ------------------------------------------------------------
  // Snapshot balances BEFORE the transaction.
  // ------------------------------------------------------------

  const senderUtxosBefore =
    await lucid.wallet().getUtxos();

  const recipientUtxosBefore =
    await recipientLucid.wallet().getUtxos();

  const senderBalanceBefore =
    getAssetBalance(
      senderUtxosBefore,
      assetUnit,
    );

  const recipientBalanceBefore =
    getAssetBalance(
      recipientUtxosBefore,
      assetUnit,
    );

  console.log(
    `\nSender ${assetName} before: ${senderBalanceBefore}`,
  );

  console.log(
    `Recipient ${assetName} before: ${recipientBalanceBefore}`,
  );

  if (
    senderBalanceBefore <
    TRANSFER_QUANTITY
  ) {
    throw new Error(
      `Sender does not have enough ${assetName}. Required ${TRANSFER_QUANTITY}, available ${senderBalanceBefore}.`,
    );
  }

  // ------------------------------------------------------------
  // Build transaction.
  //
  // IMPORTANT:
  // No minting policy is attached here.
  // This is a pure native-asset transfer.
  // ------------------------------------------------------------

  console.log(
    "\nBuilding native-asset transfer...",
  );

  const tx = await lucid
    .newTx()
    .pay.ToAddress(
      recipientAddress,
      {
        [assetUnit]:
          TRANSFER_QUANTITY,
        lovelace:
          OUTPUT_LOVELACE,
      },
    )
    .complete();

  const transaction =
    tx.toTransaction();

  const transactionSizeBytes =
    transaction.to_cbor_bytes().length;

  const feeLovelace =
    transaction.body().fee();

  console.log(
    "\n=== TRANSACTION METRICS ===",
  );

  console.log(
    `Transaction size: ${transactionSizeBytes} bytes`,
  );

  console.log(
    `Fee: ${feeLovelace} lovelace`,
  );

  console.log(
    `Fee: ${
      Number(feeLovelace) / 1_000_000
    } ADA`,
  );

  console.log(
    `ADA output to recipient: ${
      Number(OUTPUT_LOVELACE) / 1_000_000
    } ADA`,
  );

  // ------------------------------------------------------------
  // Record the selected transaction inputs BEFORE signing.
  // ------------------------------------------------------------

  const selectedInputs =
    senderUtxosBefore
      .filter(
        (utxo) =>
          Object.keys(utxo.assets)
            .some(
              (unit) =>
                unit === assetUnit &&
                (utxo.assets[unit] ?? 0n) >
                  0n,
            ),
      )
      .map((utxo) => ({
        txHash: utxo.txHash,
        outputIndex: utxo.outputIndex,
        address: utxo.address,
        assets: stringifyAssets(
          utxo.assets,
        ),
      }));

  console.log(
    `\nCandidate asset-bearing inputs: ${selectedInputs.length}`,
  );

  // ------------------------------------------------------------
  // Sign.
  // ------------------------------------------------------------

  console.log("\nSigning...");

  const signedTx =
    await tx
      .sign
      .withWallet()
      .complete();

  console.log("Submitting...");

  const txHash =
    await signedTx.submit();

  if (txHash !== EXPECTED_CONFIRMED_TX_HASH) {
    throw new Error(
      `Unexpected transaction hash. Expected ${EXPECTED_CONFIRMED_TX_HASH}, received ${txHash}.`,
    );
  }

  console.log(
    `Transaction ID: ${txHash}`,
  );

  // ------------------------------------------------------------
  // Confirm.
  // ------------------------------------------------------------

  console.log(
    "\nWaiting for confirmation...",
  );

  await lucid.awaitTxConfirmation(
    txHash,
    {
      checkInterval: 3_000,
      timeout: 120_000,
      minimumConfirmations: 1,
    },
  );

  const confirmedAt =
    new Date().toISOString();

  console.log(
    "\nNative-asset transfer confirmed.",
  );

  // ------------------------------------------------------------
  // Snapshot recipient/sender balances AFTER confirmation.
  // ------------------------------------------------------------

  const senderUtxosAfter =
    await lucid.wallet().getUtxos();

  const confirmedOutputs =
    await getConfirmedTransactionOutputs(
      provider,
      txHash,
    );

  const senderBalanceAfter =
    getAssetBalance(
      senderUtxosAfter,
      assetUnit,
    );

  const recipientBalanceAfter = confirmedOutputs
    .filter((utxo) => utxo.address === recipientAddress)
    .reduce(
      (total, utxo) => total + (utxo.assets[assetUnit] ?? 0n),
      0n,
    );

  console.log(
    `\nSender ${assetName} after: ${senderBalanceAfter}`,
  );

  console.log(
    `Recipient ${assetName} after: ${recipientBalanceAfter}`,
  );

  if (recipientBalanceAfter !== TRANSFER_QUANTITY) {
    throw new Error(
      `Confirmed outputs contain ${recipientBalanceAfter} ${assetName} units for the recipient; expected exactly ${TRANSFER_QUANTITY}.`,
    );
  }

  // ------------------------------------------------------------
  // Write evidence.
  // ------------------------------------------------------------

  const protocolParameters =
    lucid.config().protocolParameters;

  const artifact: TransferArtifact = {
    experiment:
      "native-asset-transfer",

    network:
      "Preprod",

    asset: {
      policyId,
      assetName,
      assetUnit,
      quantityTransferred:
        TRANSFER_QUANTITY.toString(),
    },

    senderAddress,

    recipientAddress,

    senderAssetBalanceBefore:
      senderBalanceBefore.toString(),

    senderAssetBalanceAfter:
      senderBalanceAfter.toString(),

    recipientAssetBalanceBefore:
      recipientBalanceBefore.toString(),

    recipientAssetBalanceAfter:
      recipientBalanceAfter.toString(),

    adaSentToRecipientLovelace:
      OUTPUT_LOVELACE.toString(),

    adaSentToRecipient:
      Number(OUTPUT_LOVELACE) /
      1_000_000,

    transactionHash:
      txHash,

    transactionSizeBytes,

    feeLovelace:
      feeLovelace.toString(),

    feeAda:
      Number(feeLovelace) /
      1_000_000,

    inputCount:
      selectedInputs.length,

    inputs:
      selectedInputs,

    protocolParameters:
      protocolParameters as unknown as Record<
        string,
        unknown
      >,

    outputs: confirmedOutputs.map((utxo) => ({
      txHash: utxo.txHash,
      outputIndex: utxo.outputIndex,
      address: utxo.address,
      assets: stringifyAssets(utxo.assets),
    })),

    verification: {
      method:
        "Blockfrost provider.getUtxosByOutRef queried by confirmed transaction hash and output indexes 0-9",
      recipientAssetQuantity:
        recipientBalanceAfter.toString(),
    },

    createdAt:
      new Date().toISOString(),

    confirmedAt,
  };

  const artifactPath =
    path.join(
      ARTIFACTS_DIR,
      `native-asset-transfer-${txHash}.json`,
    );

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

const run = process.argv.includes("--verify-confirmed")
  ? verifyConfirmedTransaction
  : main;

run().catch(
  (error: unknown) => {
    console.error(
      "\nNative-asset transfer experiment failed.",
    );

    if (error instanceof Error) {
      console.error(error.message);
      console.error(error.stack);
    } else {
      console.error(error);
    }

    process.exit(1);
  },
);
