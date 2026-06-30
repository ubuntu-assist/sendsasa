// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title TrustLock
 * @notice Marketplace escrow for SendSasa. Buyer deposits USDC; funds are
 *         released to the seller on buyer confirmation or refunded on dispute.
 *         Platform fee is charged on release (not on refund).
 * @dev Deployed on Lisk L2 (chain ID 1135). Admin = SendSasa platform wallet.
 */
contract TrustLock is Ownable {
    IERC20 public immutable usdc;
    uint256 public feeBps = 100;       // 1% fee (100 basis points)
    address public feeRecipient;

    enum DealStatus { Active, Completed, Refunded, Disputed }

    struct Deal {
        address buyer;
        address seller;
        uint256 amount;    // total USDC locked (6 decimals)
        uint256 fee;       // platform fee deducted on release
        DealStatus status;
        uint256 expiresAt; // unix timestamp
    }

    mapping(bytes32 => Deal) public deals;

    event DealLocked(bytes32 indexed dealId, address indexed buyer, address indexed seller, uint256 amount);
    event DealReleased(bytes32 indexed dealId);
    event DealRefunded(bytes32 indexed dealId);
    event DealDisputed(bytes32 indexed dealId);

    constructor(address _usdc, address _feeRecipient) Ownable(msg.sender) {
        usdc = IERC20(_usdc);
        feeRecipient = _feeRecipient;
    }

    /**
     * @notice Lock USDC into escrow for a deal.
     * @param dealId     Unique deal identifier (bytes32 of deal short code).
     * @param seller     Seller's address.
     * @param amount     Total USDC to lock (6 decimals).
     * @param expiresAt  Unix timestamp after which buyer can claim a refund.
     */
    function lock(
        bytes32 dealId,
        address seller,
        uint256 amount,
        uint256 expiresAt
    ) external {
        require(deals[dealId].buyer == address(0), "Deal already exists");
        require(amount > 0, "Amount must be > 0");
        require(seller != address(0), "Invalid seller");
        require(expiresAt > block.timestamp, "Already expired");

        uint256 fee = (amount * feeBps) / 10000;
        usdc.transferFrom(msg.sender, address(this), amount);

        deals[dealId] = Deal({
            buyer: msg.sender,
            seller: seller,
            amount: amount,
            fee: fee,
            status: DealStatus.Active,
            expiresAt: expiresAt
        });

        emit DealLocked(dealId, msg.sender, seller, amount);
    }

    /**
     * @notice Buyer confirms delivery and releases funds to seller.
     */
    function release(bytes32 dealId) external {
        Deal storage d = deals[dealId];
        require(d.status == DealStatus.Active, "Deal not active");
        require(msg.sender == d.buyer, "Only buyer can release");

        d.status = DealStatus.Completed;
        usdc.transfer(d.seller, d.amount - d.fee);
        if (d.fee > 0) usdc.transfer(feeRecipient, d.fee);

        emit DealReleased(dealId);
    }

    /**
     * @notice Either party can raise a dispute for admin resolution.
     */
    function dispute(bytes32 dealId) external {
        Deal storage d = deals[dealId];
        require(d.status == DealStatus.Active, "Deal not active");
        require(msg.sender == d.buyer || msg.sender == d.seller, "Not a party");

        d.status = DealStatus.Disputed;
        emit DealDisputed(dealId);
    }

    /**
     * @notice Admin releases funds to seller after dispute (AI verdict: RELEASE).
     */
    function adminRelease(bytes32 dealId) external onlyOwner {
        Deal storage d = deals[dealId];
        require(d.status == DealStatus.Disputed, "Deal not disputed");

        d.status = DealStatus.Completed;
        usdc.transfer(d.seller, d.amount - d.fee);
        if (d.fee > 0) usdc.transfer(feeRecipient, d.fee);

        emit DealReleased(dealId);
    }

    /**
     * @notice Admin refunds buyer after dispute (AI verdict: REFUND).
     */
    function adminRefund(bytes32 dealId) external onlyOwner {
        Deal storage d = deals[dealId];
        require(
            d.status == DealStatus.Active || d.status == DealStatus.Disputed,
            "Cannot refund"
        );

        d.status = DealStatus.Refunded;
        usdc.transfer(d.buyer, d.amount);

        emit DealRefunded(dealId);
    }

    /**
     * @notice Buyer can self-refund after deal expires.
     */
    function claimExpiredRefund(bytes32 dealId) external {
        Deal storage d = deals[dealId];
        require(d.status == DealStatus.Active, "Deal not active");
        require(msg.sender == d.buyer, "Only buyer");
        require(block.timestamp > d.expiresAt, "Not yet expired");

        d.status = DealStatus.Refunded;
        usdc.transfer(d.buyer, d.amount);

        emit DealRefunded(dealId);
    }

    function setFeeBps(uint256 _bps) external onlyOwner {
        require(_bps <= 500, "Max 5% fee");
        feeBps = _bps;
    }

    function setFeeRecipient(address _recipient) external onlyOwner {
        require(_recipient != address(0));
        feeRecipient = _recipient;
    }
}
