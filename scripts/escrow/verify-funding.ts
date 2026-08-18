import dotenv from "dotenv";
import {
  Blockfrost,
  CML,
  type Provider,
  type UTxO,
} from "@lucid-evolution/lucid";
import {
  mkdir,
  readFile,
  writeFile,
} from "node:fs/promises";
import path from "node:path";

const PREPROD_URL =
  "https://cardano-preprod.blockfrost.io/api/v0";

const ARTIFACTS_DIR =
  path.resolve("artifacts");

const FUNDING_TX_HASH =
  "1c5f64b6ebea6b5a79eb6eab4dcc9ba84ce288a6e31418e4b46ec8b5c80d3cdd";

const EXPECTED_SCRIPT_ADDRESS =
  "addr_test1wrcjrmuy9lxyzhjc5x7ynsyfs4k0nv0zq6uq888jf08xhvqra7rf6";

const EXPECTED_ASSET_UNIT =
  "a9d7a35b696278de5788199bfc8c7debcc84a991f9c155576677b3044e5854455354";

const EXPECTED_NXTEST =
  1_000n;

const EXPECTED_LOVELACE =
  3_000_000n;

type BlockfrostCborResponse = {
  cbor: string;
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

function requireEnv(name: string): string {
  const value =
    process.env[name];

  if (!value?.trim()) {
    throw new Error(
      `Missing environment variable: ${name}`,
    );
  }

  return value.trim();
}

function serializeAssets(
  assets: Record<string, bigint>,
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

async function blockfrostGet<T>(
  provider: Provider,
  pathName: string,
): Promise<T> {
  /*
   * Provider.getUtxosByOutRef is useful for UTxOs, but raw
   * transaction CBOR is not exposed by the Lucid provider API
   * in the shape needed here, so use the configured Blockfrost
   * endpoint directly.
   */
  const projectId =
    requireEnv(
      "BLOCKFROST_PREPROD_PROJECT_ID",
    );

  const response =
    await fetch(
      `${PREPROD_URL}${pathName}`,
      {
        headers: {
          project_id:
            projectId,
        },
      },
    );

  if (!response.ok) {
    throw new Error(
      `Blockfrost request failed: ${response.status} ${response.statusText} for ${pathName}`,
    );
  }

  return await response.json() as T;
}

async function confirmedOutputs(
  provider: Provider,
): Promise<UTxO[]> {
  const outputs: UTxO[] = [];

  for (
    let outputIndex = 0;
    outputIndex < 10;
    outputIndex += 1
  ) {
    try {
      outputs.push(
        ...await provider.getUtxosByOutRef([
          {
            txHash:
              FUNDING_TX_HASH,
            outputIndex,
          },
        ]),
      );
    } catch {
      // Ignore output indexes that do not exist
      // or are no longer unspent.
    }
  }

  return outputs;
}

async function main(): Promise<void> {
  loadEnvironment();

  const provider =
    new Blockfrost(
      PREPROD_URL,
      requireEnv(
        "BLOCKFROST_PREPROD_PROJECT_ID",
      ),
    );

  console.log(
    "\n=== ACCORDIAX ESCROW FUNDING VERIFICATION ===",
  );

  console.log(
    `Transaction: ${FUNDING_TX_HASH}`,
  );

  const status =
    await provider.getTransactionStatus(
      FUNDING_TX_HASH,
    );

  if (
    status.status !==
    "confirmed"
  ) {
    throw new Error(
      `Transaction is ${status.status}, not confirmed.`,
    );
  }

  console.log(
    "Transaction status: confirmed",
  );

  /*
   * Query confirmed UTxOs and raw transaction CBOR independently.
   */
  const [
    outputs,
    cborResponse,
  ] = await Promise.all([
    confirmedOutputs(
      provider,
    ),
    blockfrostGet<BlockfrostCborResponse>(
      provider,
      `/txs/${FUNDING_TX_HASH}/cbor`,
    ),
  ]);

  const scriptOutputs =
    outputs.filter(
      (output) =>
        output.address ===
        EXPECTED_SCRIPT_ADDRESS,
    );

  if (
    scriptOutputs.length !== 1
  ) {
    throw new Error(
      `Expected exactly one unspent escrow output at the expected script address; found ${scriptOutputs.length}.`,
    );
  }

  const escrowOutput =
    scriptOutputs[0];

  if (!escrowOutput) {
    throw new Error(
      "Escrow output lookup unexpectedly returned no output.",
    );
  }

  const lovelace =
    escrowOutput.assets.lovelace ??
    0n;

  const nxTest =
    escrowOutput.assets[
      EXPECTED_ASSET_UNIT
    ] ??
    0n;

  console.log(
    `Escrow output: ${escrowOutput.txHash}#${escrowOutput.outputIndex}`,
  );

  console.log(
    `Escrow ADA: ${lovelace} lovelace`,
  );

  console.log(
    `Escrow NXTEST: ${nxTest}`,
  );

  if (
    lovelace !==
    EXPECTED_LOVELACE
  ) {
    throw new Error(
      `Escrow ADA mismatch. Expected ${EXPECTED_LOVELACE}, found ${lovelace}.`,
    );
  }

  if (
    nxTest !==
    EXPECTED_NXTEST
  ) {
    throw new Error(
      `Escrow NXTEST mismatch. Expected ${EXPECTED_NXTEST}, found ${nxTest}.`,
    );
  }

  /*
   * Decode the actual confirmed transaction from Blockfrost CBOR.
   */
  const chainTransaction =
    CML.Transaction.from_cbor_hex(
      cborResponse.cbor,
    );

  const transactionOutputs =
    chainTransaction
      .body()
      .outputs();

  if (
    escrowOutput.outputIndex >=
    transactionOutputs.len()
  ) {
    throw new Error(
      `Escrow output index ${escrowOutput.outputIndex} is outside the confirmed transaction output list.`,
    );
  }

  const onChainOutput =
    transactionOutputs.get(
      escrowOutput.outputIndex,
    );

  const datumOption =
  onChainOutput.datum();

  if (!datumOption) {
    throw new Error(
      "Confirmed escrow output has no datum option.",
    );
  }

  const onChainDatum =
    datumOption.as_datum();

  if (!onChainDatum) {
    throw new Error(
      "Confirmed escrow output datum option does not contain inline datum data.",
    );
  }

  const actualDatumCbor =
    onChainDatum.to_cbor_hex();

  /*
   * Load the expected datum from the locally generated funding
   * artifact. The actual value we compare against comes directly
   * from the confirmed transaction CBOR.
   */
  const pendingArtifactPath =
    path.join(
      ARTIFACTS_DIR,
      "escrow-funding-pending.json",
    );

  const pendingArtifact =
    JSON.parse(
      await readFile(
        pendingArtifactPath,
        "utf8",
      ),
    ) as {
      validator: {
        scriptHash: string;
        address: string;
      };
      datum: {
        cbor: string;
      };
      asset: {
        assetUnit: string;
        quantity: string;
      };
      transactionSizeBytes: number;
      feeLovelace: string;
    };

  if (
    pendingArtifact.validator.address !==
    EXPECTED_SCRIPT_ADDRESS
  ) {
    throw new Error(
      "Pending artifact script address does not match the expected escrow address.",
    );
  }

  if (
    pendingArtifact.asset.assetUnit !==
    EXPECTED_ASSET_UNIT
  ) {
    throw new Error(
      "Pending artifact asset unit does not match the expected NXTEST asset.",
    );
  }

  if (
    pendingArtifact.asset.quantity !==
    EXPECTED_NXTEST.toString()
  ) {
    throw new Error(
      "Pending artifact NXTEST quantity does not match the expected escrow quantity.",
    );
  }

  if (
    actualDatumCbor !==
    pendingArtifact.datum.cbor
  ) {
    throw new Error(
      [
        "On-chain escrow datum CBOR does not match the expected datum.",
        `Expected: ${pendingArtifact.datum.cbor}`,
        `Actual:   ${actualDatumCbor}`,
      ].join("\n"),
    );
  }

  console.log(
    "Script address: PASS",
  );

  console.log(
    "NXTEST asset unit: PASS",
  );

  console.log(
    "Exact ADA amount: PASS",
  );

  console.log(
    "Exact NXTEST amount: PASS",
  );

  console.log(
    "Inline datum CBOR: PASS",
  );

  const artifact = {
    experiment:
      "escrow-funding-confirmed-verification",

    network:
      "Preprod",

    transactionHash:
      FUNDING_TX_HASH,

    status:
      status.status,

    confirmation:
      status.confirmation,

    escrow: {
      scriptAddress:
        EXPECTED_SCRIPT_ADDRESS,

      outputIndex:
        escrowOutput.outputIndex,

      outputTxHash:
        escrowOutput.txHash,

      lovelace:
        lovelace.toString(),

      assetUnit:
        EXPECTED_ASSET_UNIT,

      assetQuantity:
        nxTest.toString(),
    },

    outputs:
      outputs.map(
        (output) => ({
          txHash:
            output.txHash,

          outputIndex:
            output.outputIndex,

          address:
            output.address,

          assets:
            serializeAssets(
              output.assets,
            ),
        }),
      ),

    expected: {
      lovelace:
        EXPECTED_LOVELACE.toString(),

      assetUnit:
        EXPECTED_ASSET_UNIT,

      assetQuantity:
        EXPECTED_NXTEST.toString(),
    },

    datum: {
      expectedCbor:
        pendingArtifact.datum.cbor,

      actualOnChainCbor:
        actualDatumCbor,

      directOnChainVerification:
        true,

      matched:
        actualDatumCbor ===
        pendingArtifact.datum.cbor,

      source:
        "/txs/{hash}/cbor decoded with @lucid-evolution/lucid CML",
    },

    verification: {
      method:
        "Blockfrost getTransactionStatus plus getUtxosByOutRef plus /txs/{hash}/cbor",

      confirmed:
        true,

      scriptAddressMatched:
        true,

      exactAdaMatched:
        true,

      exactNXTESTMatched:
        true,

      inlineDatumMatched:
        true,

      transactionSizeBytes:
        pendingArtifact.transactionSizeBytes,

      feeLovelace:
        pendingArtifact.feeLovelace,
    },

    verifiedAt:
      new Date().toISOString(),
  };

  await mkdir(
    ARTIFACTS_DIR,
    {
      recursive: true,
    },
  );

  const artifactPath =
    path.join(
      ARTIFACTS_DIR,
      `escrow-funding-confirmed-${FUNDING_TX_HASH}.json`,
    );

  await writeFile(
    artifactPath,
    JSON.stringify(
      artifact,
      null,
      2,
    ),
    "utf8",
  );

  console.log(
    "\nEscrow funding verification: PASS",
  );

  console.log(
    `Evidence artifact: ${artifactPath}`,
  );
}

loadEnvironment();

main().catch(
  (error: unknown) => {
    console.error(
      "\nEscrow funding verification failed.",
    );

    console.error(
      error instanceof Error
        ? error.message
        : error,
    );

    process.exit(1);
  },
);