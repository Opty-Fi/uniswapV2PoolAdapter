import { task } from "hardhat/config";
import { TaskArguments } from "hardhat/types";

import { SushiswapPoolAdapter, SushiswapPoolAdapter__factory } from "../../typechain";

task("deploy-sushiswap-pool-adapter").setAction(async function (taskArguments: TaskArguments, { ethers }) {
  const sushiswapPoolAdapterFactory: SushiswapPoolAdapter__factory = await ethers.getContractFactory(
    "SushiswapPoolAdapter",
  );
  const sushiswapPoolAdapter: SushiswapPoolAdapter = <SushiswapPoolAdapter>(
    await sushiswapPoolAdapterFactory.deploy(taskArguments[0], taskArguments[1])
  );
  await sushiswapPoolAdapter.deployed();
  console.log("SushiswapPoolAdapter deployed to: ", sushiswapPoolAdapter.address);
});
