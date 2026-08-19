import dotenv from "dotenv";
import {
  Blockfrost,
  Lucid,
  type Assets,
  type ProtocolParameters,
  type Provider,
  type UTxO,
} from "@lucid-evolution/lucid";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const PREPROD_URL = "https://cardano-preprod.blockfrost.io/api/v0";
const ARTIFACTS_DIR = path.resolve("artifacts");
const FUNDING_LOVELACE = 2_000_000_000n;

function loadEnvironment(): void {
  const local = dotenv.config({ path: ".env.local" });
  if (local.error) dotenv.config({ path: ".env" });
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value?.trim()) throw new Error(`Missing environment variable: ${name}`);
  return value.trim();
}

function serializeAssets(assets: Assets): Record<string, string> {
  return Object.fromEntries(Object.entries(assets).map(([unit, quantity]) => [unit, quantity.toString()]));
}

function serializeProtocolParameters(parameters: ProtocolParameters): Record<string, unknown> {
  return JSON.parse(JSON.stringify(parameters, (_, value: unknown) => typeof value === "bigint" ? value.toString() : value)) as Record<string, unknown>;
}

async function confirmedOutputs(provider: Provider, txHash: string): Promise<UTxO[]> {
  const result: UTxO[] = [];
  for (let outputIndex = 0; outputIndex < 10; outputIndex += 1) {
    try {
      result.push(...await provider.getUtxosByOutRef([{ txHash, outputIndex }]));
    } catch {
      // The provider rejects indexes that do not exist or are no longer unspent.
    }
  }
  return result;
}

async function main(): Promise<void> {
  loadEnvironment();
  const provider = new Blockfrost(PREPROD_URL, requireEnv("BLOCKFROST_PREPROD_PROJECT_ID"));
  const lucid = await Lucid(provider, "Preprod");
  lucid.selectWallet.fromSeed(requireEnv("TEST_SENDER_SEED"));
  const sponsorLucid = await Lucid(provider, "Preprod");
  sponsorLucid.selectWallet.fromSeed(requireEnv("TEST_SPONSOR_SEED"));

  const senderAddress = await lucid.wallet().address();
  const sponsorAddress = await sponsorLucid.wallet().address();
  const senderUtxos = await lucid.wallet().getUtxos();
  const senderBalance = senderUtxos.reduce((total, utxo) => total + (utxo.assets.lovelace ?? 0n), 0n);
  if (senderBalance < FUNDING_LOVELACE) throw new Error(`Sender has ${senderBalance} lovelace; ${FUNDING_LOVELACE} required before constructing the transaction.`);

  const tx = await lucid.newTx().pay.ToAddress(sponsorAddress, { lovelace: FUNDING_LOVELACE }).complete();
  const unsigned = tx.toTransaction();
  const feeLovelace = unsigned.body().fee();
  const inputs = Array.from({ length: unsigned.body().inputs().len() }, (_, index) => {
    const input = unsigned.body().inputs().get(index);
    const txHash = input.transaction_id().to_hex();
    const outputIndex = Number(input.index());
    const resolved = senderUtxos.find((utxo) => utxo.txHash === txHash && utxo.outputIndex === outputIndex);
    if (!resolved) throw new Error(`Unable to resolve selected input ${txHash}#${outputIndex}.`);
    return { txHash, outputIndex, address: resolved.address, assets: serializeAssets(resolved.assets) };
  });
  const createdAt = new Date().toISOString();
  const signed = await tx.sign.withWallet().complete();
  const transactionSizeBytes = signed.toTransaction().to_cbor_bytes().length;
  const txHash = await signed.submit();
  await lucid.awaitTxConfirmation(txHash, { checkInterval: 3_000, timeout: 120_000, minimumConfirmations: 1 });
  const confirmedAt = new Date().toISOString();
  const status = await provider.getTransactionStatus(txHash);
  if (status.status !== "confirmed") throw new Error(`Transaction ${txHash} did not confirm.`);
  const outputs = await confirmedOutputs(provider, txHash);
  const sponsorOutputs = outputs.filter((output) => output.address === sponsorAddress);
  const sponsorReceived = sponsorOutputs.reduce((total, output) => total + (output.assets.lovelace ?? 0n), 0n);
  if (sponsorReceived !== FUNDING_LOVELACE) throw new Error(`Sponsor received ${sponsorReceived} lovelace; expected exactly ${FUNDING_LOVELACE}.`);

  const protocolParameters = lucid.config().protocolParameters;
  if (!protocolParameters) throw new Error("Lucid did not initialize protocol parameters.");
  const artifact = {
    experiment: "fund-sponsor",
    network: "Preprod",
    senderAddress,
    sponsorAddress,
    amountLovelace: FUNDING_LOVELACE.toString(),
    amountAda: Number(FUNDING_LOVELACE) / 1_000_000,
    transactionHash: txHash,
    transactionSizeBytes,
    feeLovelace: feeLovelace.toString(),
    feeAda: Number(feeLovelace) / 1_000_000,
    inputs,
    outputs: outputs.map((output) => ({ txHash: output.txHash, outputIndex: output.outputIndex, address: output.address, assets: serializeAssets(output.assets) })),
    protocolParameters: serializeProtocolParameters(protocolParameters),
    createdAt,
    confirmedAt,
    verification: { method: "Blockfrost getTransactionStatus plus getUtxosByOutRef", status: status.status, sponsorReceivedLovelace: sponsorReceived.toString(), exactAmountMatched: true },
  };
  await mkdir(ARTIFACTS_DIR, { recursive: true });
  await writeFile(path.join(ARTIFACTS_DIR, `fund-sponsor-${txHash}.json`), JSON.stringify(artifact, null, 2), "utf8");
  console.log(`Sponsor funding confirmed. Evidence artifact: fund-sponsor-${txHash}.json`);
}

loadEnvironment();
main().catch((error: unknown) => { console.error("Sponsor funding failed."); console.error(error instanceof Error ? error.message : error); process.exit(1); });
