import dotenv from "dotenv";
import {
  Blockfrost,
  CML,
  fromText,
  Lucid,
  type Assets,
  type Script,
} from "@lucid-evolution/lucid";
import {
  Constr,
  Data,
} from "@lucid-evolution/plutus";
import {
  paymentCredentialOf,
  validatorToAddress,
} from "@lucid-evolution/utils";
import {
  mkdir,
  readdir,
  readFile,
  writeFile,
} from "node:fs/promises";
import path from "node:path";

const PREPROD_URL =
  "https://cardano-preprod.blockfrost.io/api/v0";

const BLUEPRINT_PATH =
  path.resolve(
    "accordiax-escrow",
    "plutus.json",
  );

const ARTIFACTS_DIR =
  path.resolve("artifacts");

const VALIDATOR_TITLE =
  "escrow.escrow.spend";

const NXTEST_QUANTITY =
  1_000n;

/*
 * This is deliberately a little higher than necessary so we can
 * measure the actual minimum-ADA requirement from the completed tx.
 * The script will NOT submit this transaction.
 */
const ESCROW_LOVELACE =
  3_000_000n;

const shouldSubmit =
  process.argv.includes("--submit");

type BlueprintValidator = {
  title: string;
  compiledCode: string;
  hash: string;
};

type Blueprint = {
  preamble: {
    plutusVersion: string;
    compiler: {
      name: string;
      version: string;
    };
  };
  validators: BlueprintValidator[];
};

type MintArtifact = {
  network: string;
  assetUnit: string;
  policyId: string;
  assetName: string;
};

function loadEnvironment(): void {
  const local = dotenv.config({
    path: ".env.local",
  });

  if (local.error) {
    dotenv.config({
      path: ".env",
    });
  }
}

function requireEnv(
  name: string,
): string {
  const value =
    process.env[name];

  if (!value?.trim()) {
    throw new Error(
      `Missing environment variable: ${name}`,
    );
  }

  return value.trim();
}

async function loadValidator(): Promise<{
  script: Script;
  address: string;
  hash: string;
}> {
  const blueprint =
    JSON.parse(
      await readFile(
        BLUEPRINT_PATH,
        "utf8",
      ),
    ) as Blueprint;

  if (
    blueprint.preamble
      .plutusVersion !== "v3"
  ) {
    throw new Error(
      `Expected Plutus V3, found ${blueprint.preamble.plutusVersion}.`,
    );
  }

  const validator =
    blueprint.validators.find(
      (entry) =>
        entry.title ===
        VALIDATOR_TITLE,
    );

  if (!validator) {
    throw new Error(
      `Validator '${VALIDATOR_TITLE}' not found in plutus.json.`,
    );
  }

  const script: Script = {
    type: "PlutusV3",
    script:
      validator.compiledCode,
  };

  if (
    validator.hash !==
    "f121ef842fcc415e58a1bc49c089856cf9b1e206b8039cf24bce6bb0"
  ) {
    throw new Error(
      "Compiled escrow validator hash does not match the validated blueprint hash.",
    );
  }

  const address =
    validatorToAddress(
      "Preprod",
      script,
    );

  return {
    script,
    address,
    hash: validator.hash,
  };
}

async function loadLatestMint(): Promise<MintArtifact> {
  const files =
    await readdir(
      ARTIFACTS_DIR,
    );

  const mintFiles =
    files
      .filter(
        (file) =>
          file.startsWith(
            "native-asset-mint-",
          ) &&
          file.endsWith(".json"),
      )
      .sort();

  const file =
    mintFiles.at(-1);

  if (!file) {
    throw new Error(
      "No native-asset mint artifact found.",
    );
  }

  return JSON.parse(
    await readFile(
      path.join(
        ARTIFACTS_DIR,
        file,
      ),
      "utf8",
    ),
  ) as MintArtifact;
}

function addressToPaymentKeyHash(
  address: string,
): string {
  /*
   * This helper intentionally avoids introducing another wallet API.
   * The datum fields must contain the 28-byte payment key hashes.
   *
   * We derive these from Lucid's wallet addresses below using
   * paymentCredentialOf.
   */
  throw new Error(
    "unreachable",
  );
}

