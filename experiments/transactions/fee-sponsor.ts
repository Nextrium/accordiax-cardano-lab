import dotenv from "dotenv";
import {
  Blockfrost,
  Lucid,
  type Assets,
  type Provider,
  type UTxO,
} from "@lucid-evolution/lucid";
import { createHash } from "node:crypto";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const URL = "https://cardano-preprod.blockfrost.io/api/v0";
const ARTIFACTS = path.resolve("artifacts");
const QUANTITY = 1_000n;
const OUTPUT_LOVELACE = 2_000_000n;

type MintArtifact = { network: string; policyId: string; assetName: string; assetUnit: string };

function loadEnvironment(): void {
  const local = dotenv.config({ path: ".env.local" });
  if (local.error) dotenv.config({ path: ".env" });
}

function env(name: string): string {
  const value = process.env[name];
  if (!value?.trim()) throw new Error(`Missing environment variable: ${name}`);
  return value.trim();
}

function assetsJson(assets: Assets): Record<string, string> {
  return Object.fromEntries(Object.entries(assets).map(([unit, value]) => [unit, value.toString()]));
}

async function latestMint(): Promise<MintArtifact> {
  const files = (await readdir(ARTIFACTS)).filter((file) => file.startsWith("native-asset-mint-") && file.endsWith(".json")).sort();
  const file = files.at(-1);
  if (!file) throw new Error("No native-asset mint artifact found.");
  return JSON.parse(await readFile(path.join(ARTIFACTS, file), "utf8")) as MintArtifact;
}

async function outputs(provider: Provider, txHash: string): Promise<UTxO[]> {
  const result: UTxO[] = [];
  for (let index = 0; index < 10; index += 1) {
    try { result.push(...await provider.getUtxosByOutRef([{ txHash, outputIndex: index }])); } catch { /* no output at this index */ }
  }
  return result;
}

function digest(value: string): string {
  return createHash("sha256").update(value, "hex").digest("hex");
}

async function verify(): Promise<void> {
  loadEnvironment();
  const hash = env("STEP7_TRANSACTION_HASH");
  const provider = new Blockfrost(URL, env("BLOCKFROST_PREPROD_PROJECT_ID"));
  const mint = await latestMint();
  const recipientLucid = await Lucid(provider, "Preprod");
  recipientLucid.selectWallet.fromSeed(env("TEST_RECIPIENT_SEED"));
  const recipient = await recipientLucid.wallet().address();
  const status = await provider.getTransactionStatus(hash);
  if (status.status !== "confirmed") throw new Error(`Transaction is ${status.status}, not confirmed.`);
  const txOutputs = await outputs(provider, hash);
  const matching = txOutputs.filter((output) => output.address === recipient && (output.assets[mint.assetUnit] ?? 0n) > 0n);
  const received = matching.reduce((total, output) => total + (output.assets[mint.assetUnit] ?? 0n), 0n);
  if (received !== QUANTITY) throw new Error(`Expected exactly ${QUANTITY} NXTEST, found ${received}.`);
  await mkdir(ARTIFACTS, { recursive: true });
  await writeFile(path.join(ARTIFACTS, `fee-sponsor-verification-${hash}.json`), JSON.stringify({
    experiment: "fee-sponsor-verification", network: "Preprod", transactionHash: hash, status: status.status,
    recipient, assetUnit: mint.assetUnit, expectedQuantity: QUANTITY.toString(), receivedQuantity: received.toString(),
    outputs: txOutputs.map((output) => ({ txHash: output.txHash, outputIndex: output.outputIndex, address: output.address, assets: assetsJson(output.assets) })),
    verificationMethod: "Blockfrost getTransactionStatus plus getUtxosByOutRef", verifiedAt: new Date().toISOString(),
  }, null, 2), "utf8");
}

