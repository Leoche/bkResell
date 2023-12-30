import { Connection, PublicKey, LAMPORTS_PER_SOL, } from "@solana/web3.js";
import chalk from 'chalk';
import { PROGRAM_INFO_BY_ID } from "./modules/programs.js";
import { fetchPoolKeys } from "./modules/pool_keys.js";
import { getTokenAccountsByOwner } from "./modules/get_accounts.js";
import { compute } from "./modules/compute.js";
import { get_wallet } from "./modules/get_keypair.js";
import { swap } from "./modules/swap.js";
import { get_token_amount } from "./modules/fetch_token.js";
import { Metaplex } from '@metaplex-foundation/js';
import { createRequire } from 'module';
import { finished } from "stream";
const require = createRequire(import.meta.url)
const Metadata = require('@metaplex-foundation/mpl-token-metadata');
const prompt = require('prompt')
const multiplier = 1.2

const nFormat = new Intl.NumberFormat();

const WSS_ENDPOINT = 'wss://atlas-mainnet.helius-rpc.com?api-key=23eda528-3dba-474d-a755-8d09b7a06868'; //'wss://cold-magical-breeze.solana-mainnet.quiknode.pro/6abffb3442b1d525f2b6aab5b9ceb4b2ca4ad364/';
const HTTP_ENDPOINT = 'https://mainnet.helius-rpc.com/?api-key=23eda528-3dba-474d-a755-8d09b7a06868'; // 'https://cold-magical-breeze.solana-mainnet.quiknode.pro/6abffb3442b1d525f2b6aab5b9ceb4b2ca4ad364/'; 
const connection = new Connection(HTTP_ENDPOINT);
const MY_PUBLIC_KEY = "5sSjQKpfzZkdUBYkNEsfwD3zdQbnar4ZBubSgwCWbT7u";
const metaplex = Metaplex.make(connection);
const owner = get_wallet('wallet.txt');

const debug = true;
(async()=>{
    const ACCOUNT_TO_WATCH = new PublicKey(MY_PUBLIC_KEY);
    prompt.start();
    console.log('Signature:');
    const {signature} = await prompt.get(['signature']);
    console.log("Waiting for finalized")
    await isValidSignature(connection, signature);
    const buy = await infoBuy(signature);
    if(buy !== false) {
        const sell = await seller(connection, buy);
    }
    return;

})()
function delay(t) {
    return new Promise(resolve => {
      process.stdout.write(".")
      setTimeout(resolve, t);
    });
}
const isValidSignature = async (connection, sig) => {
    const status = await connection.getSignatureStatus(sig, {
      searchTransactionHistory: true,
    });
    if(status.value?.err === null && status.value?.confirmationStatus === "finalized") {
        console.log("Finalized")
        await delay(200)
    } else {
        await delay(200)
        await isValidSignature(connection, sig)
    }
  };