async function main(): Promise<void> {
  loadEnvironment();

  const projectId =
    requireEnv(
      "BLOCKFROST_PREPROD_PROJECT_ID",
    );

  const senderSeed =
    requireEnv(
      "TEST_SENDER_SEED",
    );

  const buyerSeed =
    senderSeed;

  const sellerSeed =
    requireEnv(
      "TEST_RECIPIENT_SEED",
    );

  const lucid =
    await Lucid(
      new Blockfrost(
        PREPROD_URL,
        projectId,
      ),
      "Preprod",
    );

  lucid.selectWallet.fromSeed(
    senderSeed,
  );

  const buyerAddress =
    await lucid.wallet().address();

  const sellerLucid =
    await Lucid(
      new Blockfrost(
        PREPROD_URL,
        projectId,
      ),
      "Preprod",
    );

  sellerLucid.selectWallet.fromSeed(
    sellerSeed,
  );

  const sellerAddress =
    await sellerLucid.wallet().address();

  const {
    script,
    address: escrowAddress,
    hash: scriptHash,
  } =
    await loadValidator();

  const mint =
    await loadLatestMint();

  console.log(
    "\n=== ACCORDIAX ESCROW FUNDING ===",
  );

  console.log(
    `Escrow validator hash: ${scriptHash}`,
  );

  console.log(
    `Escrow script address: ${escrowAddress}`,
  );

  console.log(
    `Buyer address:          ${buyerAddress}`,
  );

  console.log(
    `Seller address:         ${sellerAddress}`,
  );

  console.log(
    `NXTEST asset unit:      ${mint.assetUnit}`,
  );

  console.log(
    `NXTEST quantity:        ${NXTEST_QUANTITY}`,
  );

  /*
   * Aiken EscrowDatum:
   *
   * constructor index 0
   * [
   *   buyer verification key hash,
   *   seller verification key hash,
   *   policy id,
   *   asset name,
   *   quantity
   * ]
   *
   * All hashes are encoded as Plutus bytestrings.
   */
  const buyerCredential =
  paymentCredentialOf(
    buyerAddress,
  );

const sellerCredential =
  paymentCredentialOf(
    sellerAddress,
  );

  if (
    buyerCredential.type !==
      "Key" ||
    sellerCredential.type !==
      "Key"
  ) {
    throw new Error(
      "Buyer and seller must have key payment credentials for this experiment.",
    );
  }

  const buyerKeyHash =
    buyerCredential.hash;

  const sellerKeyHash =
    sellerCredential.hash;

  const policyId =
  mint.policyId;

const assetName =
  fromText(mint.assetName);

  const datumData =
  new Constr(0, [
    buyerKeyHash,
    sellerKeyHash,
    policyId,
    assetName,
    NXTEST_QUANTITY,
  ]);

  const datumCbor =
    Data.to(
      datumData,
    );

  console.log(
    `Datum CBOR: ${datumCbor}`,
  );

  const userUtxos =
    await lucid.wallet().getUtxos();

  const escrowInput =
    userUtxos.find(
      (utxo) =>
        (utxo.assets[
          mint.assetUnit
        ] ?? 0n) >=
        NXTEST_QUANTITY,
    );

  if (!escrowInput) {
    throw new Error(
      "No sender UTxO contains enough NXTEST.",
    );
  }

  console.log(
    `\nFunding input: ${escrowInput.txHash}#${escrowInput.outputIndex}`,
  );

  console.log(
    `Input ADA: ${
      Number(
        escrowInput.assets.lovelace ??
          0n,
      ) / 1_000_000
    } ADA`,
  );

  console.log(
    `Input NXTEST: ${
      escrowInput.assets[
        mint.assetUnit
      ] ?? 0n
    }`,
  );

  const escrowAssets:
    Assets = {
      lovelace:
        ESCROW_LOVELACE,
      [mint.assetUnit]:
        NXTEST_QUANTITY,
    };

  console.log(
    "\nBuilding escrow funding transaction...",
  );

  const tx =
    await lucid
      .newTx()
      .collectFrom([
        escrowInput,
      ])
      .pay.ToContract(
        escrowAddress,
        {
          kind: "inline",
          value:
            datumCbor,
        },
        escrowAssets,
        undefined,
      )
      .complete({
        coinSelection: false,
      });

  const transaction =
    tx.toTransaction();

  const actualOutputs =
  inspectTransactionOutputs(
    transaction,
    mint.assetUnit,
  );

const inputLovelace =
  escrowInput.assets.lovelace ??
  0n;

const inputAssetQuantity =
  escrowInput.assets[
    mint.assetUnit
  ] ??
  0n;

const outputLovelace =
  actualOutputs.reduce(
    (total, output) =>
      total +
      BigInt(
        output.lovelace,
      ),
    0n,
  );

const outputAssetQuantity =
  actualOutputs.reduce(
    (total, output) =>
      total +
      BigInt(
        output.assetQuantity,
      ),
    0n,
  );

const feeLovelace =
  transaction
    .body()
    .fee();

if (
  inputAssetQuantity !==
  outputAssetQuantity
) {
  throw new Error(
    [
      "NXTEST conservation failed.",
      `Input:  ${inputAssetQuantity}`,
      `Output: ${outputAssetQuantity}`,
    ].join("\n"),
  );
}

if (
  inputLovelace !==
  outputLovelace +
    feeLovelace
) {
  throw new Error(
    [
      "Lovelace conservation failed.",
      `Input:  ${inputLovelace}`,
      `Output: ${outputLovelace}`,
      `Fee:    ${feeLovelace}`,
    ].join("\n"),
  );
}

const escrowOutputs =
  actualOutputs.filter(
    (output) =>
      output.address ===
      escrowAddress,
  );

if (
  escrowOutputs.length !== 1
) {
  throw new Error(
    `Expected exactly one escrow output, found ${escrowOutputs.length}.`,
  );
}

const escrowOutputActual =
  escrowOutputs[0];

if (!escrowOutputActual) {
  throw new Error(
    "Escrow output lookup unexpectedly returned no output.",
  );
}

if (
  BigInt(
    escrowOutputActual.lovelace,
  ) !==
  ESCROW_LOVELACE
) {
  throw new Error(
    `Escrow ADA output mismatch: expected ${ESCROW_LOVELACE}, found ${escrowOutputActual.lovelace}.`,
  );
}

if (
  BigInt(
    escrowOutputActual.assetQuantity,
  ) !==
  NXTEST_QUANTITY
) {
  throw new Error(
    `Escrow NXTEST output mismatch: expected ${NXTEST_QUANTITY}, found ${escrowOutputActual.assetQuantity}.`,
  );
}

console.log(
  "\n=== OUTPUT ACCOUNTING ===",
);

for (
  const output of actualOutputs
) {
  console.log(
    `Output #${output.outputIndex}: ${output.address}`,
  );

  console.log(
    `  ADA: ${output.lovelace} lovelace`,
  );

  console.log(
    `  NXTEST: ${output.assetQuantity}`,
  );
}

console.log(
  `\nNXTEST: ${inputAssetQuantity} in = ${outputAssetQuantity} out`,
);

console.log(
  `ADA: ${inputLovelace} in = ${outputLovelace} out + ${feeLovelace} fee`,
);

console.log(
  "Balance checks: PASS",
);  

  const transactionSizeBytes =
    transaction
      .to_cbor_bytes()
      .length;

  console.log(
    "\n=== ESCROW FUNDING METRICS ===",
  );

  console.log(
    `Transaction size: ${transactionSizeBytes} bytes`,
  );

  console.log(
    `Fee: ${feeLovelace} lovelace`,
  );

  console.log(
    `Fee: ${
      Number(
        feeLovelace,
      ) / 1_000_000
    } ADA`,
  );

  console.log(
    `Escrow output ADA: ${
      Number(
        ESCROW_LOVELACE,
      ) / 1_000_000
    } ADA`,
  );

  const protocolParameters =
    lucid.config()
      .protocolParameters;

  if (!protocolParameters) {
    throw new Error(
      "Lucid did not initialize protocol parameters.",
    );
  }

  let transactionHash:
  | string
  | undefined;

let confirmedAt:
  | string
  | undefined;

if (shouldSubmit) {
  console.log(
    "\nSigning escrow funding transaction...",
  );

  const signed =
    await tx
      .sign
      .withWallet()
      .complete();

  console.log(
    "Submitting escrow funding transaction...",
  );

  transactionHash =
    await signed.submit();

  console.log(
    `Transaction ID: ${transactionHash}`,
  );

  console.log(
    "Waiting for confirmation...",
  );

  await lucid.awaitTx(
    transactionHash,
  );

  confirmedAt =
    new Date().toISOString();

  console.log(
    "Escrow funding transaction confirmed.",
  );
} else {
  console.log(
    "\nPrepared escrow funding transaction; NOT signed or submitted.",
  );
}

  await mkdir(
    ARTIFACTS_DIR,
    {
      recursive: true,
    },
  );

  const artifact = {
    experiment:
      "escrow-funding",

    status:
      "dry-run",

    network:
      "Preprod",

    validator: {
      title:
        VALIDATOR_TITLE,
      scriptType:
        script.type,
      scriptHash,
      address:
        escrowAddress,
    },

    parties: {
      buyerAddress,
      sellerAddress,
      buyerPaymentKeyHash:
        buyerKeyHash,
      sellerPaymentKeyHash:
        sellerKeyHash,
    },

    asset: {
      policyId,
      assetName,
      assetUnit:
        mint.assetUnit,
      quantity:
        NXTEST_QUANTITY.toString(),
    },

    datum: {
      constructorIndex:
        0,
      buyer:
        buyerKeyHash,
      seller:
        sellerKeyHash,
      policyId,
      assetName,
      quantity:
        NXTEST_QUANTITY.toString(),
      cbor:
        datumCbor,
    },

    input: {
      txHash:
        escrowInput.txHash,
      outputIndex:
        escrowInput.outputIndex,
      address:
        escrowInput.address,
      assets:
        Object.fromEntries(
          Object.entries(
            escrowInput.assets,
          ).map(
            ([
              unit,
              quantity,
            ]) => [
              unit,
              quantity.toString(),
            ],
          ),
        ),
    },

    escrowOutput: {
      address:
        escrowAddress,
      assets:
        Object.fromEntries(
          Object.entries(
            escrowAssets,
          ).map(
            ([
              unit,
              quantity,
            ]) => [
              unit,
              quantity.toString(),
            ],
          ),
        ),
      datumCbor,
    },

    actualOutputs,

balanceEquation: {
  lovelace: {
    inputs:
      inputLovelace.toString(),
    outputs:
      outputLovelace.toString(),
    fee:
      feeLovelace.toString(),
    balanced:
      inputLovelace ===
      outputLovelace +
        feeLovelace,
  },

  [mint.assetUnit]: {
    inputs:
      inputAssetQuantity.toString(),
    outputs:
      outputAssetQuantity.toString(),
    balanced:
      inputAssetQuantity ===
      outputAssetQuantity,
  },
},

    transactionHash:
      transactionHash,

    transactionSizeBytes,

    feeLovelace:
      feeLovelace.toString(),

    feeAda:
      Number(
        feeLovelace,
      ) / 1_000_000,

    protocolParameters,

    submission:
      shouldSubmit,
    confirmedAt,
    createdAt:
      new Date().toISOString(),
  };

  const artifactPath =
  path.join(
    ARTIFACTS_DIR,
    transactionHash
      ? `escrow-funding-${transactionHash}.json`
      : "escrow-funding-pending.json",
  );

  await writeFile(
    artifactPath,
    JSON.stringify(
      artifact,
      (_, value) =>
        typeof value ===
        "bigint"
          ? value.toString()
          : value,
      2,
    ),
    "utf8",
  );

  console.log(
    `\nEvidence artifact: ${artifactPath}`,
  );

  console.log(
    "\nPrepared escrow funding transaction; NOT signed or submitted.",
  );
}

