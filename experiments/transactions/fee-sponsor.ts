import dotenv from "dotenv";
import {
  Blockfrost,
  CML,
  Lucid,
  type Assets,
  type ProtocolParameters,
  type Provider,
  type UTxO,
} from "@lucid-evolution/lucid";
import { createHash } from "node:crypto";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const PREPROD_URL = "https://cardano-preprod.blockfrost.io/api/v0";
const ARTIFACTS = path.resolve("artifacts");
const NXTEST_QUANTITY = 1_000n;
const RECIPIENT_LOVELACE = 2_000_000n;

type MintArtifact = {
  network: string;
  policyId: string;
  assetName: string;
  assetUnit: string;
};

type EvidenceOutput = {
  address: string;
  assets: Record<string, string>;
};

type IntendedInput = EvidenceOutput & {
  txHash: string;
  outputIndex: number;
};

type IntendedTopology = {
  userAddress: string;
  sponsorAddress: string;
  recipient: string;
  userInput: IntendedInput;
  sponsorInput: IntendedInput;
  recipientOutput: EvidenceOutput;
  userChangeOutput: EvidenceOutput;
  sponsorChangeOutput: EvidenceOutput;
  assetUnit: string;
};

type BlockfrostAmount = {
  unit: string;
  quantity: string;
};

type BlockfrostTxIo = {
  tx_hash: string;
  output_index: number;
  address: string;
  amount: BlockfrostAmount[];
};

type BlockfrostTxUtxos = {
  inputs: BlockfrostTxIo[];
  outputs: BlockfrostTxIo[];
};

