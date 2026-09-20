import { createClient } from "genlayer-js";
import { studionet } from "genlayer-js/chains";
import { TransactionStatus } from "genlayer-js/types";

export const TRUST_LENS_CONTRACT_ADDRESS =
  (process.env.NEXT_PUBLIC_TRUST_LENS_CONTRACT_ADDRESS ??
    "0x0000000000000000000000000000000000000000") as `0x${string}`;

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

export function createTrustLensClient(walletAddress?: WalletAddress) {
  return createClient({
    chain: studionet,
    account: walletAddress,
  });
}

function trustLensAddress(contractAddress?: `0x${string}`) {
  return contractAddress ?? TRUST_LENS_CONTRACT_ADDRESS;
}

export async function readCase(caseId: string, options: ChainReadOptions = {}) {
  const client = createTrustLensClient(options.walletAddress);
  return client.readContract({
    address: trustLensAddress(options.contractAddress),
    functionName: "get_case",
    args: [caseId],
    jsonSafeReturn: true,
    leaderOnly: true,
  });
}

export async function readVerdict(verdictId: string, options: ChainReadOptions = {}) {
  const client = createTrustLensClient(options.walletAddress);
  return client.readContract({
    address: trustLensAddress(options.contractAddress),
    functionName: "get_verdict",
    args: [verdictId],
    jsonSafeReturn: true,
    leaderOnly: true,
  });
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
  const receipt = await client.waitForTransactionReceipt({
    hash,
    status: TransactionStatus.ACCEPTED,
    fullTransaction: true,
  });
  const caseId = idFromReceipt(receipt, /trc_[a-f0-9]{20}/, "case");
  const caseRecord = await readCase(caseId, { walletAddress, contractAddress: address });
  return { hash, receipt, caseId, caseRecord };
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
  const receipt = await client.waitForTransactionReceipt({
    hash,
    status: TransactionStatus.ACCEPTED,
    fullTransaction: true,
  });
  const verdictId = idFromReceipt(receipt, /tlv_[a-f0-9]{20}/, "verdict");
  const verdict = await readVerdict(verdictId, { walletAddress, contractAddress: address });
  return { hash, receipt, verdictId, verdict };
}

function idFromReceipt(receipt: unknown, pattern: RegExp, label: string): string {
  const id = collectStrings(receipt)
    .map((value) => value.match(pattern)?.[0])
    .find((value): value is string => Boolean(value));
  if (!id) {
    throw new Error(`Accepted ${label} transaction did not return its ID.`);
  }
  return id;
}

function collectStrings(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (!value || typeof value !== "object") return [];
  return Object.values(value as Record<string, unknown>).flatMap(collectStrings);
}
