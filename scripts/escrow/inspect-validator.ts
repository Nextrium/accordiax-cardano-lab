import dotenv from "dotenv";
import {
  Blockfrost,
  Lucid,
  type Script,
} from "@lucid-evolution/lucid";
import {
  validatorToAddress,
  validatorToScriptHash,
} from "@lucid-evolution/utils";
import { createHash } from "node:crypto";
import {
  mkdir,
  readFile,
  writeFile,
} from "node:fs/promises";
import path from "node:path";

const PREPROD_URL =
  "https://cardano-preprod.blockfrost.io/api/v0";

const BLUEPRINT_PATH = path.resolve(
  "accordiax-escrow",
  "plutus.json",
);

const ARTIFACTS_DIR =
  path.resolve("artifacts");

const VALIDATOR_TITLE =
  "escrow.escrow.spend";

const EXPECTED_SCRIPT_HASH =
  "f121ef842fcc415e58a1bc49c089856cf9b1e206b8039cf24bce6bb0";

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
  const value = process.env[name];

  if (!value?.trim()) {
    throw new Error(
      `Missing environment variable: ${name}`,
    );
  }

  return value.trim();
}

async function main(): Promise<void> {
  loadEnvironment();

  const projectId =
    requireEnv(
      "BLOCKFROST_PREPROD_PROJECT_ID",
    );

  console.log(
    "Loading Aiken Plutus V3 blueprint...",
  );

  const blueprint =
    JSON.parse(
      await readFile(
        BLUEPRINT_PATH,
        "utf8",
      ),
    ) as Blueprint;

  if (
    blueprint.preamble.plutusVersion !==
    "v3"
  ) {
    throw new Error(
      `Expected Plutus V3 blueprint, found ${blueprint.preamble.plutusVersion}.`,
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
      `Validator '${VALIDATOR_TITLE}' was not found in ${BLUEPRINT_PATH}.`,
    );
  }

  if (
    !validator.compiledCode ||
    !validator.hash
  ) {
    throw new Error(
      "Validator is missing compiledCode or hash.",
    );
  }

  if (
    validator.hash !==
    EXPECTED_SCRIPT_HASH
  ) {
    throw new Error(
      [
        "Compiled validator hash mismatch.",
        `Expected: ${EXPECTED_SCRIPT_HASH}`,
        `Found:    ${validator.hash}`,
      ].join("\n"),
    );
  }

  const validatorScript:
    Script = {
      type: "PlutusV3",
      script:
        validator.compiledCode,
    };

  console.log(
    "\n=== ACCORDIAX ESCROW VALIDATOR ===",
  );

  console.log(
    `Validator: ${validator.title}`,
  );

  console.log(
    `Plutus version: ${blueprint.preamble.plutusVersion}`,
  );

  console.log(
    `Compiler: ${blueprint.preamble.compiler.name} ${blueprint.preamble.compiler.version}`,
  );

  console.log(
    `Blueprint script hash: ${validator.hash}`,
  );

  const derivedScriptHash =
    validatorToScriptHash(
      validatorScript,
    );

  console.log(
    `Derived script hash:   ${derivedScriptHash}`,
  );

  if (
    derivedScriptHash !==
    EXPECTED_SCRIPT_HASH
  ) {
    throw new Error(
      [
        "Derived script hash mismatch.",
        `Expected: ${EXPECTED_SCRIPT_HASH}`,
        `Derived:  ${derivedScriptHash}`,
      ].join("\n"),
    );
  }

  const lucid =
    await Lucid(
      new Blockfrost(
        PREPROD_URL,
        projectId,
      ),
      "Preprod",
    );

  const scriptAddress =
    validatorToAddress(
      "Preprod",
      validatorScript,
    );

  console.log(
    `\nPreprod script address:\n${scriptAddress}`,
  );

  /*
   * Local integrity fingerprint of the exact
   * compiledCode loaded from plutus.json.
   *
   * This is not the Cardano script hash.
   */
  const compiledCodeSha256 =
    createHash("sha256")
      .update(
        validator.compiledCode,
        "utf8",
      )
      .digest("hex");

  await mkdir(
    ARTIFACTS_DIR,
    {
      recursive: true,
    },
  );

  const artifact = {
    experiment:
      "escrow-validator-inspection",

    network:
      "Preprod",

    blueprint:
      BLUEPRINT_PATH,

    validatorTitle:
      validator.title,

    plutusVersion:
      blueprint.preamble
        .plutusVersion,

    compiler:
      blueprint.preamble.compiler,

    scriptType:
      validatorScript.type,

    compiledCodeSha256,

    blueprintScriptHash:
      validator.hash,

    derivedScriptHash,

    expectedScriptHash:
      EXPECTED_SCRIPT_HASH,

    scriptHashMatches:
      validator.hash ===
        EXPECTED_SCRIPT_HASH &&
      derivedScriptHash ===
        EXPECTED_SCRIPT_HASH,

    scriptAddress,

    createdAt:
      new Date().toISOString(),
  };

  const artifactPath =
    path.join(
      ARTIFACTS_DIR,
      "escrow-validator-inspection.json",
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
    `\nEvidence artifact: ${artifactPath}`,
  );

  console.log(
    "\nValidator inspection: OK",
  );
}

main().catch(
  (error: unknown) => {
    console.error(
      "\nEscrow validator inspection failed.",
    );

    console.error(
      error instanceof Error
        ? error.message
        : error,
    );

    process.exit(1);
  },
);