import { Connection, PublicKey, LAMPORTS_PER_SOL, } from "@solana/web3.js";
import chalk from 'chalk';

import { log } from "console";
import { PROGRAM_INFO_BY_ID } from "./programs.js";
import { Metaplex } from '@metaplex-foundation/js';
import { createRequire } from 'module';
const require = createRequire(import.meta.url)
const Metadata = require('@metaplex-foundation/mpl-token-metadata');

const nFormat = new Intl.NumberFormat();

const WSS_ENDPOINT = 'wss://cold-magical-breeze.solana-mainnet.quiknode.pro/6abffb3442b1d525f2b6aab5b9ceb4b2ca4ad364/';
const HTTP_ENDPOINT = 'https://cold-magical-breeze.solana-mainnet.quiknode.pro/6abffb3442b1d525f2b6aab5b9ceb4b2ca4ad364/'; 
const connection = new Connection(HTTP_ENDPOINT,{wsEndpoint:WSS_ENDPOINT});
const MY_PUBLIC_KEY = "6TN1ZXZYnRpaEX1ueR2WKyxC2pd2Bn9te2qm8pAFbMh6";
const metaplex = Metaplex.make(connection);


(async()=>{
    //return await seller();
    const ACCOUNT_TO_WATCH = new PublicKey(MY_PUBLIC_KEY); // Replace with your own Wallet Address
    console.log(chalk.bold.yellow("Watching 👀: ") + "https://solscan.io/account/" + ACCOUNT_TO_WATCH.toString())
    await seller();
    return;
    const id = connection.onAccountChange(ACCOUNT_TO_WATCH, async (accountInfo, context) => {
        let signatures = await connection.getConfirmedSignaturesForAddress2(ACCOUNT_TO_WATCH, null, "confirmed")
        const latestSignature = signatures[0].signature;
        console.log("Account changed...");
        await isValidSignature(connection, latestSignature);
        await seller(latestSignature);
    });

})()
function delay(t) {
    return new Promise(resolve => {
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
        console.log("Retrying in 200")
        await delay(200)
        await isValidSignature(connection, sig)
    }
  };
async function seller(transactionId){
    let swapped = await getTransactionInfo(transactionId)
    if(swapped !== false) {
        console.log("- - - - - - - - - -")
        console.log("Try to swap " + chalk.bold.red("-"+swapped.out.amountReadeable) + " for " + chalk.bold.green("+"+swapped.in.amountReadeable*1.2))
        console.log("- - - - - - - - - -")
    }

}
async function getTransactionInfo(transactionId = "5GFKGVBTGn48vM5d5WXMpoAaevMTF1abDP3sTurgimovrKarS2rqhCubQKbeXyASTF9aKgE1mq3mLnjB6sdeyRmY"){
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