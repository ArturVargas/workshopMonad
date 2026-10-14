/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_LOCAL_RPC_URL: string;
  readonly VITE_MONAD_RPC_URL: string;
  readonly VITE_LOCAL_VOTING_ADDRESS: string;
  readonly VITE_MONAD_VOTING_ADDRESS: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

interface EthereumProvider {
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
  on?: (event: string, listener: (...args: unknown[]) => void) => void;
  removeListener?: (event: string, listener: (...args: unknown[]) => void) => void;
}

interface Window {
  ethereum?: EthereumProvider;
}
