import { ethers } from 'hardhat'

async function main() {
  const usdcAddress = process.env.LISK_USDC_ADDRESS
  if (!usdcAddress) throw new Error('LISK_USDC_ADDRESS not set')

  const [deployer] = await ethers.getSigners()
  console.log('Deploying PayDayBatch with:', deployer.address)

  const PayDayBatch = await ethers.getContractFactory('PayDayBatch')
  const payday = await PayDayBatch.deploy(usdcAddress)
  await payday.waitForDeployment()

  const address = await payday.getAddress()
  console.log('PayDayBatch deployed to:', address)
  console.log('Set LISK_PAYDAY_BATCH_ADDRESS=' + address)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