function inspectTransactionOutputs(
  transaction: CML.Transaction,
  assetUnit: string,
) {
  const outputs =
    transaction.body().outputs();

  const result: Array<{
    outputIndex: number;
    address: string;
    lovelace: string;
    assetQuantity: string;
  }> = [];

  const [policyIdHex, assetNameHex] =
    [
      assetUnit.slice(0, 56),
      assetUnit.slice(56),
    ];

  const policyId =
    CML.ScriptHash.from_hex(
      policyIdHex,
    );

  const assetName =
    CML.AssetName.from_hex(
      assetNameHex,
    );

  for (
    let index = 0;
    index < outputs.len();
    index += 1
  ) {
    const output =
      outputs.get(index);

    const address =
      output
        .address()
        .to_bech32();

    const value =
      output.amount();

    let assetQuantity = 0n;

    if (
      value.has_multiassets()
    ) {
      assetQuantity =
        value
          .multi_asset()
          .get(
            policyId,
            assetName,
          ) ??
        0n;
    }

    result.push({
      outputIndex: index,
      address,
      lovelace:
        value
          .coin()
          .toString(),
      assetQuantity:
        assetQuantity.toString(),
    });
  }

  return result;
}


main().catch(
  (error: unknown) => {
    console.error(
      "\nEscrow funding experiment failed.",
    );

    console.error(
      error instanceof Error
        ? error.message
        : error,
    );

    process.exit(1);
  },
);