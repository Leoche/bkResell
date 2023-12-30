import { createRequire } from 'module';
const require = createRequire(import.meta.url)
const { Liquidity, Percent, Token, TokenAmount, TOKEN_PROGRAM_ID } = require("@raydium-io/raydium-sdk");

//computes live estimates of the swap and returns details for transaction building or display on UI.
//returns a list containing trade details (fees,price impact,expected amount out etc..)

export async function compute(
  connection,
  poolKeys,
  curr_in,
  curr_out,
  amount_in,
  slip
) {
  try {
    const poolInfo = await Liquidity.fetchInfo({ connection, poolKeys })
    //setting up decimals
    var in_decimal
    var out_decimal

    if (curr_in.toBase58() === poolKeys.baseMint.toBase58()) {
      in_decimal = poolInfo.baseDecimals
      out_decimal = poolInfo.quoteDecimals
    } else {
      out_decimal = poolInfo.baseDecimals
      in_decimal = poolInfo.quoteDecimals
    }

    console.log("in_decimal" , in_decimal)
    console.log("out_decimal" , out_decimal)

    //priming and computing
    const amountIn = new TokenAmount(
      new Token(TOKEN_PROGRAM_ID, curr_in.toBase58(), in_decimal),
      amount_in,
      false
    )

    const currencyOut = new Token(TOKEN_PROGRAM_ID, curr_out.toBase58(), out_decimal)

    const slippage = new Percent(slip, 100)

    const {
      amountOut,
      minAmountOut,
      currentPrice,
      executionPrice,
      priceImpact,
      fee
    } = Liquidity.computeAmountOut({
      poolKeys,
      poolInfo,
      amountIn,
      currencyOut,
      slippage
    })

    return [
      amountOut,
      minAmountOut,
      currentPrice,
      executionPrice,
      priceImpact,
      fee,
      amountIn
    ]
  } catch (e) {
    console.log(e)
    return 1
  }
}
