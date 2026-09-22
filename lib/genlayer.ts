import { createClient } from "genlayer-js";
import { studionet } from "genlayer-js/chains";
import { ExecutionResult, TransactionHashVariant, TransactionStatus } from "genlayer-js/types";

export const TRUST_LENS_CONTRACT_ADDRESS =
  (process.env.NEXT_PUBLIC_TRUST_LENS_CONTRACT_ADDRESS ??
    "0xAa856442052E97FA5C657e82850e86Efd69ADD50") as `0x${string}`;

export type WalletAddress = `0x${string}`;

export type ChainReadOptions = {
  walletAddress?: WalletAddress;
  contractAddress?: `0x${string}`;
};

export type CaseInput = {
  walletAddress: WalletAddress;
  subjectUrl: string;
  claim: string;
  primaryEvidenceUrl: string;
  archiveUrl: string;
  contextUrl: string;
  contractAddress?: `0x${string}`;
};

export type AssessInput = {
  walletAddress: WalletAddress;
  caseId: string;
  contractAddress?: `0x${string}`;
};

export type WriteFinality = "finalized" | "accepted-readback";

export function createTrustLensClient(walletAddress?: WalletAddress) {
  return createClient({
    chain: studionet,
    account: walletAddress,
    provider: typeof window !== "undefined" ? window.ethereum : undefined,
  });
}

function trustLensAddress(contractAddress?: `0x${string}`) {
  return contractAddress ?? TRUST_LENS_CONTRACT_ADDRESS;
}

function createReadClient() {
  return createClient({ chain: studionet });
}

export async function readCase(caseId: string, options: ChainReadOptions = {}) {
  return readStoredRecord("get_case", [caseId], options);
}

export async function readVerdict(verdictId: string, options: ChainReadOptions = {}) {
  return readStoredRecord("get_verdict", [verdictId], options);
}

export async function registerCase({
  walletAddress,
  subjectUrl,
  claim,
  primaryEvidenceUrl,
  archiveUrl,
  contextUrl,
  contractAddress,
}: CaseInput) {
  const client = createTrustLensClient(walletAddress);
  await client.connect("studionet");
  const address = trustLensAddress(contractAddress);
  const hash = await client.writeContract({
    address,
    functionName: "register_case",
    args: [subjectUrl, claim, primaryEvidenceUrl, archiveUrl, contextUrl],
    value: BigInt(0),
    leaderOnly: false,
  });
  const { receipt, finality } = await waitForConsensusReceipt(client, hash, "case registration");
  const caseId = returnedIdFromReceipt(receipt, "trc_", "case");
  const caseRecord = await readCase(caseId, { walletAddress, contractAddress: address });
  return { hash, receipt, finality, caseId, caseRecord };
}

export async function assessCase({ walletAddress, caseId, contractAddress }: AssessInput) {
  const client = createTrustLensClient(walletAddress);
  await client.connect("studionet");
  const address = trustLensAddress(contractAddress);
  const hash = await client.writeContract({
    address,
    functionName: "assess_case",
    args: [caseId],
    value: BigInt(0),
    leaderOnly: false,
  });
  const { receipt, finality } = await waitForConsensusReceipt(client, hash, "case assessment");
  const verdictId = returnedIdFromReceipt(receipt, "tlv_", "verdict");
  const verdict = await readVerdict(verdictId, { walletAddress, contractAddress: address });
  return { hash, receipt, finality, verdictId, verdict };
}

async function waitForConsensusReceipt(
  client: ReturnType<typeof createTrustLensClient>,
  hash: `0x${string}`,
  label: string,
) {
  try {
    const receipt = await waitForReceipt(client, hash, TransactionStatus.FINALIZED, 140);
    assertNoExecutionError(receipt, label);
    return { receipt, finality: "finalized" as WriteFinality };
  } catch (finalizedError) {
    const receipt = await waitForReceipt(client, hash, TransactionStatus.ACCEPTED, 100);
    assertNoExecutionError(receipt, label);
    return { receipt, finality: "accepted-readback" as WriteFinality, finalizedError };
  }
}

async function waitForReceipt(
  client: ReturnType<typeof createTrustLensClient>,
  hash: `0x${string}`,
  status: TransactionStatus,
  retries: number,
) {
  return client.waitForTransactionReceipt({
    hash,
    status,
    interval: 3000,
    retries,
    fullTransaction: true,
  } as never);
}

function assertNoExecutionError(receipt: unknown, label: string) {
  const resultName = (receipt as { txExecutionResultName?: string })?.txExecutionResultName;
  if (resultName === ExecutionResult.FINISHED_WITH_ERROR) {
    throw new Error(`${label} reached consensus but finished with a contract execution error.`);
  }
}

async function readStoredRecord(functionName: string, args: string[], options: ChainReadOptions) {
  const client = createReadClient();
  const address = trustLensAddress(options.contractAddress);
  const variants = [TransactionHashVariant.LATEST_FINAL, TransactionHashVariant.LATEST_NONFINAL] as const;
  let lastError: unknown;
  for (const transactionHashVariant of variants) {
    try {
      const result = await client.readContract({
        address,
        functionName,
        args,
        jsonSafeReturn: true,
        transactionHashVariant,
      });
      const text = normalizeReadResult(result);
      if (text.length === 0) throw new Error(`${functionName} returned an empty record.`);
      return text;
    } catch (error) {
      lastError = error;
    }
  }
  throw new Error(`Unable to read ${functionName} from ${address}: ${errorMessage(lastError)}`);
}

function normalizeReadResult(value: unknown): string {
  if (typeof value === "string") return value;
  if (value === null || value === undefined) return "";
  return JSON.stringify(value);
}

export function returnedIdFromReceipt(receipt: unknown, prefix: "trc_" | "tlv_", label: string): string {
  const direct = directReceiptReturn(receipt);
  if (typeof direct === "string" && direct.startsWith(prefix) && direct.length === 24) {
    return direct;
  }
  throw new Error(
    `Accepted ${label} transaction did not expose a direct ${prefix} return field. Receipt keys: ${Object.keys(
      (receipt as Record<string, unknown>) ?? {},
    ).join(", ")}`,
  );
}

function directReceiptReturn(receipt: unknown) {
  if (!receipt || typeof receipt !== "object") return null;
  const data = receipt as Record<string, unknown>;
  for (const key of ["txExecutionResult", "executionResult", "returnValue", "result"]) {
    const value = data[key];
    if (typeof value === "string") return value;
    if (value && typeof value === "object") {
      const nested = value as Record<string, unknown>;
      if (typeof nested.value === "string") return nested.value;
      if (typeof nested.returnValue === "string") return nested.returnValue;
    }
  }
  return null;
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}