type BlockfrostTx = {
  hash: string;
  block: string;
  block_height: number;
  slot: number;
  fees: string;
  size: number;
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

function env(name: string): string {
  const value = process.env[name];

  if (!value?.trim()) {
    throw new Error(
      `Missing environment variable: ${name}`,
    );
  }

  return value.trim();
}

function assetsJson(
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

function cmlValueJson(
  value: CML.Value,
): Record<string, string> {
  const result: Record<string, string> = {
    lovelace: value.coin().toString(),
  };

  if (!value.has_multiassets()) {
    return result;
  }

  const policies = value.multi_asset().keys();

  for (
    let p = 0;
    p < policies.len();
    p += 1
  ) {
    const policy = policies.get(p);
    const names =
      value.multi_asset().get_assets(policy);

    if (!names) {
      continue;
    }

    const assets = names.keys();

    for (
      let a = 0;
      a < assets.len();
      a += 1
    ) {
      const name = assets.get(a);
      const quantity = names.get(name);

      if (quantity !== undefined) {
        result[
          `${policy.to_hex()}${name.to_hex()}`
        ] = quantity.toString();
      }
    }
  }

  return result;
}

function addAssets(
  target: Record<string, bigint>,
  assets: Record<string, bigint | string>,
): void {
  for (const [unit, quantity] of Object.entries(
    assets,
  )) {
    target[unit] =
      (target[unit] ?? 0n) +
      BigInt(quantity);
  }
}

function protocolJson(
  parameters: ProtocolParameters,
): Record<string, unknown> {
  return JSON.parse(
    JSON.stringify(
      parameters,
      (_, value: unknown) =>
        typeof value === "bigint"
          ? value.toString()
          : value,
    ),
  ) as Record<string, unknown>;
}

async function latestMint(): Promise<MintArtifact> {
  const files = (
    await readdir(ARTIFACTS)
  )
    .filter(
      (file) =>
        file.startsWith(
          "native-asset-mint-",
        ) &&
        file.endsWith(".json"),
    )
    .sort();

  const file = files.at(-1);

  if (!file) {
    throw new Error(
      "No native-asset mint artifact found.",
    );
  }

  return JSON.parse(
    await readFile(
      path.join(
        ARTIFACTS,
        file,
      ),
      "utf8",
    ),
  ) as MintArtifact;
}

function exactAssets(
  actual: Record<string, string>,
  expected: Record<string, string>,
): boolean {
  return [
    ...new Set([
      ...Object.keys(actual),
      ...Object.keys(expected),
    ]),
  ].every(
    (unit) =>
      (actual[unit] ?? "0") ===
      (expected[unit] ?? "0"),
  );
}

function blockfrostAssets(
  amount: BlockfrostAmount[],
): Record<string, string> {
  return Object.fromEntries(
    amount.map(
      ({ unit, quantity }) => [
        unit,
        quantity,
      ],
    ),
  );
}

function evidenceIo(
  io: BlockfrostTxIo,
): IntendedInput {
  return {
    txHash: io.tx_hash,
    outputIndex: io.output_index,
    address: io.address,
    assets: blockfrostAssets(
      io.amount,
    ),
  };
}

function hasExpectedOutput(
  outputs: BlockfrostTxIo[],
  expected: EvidenceOutput,
): boolean {
  return outputs.some(
    (output) =>
      output.address ===
        expected.address &&
      exactAssets(
        blockfrostAssets(
          output.amount,
        ),
        expected.assets,
      ),
  );
}

async function intendedTopology(): Promise<IntendedTopology> {
  return JSON.parse(
    await readFile(
      path.join(
        ARTIFACTS,
        "fee-sponsor-pending.json",
      ),
      "utf8",
    ),
  ) as IntendedTopology;
}

async function blockfrostGet<T>(
  provider: Blockfrost,
  endpoint: string,
): Promise<T> {
  const response = await fetch(
    `${provider.url}${endpoint}`,
    {
      headers: {
        project_id:
          provider.projectId,
      },
    },
  );

  if (!response.ok) {
    throw new Error(
      `Blockfrost ${endpoint} failed with HTTP ${response.status}.`,
    );
  }

  return (await response.json()) as T;
}

function addressKeyHash(
  address: string,
): string {
  const key =
    CML.Address.from_bech32(
      address,
    )
      .payment_cred()
      ?.as_pub_key();

  if (!key) {
    throw new Error(
      `Expected a key payment credential for ${address}.`,
    );
  }

  return key.to_hex();
}

function witnessDigest(
  witness: string | null,
): string | null {
  return witness
    ? createHash("sha256")
        .update(witness, "hex")
        .digest("hex")
    : null;
}

async function verify(
  txHash: string,
): Promise<void> {
  loadEnvironment();

  const provider = new Blockfrost(
    PREPROD_URL,
    env(
      "BLOCKFROST_PREPROD_PROJECT_ID",
    ),
  );

  const intended =
    await intendedTopology();

  const status =
    await provider.getTransactionStatus(
      txHash,
    );

  if (
    status.status !== "confirmed"
  ) {
    throw new Error(
      `Transaction is ${status.status}, not confirmed.`,
    );
  }

  const [
    transaction,
    utxos,
    cbor,
  ] = await Promise.all([
    blockfrostGet<BlockfrostTx>(
      provider,
      `/txs/${txHash}`,
    ),
    blockfrostGet<BlockfrostTxUtxos>(
      provider,
      `/txs/${txHash}/utxos`,
    ),
    blockfrostGet<{ cbor: string }>(
      provider,
      `/txs/${txHash}/cbor`,
    ),
  ]);

  if (
    transaction.hash !== txHash
  ) {
    throw new Error(
      "Blockfrost returned a different transaction hash.",
    );
  }

  const inputs =
    utxos.inputs.map(
      evidenceIo,
    );

  const outputs =
    utxos.outputs.map(
      evidenceIo,
    );

  const containsInput = (
    expected: IntendedInput,
  ): boolean =>
    inputs.some(
      (input) =>
        input.txHash ===
          expected.txHash &&
        input.outputIndex ===
          expected.outputIndex &&
        input.address ===
          expected.address &&
        exactAssets(
          input.assets,
          expected.assets,
        ),
    );

  if (
    !containsInput(
      intended.userInput,
    )
  ) {
    throw new Error(
      "Confirmed transaction does not contain the expected user input.",
    );
  }

  if (
    !containsInput(
      intended.sponsorInput,
    )
  ) {
    throw new Error(
      "Confirmed transaction does not contain the expected sponsor ADA input.",
    );
  }

  if (
    !hasExpectedOutput(
      utxos.outputs,
      intended.recipientOutput,
    )
  ) {
    throw new Error(
      "Recipient output does not match intended ADA and NXTEST amounts.",
    );
  }

  if (
    !hasExpectedOutput(
      utxos.outputs,
      intended.userChangeOutput,
    )
  ) {
    throw new Error(
      "User change does not match the intended user-address output.",
    );
  }

  if (
    !hasExpectedOutput(
      utxos.outputs,
      intended.sponsorChangeOutput,
    )
  ) {
    throw new Error(
      "Sponsor change does not match the intended sponsor-address output.",
    );
  }

  const recipientNxtest =
    outputs
      .filter(
        (output) =>
          output.address ===
          intended.recipient,
      )
      .reduce(
        (total, output) =>
          total +
          BigInt(
            output.assets[
              intended.assetUnit
            ] ?? "0",
          ),
        0n,
      );

  if (
    recipientNxtest !==
    NXTEST_QUANTITY
  ) {
    throw new Error(
      `Expected exactly ${NXTEST_QUANTITY} NXTEST for recipient, found ${recipientNxtest}.`,
    );
  }

  const chainTransaction =
    CML.Transaction.from_cbor_hex(
      cbor.cbor,
    );

  const fee =
    BigInt(transaction.fees);

  if (
    chainTransaction
      .body()
      .fee() !== fee
  ) {
    throw new Error(
      "Transaction-body fee differs from Blockfrost fee.",
    );
  }

  /*
   * Do not require Blockfrost's reported transaction
   * size to equal the raw CBOR byte length.
   *
   * We record both measurements because they are
   * independently reported representations of the
   * confirmed transaction.
   */
  const cborSizeBytes =
    cbor.cbor.length / 2;

  const blockfrostSizeBytes =
    transaction.size;

  const vkeyWitnesses =
    chainTransaction
      .witness_set()
      .vkeywitnesses();

  const witnessKeyHashes =
    vkeyWitnesses
      ? Array.from(
          {
            length:
              vkeyWitnesses.len(),
          },
          (_, index) =>
            vkeyWitnesses
              .get(index)
              .vkey()
              .hash()
              .to_hex(),
        ).sort()
      : [];

  const userKeyHash =
    addressKeyHash(
      intended.userAddress,
    );

  const sponsorKeyHash =
    addressKeyHash(
      intended.sponsorAddress,
    );

  if (
    witnessKeyHashes.length !== 2 ||
    !witnessKeyHashes.includes(
      userKeyHash,
    ) ||
    !witnessKeyHashes.includes(
      sponsorKeyHash,
    )
  ) {
    throw new Error(
      "Confirmed transaction is missing a required user or sponsor witness.",
    );
  }

  const inputTotals: Record<
    string,
    bigint
  > = {};

  const outputTotals: Record<
    string,
    bigint
  > = {};

  for (const input of inputs) {
    addAssets(
      inputTotals,
      input.assets,
    );
  }

  for (const output of outputs) {
    addAssets(
      outputTotals,
      output.assets,
    );
  }

  const balanceByUnit =
    Object.fromEntries(
      [
        ...new Set([
          ...Object.keys(
            inputTotals,
          ),
          ...Object.keys(
            outputTotals,
          ),
        ]),
      ].map((unit) => {
        const input =
          inputTotals[unit] ??
          0n;

        const output =
          outputTotals[unit] ??
          0n;

        const difference =
          unit === "lovelace"
            ? fee
            : 0n;

        if (
          input !==
          output + difference
        ) {
          throw new Error(
            `${unit} conservation failed.`,
          );
        }

        return [
          unit,
          {
            inputs:
              input.toString(),
            outputs:
              output.toString(),
            difference:
              (
                input - output
              ).toString(),
            conserved:
              true,
          },
        ];
      }),
    );

  await mkdir(
    ARTIFACTS,
    {
      recursive: true,
    },
  );

  const artifact = {
    experiment:
      "fee-sponsor-confirmed-verification",

    network:
      "Preprod",

    transactionHash:
      txHash,

    status:
      status.status,

    confirmation:
      status.confirmation,

    addresses: {
      user:
        intended.userAddress,
      sponsor:
        intended.sponsorAddress,
      recipient:
        intended.recipient,
    },

    inputs,

    outputs,

    feeLovelace:
      fee.toString(),

    blockfrostTransactionSizeBytes:
      blockfrostSizeBytes,

    cborSizeBytes,

    transactionSizeBytes:
      blockfrostSizeBytes,

    assetUnit:
      intended.assetUnit,

    assetQuantities: {
      recipientNxtest:
        recipientNxtest.toString(),

      inputTotals:
        Object.fromEntries(
          Object.entries(
            inputTotals,
          ).map(
            ([
              unit,
              amount,
            ]) => [
              unit,
              amount.toString(),
            ],
          ),
        ),

      outputTotals:
        Object.fromEntries(
          Object.entries(
            outputTotals,
          ).map(
            ([
              unit,
              amount,
            ]) => [
              unit,
              amount.toString(),
            ],
          ),
        ),
    },

    witnesses: {
      required: {
        userPaymentKeyHash:
          userKeyHash,

        sponsorPaymentKeyHash:
          sponsorKeyHash,
      },

      presentVerificationKeyHashes:
        witnessKeyHashes,

      count:
        witnessKeyHashes.length,

      bothRequiredWitnessesPresent:
        true,
    },

    topologyComparison: {
      source:
        "fee-sponsor-pending.json dry-run topology; chain data is authoritative",

      expectedUserInputPresent:
        true,

      expectedSponsorInputPresent:
        true,

      recipientOutputMatched:
        true,

      userChangeMatched:
        true,

      sponsorChangeMatched:
        true,
    },

    balanceEquation: {
      equation:
        "inputs = outputs + fee (lovelace); inputs = outputs (native assets)",

      byUnit:
        balanceByUnit,

      balanced:
        true,
    },

    verificationMethod:
      "Read-only Blockfrost Preprod queries: provider.getTransactionStatus, /txs/{hash}, /txs/{hash}/utxos, and /txs/{hash}/cbor; CBOR decoded with @lucid-evolution/lucid CML.",

    verifiedAt:
      new Date().toISOString(),
  };

  await writeFile(
    path.join(
      ARTIFACTS,
      `fee-sponsor-confirmed-${txHash}.json`,
    ),
    JSON.stringify(
      artifact,
      null,
      2,
    ),
    "utf8",
  );

  console.log(
    `Verified confirmed transaction: ${txHash}`,
  );
}

async function main(): Promise<void> {
  loadEnvironment();

  const provider =
    new Blockfrost(
      PREPROD_URL,
      env(
        "BLOCKFROST_PREPROD_PROJECT_ID",
      ),
    );

  const mint =
    await latestMint();

  const user =
    await Lucid(
      provider,
      "Preprod",
    );

  user.selectWallet.fromSeed(
    env("TEST_SENDER_SEED"),
  );

  const sponsor =
    await Lucid(
      provider,
      "Preprod",
    );

  sponsor.selectWallet.fromSeed(
    env("TEST_SPONSOR_SEED"),
  );

  const recipientLucid =
    await Lucid(
      provider,
      "Preprod",
    );

  recipientLucid.selectWallet.fromSeed(
    env("TEST_RECIPIENT_SEED"),
  );

  const userAddress =
    await user.wallet().address();

  const sponsorAddress =
    await sponsor.wallet().address();

  const recipient =
    await recipientLucid.wallet().address();

  const userUtxos =
    await user.wallet().getUtxos();

  const sponsorUtxos =
    await sponsor.wallet().getUtxos();

  const userInput =
    userUtxos.find(
      (utxo) =>
        (utxo.assets[
          mint.assetUnit
        ] ?? 0n) >=
        NXTEST_QUANTITY,
    );

  const sponsorInput =
    sponsorUtxos.find(
      (utxo) =>
        Object.keys(
          utxo.assets,
        ).every(
          (unit) =>
            unit ===
            "lovelace",
        ) &&
        (utxo.assets.lovelace ??
          0n) >=
          RECIPIENT_LOVELACE +
            200_000n,
    );

  if (!userInput) {
    throw new Error(
      "No user UTxO contains enough NXTEST.",
    );
  }

  if (!sponsorInput) {
    throw new Error(
      "No sponsor ADA-only UTxO has enough ADA.",
    );
  }

  const userChangeAssets:
    Assets = {
      ...userInput.assets,
    };

  userChangeAssets[
    mint.assetUnit
  ] =
    (userChangeAssets[
      mint.assetUnit
    ] ?? 0n) -
    NXTEST_QUANTITY;

  if (
    userChangeAssets[
      mint.assetUnit
    ] === 0n
  ) {
    delete userChangeAssets[
      mint.assetUnit
    ];
  }

  const sponsorInputLovelace =
    sponsorInput.assets
      .lovelace ?? 0n;

  let sponsorChange =
    sponsorInputLovelace -
    RECIPIENT_LOVELACE -
    300_000n;

  if (
    sponsorChange <= 0n
  ) {
    throw new Error(
      "Sponsor input cannot fund the output and fee.",
    );
  }

  let tx;
  let feeLovelace = 0n;

  for (
    let attempt = 0;
    attempt < 5;
    attempt += 1
  ) {
    tx =
      await user
        .newTx()
        .collectFrom([
          userInput,
          sponsorInput,
        ])
        .pay.ToAddress(
          recipient,
          {
            [mint.assetUnit]:
              NXTEST_QUANTITY,
            lovelace:
              RECIPIENT_LOVELACE,
          },
        )
        .pay.ToAddress(
          userAddress,
          userChangeAssets,
        )
        .pay.ToAddress(
          sponsorAddress,
          {
            lovelace:
              sponsorChange,
          },
        )
        .complete({
          coinSelection:
            false,
        });

    feeLovelace =
      tx
        .toTransaction()
        .body()
        .fee();

    const nextSponsorChange =
      sponsorInputLovelace -
      RECIPIENT_LOVELACE -
      feeLovelace;

    if (
      nextSponsorChange ===
      sponsorChange
    ) {
      break;
    }

    sponsorChange =
      nextSponsorChange;

    if (attempt === 4) {
      throw new Error(
        "Unable to converge on an exact sponsor-change fee balance.",
      );
    }
  }

  if (!tx) {
    throw new Error(
      "Transaction was not constructed.",
    );
  }

  const userInputAssets =
    userInput.assets;

  const sponsorInputAssets =
    sponsorInput.assets;

  const recipientOutput:
    EvidenceOutput = {
      address: recipient,
      assets: {
        lovelace:
          RECIPIENT_LOVELACE.toString(),
        [mint.assetUnit]:
          NXTEST_QUANTITY.toString(),
      },
    };

  const userChangeOutput:
    EvidenceOutput = {
      address: userAddress,
      assets:
        assetsJson(
          userChangeAssets,
        ),
    };

  const sponsorChangeOutput:
    EvidenceOutput = {
      address: sponsorAddress,
      assets: {
        lovelace:
          sponsorChange.toString(),
      },
    };

  const inputTotals: Record<
    string,
    bigint
  > = {};

  addAssets(
    inputTotals,
    userInputAssets,
  );

  addAssets(
    inputTotals,
    sponsorInputAssets,
  );

  const outputTotals: Record<
    string,
    bigint
  > = {};

  addAssets(
    outputTotals,
    userChangeAssets,
  );

  addAssets(
    outputTotals,
    recipientOutput.assets,
  );

  addAssets(
    outputTotals,
    sponsorChangeOutput.assets,
  );

  if (
    sponsorChange <= 0n
  ) {
    throw new Error(
      "Sponsor change is missing.",
    );
  }

  if (
    sponsorChangeOutput.address ===
    userAddress
  ) {
    throw new Error(
      "Sponsor change is returned to the user.",
    );
  }

  if (
    (userChangeAssets.lovelace ??
      0n) >
    (userInput.assets.lovelace ??
      0n)
  ) {
    throw new Error(
      "User change exceeds user ADA input attribution.",
    );
  }

  if (
    inputTotals[
      mint.assetUnit
    ] !==
    outputTotals[
      mint.assetUnit
    ]
  ) {
    throw new Error(
      "NXTEST assets are not conserved.",
    );
  }

  for (
    const unit of new Set([
      ...Object.keys(
        inputTotals,
      ),
      ...Object.keys(
        outputTotals,
      ),
    ])
  ) {
    const input =
      inputTotals[unit] ??
      0n;

    const output =
      outputTotals[unit] ??
      0n;

    if (
      unit === "lovelace"
        ? input !==
          output +
            feeLovelace
        : input !==
          output
    ) {
      throw new Error(
        `${unit} is not conserved.`,
      );
    }
  }

  const createdAt =
    new Date().toISOString();

  let userWitness:
    string | null = null;

  let sponsorWitness:
    string | null = null;

  let transactionHash:
    string | undefined;

  let confirmedAt:
    string | undefined;

  let transactionSizeBytes =
    tx
      .toTransaction()
      .to_cbor_bytes()
      .length;

  if (
    process.argv.includes(
      "--submit",
    )
  ) {
    userWitness =
      await tx.partialSign.withWallet();

    const sponsorTx =
      sponsor.fromTx(
        tx.toCBOR(),
      );

    sponsorWitness =
      await sponsorTx
        .partialSign
        .withWallet();

    if (
      !userWitness ||
      !sponsorWitness
    ) {
      throw new Error(
        "Both user and sponsor witnesses are required before submission.",
      );
    }

    const signed =
      await sponsorTx
        .assemble([
          userWitness,
          sponsorWitness,
        ])
        .complete();

    transactionSizeBytes =
      signed
        .toTransaction()
        .to_cbor_bytes()
        .length;

    transactionHash =
      await signed.submit();

    await user.awaitTxConfirmation(
      transactionHash,
      {
        checkInterval: 3_000,
        timeout: 120_000,
        minimumConfirmations: 1,
      },
    );

    confirmedAt =
      new Date().toISOString();
  }

  const protocolParameters =
    user.config()
      .protocolParameters;

  if (!protocolParameters) {
    throw new Error(
      "Lucid did not initialize protocol parameters.",
    );
  }

  const artifact = {
    experiment:
      "fee-sponsor",

    network:
      "Preprod",

    userAddress,

    sponsorAddress,

    recipient,

    userInput: {
      txHash:
        userInput.txHash,

      outputIndex:
        userInput.outputIndex,

      address:
        userInput.address,

      assets:
        assetsJson(
          userInput.assets,
        ),
    },

    sponsorInput: {
      txHash:
        sponsorInput.txHash,

      outputIndex:
        sponsorInput.outputIndex,

      address:
        sponsorInput.address,

      assets:
        assetsJson(
          sponsorInput.assets,
        ),
    },

    recipientOutput,

    userChangeOutput,

    sponsorChangeOutput,

    feeLovelace:
      feeLovelace.toString(),

    feeAda:
      Number(
        feeLovelace,
      ) / 1_000_000,

    transactionSizeBytes,

    assetUnit:
      mint.assetUnit,

    assetQuantity:
      NXTEST_QUANTITY.toString(),

    completeBalanceEquation: {
      inputs:
        Object.fromEntries(
          Object.entries(
            inputTotals,
          ).map(
            ([
              unit,
              value,
            ]) => [
              unit,
              value.toString(),
            ],
          ),
        ),

      outputs:
        Object.fromEntries(
          Object.entries(
            outputTotals,
          ).map(
            ([
              unit,
              value,
            ]) => [
              unit,
              value.toString(),
            ],
          ),
        ),

      feeLovelace:
        feeLovelace.toString(),

      equation:
        "inputs = outputs + fee",

      balanced:
        true,
    },

    signatures: {
      userWitness:
        userWitness
          ? {
              sha256:
                witnessDigest(
                  userWitness,
                ),
              hexLength:
                userWitness.length,
            }
          : null,

      sponsorWitness:
        sponsorWitness
          ? {
              sha256:
                witnessDigest(
                  sponsorWitness,
                ),
              hexLength:
                sponsorWitness.length,
            }
          : null,

      bothPresent:
        Boolean(
          userWitness &&
            sponsorWitness,
        ),
    },

    protocolParameters:
      protocolJson(
        protocolParameters,
      ),

    transactionHash,

    submitted:
      Boolean(
        transactionHash,
      ),

    createdAt,

    confirmedAt,
  };

  await mkdir(
    ARTIFACTS,
    {
      recursive: true,
    },
  );

  await writeFile(
    path.join(
      ARTIFACTS,
      "fee-sponsor-pending.json",
    ),
    JSON.stringify(
      artifact,
      null,
      2,
    ),
    "utf8",
  );

  console.log(
    transactionHash
      ? `Submitted and confirmed: ${transactionHash}`
      : "Prepared balanced two-party transaction; not signed or submitted.",
  );
}

loadEnvironment();

const verifyIndex =
  process.argv.indexOf(
    "--verify",
  );

const verifyHash =
  verifyIndex >= 0
    ? process.argv[
        verifyIndex + 1
      ]
    : undefined;

(
  verifyIndex >= 0
    ? verifyHash
      ? () => verify(
          verifyHash,
        )
      : () =>
          Promise.reject(
            new Error(
              "Usage: --verify <txHash>",
            ),
          )
    : main
)().catch(
  (error: unknown) => {
    console.error(
      "Fee sponsorship experiment failed.",
    );

    console.error(
      error instanceof Error
        ? error.message
        : error,
    );

    process.exit(1);
  },
);