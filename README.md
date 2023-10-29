This is a contract whereby users (the creator) can create a crowdfunding campaign and other users (the backer) can contribute their funds.

These are a few main functions:
createCampaign(string calldata _name, string calldata _goal, uint256 _targetAmount, uint256 _vestingPeriod)
contributeToCampaign(uint256_campId, uint256_sum)
claimsContributions (uint256 _campId)
claimsTokens (uint256 _campId)

There are several important things:
1. When backer call the contributeToCampaign function, they must indicate the amount(sum) they want to contribute and send Ethers.
      There may be several options:
          msg.value < sum
          msg.value > sum
          msg.value == sum
      And in each option there will be this contribution
          msg.value < sum  |  sum = message.value
          msg.value > sum  |  sum will not be changed, but (msg.value - sum) will be sent back to the sponsor
          msg.value == sum |  sum will not be changed

2. What happens if the backer sends so much money that the total amount becomes greater than the target amount. That is
      sum + total amount > target amount
      it means that
      (sum + total amount - target amount) will be sent back to the backer
      and
      sum = target amount - total amount
3. If the campaign status is true, it means the goal has been achieved.
4. Ignore the vesting period if the target is achieved as the contribution cannot be more than the target amount.