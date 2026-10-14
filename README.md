# Urna

App de votación onchain para el workshop de Monad. Cada dirección puede crear encuestas y votar una sola vez. El escrutinio vive en el contrato.

## Reglas

- De 2 a 6 opciones, con título y un plazo de 1 minuto a 30 días.
- Un voto por dirección. No se puede cambiar.
- Los votos son públicos. Una dirección no prueba que haya una persona detrás.
- Si hay empate, el contrato marca `tied` y devuelve la primera opción que alcanza el máximo.

## Contratos

```bash
nvm use 22
npm install
npm test
```

Nodo local y despliegue, en dos terminales:

```bash
npm run node
npm run deploy:local
```

`deploy:local` escribe la dirección en `app/.env.local`.

Monad testnet pide `PRIVATE_KEY` en el entorno:

```bash
npx hardhat ignition deploy ignition/modules/Voting.ts --network monadTestnet
```

La red usa chain id `10143` y el compilador con `evmVersion: osaka`. La app ya apunta al contrato de testnet `0x3BB2262d9174C70b9a04e2bF199aa159E9953a7E`. Si despliegas otro, cambia `VITE_MONAD_VOTING_ADDRESS` en `app/.env.development`.

## Interfaz

```bash
cd app
npm install
npm run dev
```

En Hardhat local puedes firmar con las cuentas 0, 1 y 2 del nodo. En Monad testnet la app pide una billetera del navegador. El faucet está en https://faucet.monad.xyz.
