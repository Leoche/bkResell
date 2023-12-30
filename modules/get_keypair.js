import { Keypair } from "@solana/web3.js"
import bs58 from "bs58"
import fs from "fs"

//function to fetch the owners keypair object from config
//returns Keypair instance if valid or undefined if not
export function get_wallet(wallet_path) {
  var wallet_txt = fs.readFileSync(wallet_path, "utf8")
  try {
    const secretkey = bs58.decode(wallet_txt)
    const ownerKeypair = Keypair.fromSecretKey(secretkey)

    return ownerKeypair
  } catch {}
}
