import "@nomiclabs/hardhat-waffle";
import "@typechain/hardhat";
import "solidity-coverage";
import "hardhat-gas-reporter";
import { resolve } from "path";
import { config as dotenvConfig } from "dotenv";
import { HardhatUserConfig, NetworkUserConfig } from "hardhat/types";
import {
  NETWORKS_RPC_URL,
  buildForkConfig,
  NETWORKS_CHAIN_ID,
  NETWORKS_DEFAULT_GAS,
  eEVMNetwork,
} from "./helper-hardhat-config";

dotenvConfig({ path: resolve(__dirname, "./.env") });

const HARDFORK = "merge";
const MNEMONIC_PATH = "m/44'/60'/0'/0";
const FORK = process.env.FORK || "";
const NETWORK_NAME = process.env.NETWORK_NAME || "";
const DEFAULT_BLOCK_GAS_LIMIT = 0x1fffffffffffff;
const DEFAULT_GAS_MUL = 5;
const FORK_BLOCK_NUMBER = process.env.FORK_BLOCK_NUMBER ? parseInt(process.env.FORK_BLOCK_NUMBER) : 0;

let MNEMONIC: string;
if (!process.env.MNEMONIC) {
  throw new Error("Please set your MNEMONIC in a .env file");
} else {
  MNEMONIC = process.env.MNEMONIC as string;
}

const getCommonNetworkConfig = (rpcUrl: string, networkName: eEVMNetwork, networkId: number): NetworkUserConfig => ({
  url: rpcUrl,
  hardfork: HARDFORK,
  blockGasLimit: DEFAULT_BLOCK_GAS_LIMIT,
  gasMultiplier: DEFAULT_GAS_MUL,
  gasPrice: NETWORKS_DEFAULT_GAS[networkName] || "auto",
  chainId: networkId,
  timeout: 100000,
  accounts: {
    mnemonic: MNEMONIC,
    path: MNEMONIC_PATH,
    initialIndex: 0,
    count: 20,
    accountsBalance: "10000000000000000000000",
  },
});

const config: HardhatUserConfig = {
  networks: {
    mainnet: getCommonNetworkConfig(
      NETWORKS_RPC_URL[eEVMNetwork.mainnet],
      eEVMNetwork.mainnet,
      NETWORKS_CHAIN_ID[eEVMNetwork.mainnet],
    ),
    polygon: getCommonNetworkConfig(
      NETWORKS_RPC_URL[eEVMNetwork.polygon],
      eEVMNetwork.polygon,
      NETWORKS_CHAIN_ID[eEVMNetwork.polygon],
    ),
    hardhat: {
      hardfork: HARDFORK,
      initialBaseFeePerGas: 1_00_000_000,
      gasPrice: "auto",
      forking: buildForkConfig(FORK as eEVMNetwork, FORK_BLOCK_NUMBER),
      allowUnlimitedContractSize: false,
      chainId: NETWORKS_CHAIN_ID[NETWORK_NAME as eEVMNetwork],
      accounts: {
        mnemonic: MNEMONIC,
        path: MNEMONIC_PATH,
        initialIndex: 0,
        count: 20,
        accountsBalance: "1000000000000000000000000000",
      },
    },
  },
  solidity: {
    compilers: [
      {
        version: "0.8.11",
        settings: {
          metadata: {
            // Not including the metadata hash
            // https://github.com/paulrberg/solidity-template/issues/31
            bytecodeHash: "none",
          },
          // Disable the optimizer when debugging
          // https://hardhat.org/hardhat-network/#solidity-optimizer-support
          optimizer: {
            enabled: true,
            runs: 200,
          },
        },
      },
    ],
  },
  paths: {
    artifacts: "./artifacts",
    cache: "./cache",
    sources: "./contracts",
    tests: "./test",
  },
  typechain: {
    outDir: "typechain",
    target: "ethers-v5",
  },
  mocha: {
    timeout: 0,
  },
  gasReporter: {
    enabled: false,
    currency: "USD",
    coinmarketcap: "b9cc2ae5-b176-41e8-80b0-095ab7f45f62",
    token: "ETH",
  },
};

export default config;
