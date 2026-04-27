// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title HashedTimelockETH
 * @notice Hashed Timelock Contract for native ETH (or BNB on BSC).
 *
 * Implements atomic cross-chain swaps where:
 *   1. Sender locks ETH with a hashlock (SHA-256) and a timelock.
 *   2. Receiver withdraws by supplying the preimage before the timelock.
 *   3. If the timelock expires, the sender can refund.
 *
 * Compatible with the QBTC multi-chain atomic swap system (Phase 5).
 * The server-side EvmMonitor reads `getContract()` to detect withdrawals
 * and extract the revealed preimage.
 *
 * @dev Deploy on:
 *   - Ethereum Sepolia  (chainId 11155111) — for ETH swaps
 *   - BSC Testnet       (chainId 97)       — for BNB swaps
 *   - Ethereum Mainnet  (chainId 1)        — for production ETH
 *   - BSC Mainnet       (chainId 56)       — for production BNB
 */
contract HashedTimelockETH {

    // ─── Events ───────────────────────────────────────────────────────────────

    event HTLCNew(
        bytes32 indexed contractId,
        address indexed sender,
        address indexed receiver,
        uint256 amount,
        bytes32 hashlock,
        uint256 timelock
    );
    event HTLCWithdraw(bytes32 indexed contractId);
    event HTLCRefund(bytes32 indexed contractId);

    // ─── Structs ──────────────────────────────────────────────────────────────

    struct LockContract {
        address payable sender;
        address payable receiver;
        uint256 amount;
        bytes32 hashlock;   // sha256(preimage)
        uint256 timelock;   // Unix timestamp
        bool withdrawn;
        bool refunded;
        bytes32 preimage;
    }

    // ─── State ────────────────────────────────────────────────────────────────

    mapping(bytes32 => LockContract) private contracts;

    // ─── Modifiers ────────────────────────────────────────────────────────────

    modifier contractExists(bytes32 contractId) {
        require(_exists(contractId), "HTLC: contract does not exist");
        _;
    }

    modifier hashlockMatches(bytes32 contractId, bytes32 preimage) {
        require(
            contracts[contractId].hashlock == sha256(abi.encodePacked(preimage)),
            "HTLC: hashlock mismatch"
        );
        _;
    }

    modifier withdrawable(bytes32 contractId) {
        require(contracts[contractId].receiver == msg.sender, "HTLC: not receiver");
        require(!contracts[contractId].withdrawn, "HTLC: already withdrawn");
        require(!contracts[contractId].refunded,  "HTLC: already refunded");
        require(block.timestamp < contracts[contractId].timelock, "HTLC: timelock expired");
        _;
    }

    modifier refundable(bytes32 contractId) {
        require(contracts[contractId].sender == msg.sender, "HTLC: not sender");
        require(!contracts[contractId].refunded,  "HTLC: already refunded");
        require(!contracts[contractId].withdrawn, "HTLC: already withdrawn");
        require(block.timestamp >= contracts[contractId].timelock, "HTLC: timelock not expired");
        _;
    }

    // ─── External functions ───────────────────────────────────────────────────

    /**
     * @notice Create a new HTLC.
     * @param receiver   Address that can claim the funds by supplying the preimage.
     * @param hashlock   sha256(preimage) — 32-byte hash of the secret.
     * @param timelock   Unix timestamp after which the sender can refund.
     * @return contractId Unique identifier for this HTLC.
     */
    function newContract(
        address payable receiver,
        bytes32 hashlock,
        uint256 timelock
    ) external payable returns (bytes32 contractId) {
        require(msg.value > 0,                       "HTLC: amount must be > 0");
        require(timelock > block.timestamp,           "HTLC: timelock must be future");
        require(receiver != address(0),              "HTLC: receiver is zero address");
        require(receiver != msg.sender,              "HTLC: receiver == sender");

        contractId = keccak256(
            abi.encodePacked(
                msg.sender,
                receiver,
                msg.value,
                hashlock,
                timelock
            )
        );

        require(!_exists(contractId), "HTLC: duplicate contract");

        contracts[contractId] = LockContract({
            sender:    payable(msg.sender),
            receiver:  receiver,
            amount:    msg.value,
            hashlock:  hashlock,
            timelock:  timelock,
            withdrawn: false,
            refunded:  false,
            preimage:  bytes32(0)
        });

        emit HTLCNew(contractId, msg.sender, receiver, msg.value, hashlock, timelock);
    }

    /**
     * @notice Withdraw locked ETH by supplying the preimage.
     * @param contractId  The HTLC to withdraw from.
     * @param preimage    The 32-byte secret whose sha256 equals the hashlock.
     */
    function withdraw(bytes32 contractId, bytes32 preimage)
        external
        contractExists(contractId)
        hashlockMatches(contractId, preimage)
        withdrawable(contractId)
        returns (bool)
    {
        LockContract storage c = contracts[contractId];
        c.preimage   = preimage;
        c.withdrawn  = true;
        c.receiver.transfer(c.amount);
        emit HTLCWithdraw(contractId);
        return true;
    }

    /**
     * @notice Refund locked ETH after the timelock has expired.
     * @param contractId  The HTLC to refund.
     */
    function refund(bytes32 contractId)
        external
        contractExists(contractId)
        refundable(contractId)
        returns (bool)
    {
        LockContract storage c = contracts[contractId];
        c.refunded = true;
        c.sender.transfer(c.amount);
        emit HTLCRefund(contractId);
        return true;
    }

    /**
     * @notice Read a contract's full state.
     * @dev The preimage field is only non-zero after a successful withdraw.
     *      The EvmMonitor polls this to detect revealed secrets.
     */
    function getContract(bytes32 contractId)
        external
        view
        returns (
            address sender,
            address receiver,
            uint256 amount,
            bytes32 hashlock,
            uint256 timelock,
            bool withdrawn,
            bool refunded,
            bytes32 preimage
        )
    {
        LockContract storage c = contracts[contractId];
        return (
            c.sender,
            c.receiver,
            c.amount,
            c.hashlock,
            c.timelock,
            c.withdrawn,
            c.refunded,
            c.preimage
        );
    }

    /**
     * @notice Check if a contract exists.
     */
    function hasContract(bytes32 contractId) external view returns (bool) {
        return _exists(contractId);
    }

    // ─── Internal ─────────────────────────────────────────────────────────────

    function _exists(bytes32 contractId) internal view returns (bool) {
        return contracts[contractId].sender != address(0);
    }
}
