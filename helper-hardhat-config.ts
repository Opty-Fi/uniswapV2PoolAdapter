import { config as dotenvConfig } from "dotenv";
import { HardhatNetworkForkingUserConfig } from "hardhat/types";
import { resolve } from "path";
dotenvConfig({ path: resolve(__dirname, "./.env") });
const GWEI = 1000 * 1000 * 1000;

export enum eEVMNetwork {
  mainnet = "mainnet",
  hardhat = "hardhat",
  polygon = "polygon",
  avalanche = "avalanche",
  mumbai = "mumbai",
}

export type iEVMParamsPerNetwork<T> = {
  [key in eEVMNetwork]: T;
};

export const NETWORKS_CHAIN_ID: iEVMParamsPerNetwork<number> = {
  [eEVMNetwork.mainnet]: 1,
  [eEVMNetwork.hardhat]: 31337,
  [eEVMNetwork.polygon]: 137,
  [eEVMNetwork.avalanche]: 43114,
  [eEVMNetwork.mumbai]: 80001,
};

export const NETWORKS_CHAIN_ID_HEX: iEVMParamsPerNetwork<string> = {
  [eEVMNetwork.mainnet]: "0x1",
  [eEVMNetwork.hardhat]: "0x7a69",
  [eEVMNetwork.polygon]: "0x89",
  [eEVMNetwork.avalanche]: "0xa86a",
  [eEVMNetwork.mumbai]: "0x13881",
};

export const NETWORKS_CHAIN_ID_TO_HEX: { [key: string]: string } = {
  "1": "0x1",
  "31337": "0x7a69",
  "137": "0x89",
  "43114": "0xa86a",
  "80001": "0x13881",
};

export const NETWORKS_RPC_URL: iEVMParamsPerNetwork<string> = {
  [eEVMNetwork.mainnet]: process.env.MAINNET_NODE_URL ? process.env.MAINNET_NODE_URL : "",
  [eEVMNetwork.hardhat]: "http://localhost:8545",
  [eEVMNetwork.polygon]: process.env.POLYGON_NODE_URL ? process.env.POLYGON_NODE_URL : "",
  [eEVMNetwork.avalanche]: process.env.AVALANCHE_NODE_URL ? process.env.AVALANCHE_NODE_URL : "",
  [eEVMNetwork.mumbai]: process.env.MUMBAI_NODE_URL ? process.env.MUMBAI_NODE_URL : "",
};

export const NETWORKS_DEFAULT_GAS: iEVMParamsPerNetwork<number | "auto"> = {
  [eEVMNetwork.mainnet]: "auto",
  [eEVMNetwork.hardhat]: "auto",
  [eEVMNetwork.polygon]: 50 * GWEI,
  [eEVMNetwork.avalanche]: 65 * GWEI,
  [eEVMNetwork.mumbai]: 30 * GWEI,
};

export const BLOCK_TO_FORK: iEVMParamsPerNetwork<number | undefined> = {
  [eEVMNetwork.mainnet]: 15799047,
  [eEVMNetwork.hardhat]: undefined,
  [eEVMNetwork.polygon]: 25200204,
  [eEVMNetwork.avalanche]: 17246557,
  [eEVMNetwork.mumbai]: 25291667,
};

export const buildForkConfig = (
  fork: eEVMNetwork,
  forkBlockNumber?: number,
): HardhatNetworkForkingUserConfig | undefined => {
  if (fork) {
    const forkMode: HardhatNetworkForkingUserConfig = {
      url: NETWORKS_RPC_URL[fork as eEVMNetwork],
    };
    if (forkBlockNumber || BLOCK_TO_FORK[fork]) {
      forkMode.blockNumber = forkBlockNumber || BLOCK_TO_FORK[fork];
    }

    return forkMode;
  }
  return undefined;
};

export const buildDeployConfig = (fork: eEVMNetwork): string[] | undefined => {
  if (fork) {
    const deployFolders: string[] = [`deploy`, `deploy_${fork}`];
    return deployFolders;
  }
};
