// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/**
 * @title PayDayBatch
 * @notice Batch USDC payout in a single transaction for SendSasa PayDay feature.
 *         Employer approves total USDC, calls batchPay once — all employees paid atomically.
 * @dev Deployed on Lisk L2 (chain ID 1135). No ownership — permissionless.
 */
contract PayDayBatch {
    IERC20 public immutable usdc;

    event BatchPaid(
        address indexed employer,
        uint256 recipientCount,
        uint256 totalAmount
    );

    constructor(address _usdc) {
        usdc = IERC20(_usdc);
    }

    /**
     * @notice Distribute USDC to multiple recipients in one transaction.
     * @param recipients  Array of recipient addresses (max 100).
     * @param amounts     Array of USDC amounts in 6-decimal units, parallel to recipients.
     */
    function batchPay(
        address[] calldata recipients,
        uint256[] calldata amounts
    ) external {
        require(recipients.length == amounts.length, "Length mismatch");
        require(
            recipients.length > 0 && recipients.length <= 100,
            "Invalid count"
        );

        uint256 total;
        for (uint256 i; i < amounts.length; i++) {
            require(amounts[i] > 0, "Zero amount");
            total += amounts[i];
        }

        usdc.transferFrom(msg.sender, address(this), total);

        for (uint256 i; i < recipients.length; i++) {
            require(recipients[i] != address(0), "Invalid recipient");
            usdc.transfer(recipients[i], amounts[i]);
        }

        emit BatchPaid(msg.sender, recipients.length, total);
    }
}
