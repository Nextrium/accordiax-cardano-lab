import dotenv from "dotenv";
import {
  Blockfrost,
  CML,
  Lucid,
  type Assets,
  type Script,
  type UTxO,
} from "@lucid-evolution/lucid";
import {
  Constr,
  Data,
} from "@lucid-evolution/plutus";
import {
  credentialToAddress,
  keyHashToCredential,
  paymentCredentialOf,
  validatorToAddress,
} from "@lucid-evolution/utils";
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

const BLUEPRINT_PATH =
  path.resolve(
    "accordiax-escrow",
    "plutus.json",
  );

const VALIDATOR_TITLE =
  "escrow.escrow.spend";

const ESCROW_TX_HASH =
  "1c5f64b6ebea6b5a79eb6eab4dcc9ba84ce288a6e31418e4b46ec8b5c80d3cdd";

const ESCROW_OUTPUT_INDEX =
  0;

const EXPECTED_SCRIPT_HASH =
  "f121ef842fcc415e58a1bc49c089856cf9b1e206b8039cf24bce6bb0";

const EXPECTED_SCRIPT_ADDRESS =
  "addr_test1wrcjrmuy9lxyzhjc5x7ynsyfs4k0nv0zq6uq888jf08xhvqra7rf6";

const NXTEST_UNIT =
  "a9d7a35b696278de5788199bfc8c7debcc84a991f9c155576677b3044e5854455354";

const RELEASE_QUANTITY =
  1_000n;

const RELEASE_SEED_ENV =
  "TEST_RECIPIENT_SEED";

const shouldSubmit =
  process.argv.includes(
    "--submit",
  );

type BlueprintValidator = {
  title: string;
  compiledCode: string;
  hash: string;
};

type Blueprint = {
  preamble: {
    plutusVersion: string;
  };
  validators: BlueprintValidator[];
};

type InspectedOutput = {
  outputIndex: number;
  address: string;
  lovelace: bigint;
  assetQuantity: bigint;
};

type ResolvedTransactionInput = {
  txHash: string;
  outputIndex: number;
  address: string;
  assets: Assets;
};

function loadEnvironment(): void {
  const local =
    dotenv.config({
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
      .plutusVersion !==
    "v3"
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
      `Validator '${VALIDATOR_TITLE}' was not found.`,
    );
  }

  if (
    validator.hash !==
    EXPECTED_SCRIPT_HASH
  ) {
    throw new Error(
      [
        "Validator hash mismatch.",
        `Expected: ${EXPECTED_SCRIPT_HASH}`,
        `Found:    ${validator.hash}`,
      ].join("\n"),
    );
  }

  const script: Script = {
    type: "PlutusV3",
    script:
      validator.compiledCode,
  };

  const address =
    validatorToAddress(
      "Preprod",
      script,
    );

  if (
    address !==
    EXPECTED_SCRIPT_ADDRESS
  ) {
    throw new Error(
      "Derived escrow script address does not match the confirmed funding address.",
    );
  }

  return {
    script,
    address,
    hash:
      validator.hash,
  };
}

function serializeAssets(
  assets: Assets,
): Record<string, string> {
  return Object.fromEntries(
    Object.entries(
      assets,
    ).map(
      ([
        unit,
        quantity,
      ]) => [
        unit,
        quantity.toString(),
      ],
    ),
  );
}

function inspectOutputs(
  transaction: CML.Transaction,
): InspectedOutput[] {
  const outputs =
    transaction
      .body()
      .outputs();

  const result:
    InspectedOutput[] = [];

  const policyId =
    CML.ScriptHash.from_hex(
      NXTEST_UNIT.slice(
        0,
        56,
      ),
    );

  const assetName =
    CML.AssetName.from_hex(
      NXTEST_UNIT.slice(
        56,
      ),
    );

  for (
    let index = 0;
    index < outputs.len();
    index += 1
  ) {
    const output =
      outputs.get(index);

    const value =
      output.amount();

    const assetQuantity =
      value.has_multiassets()
        ? (
            value
              .multi_asset()
              .get(
                policyId,
                assetName,
              ) ??
            0n
          )
        : 0n;

    result.push({
      outputIndex:
        index,
      address:
        output
          .address()
          .to_bech32(),
      lovelace:
        value.coin(),
      assetQuantity,
    });
  }

  return result;
}

