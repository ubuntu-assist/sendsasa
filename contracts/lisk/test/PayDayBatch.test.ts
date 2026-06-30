import { expect } from 'chai'
import { ethers } from 'hardhat'
import { PayDayBatch__factory, MockERC20__factory } from '../typechain-types'
import type { PayDayBatch } from '../typechain-types'
import type { MockERC20 } from '../typechain-types'

describe('PayDayBatch', function () {
  let payday: PayDayBatch
  let usdc: MockERC20
  let employer: any
  let recipients: any[]
  let other: any

  const USDC_DECIMALS = 6n
  const ONE_USDC = 10n ** USDC_DECIMALS

  beforeEach(async function () {
    const signers = await ethers.getSigners()
    employer = signers[0]
    other = signers[1]
    recipients = signers.slice(2, 7) // 5 test recipients

    usdc = await new MockERC20__factory(employer).deploy('USD Coin', 'USDC', 6)
    payday = await new PayDayBatch__factory(employer).deploy(
      await usdc.getAddress(),
    )

    await usdc.mint(employer.address, 10_000n * ONE_USDC)
    await usdc.approve(await payday.getAddress(), 10_000n * ONE_USDC)
  })

  // -------------------------------------------------------------------------
  // Deployment
  // -------------------------------------------------------------------------
  describe('deployment', function () {
    it('stores usdc address', async function () {
      expect(await payday.usdc()).to.equal(await usdc.getAddress())
    })
  })

  // -------------------------------------------------------------------------
  // batchPay() — happy paths
  // -------------------------------------------------------------------------
  describe('batchPay() — happy paths', function () {
    it('pays a single recipient the correct amount', async function () {
      const amount = 50n * ONE_USDC
      const before = await usdc.balanceOf(recipients[0].address)

      await payday.batchPay([recipients[0].address], [amount])

      expect(await usdc.balanceOf(recipients[0].address)).to.equal(
        before + amount,
      )
    })

    it('pays 5 recipients the correct individual amounts', async function () {
      const amounts = [10n, 20n, 30n, 40n, 50n].map((n) => n * ONE_USDC)
      const addrs = recipients.map((r) => r.address)
      const befores = await Promise.all(
        recipients.map((r) => usdc.balanceOf(r.address)),
      )

      await payday.batchPay(addrs, amounts)

      for (let i = 0; i < recipients.length; i++) {
        expect(await usdc.balanceOf(recipients[i].address)).to.equal(
          befores[i] + amounts[i],
        )
      }
    })

    it('pulls exact total from employer, leaves contract balance at zero', async function () {
      const amounts = [100n, 200n, 300n].map((n) => n * ONE_USDC)
      const total = amounts.reduce((a, b) => a + b, 0n)
      const addrs = recipients.slice(0, 3).map((r) => r.address)

      const employerBefore = await usdc.balanceOf(employer.address)

      await payday.batchPay(addrs, amounts)

      expect(await usdc.balanceOf(employer.address)).to.equal(
        employerBefore - total,
      )
      expect(await usdc.balanceOf(await payday.getAddress())).to.equal(0n)
    })

    it('emits BatchPaid with correct recipientCount and totalAmount', async function () {
      const amounts = [10n, 20n].map((n) => n * ONE_USDC)
      const total = amounts.reduce((a, b) => a + b, 0n)
      const addrs = recipients.slice(0, 2).map((r) => r.address)

      await expect(payday.batchPay(addrs, amounts))
        .to.emit(payday, 'BatchPaid')
        .withArgs(employer.address, 2n, total)
    })

    it('accepts 100 recipients (max boundary)', async function () {
      const wallets = Array.from({ length: 100 }, () =>
        ethers.Wallet.createRandom(),
      )
      const addrs = wallets.map((w) => w.address)
      const amounts = Array(100).fill(ONE_USDC)
      const total = 100n * ONE_USDC

      await usdc.mint(employer.address, total)
      await usdc.approve(await payday.getAddress(), total)

      await expect(payday.batchPay(addrs, amounts)).to.not.be.reverted

      expect(await usdc.balanceOf(addrs[0])).to.equal(ONE_USDC)
      expect(await usdc.balanceOf(addrs[99])).to.equal(ONE_USDC)
    })

    it('allows the same caller to batch-pay multiple times', async function () {
      const addrs = [recipients[0].address]
      const amounts = [5n * ONE_USDC]

      await payday.batchPay(addrs, amounts)
      await payday.batchPay(addrs, amounts)

      expect(await usdc.balanceOf(recipients[0].address)).to.equal(
        10n * ONE_USDC,
      )
    })
  })

  // -------------------------------------------------------------------------
  // batchPay() — revert conditions
  // -------------------------------------------------------------------------
  describe('batchPay() — reverts', function () {
    it('reverts when lengths mismatch', async function () {
      await expect(
        payday.batchPay(
          [recipients[0].address, recipients[1].address],
          [ONE_USDC],
        ),
      ).to.be.revertedWith('Length mismatch')
    })

    it('reverts when recipients array is empty', async function () {
      await expect(payday.batchPay([], [])).to.be.revertedWith('Invalid count')
    })

    it('reverts when recipients exceed 100', async function () {
      const wallets = Array.from({ length: 101 }, () =>
        ethers.Wallet.createRandom(),
      )
      const addrs = wallets.map((w) => w.address)
      const amounts = Array(101).fill(ONE_USDC)

      await usdc.mint(employer.address, 101n * ONE_USDC)
      await usdc.approve(await payday.getAddress(), 101n * ONE_USDC)

      await expect(payday.batchPay(addrs, amounts)).to.be.revertedWith(
        'Invalid count',
      )
    })

    it('reverts when any amount is zero', async function () {
      const addrs = [recipients[0].address, recipients[1].address]
      const amounts = [ONE_USDC, 0n]

      await expect(payday.batchPay(addrs, amounts)).to.be.revertedWith(
        'Zero amount',
      )
    })

    it('reverts on zero-address recipient', async function () {
      const addrs = [recipients[0].address, ethers.ZeroAddress]
      const amounts = [ONE_USDC, ONE_USDC]

      await expect(payday.batchPay(addrs, amounts)).to.be.revertedWith(
        'Invalid recipient',
      )
    })

    it('reverts when employer has insufficient allowance', async function () {
      await usdc.approve(await payday.getAddress(), 0n)
      await expect(payday.batchPay([recipients[0].address], [ONE_USDC])).to.be
        .reverted
    })

    it('reverts when caller has insufficient balance', async function () {
      await usdc
        .connect(other)
        .approve(await payday.getAddress(), ethers.MaxUint256)

      await expect(
        payday.connect(other).batchPay([recipients[0].address], [ONE_USDC]),
      ).to.be.reverted
    })
  })

  // -------------------------------------------------------------------------
  // Permissionless
  // -------------------------------------------------------------------------
  describe('permissionless', function () {
    it('any address can call batchPay (not just a designated employer)', async function () {
      await usdc.mint(other.address, 50n * ONE_USDC)
      await usdc
        .connect(other)
        .approve(await payday.getAddress(), 50n * ONE_USDC)

      const before = await usdc.balanceOf(recipients[0].address)
      await payday
        .connect(other)
        .batchPay([recipients[0].address], [10n * ONE_USDC])

      expect(await usdc.balanceOf(recipients[0].address)).to.equal(
        before + 10n * ONE_USDC,
      )
    })
  })
})
