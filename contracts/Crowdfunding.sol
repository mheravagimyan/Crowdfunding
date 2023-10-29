// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.20;
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract Crowdfunding is Ownable{
    uint256 public campaignId;
    uint256 public ratio;
    address public tokenCF;
    mapping(uint256 => Campaign) public idToCampaign;
    mapping(uint256 => mapping(address => uint256)) backerToContribution; 

    struct Campaign {
        string name;
        string goal;
        uint256 targetAmount;
        address creator;
        uint256 vestingPeriod;
        uint256 totalAmount; // Total amount of contributions
        bool claim; // To know did the creator claim all contributions.
        bool status; // To know does the campaign active 
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
    
    // To protect Reentrancy attack
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
            false,
            false
        );

        emit CampaignCreated(campaignId, _name, msg.sender, _targetAmount, block.timestamp + _vestingPeriod);
    }

    /**
     * @dev This function allow a user to contribute funds to a crowdfunding campaign. 
     * @param _campId The id of want campaign.
     * @param _sum The want amount to contribute. 
     */
    function contributeToCampaign(uint256 _campId, uint256 _sum) external payable noReentrancy {
        require(_campId <= campaignId, "Crowdfunding: Invalid campaign id!");
        Campaign memory camp = idToCampaign[_campId];
        require(!camp.status, "Crowdfunding: Campaign already over!");
        require(block.timestamp < camp.vestingPeriod, "Crowdfunding: Vesting period already over!");

        if(msg.value > _sum) {
            (bool success,) = payable(msg.sender).call{value: msg.value - _sum}("");
            require(success, "Crowdfunding: Transaction faild!");
        } else {
            _sum = msg.value;
        }

        if(_sum + camp.totalAmount >= camp.targetAmount) {
            uint256 conAmount = camp.targetAmount - camp.totalAmount;

            (bool success,) = payable(msg.sender).call{value: _sum - conAmount}("");
            require(success, "Crowdfunding: Transaction faild!");

            _sum = conAmount;
            camp.status = true;
        }

        camp.totalAmount += _sum;
        backerToContribution[_campId][msg.sender] += _sum;
        idToCampaign[_campId] = camp;

        emit FundsContributed(_campId, msg.sender, _sum);
    }

    /**
     * @dev This function allow creator to claim all contributions if the goal is met.
     * @param _campId The id of want campaign.
     */
    function claimContributions(uint256 _campId) external payable noReentrancy {
        require(_campId <= campaignId, "Crowdfunding: Invalid campaign id!");
        Campaign memory camp = idToCampaign[_campId];
        require(camp.status, "Crowdfunding: Goal not achieved!");
        require(camp.creator == msg.sender, "Crowdfunding: Only creator can claim contributions!");
        require(!camp.claim, "Crowdfunding: Already claimed!");

        uint256 claimAmount = camp.totalAmount;
        (bool success,) = payable(msg.sender).call{value: claimAmount}("");
        require(success, "Crowdfunding: Transaction faild!");
        camp.claim = true;
        idToCampaign[_campId] = camp;

        emit ContributionsClaimed(_campId, msg.sender, claimAmount);
    }

    /**
     * @dev This function allow backers to claim tokens if the goal is met.
     * @param _campId The id of want campaign.
     */
    function claimTokens(uint256 _campId) external noReentrancy {
        require(_campId <= campaignId, "Crowdfunding: Invalid campaign id!");
        Campaign memory camp = idToCampaign[_campId];
        require(camp.status || camp.vestingPeriod <= block.timestamp, "Crowdfunding: Goal not achieved!");
        require(backerToContribution[_campId][msg.sender] > 0, "Crowdfunding: You aren't backer in this campaign or the contribution balance is 0!");

        if(camp.totalAmount < camp.targetAmount) {
            _refundContributions(_campId);
        } else {
            _claimTokens(_campId);
        }

        backerToContribution[_campId][msg.sender] = 0;
    }

    /**
     * @dev This function allow to transfer eth to backers, if the goal is not met.
     * @param _campId The id of want campaign.
     */
    function _refundContributions(uint256 _campId) private {
        uint256 refundAmount = backerToContribution[_campId][msg.sender];
        (bool success,) = payable(msg.sender).call{value: refundAmount}("");
        require(success, "Crowdfunding: Transaction faild!");

        emit ContributionsRefunded(_campId, msg.sender, refundAmount); 
    }

    /**
     * @dev This function allow to transfer tokens to backers, the goal is achieved.
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
    function getContributionBalances(uint256 _campId, address _backer) external view returns(uint256) {
        require(_campId <= campaignId, "Crowdfunding: Invalid campaign id!");
        require(msg.sender == _backer || msg.sender == idToCampaign[_campId].creator, "Crowdfunding: You aren't backer in this campaign or the contribution balance is 0!");
        uint256 balance = backerToContribution[_campId][_backer];

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

    /**
     * @dev This function allow to get campaign info.
     * @param _campId The want campaign id
     */
    function getCampaignInfo(uint256 _campId) external view returns(Campaign memory) {
        Campaign memory camp = idToCampaign[_campId];

        return Campaign(
            camp.name, 
            camp.goal, 
            camp.targetAmount, 
            camp.creator, 
            camp.vestingPeriod,
            camp.totalAmount,
            camp.claim,
            camp.status
        );
    }
}

