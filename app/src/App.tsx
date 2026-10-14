import { useEffect, useMemo, useState } from "react";
import type { Address, WalletClient } from "viem";
import { LOCAL_ACCOUNTS, type NetworkId } from "./chains";
import {
  castVote,
  connectInjectedWallet,
  createPoll,
  errorMessage,
  formatDeadline,
  getVotingAddress,
  loadPolls,
  makeLocalWallet,
  makePublicClient,
  shortAddress,
  type PollView,
} from "./voting";

const DURATIONS = [
  { label: "1 minuto", seconds: 60n },
  { label: "4 minutos", seconds: 240n },
  { label: "1 hora", seconds: 3600n },
  { label: "1 día", seconds: 86_400n },
  { label: "7 días", seconds: 7n * 86_400n },
];

export function App() {
  const [network, setNetwork] = useState<NetworkId>("local");
  const [accountIndex, setAccountIndex] = useState(0);
  const [walletAddress, setWalletAddress] = useState<Address | null>(null);
  const [walletClient, setWalletClient] = useState<WalletClient | null>(null);
  const [polls, setPolls] = useState<PollView[]>([]);
  const [status, setStatus] = useState("Listo.");
  const [busy, setBusy] = useState(false);
  const [nodeOnline, setNodeOnline] = useState<boolean | null>(null);
  const [reloadToken, setReloadToken] = useState(0);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [options, setOptions] = useState(["", ""]);
  const [duration, setDuration] = useState(DURATIONS[2].seconds.toString());

  const contractAddress = getVotingAddress(network);
  const signer = useMemo(() => {
    if (network === "local") {
      const selected = LOCAL_ACCOUNTS[accountIndex] ?? LOCAL_ACCOUNTS[0];
      return makeLocalWallet(network, selected.privateKey);
    }
    if (!walletAddress || !walletClient) return null;
    return { account: { address: walletAddress }, walletClient };
  }, [accountIndex, network, walletAddress, walletClient]);

  const voter = signer?.account.address ?? null;

  useEffect(() => {
    let cancelled = false;

    async function refresh() {
      if (!contractAddress) {
        setPolls([]);
        setNodeOnline(null);
        return;
      }
      try {
        const client = makePublicClient(network);
        await client.getChainId();
        if (cancelled) return;
        setNodeOnline(true);
        const next = await loadPolls(network, voter);
        if (cancelled) return;
        setPolls(next);
      } catch {
        if (cancelled) return;
        setNodeOnline(false);
        setPolls([]);
      }
    }

    void refresh();
    return () => {
      cancelled = true;
    };
  }, [contractAddress, network, reloadToken, voter]);

  async function onCreate(event: React.FormEvent) {
    event.preventDefault();
    if (!signer) {
      setStatus("Conecta una billetera para crear la encuesta.");
      return;
    }

    const labels = options.map((option) => option.trim()).filter(Boolean);
    if (title.trim().length === 0 || labels.length < 2) {
      setStatus("Hace falta un título y al menos dos opciones.");
      return;
    }

    setBusy(true);
    setStatus("Firmando la creación…");
    try {
      await createPoll({
        network,
        walletClient: signer.walletClient,
        account: signer.account.address,
        title: title.trim(),
        description: description.trim(),
        options: labels,
        durationSeconds: BigInt(duration),
      });
      setTitle("");
      setDescription("");
      setOptions(["", ""]);
      setStatus("Encuesta publicada.");
      setReloadToken((token) => token + 1);
    } catch (error) {
      setStatus(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  async function onVote(pollId: bigint, optionIndex: bigint) {
    if (!signer) {
      setStatus("Conecta una billetera para votar.");
      return;
    }
    setBusy(true);
    setStatus("Enviando el voto…");
    try {
      await castVote({
        network,
        walletClient: signer.walletClient,
        account: signer.account.address,
        pollId,
        optionIndex,
      });
      setStatus("Voto contado.");
      setReloadToken((token) => token + 1);
    } catch (error) {
      setStatus(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  async function onConnect() {
    setBusy(true);
    try {
      const connected = await connectInjectedWallet(network);
      setWalletAddress(connected.address);
      setWalletClient(connected.walletClient);
      setStatus(`Conectada ${shortAddress(connected.address)}.`);
    } catch (error) {
      setStatus(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="page">
      <header className="topbar">
        <div>
          <p className="eyebrow">Monad workshop</p>
          <h1>Urna</h1>
        </div>
        <div className="topbar-actions">
          <label>
            Red
            <select
              value={network}
              onChange={(event) => {
                setNetwork(event.target.value as NetworkId);
                setWalletAddress(null);
                setWalletClient(null);
                setPolls([]);
                setNodeOnline(null);
              }}
            >
              <option value="local">Hardhat local</option>
              <option value="monad">Monad testnet</option>
            </select>
          </label>
          {network === "local" ? (
            <label>
              Firmante
              <select
                value={accountIndex}
                onChange={(event) => setAccountIndex(Number(event.target.value))}
              >
                {LOCAL_ACCOUNTS.map((account, index) => (
                  <option key={account.label} value={index}>
                    {account.label}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <button type="button" onClick={() => void onConnect()} disabled={busy}>
              {walletAddress ? shortAddress(walletAddress) : "Conectar billetera"}
            </button>
          )}
        </div>
      </header>

      <p className="lede">
        Cada dirección vota una vez. El conteo queda en el contrato y no se puede
        reescribir desde la interfaz.
      </p>

      {!contractAddress && (
        <section className="notice">
          <h2>Falta el contrato en esta red</h2>
          <p>
            {network === "local"
              ? "Arranca el nodo con npm run node y despliega con npm run deploy:local. Reinicia la app para que tome la dirección."
              : "Despliega en Monad testnet y guarda la dirección en VITE_MONAD_VOTING_ADDRESS."}
          </p>
        </section>
      )}

      {contractAddress && nodeOnline === false && (
        <section className="notice">
          <h2>No hay conexión con la red</h2>
          <p>
            {network === "local"
              ? "El nodo local no responde en 127.0.0.1:8545."
              : "No se pudo leer Monad testnet."}
          </p>
        </section>
      )}

      <main className="layout">
        <form className="panel" onSubmit={(event) => void onCreate(event)}>
          <h2>Nueva encuesta</h2>
          <label>
            Título
            <input
              value={title}
              maxLength={80}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="¿Qué construimos después?"
            />
          </label>
          <label>
            Contexto
            <textarea
              value={description}
              maxLength={280}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="Una línea para quien llega sin contexto."
            />
          </label>
          <fieldset>
            <legend>Opciones</legend>
            {options.map((option, index) => (
              <input
                key={index}
                value={option}
                maxLength={40}
                placeholder={`Opción ${index + 1}`}
                onChange={(event) => {
                  const next = [...options];
                  next[index] = event.target.value;
                  setOptions(next);
                }}
              />
            ))}
            <div className="row">
              <button
                type="button"
                className="ghost"
                disabled={options.length >= 6}
                onClick={() => setOptions([...options, ""])}
              >
                Añadir opción
              </button>
              <button
                type="button"
                className="ghost"
                disabled={options.length <= 2}
                onClick={() => setOptions(options.slice(0, -1))}
              >
                Quitar
              </button>
            </div>
          </fieldset>
          <label>
            Cierra en
            <select value={duration} onChange={(event) => setDuration(event.target.value)}>
              {DURATIONS.map((item) => (
                <option key={item.label} value={item.seconds.toString()}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>
          <button type="submit" disabled={busy || !contractAddress || !signer}>
            Publicar encuesta
          </button>
          {network === "local" && signer && (
            <p className="hint">Firmando como {shortAddress(signer.account.address)}</p>
          )}
        </form>

        <section className="polls">
          <div className="polls-head">
            <h2>Encuestas</h2>
            <button
              type="button"
              className="ghost"
              onClick={() => setReloadToken((token) => token + 1)}
            >
              Actualizar
            </button>
          </div>
          {contractAddress && polls.length === 0 && nodeOnline !== false && (
            <p className="empty">Todavía no hay encuestas en este contrato.</p>
          )}
          {polls.map((poll) => (
            <article className="poll" key={poll.id.toString()}>
              <header>
                <div>
                  <h3>{poll.title}</h3>
                  {poll.description && <p>{poll.description}</p>}
                </div>
                <span className={poll.open ? "badge open" : "badge closed"}>
                  {poll.open ? "Abierta" : "Cerrada"}
                </span>
              </header>
              <p className="meta">
                {poll.open ? "Cierra" : "Cerró"} {formatDeadline(poll.deadline)} ·{" "}
                {poll.totalVotes.toString()}{" "}
                {poll.totalVotes === 1n ? "voto" : "votos"} · {shortAddress(poll.creator)}
              </p>
              <ul>
                {poll.options.map((option, index) => {
                  const share =
                    poll.totalVotes === 0n
                      ? 0
                      : Number((option.votes * 100n) / poll.totalVotes);
                  const selected = poll.hasVoted && poll.voteIndex === BigInt(index);
                  const leading =
                    poll.winnerIndex !== null &&
                    option.votes === poll.winnerVotes &&
                    option.votes > 0n;
                  return (
                    <li key={option.label}>
                      <button
                        type="button"
                        disabled={busy || !poll.open || poll.hasVoted || !signer}
                        onClick={() => void onVote(poll.id, BigInt(index))}
                      >
                        <span className="option-label">
                          {option.label}
                          {selected && <em> tu voto</em>}
                          {leading && <em>{poll.tied ? " empate" : " adelante"}</em>}
                        </span>
                        <span className="option-count">{option.votes.toString()}</span>
                        <span className="bar" style={{ width: `${share}%` }} />
                      </button>
                    </li>
                  );
                })}
              </ul>
            </article>
          ))}
        </section>
      </main>
      <footer>{status}</footer>
    </div>
  );
}
