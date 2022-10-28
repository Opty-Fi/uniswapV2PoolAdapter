import hre from "hardhat";
import { Artifact } from "hardhat/types";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/dist/src/signer-with-address";
import { default as SushiswapPools } from "./sushiswap_pools_small test list.json";
import { OptyFiOracle, TestDeFiAdapter } from "../../../typechain";
import { LiquidityPool, Signers } from "../../types";
import { shouldBehaveLikeSushiswapPoolAdapter } from "./UniswapV2PoolAdapter.behavior";
import { IUniswapV2Router02 } from "../../../typechain";
import { getOverrideOptions } from "../../utils";
import tokens from "../../../helpers/tokens.json";
import underlyingTokens from "../../../helpers/underlyingTokens.json";
import { SushiswapPoolAdapterPolygon } from "../../../typechain";

const { deployContract } = hre.waffle;

describe("Unit tests", function () {
  before(async function () {
    this.signers = {} as Signers;
    const signers: SignerWithAddress[] = await hre.ethers.getSigners();
    this.signers.owner = signers[0];
    this.signers.deployer = signers[1];
    this.signers.attacker = signers[2];
    this.signers.riskOperator = signers[3];

    const registryArtifact: Artifact = await hre.artifacts.readArtifact("IAdapterRegistryBase");
    const mockRegistry = await hre.waffle.deployMockContract(this.signers.deployer, registryArtifact.abi);
    await mockRegistry.mock.getRiskOperator.returns(this.signers.riskOperator.address);

    // get the UniswapV2Router contract instance
    this.sushiswapRouter = <IUniswapV2Router02>(
      await hre.ethers.getContractAt("IUniswapV2Router02", "0x1b02dA8Cb0d097eB8D57A175b88c7D8b47997506")
    );

    // deploy OptyFi Oracle
    const OptyFiOracleArtifact: Artifact = await hre.artifacts.readArtifact("OptyFiOracle");
    this.optyFiOracle = <OptyFiOracle>(
      await deployContract(this.signers.owner, OptyFiOracleArtifact, ["86400", "86400"], getOverrideOptions())
    );

    // deploy Sushiswap Pools Adapter
    const SushiswapPoolAdapterArtifact: Artifact = await hre.artifacts.readArtifact("SushiswapPoolAdapterPolygon");
    this.sushiswapPoolAdapter = <SushiswapPoolAdapterPolygon>(
      await deployContract(
        this.signers.deployer,
        SushiswapPoolAdapterArtifact,
        [mockRegistry.address, this.optyFiOracle.address],
        getOverrideOptions(),
      )
    );

    // set price feed for WMATIC-USD
    await this.optyFiOracle
      .connect(this.signers.owner)
      .setChainlinkPriceFeed([
        { tokenA: tokens.WMATIC, tokenB: tokens.USD, priceFeed: "0xAB594600376Ec9fD91F8e885dADF0CE036862dE0" },
      ]);

    // set price feed for USDC-USD
    await this.optyFiOracle
      .connect(this.signers.owner)
      .setChainlinkPriceFeed([
        { tokenA: tokens.USDC, tokenB: tokens.USD, priceFeed: "0xfE4A8cc5b5B2366C1B58Bea3858e81843581b2F7" },
      ]);

    // set price feed for USDT-USD
    await this.optyFiOracle
      .connect(this.signers.owner)
      .setChainlinkPriceFeed([
        { tokenA: tokens.USDT, tokenB: tokens.USD, priceFeed: "0x0A6513e40db6EB1b165753AD52E80663aeA50545" },
      ]);

    // set price feed for DAI-USD
    await this.optyFiOracle
      .connect(this.signers.owner)
      .setChainlinkPriceFeed([
        { tokenA: tokens.DAI, tokenB: tokens.USD, priceFeed: "0x4746DeC9e833A82EC7C2C1356372CcF2cfcD2F3D" },
      ]);

    // deploy TestDeFiAdapter Contract
    const testDeFiAdapterArtifact: Artifact = await hre.artifacts.readArtifact("TestDeFiAdapter");
    this.testDeFiAdapter = <TestDeFiAdapter>(
      await deployContract(this.signers.deployer, testDeFiAdapterArtifact, [], getOverrideOptions())
    );
  });

  describe("SushiswapPoolAdapter", function () {
    Object.keys(SushiswapPools).map((poolName: string) => {
      const pairUnderlyingTokens = [
        (SushiswapPools as LiquidityPool)[poolName].token0,
        (SushiswapPools as LiquidityPool)[poolName].token1,
      ];
      for (const pairUnderlyingToken of pairUnderlyingTokens) {
        if (Object.values(underlyingTokens).includes(pairUnderlyingToken)) {
          for (const key of Object.keys(underlyingTokens)) {
            if ((underlyingTokens[key as keyof typeof underlyingTokens] as string) == pairUnderlyingToken) {
              shouldBehaveLikeSushiswapPoolAdapter(key, poolName, (SushiswapPools as LiquidityPool)[poolName]);
            }
          }
        }
      }
    });
  });
});
