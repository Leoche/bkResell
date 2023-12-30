import { createRequire } from 'module';
const require = createRequire(import.meta.url)
const { Liquidity, Percent, Token, TokenAccount, TokenAmount } = require("@raydium-io/raydium-sdk");
import {Connection,Keypair,Transaction,ComputeBudgetProgram} from "@solana/web3.js";
import { sendTx } from "./send_transaction.js"

export async function swap(
  connection,
  poolKeys,
  ownerKeypair,
  tokenAccounts,
  is_snipe,
  amountIn,
  minAmountOut
) {
  const owner = ownerKeypair.publicKey

  const inst = await Liquidity.makeSwapInstructionSimple({
    connection: connection,
    poolKeys: poolKeys,
    userKeys: {
      tokenAccounts,
      owner
    },
    amountIn,
    amountOut: minAmountOut,
    fixedSide: "in",
    config: {}
  })

  const modifyComputeUnits = ComputeBudgetProgram.setComputeUnitLimit({ 
    units: 1000000 
  });
  
  const addPriorityFee = ComputeBudgetProgram.setComputeUnitPrice({ 
    microLamports: 10000
  });

  const tx = new Transaction()
  tx.add(modifyComputeUnits)
  .add(addPriorityFee);
  const signers = [ownerKeypair]

  inst.innerTransactions[0].instructions.forEach(e => {
    tx.add(e)
  })

  inst.innerTransactions[0].signers.forEach(e => {
    signers.push(e)
  })

  const res = await sendTx(connection, tx, signers)
  return res
}
