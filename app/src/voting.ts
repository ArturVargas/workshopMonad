import {
  createPublicClient,
  createWalletClient,
  custom,
  getContract,
  http,
  type Address,
  type PublicClient,
  type WalletClient,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import votingAbiJson from "./voting-abi.json";
import {
  chainFor,
  contractAddressFor,
  rpcFor,
  type NetworkId,
} from "./chains";

export const votingAbi = votingAbiJson;

export type PollView = {
  id: bigint;
  creator: Address;
  title: string;
  description: string;
  deadline: bigint;
  totalVotes: bigint;
  open: boolean;
  options: { label: string; votes: bigint }[];
  hasVoted: boolean;
  voteIndex: bigint;
  winnerIndex: bigint | null;
  winnerVotes: bigint;
  tied: boolean;
};

type PollResult = readonly [
  Address,
  string,
  string,
  bigint,
  bigint,
  bigint,
  boolean,
];

type OptionsResult = readonly [string[], bigint[]];

type WinnerResult = readonly [bigint, bigint, boolean];

export function getVotingAddress(network: NetworkId): Address | "" {
  return contractAddressFor(network);
}

export function makePublicClient(network: NetworkId): PublicClient {
  return createPublicClient({
    chain: chainFor(network),
    transport: http(rpcFor(network)),
  });
}

export function makeLocalWallet(network: NetworkId, privateKey: `0x${string}`) {
  const account = privateKeyToAccount(privateKey);
  const walletClient = createWalletClient({
    account,
    chain: chainFor(network),
    transport: http(rpcFor(network)),
  });
  return { account, walletClient };
}

export async function connectInjectedWallet(network: NetworkId) {
  if (!window.ethereum) {
    throw new Error("No hay una billetera en el navegador.");
  }

  const chain = chainFor(network);
  const chainIdHex = `0x${chain.id.toString(16)}`;

  try {
    await window.ethereum.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: chainIdHex }],
    });
  } catch (error) {
    const code = (error as { code?: number }).code;
    if (code !== 4902) throw error;
    await window.ethereum.request({
      method: "wallet_addEthereumChain",
      params: [
        {
          chainId: chainIdHex,
          chainName: chain.name,
          nativeCurrency: chain.nativeCurrency,
          rpcUrls: [rpcFor(network)],
          blockExplorerUrls: chain.blockExplorers
            ? [chain.blockExplorers.default.url]
            : [],
        },
      ],
    });
  }

  const accounts = (await window.ethereum.request({
    method: "eth_requestAccounts",
  })) as string[];

  const walletClient = createWalletClient({
    chain,
    transport: custom(window.ethereum),
  });

  return {
    address: accounts[0] as Address,
    walletClient,
  };
}

function contractAt(client: PublicClient | WalletClient, address: Address) {
  return getContract({
    address,
    abi: votingAbi,
    client,
  });
}

export async function loadPolls(
  network: NetworkId,
  voter: Address | null,
): Promise<PollView[]> {
  const address = getVotingAddress(network);
  if (!address) return [];

  const publicClient = makePublicClient(network);
  const voting = contractAt(publicClient, address);
  const pollCount = (await voting.read.pollCount()) as bigint;
  const polls: PollView[] = [];

  for (let id = pollCount; id > 0n; id--) {
    const pollId = id - 1n;
    const [creator, title, description, deadline, totalVotes, , open] =
      (await voting.read.getPoll([pollId])) as PollResult;
    const [labels, counts] = (await voting.read.getOptions([
      pollId,
    ])) as OptionsResult;
    const hasVoted = voter
      ? ((await voting.read.hasVoted([pollId, voter])) as boolean)
      : false;
    const voteIndex = hasVoted
      ? ((await voting.read.voteOf([pollId, voter as Address])) as bigint)
      : 0n;

    let winnerIndex: bigint | null = null;
    let winnerVotes = 0n;
    let tied = false;
    if (totalVotes > 0n) {
      const [optionIndex, voteCount, isTied] = (await voting.read.winner([
        pollId,
      ])) as WinnerResult;
      winnerIndex = optionIndex;
      winnerVotes = voteCount;
      tied = isTied;
    }

    polls.push({
      id: pollId,
      creator,
      title,
      description,
      deadline,
      totalVotes,
      open,
      options: labels.map((label, index) => ({
        label,
        votes: counts[index] ?? 0n,
      })),
      hasVoted,
      voteIndex,
      winnerIndex,
      winnerVotes,
      tied,
    });
  }

  return polls;
}

export async function createPoll(args: {
  network: NetworkId;
  walletClient: WalletClient;
  account: Address;
  title: string;
  description: string;
  options: string[];
  durationSeconds: bigint;
}) {
  const address = getVotingAddress(args.network);
  if (!address) throw new Error("Falta la dirección del contrato.");

  const voting = getContract({
    address,
    abi: votingAbi,
    client: { public: makePublicClient(args.network), wallet: args.walletClient },
  });

  return voting.write.createPoll(
    [args.title, args.description, args.options, args.durationSeconds],
    { account: args.account, chain: chainFor(args.network) },
  );
}

export async function castVote(args: {
  network: NetworkId;
  walletClient: WalletClient;
  account: Address;
  pollId: bigint;
  optionIndex: bigint;
}) {
  const address = getVotingAddress(args.network);
  if (!address) throw new Error("Falta la dirección del contrato.");

  const voting = getContract({
    address,
    abi: votingAbi,
    client: { public: makePublicClient(args.network), wallet: args.walletClient },
  });

  return voting.write.vote([args.pollId, args.optionIndex], {
    account: args.account,
    chain: chainFor(args.network),
  });
}

export function shortAddress(address: Address) {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

export function formatDeadline(deadline: bigint) {
  return new Date(Number(deadline) * 1000).toLocaleString("es", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function errorMessage(error: unknown) {
  if (error instanceof Error) {
    const match = error.message.match(/Error: ([A-Za-z0-9_]+)/);
    if (match) return match[1];
    return error.message.split("\n")[0] ?? "La transacción falló.";
  }
  return "La transacción falló.";
}
