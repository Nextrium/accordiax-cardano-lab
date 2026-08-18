import dotenv from "dotenv";
import { Blockfrost, Lucid } from "@lucid-evolution/lucid";

dotenv.config({ path: [".env.local", ".env"] });

const projectId =
  process.env.BLOCKFROST_PREPROD_PROJECT_ID;

const seed =
  process.env.TEST_RECIPIENT_SEED;

if (!projectId) {
  throw new Error("Missing BLOCKFROST_PREPROD_PROJECT_ID");
}

if (!seed) {
  throw new Error("Missing TEST_RECIPIENT_SEED");
}

const provider =
  new Blockfrost(
    "https://cardano-preprod.blockfrost.io/api/v0",
    projectId,
  );

const lucid =
  await Lucid(
    provider,
    "Preprod",
  );

lucid.selectWallet.fromSeed(seed);

const address =
  await lucid.wallet().address();

const utxos =
  await lucid.wallet().getUtxos();

const NXTEST_UNIT =
  "a9d7a35b696278de5788199bfc8c7debcc84a991f9c155576677b3044e5854455354";

console.log("Seller address:", address);
console.log("Seller UTxOs:", utxos.length);

for (const utxo of utxos) {
  console.log(
    `\n${utxo.txHash}#${utxo.outputIndex}`,
  );

  console.log(
    "ADA:",
    utxo.assets.lovelace ?? 0n,
  );

  console.log(
    "NXTEST:",
    utxo.assets[NXTEST_UNIT] ?? 0n,
  );
}
