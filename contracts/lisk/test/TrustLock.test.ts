import { expect } from 'chai'
import { ethers } from 'hardhat'
import { time } from '@nomicfoundation/hardhat-network-helpers'
import { TrustLock__factory, MockERC20__factory } from '../typechain-types'
import type { TrustLock } from '../typechain-types'
import type { MockERC20 } from '../typechain-types'

function encodeDealId(shortCode: string): string {
  return ethers.zeroPadValue(ethers.toUtf8Bytes(shortCode), 32)
}

describe('TrustLock', function () {
  let trustlock: TrustLock
  let usdc: MockERC20
  let owner: any
  let feeRecipient: any
  let buyer: any
  let seller: any
  let third: any

  const USDC_DECIMALS = 6n
  const ONE_USDC = 10n ** USDC_DECIMALS
  const DEAL_AMOUNT = 250n * ONE_USDC
  const EXPECTED_FEE = (DEAL_AMOUNT * 100n) / 10000n // 1% = 2.5 USDC
  const DEAL_ID = encodeDealId('TL-AABB')

  beforeEach(async function () {
    ;[owner, feeRecipient, buyer, seller, third] = await ethers.getSigners()

    usdc = await new MockERC20__factory(owner).deploy('USD Coin', 'USDC', 6)
    trustlock = await new TrustLock__factory(owner).deploy(
      await usdc.getAddress(),
      feeRecipient.address,
    )

    await usdc.mint(buyer.address, DEAL_AMOUNT * 10n)
    await usdc
      .connect(buyer)
      .approve(await trustlock.getAddress(), DEAL_AMOUNT * 10n)
  })

  // -------------------------------------------------------------------------
  // Deployment
  // -------------------------------------------------------------------------
  describe('deployment', function () {
    it('sets usdc, feeRecipient, feeBps', async function () {
      expect(await trustlock.usdc()).to.equal(await usdc.getAddress())
      expect(await trustlock.feeRecipient()).to.equal(feeRecipient.address)
      expect(await trustlock.feeBps()).to.equal(100n)
    })

    it('sets deployer as owner', async function () {
      expect(await trustlock.owner()).to.equal(owner.address)
    })
  })

  // -------------------------------------------------------------------------
  // lock()
  // -------------------------------------------------------------------------
  describe('lock()', function () {
    it('transfers USDC to contract and stores deal', async function () {
      const expiresAt = (await time.latest()) + 86400
      const contractAddr = await trustlock.getAddress()
      const before = await usdc.balanceOf(contractAddr)

      await trustlock
        .connect(buyer)
        .lock(DEAL_ID, seller.address, DEAL_AMOUNT, expiresAt)

      expect(await usdc.balanceOf(contractAddr)).to.equal(before + DEAL_AMOUNT)
    })

    it('stores buyer, seller, amount, fee, Active status', async function () {
      const expiresAt = (await time.latest()) + 86400
      await trustlock
        .connect(buyer)
        .lock(DEAL_ID, seller.address, DEAL_AMOUNT, expiresAt)

      const deal = await trustlock.deals(DEAL_ID)
      expect(deal.buyer).to.equal(buyer.address)
      expect(deal.seller).to.equal(seller.address)
      expect(deal.amount).to.equal(DEAL_AMOUNT)
      expect(deal.fee).to.equal(EXPECTED_FEE)
      expect(deal.status).to.equal(0n) // Active = 0
    })

    it('emits DealLocked', async function () {
      const expiresAt = (await time.latest()) + 86400
      await expect(
        trustlock
          .connect(buyer)
          .lock(DEAL_ID, seller.address, DEAL_AMOUNT, expiresAt),
      )
        .to.emit(trustlock, 'DealLocked')
        .withArgs(DEAL_ID, buyer.address, seller.address, DEAL_AMOUNT)
    })

    it('reverts when deal already exists', async function () {
      const expiresAt = (await time.latest()) + 86400
      await trustlock
        .connect(buyer)
        .lock(DEAL_ID, seller.address, DEAL_AMOUNT, expiresAt)

      await expect(
        trustlock
          .connect(buyer)
          .lock(DEAL_ID, seller.address, DEAL_AMOUNT, expiresAt),
      ).to.be.revertedWith('Deal already exists')
    })

    it('reverts on zero amount', async function () {
      const expiresAt = (await time.latest()) + 86400
      await expect(
        trustlock.connect(buyer).lock(DEAL_ID, seller.address, 0n, expiresAt),
      ).to.be.revertedWith('Amount must be > 0')
    })

    it('reverts on zero address seller', async function () {
      const expiresAt = (await time.latest()) + 86400
      await expect(
        trustlock
          .connect(buyer)
          .lock(DEAL_ID, ethers.ZeroAddress, DEAL_AMOUNT, expiresAt),
      ).to.be.revertedWith('Invalid seller')
    })

    it('reverts when expiresAt is in the past', async function () {
      const pastTimestamp = (await time.latest()) - 1
      await expect(
        trustlock
          .connect(buyer)
          .lock(DEAL_ID, seller.address, DEAL_AMOUNT, pastTimestamp),
      ).to.be.revertedWith('Already expired')
    })

    it('reverts when buyer has insufficient allowance', async function () {
      await usdc.connect(buyer).approve(await trustlock.getAddress(), 0n)
      const expiresAt = (await time.latest()) + 86400
      await expect(
        trustlock
          .connect(buyer)
          .lock(DEAL_ID, seller.address, DEAL_AMOUNT, expiresAt),
      ).to.be.reverted
    })
  })

  // -------------------------------------------------------------------------
  // release()
  // -------------------------------------------------------------------------
  describe('release()', function () {
    beforeEach(async function () {
      const expiresAt = (await time.latest()) + 86400
      await trustlock
        .connect(buyer)
        .lock(DEAL_ID, seller.address, DEAL_AMOUNT, expiresAt)
    })

    it('pays seller (amount - fee) and fee to feeRecipient', async function () {
      const sellerBefore = await usdc.balanceOf(seller.address)
      const feeBefore = await usdc.balanceOf(feeRecipient.address)

      await trustlock.connect(buyer).release(DEAL_ID)

      expect(await usdc.balanceOf(seller.address)).to.equal(
        sellerBefore + DEAL_AMOUNT - EXPECTED_FEE,
      )
      expect(await usdc.balanceOf(feeRecipient.address)).to.equal(
        feeBefore + EXPECTED_FEE,
      )
    })

    it('sets status to Completed (1)', async function () {
      await trustlock.connect(buyer).release(DEAL_ID)
      expect((await trustlock.deals(DEAL_ID)).status).to.equal(1n)
    })

    it('emits DealReleased', async function () {
      await expect(trustlock.connect(buyer).release(DEAL_ID))
        .to.emit(trustlock, 'DealReleased')
        .withArgs(DEAL_ID)
    })

    it('reverts when called by non-buyer', async function () {
      await expect(
        trustlock.connect(seller).release(DEAL_ID),
      ).to.be.revertedWith('Only buyer can release')
    })

    it('reverts when deal is not Active', async function () {
      await trustlock.connect(buyer).release(DEAL_ID)
      await expect(
        trustlock.connect(buyer).release(DEAL_ID),
      ).to.be.revertedWith('Deal not active')
    })

    it('seller receives full amount when feeBps is zero', async function () {
      await trustlock.connect(owner).setFeeBps(0)
      const zeroFeeId = encodeDealId('TL-ZERO')
      const expiresAt = (await time.latest()) + 86400
      await trustlock
        .connect(buyer)
        .lock(zeroFeeId, seller.address, DEAL_AMOUNT, expiresAt)

      const sellerBefore = await usdc.balanceOf(seller.address)
      await trustlock.connect(buyer).release(zeroFeeId)
      expect(await usdc.balanceOf(seller.address)).to.equal(
        sellerBefore + DEAL_AMOUNT,
      )
    })
  })

  // -------------------------------------------------------------------------
  // dispute()
  // -------------------------------------------------------------------------
  describe('dispute()', function () {
    beforeEach(async function () {
      const expiresAt = (await time.latest()) + 86400
      await trustlock
        .connect(buyer)
        .lock(DEAL_ID, seller.address, DEAL_AMOUNT, expiresAt)
    })

    it('buyer can raise dispute', async function () {
      await expect(trustlock.connect(buyer).dispute(DEAL_ID))
        .to.emit(trustlock, 'DealDisputed')
        .withArgs(DEAL_ID)

      expect((await trustlock.deals(DEAL_ID)).status).to.equal(3n) // Disputed = 3
    })

    it('seller can raise dispute', async function () {
      await expect(trustlock.connect(seller).dispute(DEAL_ID))
        .to.emit(trustlock, 'DealDisputed')
        .withArgs(DEAL_ID)
    })

    it('reverts for non-party', async function () {
      await expect(
        trustlock.connect(third).dispute(DEAL_ID),
      ).to.be.revertedWith('Not a party')
    })

    it('reverts when deal is not Active', async function () {
      await trustlock.connect(buyer).dispute(DEAL_ID)
      await expect(
        trustlock.connect(buyer).dispute(DEAL_ID),
      ).to.be.revertedWith('Deal not active')
    })
  })

  // -------------------------------------------------------------------------
  // adminRelease()
  // -------------------------------------------------------------------------
  describe('adminRelease()', function () {
    beforeEach(async function () {
      const expiresAt = (await time.latest()) + 86400
      await trustlock
        .connect(buyer)
        .lock(DEAL_ID, seller.address, DEAL_AMOUNT, expiresAt)
      await trustlock.connect(buyer).dispute(DEAL_ID)
    })

    it('releases funds to seller and fee to recipient', async function () {
      const sellerBefore = await usdc.balanceOf(seller.address)
      const feeBefore = await usdc.balanceOf(feeRecipient.address)

      await trustlock.connect(owner).adminRelease(DEAL_ID)

      expect(await usdc.balanceOf(seller.address)).to.equal(
        sellerBefore + DEAL_AMOUNT - EXPECTED_FEE,
      )
      expect(await usdc.balanceOf(feeRecipient.address)).to.equal(
        feeBefore + EXPECTED_FEE,
      )
    })

    it('sets status to Completed', async function () {
      await trustlock.connect(owner).adminRelease(DEAL_ID)
      expect((await trustlock.deals(DEAL_ID)).status).to.equal(1n)
    })

    it('emits DealReleased', async function () {
      await expect(trustlock.connect(owner).adminRelease(DEAL_ID))
        .to.emit(trustlock, 'DealReleased')
        .withArgs(DEAL_ID)
    })

    it('reverts for non-owner', async function () {
      await expect(
        trustlock.connect(buyer).adminRelease(DEAL_ID),
      ).to.be.revertedWithCustomError(trustlock, 'OwnableUnauthorizedAccount')
    })

    it('reverts when deal is not Disputed', async function () {
      const otherId = encodeDealId('TL-ACTIVE')
      const expiresAt = (await time.latest()) + 86400
      await trustlock
        .connect(buyer)
        .lock(otherId, seller.address, DEAL_AMOUNT, expiresAt)
      await expect(
        trustlock.connect(owner).adminRelease(otherId),
      ).to.be.revertedWith('Deal not disputed')
    })
  })

  // -------------------------------------------------------------------------
  // adminRefund()
  // -------------------------------------------------------------------------
  describe('adminRefund()', function () {
    it('refunds buyer from Active deal (full amount, no fee)', async function () {
      const expiresAt = (await time.latest()) + 86400
      await trustlock
        .connect(buyer)
        .lock(DEAL_ID, seller.address, DEAL_AMOUNT, expiresAt)

      const buyerBefore = await usdc.balanceOf(buyer.address)
      await trustlock.connect(owner).adminRefund(DEAL_ID)

      expect(await usdc.balanceOf(buyer.address)).to.equal(
        buyerBefore + DEAL_AMOUNT,
      )
      expect((await trustlock.deals(DEAL_ID)).status).to.equal(2n) // Refunded = 2
    })

    it('refunds buyer from Disputed deal', async function () {
      const expiresAt = (await time.latest()) + 86400
      await trustlock
        .connect(buyer)
        .lock(DEAL_ID, seller.address, DEAL_AMOUNT, expiresAt)
      await trustlock.connect(buyer).dispute(DEAL_ID)

      const buyerBefore = await usdc.balanceOf(buyer.address)
      await trustlock.connect(owner).adminRefund(DEAL_ID)

      expect(await usdc.balanceOf(buyer.address)).to.equal(
        buyerBefore + DEAL_AMOUNT,
      )
    })

    it('emits DealRefunded', async function () {
      const expiresAt = (await time.latest()) + 86400
      await trustlock
        .connect(buyer)
        .lock(DEAL_ID, seller.address, DEAL_AMOUNT, expiresAt)

      await expect(trustlock.connect(owner).adminRefund(DEAL_ID))
        .to.emit(trustlock, 'DealRefunded')
        .withArgs(DEAL_ID)
    })

    it('reverts for non-owner', async function () {
      const expiresAt = (await time.latest()) + 86400
      await trustlock
        .connect(buyer)
        .lock(DEAL_ID, seller.address, DEAL_AMOUNT, expiresAt)

      await expect(
        trustlock.connect(seller).adminRefund(DEAL_ID),
      ).to.be.revertedWithCustomError(trustlock, 'OwnableUnauthorizedAccount')
    })

    it('reverts when deal is already Completed', async function () {
      const expiresAt = (await time.latest()) + 86400
      await trustlock
        .connect(buyer)
        .lock(DEAL_ID, seller.address, DEAL_AMOUNT, expiresAt)
      await trustlock.connect(buyer).release(DEAL_ID)

      await expect(
        trustlock.connect(owner).adminRefund(DEAL_ID),
      ).to.be.revertedWith('Cannot refund')
    })
  })

  // -------------------------------------------------------------------------
  // claimExpiredRefund()
  // -------------------------------------------------------------------------
  describe('claimExpiredRefund()', function () {
    it('lets buyer self-refund after expiry', async function () {
      const expiresAt = (await time.latest()) + 3600
      await trustlock
        .connect(buyer)
        .lock(DEAL_ID, seller.address, DEAL_AMOUNT, expiresAt)

      await time.increaseTo(expiresAt + 1)

      const buyerBefore = await usdc.balanceOf(buyer.address)
      await trustlock.connect(buyer).claimExpiredRefund(DEAL_ID)

      expect(await usdc.balanceOf(buyer.address)).to.equal(
        buyerBefore + DEAL_AMOUNT,
      )
      expect((await trustlock.deals(DEAL_ID)).status).to.equal(2n) // Refunded
    })

    it('emits DealRefunded on expired claim', async function () {
      const expiresAt = (await time.latest()) + 3600
      await trustlock
        .connect(buyer)
        .lock(DEAL_ID, seller.address, DEAL_AMOUNT, expiresAt)

      await time.increaseTo(expiresAt + 1)

      await expect(trustlock.connect(buyer).claimExpiredRefund(DEAL_ID))
        .to.emit(trustlock, 'DealRefunded')
        .withArgs(DEAL_ID)
    })

    it('reverts if called before expiry', async function () {
      const expiresAt = (await time.latest()) + 3600
      await trustlock
        .connect(buyer)
        .lock(DEAL_ID, seller.address, DEAL_AMOUNT, expiresAt)

      await expect(
        trustlock.connect(buyer).claimExpiredRefund(DEAL_ID),
      ).to.be.revertedWith('Not yet expired')
    })

    it('reverts if called by non-buyer', async function () {
      const expiresAt = (await time.latest()) + 3600
      await trustlock
        .connect(buyer)
        .lock(DEAL_ID, seller.address, DEAL_AMOUNT, expiresAt)

      await time.increaseTo(expiresAt + 1)

      await expect(
        trustlock.connect(seller).claimExpiredRefund(DEAL_ID),
      ).to.be.revertedWith('Only buyer')
    })

    it('reverts when deal is not Active (already refunded)', async function () {
      const expiresAt = (await time.latest()) + 3600
      await trustlock
        .connect(buyer)
        .lock(DEAL_ID, seller.address, DEAL_AMOUNT, expiresAt)

      await time.increaseTo(expiresAt + 1)
      await trustlock.connect(buyer).claimExpiredRefund(DEAL_ID)

      await expect(
        trustlock.connect(buyer).claimExpiredRefund(DEAL_ID),
      ).to.be.revertedWith('Deal not active')
    })
  })

  // -------------------------------------------------------------------------
  // setFeeBps() / setFeeRecipient()
  // -------------------------------------------------------------------------
  describe('admin config', function () {
    it('owner can update feeBps (max 500)', async function () {
      await trustlock.connect(owner).setFeeBps(250)
      expect(await trustlock.feeBps()).to.equal(250n)
    })

    it('reverts when feeBps > 500', async function () {
      await expect(trustlock.connect(owner).setFeeBps(501)).to.be.revertedWith(
        'Max 5% fee',
      )
    })

    it('reverts setFeeBps for non-owner', async function () {
      await expect(
        trustlock.connect(buyer).setFeeBps(50),
      ).to.be.revertedWithCustomError(trustlock, 'OwnableUnauthorizedAccount')
    })

    it('owner can update feeRecipient', async function () {
      await trustlock.connect(owner).setFeeRecipient(third.address)
      expect(await trustlock.feeRecipient()).to.equal(third.address)
    })

    it('reverts setFeeRecipient to zero address', async function () {
      await expect(trustlock.connect(owner).setFeeRecipient(ethers.ZeroAddress))
        .to.be.reverted
    })

    it('reverts setFeeRecipient for non-owner', async function () {
      await expect(
        trustlock.connect(buyer).setFeeRecipient(third.address),
      ).to.be.revertedWithCustomError(trustlock, 'OwnableUnauthorizedAccount')
    })
  })

  // -------------------------------------------------------------------------
  // Fee math
  // -------------------------------------------------------------------------
  describe('fee math', function () {
    it('computes 1% correctly for round amounts', async function () {
      const amount = 100n * ONE_USDC
      const expiresAt = (await time.latest()) + 86400
      const id = encodeDealId('TL-MATH1')
      await trustlock.connect(buyer).lock(id, seller.address, amount, expiresAt)
      expect((await trustlock.deals(id)).fee).to.equal(amount / 100n) // 1 USDC
    })

    it('contract holds zero USDC after release', async function () {
      const expiresAt = (await time.latest()) + 86400
      await trustlock
        .connect(buyer)
        .lock(DEAL_ID, seller.address, DEAL_AMOUNT, expiresAt)
      await trustlock.connect(buyer).release(DEAL_ID)
      expect(await usdc.balanceOf(await trustlock.getAddress())).to.equal(0n)
    })
  })
})
