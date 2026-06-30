import { ethers } from 'hardhat'

async function main() {
  const usdcAddress = process.env.LISK_USDC_ADDRESS
  const feeRecipient = process.env.FEE_RECIPIENT_ADDRESS

  if (!usdcAddress) throw new Error('LISK_USDC_ADDRESS not set')
  if (!feeRecipient) throw new Error('FEE_RECIPIENT_ADDRESS not set')

  const [deployer] = await ethers.getSigners()
  console.log('Deploying TrustLock with:', deployer.address)

  const TrustLock = await ethers.getContractFactory('TrustLock')
  const trustlock = await TrustLock.deploy(usdcAddress, feeRecipient)
  await trustlock.waitForDeployment()

  const address = await trustlock.getAddress()
  console.log('TrustLock deployed to:', address)
  console.log('Set LISK_TRUSTLOCK_ADDRESS=' + address)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
