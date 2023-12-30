import { createRequire } from 'module';
const require = createRequire(import.meta.url)
const { SPL_ACCOUNT_LAYOUT, TOKEN_PROGRAM_ID } = require("@raydium-io/raydium-sdk");

//fetching token accounts
export async function getTokenAccountsByOwner(connection, owner) {
  const tokenResp = await connection.getTokenAccountsByOwner(owner, {
    programId: TOKEN_PROGRAM_ID
  })

  const accounts = []

  for (const { pubkey, account } of tokenResp.value) {
    accounts.push({
      pubkey,
      accountInfo: SPL_ACCOUNT_LAYOUT.decode(account.data)
    })
  }

  return accounts
}
