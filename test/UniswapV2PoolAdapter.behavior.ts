import chai, { expect } from "chai";
import { solidity } from "ethereum-waffle";
import { BigNumber } from "ethers";
import { ethers } from "hardhat";
import { LiquidityPool, PoolItem } from "./types";
import { ERC20, ERC20__factory, IUniswapV2Pair__factory, UniswapV2PoolAdapter } from "../typechain";
import { getOverrideOptions, setTokenBalanceInStorage } from "./utils";

chai.use(solidity);

export function shouldBehaveLikeUniswapV2PoolAdapter(
  underlyingTokenName: string,
  poolName: string,
  pool: PoolItem,
  tokens: { [key: string]: string },
  pools: LiquidityPool,
  router: string,
  sandwhichAttackStepPool: string,
  protocol: string,
): void {
  it(`should deposit ${underlyingTokenName} and withdraw ${underlyingTokenName} in ${poolName} pool of Sushiswap`, async function () {
    if (pool.deprecated == true) {
      this.skip();
    }

    const adapterInstances: { [key: string]: UniswapV2PoolAdapter } = {
      Sushiswap: this.sushiswapPoolAdapter,
      Apeswap: this.apeswapPoolAdapter,
      Quickswap: this.quickswapPoolAdapter,
    };

    const adapterInstance = adapterInstances[protocol];

    let tx = await this.testDeFiAdapter.giveAllowances([pool.pool, pool.token0, pool.token1], [router, router, router]);
    await tx.wait(1);

    tx = await adapterInstance
      .connect(this.signers.riskOperator)
      .setLiquidityPoolToTolerance([{ liquidityPool: pool.pool, tolerance: "150" }]);
    await tx.wait(1);

    tx = await adapterInstance.connect(this.signers.riskOperator).setLiquidityPoolToWantTokenToSlippage([
      { liquidityPool: pool.pool, wantToken: pool.token0, slippage: "100" },
      { liquidityPool: pool.pool, wantToken: pool.token1, slippage: "100" },
    ]);

    // sushiswap's deposit pool instance
    const sushiswapDepositInstance = await ethers.getContractAt(IUniswapV2Pair__factory.abi, pool.pool);

    // token0 instance
    const token0Instance = <ERC20>await ethers.getContractAt(ERC20__factory.abi, pool.token0);

    // token1 instance
    const token1Instance = <ERC20>await ethers.getContractAt(ERC20__factory.abi, pool.token1);

    let underlyingTokenInstance: ERC20;
    let toTokenInstance: ERC20;
    let reserve0: BigNumber;
    let reserve1: BigNumber;

    if (tokens[underlyingTokenName as keyof typeof tokens] == pool.token0) {
      underlyingTokenInstance = token0Instance;
      toTokenInstance = token1Instance;
      reserve0 = (await sushiswapDepositInstance.getReserves())[0];
      reserve1 = (await sushiswapDepositInstance.getReserves())[1];
    } else {
      underlyingTokenInstance = token1Instance;
      toTokenInstance = token0Instance;
      reserve0 = (await sushiswapDepositInstance.getReserves())[1];
      reserve1 = (await sushiswapDepositInstance.getReserves())[0];
    }

    await setTokenBalanceInStorage(underlyingTokenInstance, this.testDeFiAdapter.address, "20");

    // 1. deposit all underlying tokens
    await this.testDeFiAdapter.testGetDepositAllCodes(
      underlyingTokenInstance.address,
      pool.pool,
      adapterInstance.address,
      getOverrideOptions(),
    );
    // 2. assert whether lptoken balance is as expected or not after deposit
    const actualLPTokenBalanceAfterDeposit = await adapterInstance.getLiquidityPoolTokenBalance(
      this.testDeFiAdapter.address,
      this.testDeFiAdapter.address, // placeholder of type address
      pool.pool,
    );

    const expectedLPTokenBalanceAfterDeposit = await sushiswapDepositInstance.balanceOf(this.testDeFiAdapter.address);
    expect(actualLPTokenBalanceAfterDeposit).to.be.eq(expectedLPTokenBalanceAfterDeposit);
    // 3. assert whether underlying token balance is as expected or not after deposit
    const actualUnderlyingTokenBalanceAfterDeposit = await this.testDeFiAdapter.getERC20TokenBalance(
      underlyingTokenInstance.address,
      this.testDeFiAdapter.address,
    );
    const expectedUnderlyingTokenBalanceAfterDeposit = await underlyingTokenInstance.balanceOf(
      this.testDeFiAdapter.address,
    );
    expect(actualUnderlyingTokenBalanceAfterDeposit).to.be.eq(expectedUnderlyingTokenBalanceAfterDeposit);

    // 4. assert whether the amount in token is as expected or not after depositing
    const _underlyingTokenBalanceInVaultAfterDeposit = await underlyingTokenInstance.balanceOf(
      this.testDeFiAdapter.address,
    );

    const vaultToTokenBalance = await this.testDeFiAdapter.getERC20TokenBalance(
      toTokenInstance.address,
      this.testDeFiAdapter.address,
    );

    // 5. Withdraw all lpToken balance
    await this.testDeFiAdapter.testGetWithdrawAllCodes(
      underlyingTokenInstance.address,
      pool.pool,
      adapterInstance.address,
      getOverrideOptions(),
    );

    // 6. assert whether lpToken balance is as expected or not
    const actualLPTokenBalanceAfterWithdraw = await adapterInstance.getLiquidityPoolTokenBalance(
      this.testDeFiAdapter.address,
      this.testDeFiAdapter.address, // placeholder of type address
      pool.pool,
    );
    const expectedLPTokenBalanceAfterWithdraw = await sushiswapDepositInstance.balanceOf(this.testDeFiAdapter.address);
    expect(actualLPTokenBalanceAfterWithdraw).to.be.eq(expectedLPTokenBalanceAfterWithdraw);

    // 7. assert whether underlying token balance is as expected or not after withdraw
    const actualUnderlyingTokenBalanceAfterWithdraw = await this.testDeFiAdapter.getERC20TokenBalance(
      underlyingTokenInstance.address,
      this.testDeFiAdapter.address,
    );

    const slippage = await adapterInstance.liquidityPoolToWantTokenToSlippage(
      pool.pool,
      underlyingTokenInstance.address,
    );
    const amountOutUT = await adapterInstance.getSomeAmountInToken(
      underlyingTokenInstance.address,
      pool.pool,
      actualLPTokenBalanceAfterDeposit,
    );
    let vaultToTokenBalanceInUT = BigNumber.from("0");
    if (vaultToTokenBalance.gt(BigNumber.from("0"))) {
      vaultToTokenBalanceInUT = await this.sushiswapRouter.getAmountOut(vaultToTokenBalance, reserve1, reserve0);
    }
    expect(actualUnderlyingTokenBalanceAfterWithdraw).to.be.gte(
      amountOutUT
        .div(BigNumber.from("2"))
        .add(
          amountOutUT
            .div(BigNumber.from("2"))
            .add(vaultToTokenBalanceInUT)
            .mul(BigNumber.from("10000").sub(slippage))
            .div(BigNumber.from("10000")),
        )
        .add(_underlyingTokenBalanceInVaultAfterDeposit),
    );

    // 8. non-riskOperator shouldn't be able to set tolerances
    await expect(
      adapterInstance
        .connect(this.signers.attacker)
        .setLiquidityPoolToTolerance([{ liquidityPool: "0xD75EA151a61d06868E31F8988D28DFE5E9df57B4", tolerance: 200 }]),
    ).to.be.revertedWith("caller is not the riskOperator");

    // 9. riskOperator should be able to set tolerances
    await adapterInstance
      .connect(this.signers.riskOperator)
      .setLiquidityPoolToTolerance([{ liquidityPool: "0xD75EA151a61d06868E31F8988D28DFE5E9df57B4", tolerance: 200 }]);
    expect(await adapterInstance.liquidityPoolToTolerance("0xD75EA151a61d06868E31F8988D28DFE5E9df57B4")).to.be.eq(200);
  }).timeout(100000);
}
