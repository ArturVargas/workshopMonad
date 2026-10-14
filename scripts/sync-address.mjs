import { existsSync, readFileSync, writeFileSync } from "node:fs";

const deployedPath = "ignition/deployments/chain-31337/deployed_addresses.json";
const deployed = JSON.parse(readFileSync(deployedPath, "utf8"));
const address = deployed["VotingModule#Voting"];

if (!address) {
  throw new Error("No apareció VotingModule#Voting en el deployment local.");
}

const envPath = "app/.env.local";
const line = `VITE_LOCAL_VOTING_ADDRESS=${address}`;
const current = existsSync(envPath) ? readFileSync(envPath, "utf8") : "";
const next = current.includes("VITE_LOCAL_VOTING_ADDRESS=")
  ? current.replace(/VITE_LOCAL_VOTING_ADDRESS=.*/g, line)
  : `${current.trim()}\n${line}\n`.replace(/^\n/, "");

writeFileSync(envPath, next.endsWith("\n") ? next : `${next}\n`);
console.log(`Dirección local escrita en ${envPath}: ${address}`);
