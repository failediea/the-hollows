// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title HollowsTreasury
 * @notice Treasury contract for The Hollows - A dark fantasy persistent world for AI agents on Monad
 * @dev Manages entry fees, prize pools, seasons, and PvP wagers
 */
contract HollowsTreasury {
    
    // ============ State Variables ============
    
    address public owner;
    bool public paused;
    
    uint256 public entryFee;
    uint256 public currentSeason;
    uint256 public seasonStartTime;
    uint256 public totalEntries;
    
    // Pool balances (40% Boss, 30% Abyss, 20% Arena, 10% Operations)
    uint256 public bossPool;
    uint256 public abyssPool;
    uint256 public arenaPool;
    uint256 public operationsPool;
    
    // Tracking
    mapping(address => uint256) public agentEntries;
    mapping(uint256 => uint256) public seasonEntries;
    
    // Wager system
    uint256 public nextWagerId;
    uint256 public constant WAGER_TIMEOUT = 1 hours;
    uint256 public constant WAGER_FEE_PERCENT = 5; // 5% fee to arena pool
    
    struct Wager {
        address challenger;
        address opponent;
        uint256 amount;
        uint256 createdAt;
        bool accepted;
        bool resolved;
    }
    
    mapping(uint256 => Wager) public wagers;
    
    // Reentrancy guard
    uint256 private locked = 1;
    
    // ============ Events ============
    
    event AgentEntered(address indexed agent, uint256 fee, uint256 season);
    event BossRewardDistributed(uint256 season, uint256 totalAmount);
    event ArenaRewardDistributed(address indexed winner, uint256 amount);
    event AbyssRewardDistributed(uint256 season, uint256 totalAmount);
    event WagerCreated(uint256 indexed wagerId, address indexed challenger, address indexed opponent, uint256 amount);
    event WagerAccepted(uint256 indexed wagerId);
    event WagerResolved(uint256 indexed wagerId, address indexed winner, uint256 payout);
    event WagerCancelled(uint256 indexed wagerId);
    event SeasonStarted(uint256 indexed season, uint256 timestamp);
    event EntryFeeUpdated(uint256 newFee);
    event OperationsWithdrawn(uint256 amount, address indexed to);
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);
    event Paused();
    event Unpaused();
    
    // ============ Modifiers ============
    
    modifier onlyOwner() {
        require(msg.sender == owner, "Not owner");
        _;
    }
    
    modifier whenNotPaused() {
        require(!paused, "Contract paused");
        _;
    }
    
    modifier nonReentrant() {
        require(locked == 1, "Reentrancy detected");
        locked = 2;
        _;
        locked = 1;
    }
    
    // ============ Constructor ============
    
    constructor(uint256 _initialEntryFee) {
        owner = msg.sender;
        entryFee = _initialEntryFee;
        currentSeason = 1;
        seasonStartTime = block.timestamp;
        emit SeasonStarted(1, block.timestamp);
    }
    
    // ============ Entry Fee System ============
    
    /**
     * @notice Agent pays entry fee to enter The Hollows
     * @dev Splits fee into 4 pools: 40% Boss, 30% Abyss, 20% Arena, 10% Operations
     */
    function enter() external payable whenNotPaused nonReentrant {
        require(msg.value == entryFee, "Incorrect entry fee");
        require(msg.value > 0, "Entry fee must be > 0");
        
        // Calculate pool distributions
        uint256 toBoss = (msg.value * 40) / 100;
        uint256 toAbyss = (msg.value * 30) / 100;
        uint256 toArena = (msg.value * 20) / 100;
        uint256 toOps = msg.value - toBoss - toAbyss - toArena; // Remaining to ops (handles rounding)
        
        // Update pools
        bossPool += toBoss;
        abyssPool += toAbyss;
        arenaPool += toArena;
        operationsPool += toOps;
        
        // Update tracking
        totalEntries++;
        seasonEntries[currentSeason]++;
        agentEntries[msg.sender]++;
        
        emit AgentEntered(msg.sender, msg.value, currentSeason);
    }
    
    // ============ Prize Distribution ============
    
    /**
     * @notice Distribute boss pool rewards to winners
     * @param winners Array of winner addresses
     * @param shares Array of share amounts (must sum to total distributed)
     */
    function distributeBossReward(
        address[] calldata winners,
        uint256[] calldata shares
    ) external onlyOwner whenNotPaused nonReentrant {
        require(winners.length > 0, "No winners");
        require(winners.length == shares.length, "Length mismatch");
        
        uint256 totalShares = 0;
        for (uint256 i = 0; i < shares.length; i++) {
            totalShares += shares[i];
        }
        
        require(totalShares <= bossPool, "Insufficient boss pool");
        require(totalShares > 0, "Total shares must be > 0");
        
        // Distribute rewards
        for (uint256 i = 0; i < winners.length; i++) {
            require(winners[i] != address(0), "Invalid winner address");
            require(shares[i] > 0, "Share must be > 0");
            
            (bool success, ) = winners[i].call{value: shares[i]}("");
            require(success, "Transfer failed");
        }
        
        bossPool -= totalShares;
        emit BossRewardDistributed(currentSeason, totalShares);
    }
    
    /**
     * @notice Distribute arena pool reward to PvP winner
     * @param winner Winner address
     * @param amount Amount to distribute
     */
    function distributeArenaReward(
        address winner,
        uint256 amount
    ) external onlyOwner whenNotPaused nonReentrant {
        require(winner != address(0), "Invalid winner");
        require(amount > 0, "Amount must be > 0");
        require(amount <= arenaPool, "Insufficient arena pool");
        
        arenaPool -= amount;
        
        (bool success, ) = winner.call{value: amount}("");
        require(success, "Transfer failed");
        
        emit ArenaRewardDistributed(winner, amount);
    }
    
    /**
     * @notice Distribute abyss pool rewards to winners
     * @param winners Array of winner addresses
     * @param shares Array of share amounts
     */
    function distributeAbyssReward(
        address[] calldata winners,
        uint256[] calldata shares
    ) external onlyOwner whenNotPaused nonReentrant {
        require(winners.length > 0, "No winners");
        require(winners.length == shares.length, "Length mismatch");
        
        uint256 totalShares = 0;
        for (uint256 i = 0; i < shares.length; i++) {
            totalShares += shares[i];
        }
        
        require(totalShares <= abyssPool, "Insufficient abyss pool");
        require(totalShares > 0, "Total shares must be > 0");
        
        // Distribute rewards
        for (uint256 i = 0; i < winners.length; i++) {
            require(winners[i] != address(0), "Invalid winner address");
            require(shares[i] > 0, "Share must be > 0");
            
            (bool success, ) = winners[i].call{value: shares[i]}("");
            require(success, "Transfer failed");
        }
        
        abyssPool -= totalShares;
        emit AbyssRewardDistributed(currentSeason, totalShares);
    }
    
    // ============ Season Management ============
    
    /**
     * @notice Start a new season, incrementing counter and resetting pools
     * @dev Can optionally keep some pool balances for rollover
     */
    function startNewSeason() external onlyOwner {
        currentSeason++;
        seasonStartTime = block.timestamp;
        
        // Note: Pools carry over by default. Owner should distribute before new season
        // or implement custom reset logic based on game design
        
        emit SeasonStarted(currentSeason, block.timestamp);
    }
    
    /**
     * @notice Get current season info
     * @return season Current season number
     * @return startTime Season start timestamp
     */
    function getCurrentSeason() external view returns (uint256 season, uint256 startTime) {
        return (currentSeason, seasonStartTime);
    }
    
    /**
     * @notice Get all pool balances
     * @return boss Boss pool balance
     * @return abyss Abyss pool balance
     * @return arena Arena pool balance
     * @return operations Operations pool balance
     */
    function getPoolBalances() external view returns (
        uint256 boss,
        uint256 abyss,
        uint256 arena,
        uint256 operations
    ) {
        return (bossPool, abyssPool, arenaPool, operationsPool);
    }
    
    /**
     * @notice Get season info including pool balances
     * @return season Current season number
     * @return startTime Season start timestamp
     * @return boss Boss pool balance
     * @return abyss Abyss pool balance
     * @return arena Arena pool balance
     * @return operations Operations pool balance
     */
    function getSeasonInfo() external view returns (
        uint256 season,
        uint256 startTime,
        uint256 boss,
        uint256 abyss,
        uint256 arena,
        uint256 operations
    ) {
        return (
            currentSeason,
            seasonStartTime,
            bossPool,
            abyssPool,
            arenaPool,
            operationsPool
        );
    }
    
    // ============ Wager Escrow (PvP) ============
    
    /**
     * @notice Create a wagered PvP match
     * @param opponent Address of the opponent
     */
    function createWager(address opponent) external payable whenNotPaused nonReentrant returns (uint256) {
        require(msg.value > 0, "Wager must be > 0");
        require(opponent != address(0), "Invalid opponent");
        require(opponent != msg.sender, "Cannot wager against self");
        
        uint256 wagerId = nextWagerId++;
        
        wagers[wagerId] = Wager({
            challenger: msg.sender,
            opponent: opponent,
            amount: msg.value,
            createdAt: block.timestamp,
            accepted: false,
            resolved: false
        });
        
        emit WagerCreated(wagerId, msg.sender, opponent, msg.value);
        return wagerId;
    }
    
    /**
     * @notice Accept a wager (opponent must match amount)
     * @param wagerId ID of the wager to accept
     */
    function acceptWager(uint256 wagerId) external payable whenNotPaused nonReentrant {
        Wager storage wager = wagers[wagerId];
        
        require(wager.challenger != address(0), "Wager does not exist");
        require(!wager.accepted, "Already accepted");
        require(!wager.resolved, "Already resolved");
        require(msg.sender == wager.opponent, "Not the opponent");
        require(msg.value == wager.amount, "Must match wager amount");
        require(block.timestamp <= wager.createdAt + WAGER_TIMEOUT, "Wager expired");
        
        wager.accepted = true;
        emit WagerAccepted(wagerId);
    }
    
    /**
     * @notice Resolve a wager and pay winner (minus 5% fee to arena pool)
     * @param wagerId ID of the wager
     * @param winner Address of the winner
     */
    function resolveWager(uint256 wagerId, address winner) external onlyOwner nonReentrant {
        Wager storage wager = wagers[wagerId];
        
        require(wager.challenger != address(0), "Wager does not exist");
        require(wager.accepted, "Not accepted yet");
        require(!wager.resolved, "Already resolved");
        require(winner == wager.challenger || winner == wager.opponent, "Invalid winner");
        
        wager.resolved = true;
        
        // Total pot is 2x wager amount
        uint256 totalPot = wager.amount * 2;
        uint256 fee = (totalPot * WAGER_FEE_PERCENT) / 100;
        uint256 payout = totalPot - fee;
        
        // Fee goes to arena pool
        arenaPool += fee;
        
        // Payout to winner
        (bool success, ) = winner.call{value: payout}("");
        require(success, "Transfer failed");
        
        emit WagerResolved(wagerId, winner, payout);
    }
    
    /**
     * @notice Cancel a wager if not accepted within timeout
     * @param wagerId ID of the wager to cancel
     */
    function cancelWager(uint256 wagerId) external nonReentrant {
        Wager storage wager = wagers[wagerId];
        
        require(wager.challenger != address(0), "Wager does not exist");
        require(msg.sender == wager.challenger, "Not the challenger");
        require(!wager.accepted, "Already accepted");
        require(!wager.resolved, "Already resolved");
        require(block.timestamp > wager.createdAt + WAGER_TIMEOUT, "Timeout not reached");
        
        wager.resolved = true;
        
        // Refund challenger
        (bool success, ) = wager.challenger.call{value: wager.amount}("");
        require(success, "Refund failed");
        
        emit WagerCancelled(wagerId);
    }
    
    /**
     * @notice Get wager details
     * @param wagerId ID of the wager
     */
    function getWager(uint256 wagerId) external view returns (
        address challenger,
        address opponent,
        uint256 amount,
        uint256 createdAt,
        bool accepted,
        bool resolved
    ) {
        Wager memory wager = wagers[wagerId];
        return (
            wager.challenger,
            wager.opponent,
            wager.amount,
            wager.createdAt,
            wager.accepted,
            wager.resolved
        );
    }
    
    // ============ View Functions ============
    
    function getEntryFee() external view returns (uint256) {
        return entryFee;
    }
    
    function getTotalEntries() external view returns (uint256) {
        return totalEntries;
    }
    
    function getAgentEntries(address agent) external view returns (uint256) {
        return agentEntries[agent];
    }
    
    // ============ Admin Functions ============
    
    /**
     * @notice Set new entry fee
     * @param _newFee New entry fee amount
     */
    function setEntryFee(uint256 _newFee) external onlyOwner {
        require(_newFee > 0, "Fee must be > 0");
        entryFee = _newFee;
        emit EntryFeeUpdated(_newFee);
    }
    
    /**
     * @notice Withdraw operations pool
     */
    function withdrawOperations() external onlyOwner nonReentrant {
        uint256 amount = operationsPool;
        require(amount > 0, "No operations funds");
        
        operationsPool = 0;
        
        (bool success, ) = owner.call{value: amount}("");
        require(success, "Transfer failed");
        
        emit OperationsWithdrawn(amount, owner);
    }
    
    /**
     * @notice Pause contract (emergency)
     */
    function pause() external onlyOwner {
        require(!paused, "Already paused");
        paused = true;
        emit Paused();
    }
    
    /**
     * @notice Unpause contract
     */
    function unpause() external onlyOwner {
        require(paused, "Not paused");
        paused = false;
        emit Unpaused();
    }
    
    /**
     * @notice Transfer ownership
     * @param newOwner Address of new owner
     */
    function transferOwnership(address newOwner) external onlyOwner {
        require(newOwner != address(0), "Invalid new owner");
        address oldOwner = owner;
        owner = newOwner;
        emit OwnershipTransferred(oldOwner, newOwner);
    }
    
    // ============ Fallback ============
    
    receive() external payable {
        revert("Use enter() to pay entry fee");
    }
    
    fallback() external payable {
        revert("Use enter() to pay entry fee");
    }
}
