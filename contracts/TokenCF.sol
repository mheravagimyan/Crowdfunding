// SPDX-License-Identifier: MIT
pragma solidity ^ 0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
// Create erc20 token contract just for testing
contract TokenCF is ERC20 {
    constructor() ERC20("tokenCF", "CFT"){}
    function mint(address to, uint amount) external{
        _mint(to, amount);
    }
}