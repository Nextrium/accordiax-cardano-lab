import { config } from "dotenv";
import {
  Blockfrost,
  Lucid,
  type Assets,
  type CML,
  type ProtocolParameters,
  type UTxO,
} from "@lucid-evolution/lucid";
import { mkdir, writeFile } from "node:fs/promises";

config({ path: [".env.local", ".env"] });

const BLOCKFROST_PREPROD_URL =
  "https://cardano-preprod.blockfrost.io/api/v0";

const TRANSFER_AMOUNT_LOVELACE = 2_000_000n;

function requireEnv(name: string): string {
  const value = process.env[name];

  if (!value || value.trim() === "") {
    throw new Error(`Missing environment variable: ${name}`);
  }

  return value.trim();
}

function sumLovelace(
  utxos: UTxO[],
): bigint {
  return utxos.reduce(
    (total, utxo) => total + (utxo.assets.lovelace ?? 0n),
    0n,
  );
}

function serializeAssets(assets: Assets): Record<string, string> {
  return Object.fromEntries(
    Object.entries(assets).map(([unit, quantity]) => [
      unit,
      quantity.toString(),
    ]),
  );
}

function serializeCmlValue(value: CML.Value): Record<string, string> {
  const assets: Record<string, string> = {
    lovelace: value.coin().toString(),
  };

  if (!value.has_multiassets()) {
    return assets;
  }

  const multiAsset = value.multi_asset();
  const policyIds = multiAsset.keys();

  for (let policyIndex = 0; policyIndex < policyIds.len(); policyIndex += 1) {
    const policyId = policyIds.get(policyIndex);
    const policyAssets = multiAsset.get_assets(policyId);

    if (!policyAssets) {
      continue;
    }

    const assetNames = policyAssets.keys();

    for (let assetIndex = 0; assetIndex < assetNames.len(); assetIndex += 1) {
      const assetName = assetNames.get(assetIndex);
      const quantity = policyAssets.get(assetName);

      if (quantity !== undefined) {
        assets[`${policyId.to_hex()}${assetName.to_hex()}`] =
          quantity.toString();
      }
    }
  }

  return assets;
}

function serializeProtocolParameters(
  parameters: ProtocolParameters,
): Record<string, unknown> {
  return JSON.parse(
    JSON.stringify(parameters, (_key, value: unknown) =>
      typeof value === "bigint" ? value.toString() : value,
    ),
  ) as Record<string, unknown>;
}

async function main(): Promise<void> {
  const projectId = requireEnv(
    "BLOCKFROST_PREPROD_PROJECT_ID",
  );

  const senderSeed = requireEnv("TEST_SENDER_SEED");
  const recipientSeed = requireEnv("TEST_RECIPIENT_SEED");

  const lucid = await Lucid(
    new Blockfrost(
      BLOCKFROST_PREPROD_URL,
      projectId,
    ),
    "Preprod",
  );

  lucid.selectWallet.fromSeed(senderSeed);

  const senderAddress = await lucid.wallet().address();

  const recipientLucid = await Lucid(
    new Blockfrost(
      BLOCKFROST_PREPROD_URL,
      projectId,
    ),
    "Preprod",
  );

  recipientLucid.selectWallet.fromSeed(recipientSeed);

  const recipientAddress =
    await recipientLucid.wallet().address();

  console.log("\n=== CARDANO PREPROD TEST WALLETS ===");
  console.log(`Sender:    ${senderAddress}`);
  console.log(`Recipient: ${recipientAddress}`);

  const senderUtxosBefore =
    await lucid.wallet().getUtxos();

  const senderBalanceBefore =
    sumLovelace(senderUtxosBefore);

  console.log(
    `\nSender balance: ${senderBalanceBefore} lovelace`,
  );

  console.log(
    `Sender balance: ${Number(senderBalanceBefore) / 1_000_000} ADA`,
  );

  if (senderBalanceBefore < TRANSFER_AMOUNT_LOVELACE) {
    console.log(
      "\nInsufficient test ADA.",
    );

    console.log(
      "\nFund this sender address from the Cardano Preprod faucet:",
    );

    console.log(senderAddress);

    process.exit(2);
  }

  console.log("\nBuilding transaction...");

  const tx = await lucid
    .newTx()
    .pay.ToAddress(recipientAddress, {
      lovelace: TRANSFER_AMOUNT_LOVELACE,
    })
    .complete();

  const transaction = tx.toTransaction();
  const feeLovelace =
    transaction.body().fee();

  const protocolParameters = lucid.config().protocolParameters;

  if (!protocolParameters) {
    throw new Error("Lucid did not initialize protocol parameters.");
  }

  const transactionInputs = transaction.body().inputs();
  const inputs = Array.from({ length: transactionInputs.len() }, (_, index) => {
    const input = transactionInputs.get(index);
    const txHash = input.transaction_id().to_hex();
    const outputIndex = Number(input.index());
    const resolvedInput = senderUtxosBefore.find(
      (utxo) =>
        utxo.txHash === txHash &&
        utxo.outputIndex === outputIndex,
    );

    if (!resolvedInput) {
      throw new Error(
        `Unable to resolve transaction input ${txHash}#${outputIndex}.`,
      );
    }

    return {
      txHash,
      outputIndex,
      address: resolvedInput.address,
      assets: serializeAssets(resolvedInput.assets),
    };
  });

  const transactionOutputs = transaction.body().outputs();
  const outputs = Array.from({ length: transactionOutputs.len() }, (_, index) => {
    const output = transactionOutputs.get(index);

    return {
      address: output.address().to_bech32(),
      assets: serializeCmlValue(output.amount()),
    };
  });

  const createdAt = new Date().toISOString();

  console.log("\nSigning...");

  const signedTx =
    await tx.sign.withWallet().complete();

  const txSizeBytes = signedTx.toTransaction().to_cbor_bytes().length;

  console.log("\n=== TRANSACTION METRICS ===");
  console.log(`Transaction size: ${txSizeBytes} bytes`);
  console.log(`Fee: ${feeLovelace} lovelace`);
  console.log(`Fee: ${Number(feeLovelace) / 1_000_000} ADA`);

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

  const confirmedAt = new Date().toISOString();

  console.log("\nTransaction confirmed.");

  const artifact = {
    experiment: "ada-transfer",
    network: "Preprod",
    senderAddress,
    recipientAddress,
    transferAmountLovelace:
      TRANSFER_AMOUNT_LOVELACE.toString(),
    transferAmountAda:
      Number(TRANSFER_AMOUNT_LOVELACE) / 1_000_000,
    transactionHash: txHash,
    transactionSizeBytes: txSizeBytes,
    feeLovelace: feeLovelace.toString(),
    feeAda: Number(feeLovelace) / 1_000_000,
    inputs,
    outputs,
    protocolParameters: serializeProtocolParameters(protocolParameters),
    createdAt,
    confirmedAt,
  };

  await mkdir("artifacts", { recursive: true });

  await writeFile(
    `artifacts/ada-transfer-${txHash}.json`,
    JSON.stringify(artifact, null, 2),
    "utf8",
  );

  console.log(
    "\nEvidence artifact:",
    `artifacts/ada-transfer-${txHash}.json`,
  );
}

main().catch((error: unknown) => {
  console.error("\nTransaction experiment failed.");

  if (error instanceof Error) {
    console.error(error.message);
  } else {
    console.error(error);
  }

  process.exit(1);
});