async function main(): Promise<void> {
  loadEnvironment();
  const provider = new Blockfrost(URL, env("BLOCKFROST_PREPROD_PROJECT_ID"));
  const mint = await latestMint();
  const user = await Lucid(provider, "Preprod");
  user.selectWallet.fromSeed(env("TEST_SENDER_SEED"));
  const sponsor = await Lucid(provider, "Preprod");
  sponsor.selectWallet.fromSeed(env("TEST_SPONSOR_SEED"));
  const recipientLucid = await Lucid(provider, "Preprod");
  recipientLucid.selectWallet.fromSeed(env("TEST_RECIPIENT_SEED"));
  const userAddress = await user.wallet().address();
  const sponsorAddress = await sponsor.wallet().address();
  const recipient = await recipientLucid.wallet().address();
  const userUtxos = await user.wallet().getUtxos();
  const sponsorUtxos = await sponsor.wallet().getUtxos();
  const userInput = userUtxos.find((utxo) => (utxo.assets[mint.assetUnit] ?? 0n) >= QUANTITY);
  const sponsorInput = sponsorUtxos.find((utxo) => Object.keys(utxo.assets).every((unit) => unit === "lovelace") && (utxo.assets.lovelace ?? 0n) >= OUTPUT_LOVELACE + 1_000_000n);
  if (!userInput) throw new Error("No user UTxO contains enough NXTEST.");
  if (!sponsorInput) throw new Error("No sponsor ADA-only UTxO has enough ADA.");
  const tx = await user.newTx().collectFrom([userInput, sponsorInput]).pay.ToAddress(recipient, { [mint.assetUnit]: QUANTITY, lovelace: OUTPUT_LOVELACE }).complete();
  const feeLovelace = tx.toTransaction().body().fee();
  const inputLovelace = (userInput.assets.lovelace ?? 0n) + (sponsorInput.assets.lovelace ?? 0n);
  if (inputLovelace < OUTPUT_LOVELACE + feeLovelace) throw new Error("Selected user and sponsor inputs do not cover the output and fee.");
  const userWitness = await tx.partialSign.withWallet();
  const sponsorTx = sponsor.fromTx(tx.toCBOR());
  const sponsorWitness = await sponsorTx.partialSign.withWallet();
  const assembled = sponsorTx.assemble([userWitness, sponsorWitness]);
  const signed = await assembled.complete();
  const signedCbor = signed.toCBOR();
  let transactionHash: string | undefined;
  let confirmedAt: string | undefined;
  if (process.argv.includes("--submit")) {
    transactionHash = await signed.submit();
    await user.awaitTxConfirmation(transactionHash, { checkInterval: 3_000, timeout: 120_000, minimumConfirmations: 1 });
    confirmedAt = new Date().toISOString();
  }

  const artifact = {
    experiment: "fee-sponsor", network: "Preprod", userAddress, sponsorAddress, recipient,
    userInput: { txHash: userInput.txHash, outputIndex: userInput.outputIndex, address: userInput.address, assets: assetsJson(userInput.assets) },
    sponsorInput: { txHash: sponsorInput.txHash, outputIndex: sponsorInput.outputIndex, address: sponsorInput.address, assets: assetsJson(sponsorInput.assets) },
    outputs: signed.toJSON(), transactionSizeBytes: signedCbor.length / 2, feeLovelace: feeLovelace.toString(),
    feeAda: Number(feeLovelace) / 1_000_000, assetUnit: mint.assetUnit, assetQuantity: QUANTITY.toString(),
    inputLovelace: inputLovelace.toString(),
    signatures: { userWitnessSha256: digest(userWitness), sponsorWitnessSha256: digest(sponsorWitness), userWitnessHexLength: userWitness.length, sponsorWitnessHexLength: sponsorWitness.length, bothPresent: userWitness.length > 0 && sponsorWitness.length > 0 },
    protocolParameters: user.config().protocolParameters, transactionHash, submitted: transactionHash !== undefined, confirmedAt, createdAt: new Date().toISOString(),
  };
  await mkdir(ARTIFACTS, { recursive: true });
  await writeFile(path.join(ARTIFACTS, "fee-sponsor-pending.json"), JSON.stringify(artifact, (_, value) => typeof value === "bigint" ? value.toString() : value, 2), "utf8");
  console.log(transactionHash ? `Submitted and confirmed: ${transactionHash}` : "Prepared two-signature transaction evidence; not submitted.");
}

loadEnvironment();
(process.argv.includes("--verify") ? verify : main)().catch((error: unknown) => { console.error(error); process.exit(1); });
