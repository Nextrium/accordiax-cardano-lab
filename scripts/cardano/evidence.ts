import { writeFile } from "node:fs/promises";

export interface TransactionEvidence {
  experiment: string;
  network: string;
  transactionHash: string;
  transactionSizeBytes: number;
  feeLovelace: string;
  feeAda: number;

  senderAddress?: string;
  recipientAddress?: string;

  transferAssets?: Record<string, string>;

  inputs?: Array<{
    txHash: string;
    outputIndex: number;
    address: string;
    assets: Record<string, string>;
  }>;

  outputs?: Array<{
    address: string;
    assets: Record<string, string>;
  }>;

  protocolParameters?: Record<string, unknown>;

  createdAt: string;
  confirmedAt?: string;
}

export async function writeTransactionEvidence(
  fileName: string,
  evidence: TransactionEvidence,
): Promise<void> {
  await writeFile(
    fileName,
    JSON.stringify(evidence, null, 2),
    "utf8",
  );
}