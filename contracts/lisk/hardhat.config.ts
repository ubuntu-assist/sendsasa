import { HardhatUserConfig } from 'hardhat/config'
import '@nomicfoundation/hardhat-toolbox'
import 'dotenv/config'

const DEPLOYER_KEY = process.env.DEPLOYER_PRIVATE_KEY ?? ''

const config: HardhatUserConfig = {
  solidity: {
    version: '0.8.20',
    settings: { optimizer: { enabled: true, runs: 200 } },
  },
  networks: {
    liskSepolia: {
      url: 'https://rpc.sepolia-api.lisk.com',
      chainId: 4202,
      accounts: DEPLOYER_KEY ? [DEPLOYER_KEY] : [],
    },
    lisk: {
      url: process.env.LISK_RPC_URL ?? 'https://rpc.api.lisk.com',
      chainId: 1135,
      accounts: DEPLOYER_KEY ? [DEPLOYER_KEY] : [],
    },
  },
  etherscan: {
    apiKey: {
      lisk: 'empty',
      liskSepolia: 'empty',
    },
    customChains: [
      {
        network: 'lisk',
        chainId: 1135,
        urls: {
          apiURL: 'https://blockscout.lisk.com/api',
          browserURL: 'https://blockscout.lisk.com',
        },
      },
      {
        network: 'liskSepolia',
        chainId: 4202,
        urls: {
          apiURL: 'https://sepolia-blockscout.lisk.com/api',
          browserURL: 'https://sepolia-blockscout.lisk.com',
        },
      },
    ],
  },
}

export default config
