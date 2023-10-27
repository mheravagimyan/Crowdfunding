// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.20;
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract Crowdfunding is Ownable{
    uint256 public campaignId;
    uint256 ratio;
    address tokenCF;
    mapping(uint256 => Campaign) idToCampaign;
    mapping(uint256 => mapping(address => uint256)) backerToContribution; 

    struct Campaign {
        string name;
        string goal;
        uint256 targetAmount;
        address creator;
        uint256 vestingPeriod;
        uint256 totalAmount; // Total amount of contributions
        bool claim; // To know did the creator claim all contributions.
    }

    /**
     * @dev Constructor 
     * @param _tokenCF The CrowdFunding token that will be send to the backers.
     * @param _ratio The ratio of contributions / tokenCF.
     */
    constructor(address _tokenCF, uint256 _ratio) Ownable(msg.sender) {
        require(_tokenCF != address(0) && _ratio > 0, "Crowdfunding: Invalid constructor args!");
        tokenCF = _tokenCF;
        ratio = _ratio;
    }

    event CampaignCreated(uint256 campaignId, string name, address creator, uint256 targetAmount, uint256 vestingPeriod);
    event FundsContributed(uint256 campaignId, address backer, uint256 amount);
    event TokensClaimed(uint256 campaignId, address backer, uint256 amount);
    event ContributionsClaimed(uint256 campaignId, address creator, uint256 amount);
    event ContributionsRefunded(uint256 campaignId, address backer, uint256 amount);
    

    bool locked;
    modifier noReentrancy {
        require(!locked, "Crowdfunding: No reentrancy!");
        locked = true;
        _;
        locked = false;
    }

    /**
     * @dev This function allow a user to create a new crowdfunding campaign. 
     * @param _name The name of each crowdfunding campaign.
     * @param _goal The funding goal of each crowdfunding campaign.
     * @param _targetAmount The want amount that must be reached.
     * @param _vestingPeriod The vesting period for each crowdfunding campaign.
     */
    function createCampaign(string calldata _name, string calldata _goal, uint256 _targetAmount, uint256 _vestingPeriod) external {
        require(_targetAmount > 0 && _vestingPeriod > 0, "Crowdfunding: Invalid target amount or vesting period!");
        
        idToCampaign[++campaignId] = Campaign(
            _name,
            _goal,
            _targetAmount,
            msg.sender,
            block.timestamp + _vestingPeriod,
            0,
            false
        );

        emit CampaignCreated(campaignId, _name, msg.sender, _targetAmount, _vestingPeriod);
    }

    /**
     * @dev This function allow a user to contribute funds to a crowdfunding campaign. 
     * @param _campId The id of want campaign.
     * @param _sum The want amount to contribute. 
     */
    function contributeToCampaign(uint256 _campId, uint256 _sum) external payable noReentrancy {
        require(_campId <= campaignId, "Crowdfunding: Invalid campaign id!");
        Campaign memory camp = idToCampaign[_campId];
        require(camp.vestingPeriod <= block.timestamp, "Crowdfunding: Vesting period already over!");

        if(msg.value > _sum) {
            (bool success,) = payable(msg.sender).call{value: msg.value - _sum}("");
            require(success, "Crowdfunding: Transaction faild!");
        } else {
            _sum = msg.value;
        }

        require(camp.totalAmount + _sum <= camp.targetAmount, "Crowdfunding: Invalid sum!");
        camp.totalAmount += _sum;
        backerToContribution[_campId][msg.sender] += _sum;
        idToCampaign[_campId] = camp;

        emit FundsContributed(_campId, msg.sender, _sum);
    }

    /**
     * @dev This function allow creator to claim all contributions if vesting period was over and the target reached.
     * @param _campId The id of want campaign.
     */
    function claimContributions(uint256 _campId) external payable noReentrancy {
        require(_campId <= campaignId, "Crowdfunding: Invalid campaign id!");
        Campaign memory camp = idToCampaign[_campId];
        require(camp.creator == msg.sender, "Crowdfunding: Only creator can claim contributions!");
        require(!camp.claim, "Crowdfunding: Already claimed!");
        require(camp.vestingPeriod <= block.timestamp, "Crowdfunding: Vesting period doesn't over!");
        require(camp.targetAmount <= camp.totalAmount, "Crowdfunding: Goal not achieved!");

        uint256 claimAmount = camp.totalAmount;
        (bool success,) = payable(msg.sender).call{value: claimAmount}("");
        require(success, "Crowdfunding: Transaction faild!");
        camp.claim = true;
        idToCampaign[_campId] = camp;

        emit ContributionsClaimed(_campId, msg.sender, claimAmount);
    }

    /**
     * @dev This function allow backers to claim tokens if vesting period was over and the target reached.
     * @param _campId The id of want campaign.
     */
    function claimTokens(uint256 _campId) external noReentrancy {
        require(_campId <= campaignId, "Crowdfunding: Invalid campaign id!");
        Campaign memory camp = idToCampaign[_campId];
        require(camp.vestingPeriod <= block.timestamp, "Crowdfunding: Vesting period doesn't over!");
        require(backerToContribution[_campId][msg.sender] > 0, "Crowdfunding: You aren't backer in this campaign id!");

        if(camp.targetAmount > camp.totalAmount) {
            _refundContributions(_campId);
        } else {
            _claimTokens(_campId);
        }

        backerToContribution[_campId][msg.sender] = 0;
    }

    /**
     * @dev This function allow to transfer eth to backers, because the target didn't reached.
     * @param _campId The id of want campaign.
     */
    function _refundContributions(uint256 _campId) private {
        uint256 refundAmount = backerToContribution[_campId][msg.sender];
        (bool success,) = payable(msg.sender).call{value: refundAmount}("");
        require(success, "Crowdfunding: Transaction faild!");

        emit ContributionsRefunded(_campId, msg.sender, refundAmount); 
    }

    /**
     * @dev This function allow to transfer tokens to backers, because the target reached.
     * @param _campId The id of want campaign.
     */
    function _claimTokens(uint256 _campId) private {
        uint256 claimAmount = backerToContribution[_campId][msg.sender] / ratio;
        IERC20(tokenCF).transfer(msg.sender, claimAmount);

        emit TokensClaimed(_campId, msg.sender, claimAmount);
    }
    
    /**
     * @dev This function allows you to get the contribution balance, if any.
     * @param _campId The id of want campaign.
     */
    function getContributionBalances(uint256 _campId) external view returns(uint256) {
        require(_campId <= campaignId, "Crowdfunding: Invalid campaign id!");
        uint256 balance = backerToContribution[_campId][msg.sender];
        require(balance > 0, "Crowdfunding: You aren't backer in this campaign id!");

        return balance;
    }

    /**
     * @dev This function allow to know how many token can be received for exact contribution.
     * @param _amount Exact contribution amount
     */
    function getTokensForExatContribution(uint256 _amount) external view returns(uint256) {
        return _amount / ratio;
    }

    /**
     * @dev This function allows to know how much must be contributed to receive exact tokens.
     * @param _amount Exact token amount
     */
    function getContributionForExatTokens(uint256 _amount) external view returns(uint256) {
        return _amount * ratio;
    }
}