async function getConfirmedEscrowUtxo(
  provider: Blockfrost,
): Promise<UTxO> {
  const status =
    await provider.getTransactionStatus(
      ESCROW_TX_HASH,
    );

  if (
    status.status !==
    "confirmed"
  ) {
    throw new Error(
      `Escrow funding transaction is ${status.status}, not confirmed.`,
    );
  }

  const utxos =
    await provider.getUtxosByOutRef([
      {
        txHash:
          ESCROW_TX_HASH,
        outputIndex:
          ESCROW_OUTPUT_INDEX,
      },
    ]);

  if (
    utxos.length !== 1
  ) {
    throw new Error(
      `Expected exactly one confirmed escrow UTxO; found ${utxos.length}.`,
    );
  }

  const escrowUtxo =
    utxos[0];

  if (!escrowUtxo) {
    throw new Error(
      "Confirmed escrow UTxO lookup returned no UTxO.",
    );
  }

  if (
    escrowUtxo.address !==
    EXPECTED_SCRIPT_ADDRESS
  ) {
    throw new Error(
      "Confirmed escrow UTxO address does not match the expected script address.",
    );
  }

  const nxTest =
    escrowUtxo.assets[
      NXTEST_UNIT
    ] ??
    0n;

  if (
    nxTest !==
    RELEASE_QUANTITY
  ) {
    throw new Error(
      `Confirmed escrow UTxO contains ${nxTest} NXTEST; expected ${RELEASE_QUANTITY}.`,
    );
  }

  return escrowUtxo;
}

async function resolveTransactionInputs(
  transaction: CML.Transaction,
  provider: Blockfrost,
): Promise<
  ResolvedTransactionInput[]
