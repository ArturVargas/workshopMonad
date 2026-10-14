import { defineChain, type Chain } from "viem";

export const hardhatLocal = defineChain({
  id: 31337,
  name: "Hardhat",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: {
    default: { http: ["http://127.0.0.1:8545"] },
  },
});

export const monadTestnet = defineChain({
  id: 10143,
  name: "Monad Testnet",
  nativeCurrency: { name: "Monad", symbol: "MON", decimals: 18 },
  rpcUrls: {
    default: { http: ["https://testnet-rpc.monad.xyz"] },
  },
  blockExplorers: {
    default: {
      name: "Monadscan",
      url: "https://testnet.monadscan.com",
    },
  },
});

export type NetworkId = "local" | "monad";

export const LOCAL_ACCOUNTS = [
  {
    label: "Cuenta 0",
    privateKey:
      "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80",
  },
  {
    label: "Cuenta 1",
    privateKey:
      "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d",
  },
  {
    label: "Cuenta 2",
    privateKey:
      "0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a",
  },
] as const;

export function chainFor(network: NetworkId): Chain {
  return network === "local" ? hardhatLocal : monadTestnet;
}

export function rpcFor(network: NetworkId): string {
  if (network === "local") {
    return import.meta.env.VITE_LOCAL_RPC_URL || hardhatLocal.rpcUrls.default.http[0];
  }
  return import.meta.env.VITE_MONAD_RPC_URL || monadTestnet.rpcUrls.default.http[0];
}

const DEFAULT_MONAD_VOTING_ADDRESS =
  "0x3BB2262d9174C70b9a04e2bF199aa159E9953a7E";

export function contractAddressFor(network: NetworkId): `0x${string}` | "" {
  const raw =
    network === "local"
      ? import.meta.env.VITE_LOCAL_VOTING_ADDRESS
      : import.meta.env.VITE_MONAD_VOTING_ADDRESS || DEFAULT_MONAD_VOTING_ADDRESS;
  if (raw && /^0x[a-fA-F0-9]{40}$/.test(raw)) return raw as `0x${string}`;
  return "";
}
