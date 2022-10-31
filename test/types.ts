import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/dist/src/signer-with-address";
import { Fixture } from "ethereum-waffle";
import { IUniswapV2Router02 } from "../typechain/IUniswapV2Router02";
import { TestDeFiAdapter } from "../typechain/TestDeFiAdapter";
import { OptyFiOracle } from "../typechain/OptyFiOracle";
import { UniswapV2PoolAdapter } from "../typechain";

export interface Signers {
  admin: SignerWithAddress;
  owner: SignerWithAddress;
  deployer: SignerWithAddress;
  alice: SignerWithAddress;
  attacker: SignerWithAddress;
  operator: SignerWithAddress;
  riskOperator: SignerWithAddress;
}

export interface PoolItem {
  pool: string;
  token0: string;
  token1: string;
  deprecated?: boolean;
}

export interface LiquidityPool {
  [name: string]: PoolItem;
}

declare module "mocha" {
  export interface Context {
    sushiswapPoolAdapter: UniswapV2PoolAdapter;
    apeswapPoolAdapter: UniswapV2PoolAdapter;
    quickswapPoolAdapter: UniswapV2PoolAdapter;
    uniswapV2PoolAdapter: UniswapV2PoolAdapter;
    testDeFiAdapter: TestDeFiAdapter;
    sushiswapRouter: IUniswapV2Router02;
    apeswapRouter: IUniswapV2Router02;
    quickswapRouter: IUniswapV2Router02;
    uniswapV2Router: IUniswapV2Router02;
    optyFiOracle: OptyFiOracle;
    loadFixture: <T>(fixture: Fixture<T>) => Promise<T>;
    signers: Signers;
  }
}