async function infoBuy(transactionId){
    let swapped = await getTransactionInfo(transactionId)
    if(swapped !== false) {
        return swapped;
    }
}
async function getTransactionInfo(transactionId){
    console.log(chalk.bold.yellow("NEW TX DETECTED: ") + "https://solscan.io/tx/" + transactionId)
    const tx = await connection.getParsedTransaction(transactionId,{ maxSupportedTransactionVersion: 0, commitment: "finalized" });
    if(tx == null){
        console.log("TX is null");
        return false;
    }
    const signer = tx.transaction.message.accountKeys.filter(accounts => accounts.signer)[0].pubkey.toString()
    if(signer != MY_PUBLIC_KEY){
        console.log("Signer is not the account");
        return false;
    }
    let results = {}
    for(let index = 0; index< tx.transaction.message.instructions.length; index++){
        let instruction = tx.transaction.message.instructions[index]
        if(PROGRAM_INFO_BY_ID[instruction.programId].name == "Raydium AMM Program"){
            let innerInstruction = tx.meta.innerInstructions.filter(innerInstruction => innerInstruction.index == index)[0];
            results.raydiumAccounts = instruction.accounts;
            for(let i = 0; i< innerInstruction.instructions.length; i++){
                let innerinstruction = innerInstruction.instructions[i]
                if(innerinstruction.parsed.info.authority == signer) {
                    results.in = innerinstruction.parsed.info
                    results.in.amountReadeable = parseInt(innerinstruction.parsed.info.amount) / LAMPORTS_PER_SOL;
                    results.in.amountReal = parseInt(innerinstruction.parsed.info.amount) / LAMPORTS_PER_SOL;
                    results.in.symbol = "SOL";
                    results.in.decimal = 9;
                    console.log(" - SWAP: "+chalk.red.bold("- "+parseInt(innerinstruction.parsed.info.amount) / LAMPORTS_PER_SOL)+" SOL");
                } else{
                    results.out = innerinstruction.parsed.info
                    const account = await connection.getParsedAccountInfo(new PublicKey(innerinstruction.parsed.info.source))
                    let mint = account.value.data.parsed.info.mint;
                    const metadataPDA = metaplex.nfts().pdas().metadata({ mint: new PublicKey(mint) });
                    const metadataAccount = await connection.getAccountInfo(metadataPDA); // Get the account info from the PDA 
                    const symbol = Metadata.deserializeMetadata(metadataAccount).symbol;
                    const decimals = account.value.data.parsed.info.tokenAmount.decimals;
                    results.out.amountReal = parseInt(innerinstruction.parsed.info.amount) / (Math.pow(10,decimals));
                    results.out.amountReadeable = nFormat.format((parseInt(innerinstruction.parsed.info.amount) / (Math.pow(10,decimals))));
                    results.out.symbol = symbol;
                    results.out.decimal = decimals;
                    console.log(" - FOR : " + chalk.green.bold("+ "+nFormat.format((parseInt(innerinstruction.parsed.info.amount) / (Math.pow(10,decimals)))))+" "+symbol);
                }
            }
        }
    }
    return results
}
async function seller(connection, infoBuy){
    const desiredAmountOut = infoBuy.in.amountReadeable*multiplier;
    console.log("- - - - - - - - - -")
    console.log("Try to swap " + chalk.bold.red("-"+infoBuy.out.amountReadeable) + " for " + chalk.bold.green("+"+infoBuy.in.amountReadeable*multiplier))
    console.log("- - - - - - - - - -")
    const pool_keys = await fetchPoolKeys(connection, new PublicKey(infoBuy.raydiumAccounts[1]));

    const token_amount= await get_token_amount(connection,owner, infoBuy.raydiumAccounts[1],false);
    console.log("token_amount:", token_amount)
    const token_in_key = pool_keys.baseMint;
    const token_out_key = pool_keys.quoteMint;
    let tries = 0;
    let maxTries = 99999;
    let finished = false;
    while(!finished && tries < maxTries){
        let computation;
        try{
            computation = await compute(connection, pool_keys, token_in_key, token_out_key, token_amount, 10);
        } catch(e){
            console.log(chalk.red(`Error 100 ms...`))
            await sleep(100);
            tries++;
            continue;
        }
        if(computation == 1){
            console.log(chalk.red(`Error 100 ms...`))
            await sleep(100);
            tries++;
            continue;
        }
        //console.clear();
        console.log(chalk.blue.bold("\nQuoting #"+tries+"... "))
        const amountOut = computation[0];
        const minAmountOut = computation[1];
        const currentPrice = computation[2];
        const executionPrice = computation[3];
        const priceImpact = computation[4];
        const fee = computation[5];
        const amountIn = computation[6];
        const realAmountOut = minAmountOut.toFixed() / Math.pow(10, infoBuy.in.decimal);
        console.log(chalk.red.bold(`\n\tAverage Amount out: ${amountOut.toFixed()} SOL`))
        console.log(chalk.red.bold(`\tDesired Amount out: ${desiredAmountOut} SOL`))
        if(amountOut.toFixed() < desiredAmountOut) {
            console.log(chalk.red(`Not profitable, continuing in 200 ms...`))
            await sleep(200);
            tries++;
            continue;
        } else {
            console.log(chalk.green.bold(`\nMin Amount out: ${(minAmountOut.toFixed())} SOL`))
            console.log(chalk.green(`Swapping...`))
            const token_accounts = await getTokenAccountsByOwner(connection, owner.publicKey);
            const swap_status = await swap(connection,pool_keys,owner,token_accounts,false,amountIn,minAmountOut);
            if (swap_status == 0){
                console.log(chalk.bold.greenBright('\tSwap successful!'))
                finished = true
            }else{
                console.log(chalk.red('\tSwap failed, retrying...'))
                await sleep(200);
                tries++;
                continue
            }
        }
    }

}
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms))
}