> {
  const inputs =
    transaction
      .body()
      .inputs();

  const resolved:
    ResolvedTransactionInput[] =
      [];

  for (
    let index = 0;
    index < inputs.len();
    index += 1
  ) {
    const input =
      inputs.get(index);

    const txHash =
      input
        .transaction_id()
        .to_hex();

    const outputIndex =
      Number(
        input.index(),
      );

    const utxos =
      await provider.getUtxosByOutRef([
        {
          txHash,
          outputIndex,
        },
      ]);

    if (
      utxos.length !== 1 ||
      !utxos[0]
    ) {
      throw new Error(
        `Unable to resolve transaction input ${txHash}#${outputIndex}.`,
      );
    }

    const utxo =
      utxos[0];

    resolved.push({
      txHash,
      outputIndex,
      address:
        utxo.address,
      assets:
        utxo.assets,
    });
  }

  return resolved;
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

  const sellerSeed =
    requireEnv(
      RELEASE_SEED_ENV,
    );

  const lucid =
    await Lucid(
      provider,
      "Preprod",
    );

  lucid.selectWallet.fromSeed(
    sellerSeed,
  );

  const sellerAddress =
    await lucid.wallet().address();

  const sellerCredential =
    paymentCredentialOf(
      sellerAddress,
    );

  if (
    sellerCredential.type !==
    "Key"
  ) {
    throw new Error(
      "Seller address does not have a key payment credential.",
    );
  }

  const sellerKeyHash =
    sellerCredential.hash;

  /*
   * Current validator compatibility:
   * it constructs the beneficiary using only the seller's
   * payment verification key.
   *
   * This redesign is intentionally deferred until after
   * the current prototype milestone.
   */
  const sellerBeneficiaryAddress =
    credentialToAddress(
      "Preprod",
      keyHashToCredential(
        sellerKeyHash,
      ),
    );

  const {
    script,
    address:
      escrowAddress,
    hash:
      scriptHash,
  } =
    await loadValidator();

  const escrowUtxo =
    await getConfirmedEscrowUtxo(
      provider,
    );

  /*
   * Retrieve the seller's wallet UTxOs.
   *
   * We explicitly select a 2 ADA-only UTxO as a temporary
   * prototype funding input so Lucid does not have to guess
   * which wallet UTxO should provide the additional ADA
   * needed for fee/minimum-ADA balancing.
   */
  const sellerUtxos =
  await lucid
    .wallet()
    .getUtxos();

  console.log(
    "\n=== ACCORDIAX ESCROW RELEASE ===",
  );

  console.log(
    `Escrow input: ${ESCROW_TX_HASH}#${ESCROW_OUTPUT_INDEX}`,
  );

  console.log(
    `Escrow script: ${escrowAddress}`,
  );

  console.log(
    `Seller wallet address: ${sellerAddress}`,
  );

  console.log(
    `Seller beneficiary address: ${sellerBeneficiaryAddress}`,
  );

  console.log(
    `Seller key hash: ${sellerKeyHash}`,
  );

  console.log(
    `NXTEST to release: ${RELEASE_QUANTITY}`,
  );

  /*
   * Aiken:
   *
   * pub type EscrowRedeemer {
   *   Release
   *   Refund
   * }
   *
   * Release = constructor 0 with no fields.
   */
  const releaseRedeemer =
    Data.to(
      new Constr(
        0,
        [],
      ),
    );

  /*
   * Current validator requires the beneficiary output to carry
   * the escrow input's OutputReference as an inline datum.
   */
  const escrowOutputReferenceDatum =
    Data.to(
      new Constr(
        0,
        [
          ESCROW_TX_HASH,
          BigInt(
            ESCROW_OUTPUT_INDEX,
          ),
        ],
      ),
    );

  console.log(
    `Release redeemer: ${releaseRedeemer}`,
  );

  /*
   * Do not hardcode ADA here.
   *
   * Lucid's payment builder will calculate the required
   * minimum ADA for the native-asset output.
   */
  const sellerOutputAssets:
    Assets = {
      [NXTEST_UNIT]:
        RELEASE_QUANTITY,
    };

  console.log(
    "\nBuilding release transaction...",
  );

  const tx =
    await lucid
      .newTx()
      .collectFrom(
        [
          escrowUtxo,
        ],
        releaseRedeemer,
      )
      .attach.SpendingValidator(
        script,
      )
      .pay.ToAddressWithData(
        sellerBeneficiaryAddress,
        {
          kind: "inline",
          value:
            escrowOutputReferenceDatum,
        },
        sellerOutputAssets,
      )
      .addSigner(
        sellerAddress,
      )
      .complete({
  presetWalletInputs:
    sellerUtxos,
  setCollateral:
    2_000_000n,
});

  const transaction =
    tx.toTransaction();

  const outputs =
    inspectOutputs(
      transaction,
    );

  /*
   * Resolve every actual transaction input so accounting
   * includes the escrow input and any ordinary wallet inputs.
   */
  const resolvedInputs =
    await resolveTransactionInputs(
      transaction,
      provider,
    );

  const inputLovelace =
    resolvedInputs.reduce(
      (
        total,
        input,
      ) =>
        total +
        (
          input.assets.lovelace ??
          0n
        ),
      0n,
    );

  const inputNXTEST =
    resolvedInputs.reduce(
      (
        total,
        input,
      ) =>
        total +
        (
          input.assets[
            NXTEST_UNIT
          ] ??
          0n
        ),
      0n,
    );

  const outputLovelace =
    outputs.reduce(
      (
        total,
        output,
      ) =>
        total +
        output.lovelace,
      0n,
    );

  const outputNXTEST =
    outputs.reduce(
      (
        total,
        output,
      ) =>
        total +
        output.assetQuantity,
      0n,
    );

  const feeLovelace =
    transaction
      .body()
      .fee();

  if (
    inputNXTEST !==
    outputNXTEST
  ) {
    throw new Error(
      [
        "NXTEST conservation failed.",
        `Inputs:  ${inputNXTEST}`,
        `Outputs: ${outputNXTEST}`,
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
        `Inputs:  ${inputLovelace}`,
        `Outputs: ${outputLovelace}`,
        `Fee:     ${feeLovelace}`,
      ].join("\n"),
    );
  }

  const beneficiaryOutputs =
    outputs.filter(
      (output) =>
        output.address ===
        sellerBeneficiaryAddress,
    );

  const beneficiaryNXTEST =
    beneficiaryOutputs.reduce(
      (
        total,
        output,
      ) =>
        total +
        output.assetQuantity,
      0n,
    );

  if (
    beneficiaryNXTEST !==
    RELEASE_QUANTITY
  ) {
    throw new Error(
      `Seller beneficiary would receive ${beneficiaryNXTEST} NXTEST; expected exactly ${RELEASE_QUANTITY}.`,
    );
  }

  console.log(
    "\n=== RELEASE OUTPUT ACCOUNTING ===",
  );

  for (
    const output of outputs
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
    `\nNXTEST: ${inputNXTEST} in = ${outputNXTEST} out`,
  );

  console.log(
    `ADA: ${inputLovelace} in = ${outputLovelace} out + ${feeLovelace} fee`,
  );

  console.log(
    `Seller beneficiary NXTEST: ${beneficiaryNXTEST}`,
  );

  console.log(
    "Release transaction accounting: PASS",
  );

  const transactionSizeBytes =
    transaction
      .to_cbor_bytes()
      .length;

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

  if (
    shouldSubmit
  ) {
    console.log(
      "\nSigning release transaction with seller...",
    );

    const signed =
      await tx
        .sign
        .withWallet()
        .complete();

    console.log(
      "Submitting release transaction...",
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
      "Escrow release confirmed.",
    );
  } else {
    console.log(
      "\nPrepared release transaction; NOT signed or submitted.",
    );
  }

  const artifact = {
    experiment:
      "escrow-release",

    status:
      shouldSubmit
        ? "submitted"
        : "dry-run",

    network:
      "Preprod",

    escrowInput: {
      txHash:
        ESCROW_TX_HASH,

      outputIndex:
        ESCROW_OUTPUT_INDEX,

      address:
        escrowUtxo.address,

      assets:
        serializeAssets(
          escrowUtxo.assets,
        ),
    },

    validator: {
      title:
        VALIDATOR_TITLE,

      scriptType:
        script.type,

      scriptHash,

      address:
        escrowAddress,
    },

    redeemer: {
      constructor:
        "Release",

      constructorIndex:
        0,

      cbor:
        releaseRedeemer,
    },

    seller: {
      walletAddress:
        sellerAddress,

      beneficiaryAddress:
        sellerBeneficiaryAddress,

      paymentKeyHash:
        sellerKeyHash,
    },

    beneficiaryDatum: {
      cbor:
        escrowOutputReferenceDatum,
    },

    inputs:
      resolvedInputs.map(
        (input) => ({
          txHash:
            input.txHash,

          outputIndex:
            input.outputIndex,

          address:
            input.address,

          assets:
            serializeAssets(
              input.assets,
            ),
        }),
      ),

    outputs:
      outputs.map(
        (output) => ({
          outputIndex:
            output.outputIndex,

          address:
            output.address,

          lovelace:
            output.lovelace
              .toString(),

          nxTest:
            output.assetQuantity
              .toString(),
        }),
      ),

    accounting: {
      inputLovelace:
        inputLovelace.toString(),

      outputLovelace:
        outputLovelace.toString(),

      feeLovelace:
        feeLovelace.toString(),

      inputNXTEST:
        inputNXTEST.toString(),

      outputNXTEST:
        outputNXTEST.toString(),

      beneficiaryNXTEST:
        beneficiaryNXTEST.toString(),

      balanced:
        inputLovelace ===
          outputLovelace +
          feeLovelace &&
        inputNXTEST ===
          outputNXTEST,

      exactBeneficiaryAmount:
        beneficiaryNXTEST ===
        RELEASE_QUANTITY,
    },

    transactionSizeBytes,

    feeLovelace:
      feeLovelace.toString(),

    feeAda:
      Number(
        feeLovelace,
      ) / 1_000_000,

    transactionHash,

    submission:
      shouldSubmit,

    confirmedAt,

    protocolParameters,

    createdAt:
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
      transactionHash
        ? `escrow-release-${transactionHash}.json`
        : "escrow-release-pending.json",
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
}

main().catch(
  (error: unknown) => {
    console.error(
      "\nEscrow release experiment failed.",
    );

    console.error(
      "=== ERROR OBJECT ===",
    );

    console.dir(
      error,
      {
        depth: null,
      },
    );

    if (
      error instanceof Error
    ) {
      console.error(
        "\n=== ERROR MESSAGE ===",
      );

      console.error(
        error.message,
      );

      console.error(
        "\n=== ERROR STACK ===",
      );

      console.error(
        error.stack,
      );

      const cause =
        (error as Error & {
          cause?: unknown;
        }).cause;

      if (
        cause !==
        undefined
      ) {
        console.error(
          "\n=== ERROR CAUSE ===",
        );

        console.dir(
          cause,
          {
            depth: null,
          },
        );
      }
    }

    process.exit(1);
  },
);