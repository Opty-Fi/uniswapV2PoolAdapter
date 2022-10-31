import { artifacts, ethers, waffle } from "hardhat";
import { Artifact } from "hardhat/types";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/dist/src/signer-with-address";
import { default as SushiswapPolygon } from "@optyfi/defi-legos/polygon/sushiswap";
import { default as ApeswapPolygon } from "@optyfi/defi-legos/polygon/apeswap";
import { default as QuickswapPolygon } from "@optyfi/defi-legos/polygon/quickswap";
import { legos as Polygon } from "@optyfi/defi-legos/polygon";
import { getAddress } from "ethers/lib/utils";
import { LiquidityPool, Signers } from "./types";
import {
  IUniswapV2Router02,
  IUniswapV2Router02__factory,
  OptyFiOracle,
  TestDeFiAdapter,
  UniswapV2PoolAdapter,
} from "../typechain";
import { getOverrideOptions } from "./utils";
import { shouldBehaveLikeUniswapV2PoolAdapter } from "./UniswapV2PoolAdapter.behavior";

const { deployContract } = waffle;

const polygonTestPools: string[] = ["WMATIC-USDC", "USDC-USDT", "USDC-DAI"];
const polygonTestUnderlyingTokens: { [key: string]: string } = {
  USDC: getAddress(Polygon.tokens.USDC),
  USDT: getAddress(Polygon.tokens.USDT),
  DAI: getAddress(Polygon.tokens.DAI),
  WMATIC: getAddress(Polygon.tokens.WMATIC),
};

describe("Unit tests for UniswapV2PoolAdapter", function () {
  before(async function () {
    this.signers = {} as Signers;
    const signers: SignerWithAddress[] = await ethers.getSigners();
    this.signers.owner = signers[0];
    this.signers.deployer = signers[1];
    this.signers.attacker = signers[2];
    this.signers.riskOperator = signers[3];

    const registryArtifact: Artifact = await artifacts.readArtifact("IAdapterRegistryBase");
    const mockRegistry = await waffle.deployMockContract(this.signers.deployer, registryArtifact.abi);
    await mockRegistry.mock.getRiskOperator.returns(this.signers.riskOperator.address);

    // get the UniswapV2Router contract instance
    this.sushiswapRouter = <IUniswapV2Router02>(
      await ethers.getContractAt(IUniswapV2Router02__factory.abi, SushiswapPolygon.SushiswapRouter.address)
    );

    // deploy OptyFi Oracle
    const OptyFiOracleArtifact: Artifact = await artifacts.readArtifact("OptyFiOracle");
    this.optyFiOracle = <OptyFiOracle>(
      await deployContract(this.signers.owner, OptyFiOracleArtifact, ["86400", "86400"], getOverrideOptions())
    );

    // deploy Sushiswap Pools Adapter
    const unswapV2PoolAdapterArtifact: Artifact = await artifacts.readArtifact("UniswapV2PoolAdapter");
    this.sushiswapPoolAdapter = <UniswapV2PoolAdapter>(
      await deployContract(
        this.signers.deployer,
        unswapV2PoolAdapterArtifact,
        [
          mockRegistry.address,
          this.optyFiOracle.address,
          SushiswapPolygon.SushiswapRouter.address,
          SushiswapPolygon.SushiswapFactory.address,
          SushiswapPolygon.rootKFactor,
        ],
        getOverrideOptions(),
      )
    );

    this.apeswapPoolAdapter = <UniswapV2PoolAdapter>(
      await deployContract(
        this.signers.deployer,
        unswapV2PoolAdapterArtifact,
        [
          mockRegistry.address,
          this.optyFiOracle.address,
          ApeswapPolygon.ApeswapRouter.address,
          ApeswapPolygon.ApeswapFactory.address,
          ApeswapPolygon.rootKFactor,
        ],
        getOverrideOptions(),
      )
    );

    // set price feed for WMATIC-USD
    await this.optyFiOracle.connect(this.signers.owner).setChainlinkPriceFeed([
      {
        tokenA: Polygon.tokens.WMATIC,
        tokenB: Polygon.tokens.USD,
        priceFeed: "0xAB594600376Ec9fD91F8e885dADF0CE036862dE0",
      },
    ]);

    // set price feed for USDC-USD
    await this.optyFiOracle.connect(this.signers.owner).setChainlinkPriceFeed([
      {
        tokenA: Polygon.tokens.USDC,
        tokenB: Polygon.tokens.USD,
        priceFeed: "0xfE4A8cc5b5B2366C1B58Bea3858e81843581b2F7",
      },
    ]);

    // set price feed for USDT-USD
    await this.optyFiOracle.connect(this.signers.owner).setChainlinkPriceFeed([
      {
        tokenA: Polygon.tokens.USDT,
        tokenB: Polygon.tokens.USD,
        priceFeed: "0x0A6513e40db6EB1b165753AD52E80663aeA50545",
      },
    ]);

    // set price feed for DAI-USD
    await this.optyFiOracle.connect(this.signers.owner).setChainlinkPriceFeed([
      {
        tokenA: Polygon.tokens.DAI,
        tokenB: Polygon.tokens.USD,
        priceFeed: "0x4746DeC9e833A82EC7C2C1356372CcF2cfcD2F3D",
      },
    ]);

    // deploy TestDeFiAdapter Contract
    const testDeFiAdapterArtifact: Artifact = await artifacts.readArtifact("TestDeFiAdapter");
    this.testDeFiAdapter = <TestDeFiAdapter>(
      await deployContract(this.signers.deployer, testDeFiAdapterArtifact, [], getOverrideOptions())
    );
  });

  describe("SushiswapPoolAdapter", function () {
    Object.keys(SushiswapPolygon.liquidity.pools).map(async function (poolName: string) {
      const pairUnderlyingTokens = [
        getAddress((SushiswapPolygon.liquidity.pools as LiquidityPool)[poolName].token0),
        getAddress((SushiswapPolygon.liquidity.pools as LiquidityPool)[poolName].token1),
      ];
      for (const pairUnderlyingToken of pairUnderlyingTokens) {
        if (!polygonTestPools.includes(poolName)) {
          continue;
        }
        if (Object.values(polygonTestUnderlyingTokens).includes(pairUnderlyingToken)) {
          for (const key of Object.keys(Polygon.tokens)) {
            if (polygonTestUnderlyingTokens[key as keyof typeof polygonTestUnderlyingTokens] == pairUnderlyingToken) {
              shouldBehaveLikeUniswapV2PoolAdapter(
                key,
                poolName,
                (SushiswapPolygon.liquidity.pools as LiquidityPool)[poolName],
                Polygon.tokens,
                SushiswapPolygon.SushiswapRouter.address,
                "Sushiswap",
              );
            }
          }
        }
      }
    });
  });

  describe("ApeswapPoolAdapter", function () {
    Object.keys(ApeswapPolygon.liquidity.pools).map(async function (poolName: string) {
      const pairUnderlyingTokens = [
        getAddress((ApeswapPolygon.liquidity.pools as LiquidityPool)[poolName].token0),
        getAddress((ApeswapPolygon.liquidity.pools as LiquidityPool)[poolName].token1),
      ];
      for (const pairUnderlyingToken of pairUnderlyingTokens) {
        if (!polygonTestPools.includes(poolName)) {
          continue;
        }
        if (Object.values(polygonTestUnderlyingTokens).includes(pairUnderlyingToken)) {
          for (const key of Object.keys(Polygon.tokens)) {
            if (polygonTestUnderlyingTokens[key as keyof typeof polygonTestUnderlyingTokens] == pairUnderlyingToken) {
              shouldBehaveLikeUniswapV2PoolAdapter(
                key,
                poolName,
                (ApeswapPolygon.liquidity.pools as LiquidityPool)[poolName],
                Polygon.tokens,
                ApeswapPolygon.ApeswapRouter.address,
                "Apeswap",
              );
            }
          }
        }
      }
    });
  });

  describe("ApeswapPoolAdapter", function () {
    Object.keys(QuickswapPolygon.liquidity.pools).map(async function (poolName: string) {
      const pairUnderlyingTokens = [
        getAddress((QuickswapPolygon.liquidity.pools as LiquidityPool)[poolName].token0),
        getAddress((QuickswapPolygon.liquidity.pools as LiquidityPool)[poolName].token1),
      ];
      for (const pairUnderlyingToken of pairUnderlyingTokens) {
        if (!polygonTestPools.includes(poolName)) {
          continue;
        }
        if (Object.values(polygonTestUnderlyingTokens).includes(pairUnderlyingToken)) {
          for (const key of Object.keys(Polygon.tokens)) {
            if (polygonTestUnderlyingTokens[key as keyof typeof polygonTestUnderlyingTokens] == pairUnderlyingToken) {
              shouldBehaveLikeUniswapV2PoolAdapter(
                key,
                poolName,
                (QuickswapPolygon.liquidity.pools as LiquidityPool)[poolName],
                Polygon.tokens,
                QuickswapPolygon.QuickswapRouter.address,
                "Quickswap",
              );
            }
          }
        }
      }
    });
  });
});
