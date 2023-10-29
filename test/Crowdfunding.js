const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time } = require('@nomicfoundation/hardhat-network-helpers');

describe("Crowdfunding", function() {
  let token;
  let owner;
  let crowdfunding;
  beforeEach(async function () {  

    [owner, creator, backer1, backer2, backer3] = await ethers.getSigners();
    
    const Token = await ethers.getContractFactory("TokenCF", owner);
    token = await Token.deploy();
    await token.waitForDeployment();

    const Crowdfunding = await ethers.getContractFactory("Crowdfunding", owner);
    crowdfunding = await Crowdfunding.deploy(await token.getAddress(), 3);
    await crowdfunding.waitForDeployment();

    await token.mint(await crowdfunding.getAddress(), ethers.parseEther("1000"));

  });

  async function createCampaign() {
    let name = "Help";
    let goal = "Schools and Education";
    let targetAmount = ethers.parseEther("10");
    let vestingPeriod = 2592000;
    
    await crowdfunding.connect(creator).createCampaign(name, goal, targetAmount, vestingPeriod);
  }

  describe("Initialization", function() {
    it("Should be deployed with correct args!", async function() {
      expect(await crowdfunding.tokenCF()).to.eq(await token.getAddress());
      expect(await crowdfunding.ratio()).to.eq(3);
    });
  });

  describe("Function createCampaign", function() {
    it("Should be possible to create a campaign!", async function() {
      let name = "Help";
      let goal = "Schools and Education";
      let targetAmount = ethers.parseEther("10");
      let vestingPeriod = 2592000;
      
      await crowdfunding.connect(creator).createCampaign(name, goal, targetAmount, vestingPeriod);
      
      arr = await crowdfunding.getCampaignInfo(1);

      expect(arr[0]).to.eq(name);
      expect(arr[1]).to.eq(goal);
      expect(arr[2]).to.eq(targetAmount);
      expect(arr[3]).to.eq(creator.address);
      expect(arr[4]).to.eq(await time.latest() + vestingPeriod);
      expect(arr[5]).to.eq(0);
      expect(arr[6]).to.eq(false);
      expect(arr[7]).to.eq(false);
      expect(await crowdfunding.campaignId()).to.eq(1);
    });

    describe("Require", function() {
      it("Should reverted with 'Crowdfunding: Invalid target amount or vesting period!'", async function() {
        let name = "Help";
        let goal = "Schools and Education";
        let targetAmount = ethers.parseEther("0");
        let vestingPeriod = 0;
      
        let tx = crowdfunding.connect(creator).createCampaign(name, goal, targetAmount, vestingPeriod);

        await expect(tx)
          .to.revertedWith("Crowdfunding: Invalid target amount or vesting period!");
      });
    });

    describe("Events", function() {
      it("Should emited with correct args", async function() {
        let name = "Help";
        let goal = "Schools and Education";
        let targetAmount = ethers.parseEther("10");
        let vestingPeriod = 2592000;
      
        let tx = await crowdfunding.connect(creator).createCampaign(name, goal, targetAmount, vestingPeriod);

        await expect(tx)
                .to.emit(crowdfunding, 'CampaignCreated')
                .withArgs(1, name, creator.address, targetAmount, await time.latest() + vestingPeriod);
      });
    });
  });

  describe("Function contributeToCampaign", function() {
    it("Should be possible to contribute to campaign!", async function() {
      await createCampaign();
      let tx1 = await crowdfunding.connect(backer1).contributeToCampaign(1, ethers.parseEther("0.01"), {value: ethers.parseEther("1")});
      let tx2 = await crowdfunding.connect(backer2).contributeToCampaign(1, ethers.parseEther("1"), {value: ethers.parseEther("0.02")});

      expect(await crowdfunding.connect(backer1).getContributionBalances(1, backer1.address)).to.eq(ethers.parseEther("0.01"));
      expect(await crowdfunding.connect(backer2).getContributionBalances(1, backer2.address)).to.eq(ethers.parseEther("0.02"));
      
      [,,,,,totalAmount,,sstatus] = await crowdfunding.getCampaignInfo(1);
      expect(totalAmount).to.eq(ethers.parseEther("0.03"));
      expect(sstatus).to.eq(false);
      
      let tx3 = await crowdfunding.connect(backer3).contributeToCampaign(1, ethers.parseEther("20"), {value: ethers.parseEther("20")});
      expect(await crowdfunding.connect(backer3).getContributionBalances(1, backer3.address)).to.eq(ethers.parseEther("9.97"));
      await expect(tx1).changeEtherBalances([backer1.address, await crowdfunding.getAddress()], [-ethers.parseEther("0.01"), ethers.parseEther("0.01")]);
      await expect(tx2).changeEtherBalances([backer2.address, await crowdfunding.getAddress()], [-ethers.parseEther("0.02"), ethers.parseEther("0.02")]);
      await expect(tx3).changeEtherBalances([backer3.address, await crowdfunding.getAddress()], [-ethers.parseEther("9.97"), ethers.parseEther("9.97")]);
      
      [,,,,,totalAmount,,sstatus] = await crowdfunding.getCampaignInfo(1);
      expect(totalAmount).to.eq(ethers.parseEther("10"));
      expect(sstatus).to.eq(true);

    });
    
    describe("Require", function () {
      it("Should reverted with 'Crowdfunding: Invalid campaign id!'", async function() {
        await createCampaign();
        let tx = crowdfunding.connect(backer1).contributeToCampaign(2, ethers.parseEther("0.01"), {value: ethers.parseEther("0.01")});
        
        await expect(tx)
          .to.revertedWith("Crowdfunding: Invalid campaign id!");
      });

      it("Should reverted with 'Crowdfunding: Campaign already over!'", async function() {
        await createCampaign();
        await crowdfunding.connect(backer1).contributeToCampaign(1, ethers.parseEther("10"), {value: ethers.parseEther("10")});
        let tx = crowdfunding.connect(backer2).contributeToCampaign(1, ethers.parseEther("1"), {value: ethers.parseEther("1")});
        
        await expect(tx)
          .to.revertedWith("Crowdfunding: Campaign already over!");
      });

      it("Should reverted with 'Crowdfunding: Vesting period already over!'", async function() {
        await createCampaign();
        await crowdfunding.connect(backer1).contributeToCampaign(1, ethers.parseEther("1"), {value: ethers.parseEther("1")});

        await time.increase(2592000);

        let tx = crowdfunding.connect(backer2).contributeToCampaign(1, ethers.parseEther("1"), {value: ethers.parseEther("1")});
        
        await expect(tx)
          .to.revertedWith("Crowdfunding: Vesting period already over!");
      });
    });

    describe("Events", function() {
      it("Should emited with correct args", async function() {
        await createCampaign();
        let tx = await crowdfunding.connect(backer1).contributeToCampaign(1, ethers.parseEther("1"), {value: ethers.parseEther("1")});

        await expect(tx)
                .to.emit(crowdfunding, 'FundsContributed')
                .withArgs(1, backer1.address, ethers.parseEther("1"));
      });
    });
  });

  describe("Function claimContributions", function () {
    it("Should be possible to claim contributions!", async function() {
      await createCampaign();
      await crowdfunding.connect(backer1).contributeToCampaign(1, ethers.parseEther("4"), {value: ethers.parseEther("4")});
      await crowdfunding.connect(backer2).contributeToCampaign(1, ethers.parseEther("6"), {value: ethers.parseEther("6")});
      let tx = await crowdfunding.connect(creator).claimContributions(1);
      [,,,,,,claimStatus,] = await crowdfunding.getCampaignInfo(1);
      
      await expect(tx).changeEtherBalances([await crowdfunding.getAddress(), creator.address], [-ethers.parseEther("10"), ethers.parseEther("10")]);
      expect(claimStatus).to.eq(true);
    });

    describe("Require", function() {
      it("Should reverted with 'Crowdfunding: Invalid campaign id!'", async function() {
        await createCampaign();
        crowdfunding.connect(creator).claimContributions(2, ethers.parseEther("0.01"), {value: ethers.parseEther("0.01")});
        let tx = crowdfunding.connect(creator).claimContributions(2);
        await expect(tx)
          .to.revertedWith("Crowdfunding: Invalid campaign id!");
      });

      it("Should reverted with 'Crowdfunding: Goal not achieved!'", async function() {
        await createCampaign();
        await crowdfunding.connect(backer1).contributeToCampaign(1, ethers.parseEther("4"), {value: ethers.parseEther("4")});
        let tx = crowdfunding.connect(creator).claimContributions(1);
        
        await expect(tx)
          .to.revertedWith("Crowdfunding: Goal not achieved!");
      });

      it("Should reverted with 'Crowdfunding: Only creator can claim contributions!'", async function() {
        await createCampaign();
        await crowdfunding.connect(backer1).contributeToCampaign(1, ethers.parseEther("4"), {value: ethers.parseEther("4")});
        await crowdfunding.connect(backer2).contributeToCampaign(1, ethers.parseEther("6"), {value: ethers.parseEther("6")});
        let tx = crowdfunding.connect(backer3).claimContributions(1);
        
        await expect(tx)
          .to.revertedWith("Crowdfunding: Only creator can claim contributions!");
      });

      it("Should reverted with 'Crowdfunding: Already claimed!'", async function() {
        await createCampaign();
        await crowdfunding.connect(backer1).contributeToCampaign(1, ethers.parseEther("4"), {value: ethers.parseEther("4")});
        await crowdfunding.connect(backer2).contributeToCampaign(1, ethers.parseEther("6"), {value: ethers.parseEther("6")});
        await crowdfunding.connect(creator).claimContributions(1);
        let tx = crowdfunding.connect(creator).claimContributions(1);
        
        await expect(tx)
          .to.revertedWith("Crowdfunding: Already claimed!");
      });
    });

    describe("Events", function() {
      it("Should emited with correct args", async function() {
        await createCampaign();
        await crowdfunding.connect(backer1).contributeToCampaign(1, ethers.parseEther("4"), {value: ethers.parseEther("4")});
        await crowdfunding.connect(backer2).contributeToCampaign(1, ethers.parseEther("6"), {value: ethers.parseEther("6")});
        let tx = await crowdfunding.connect(creator).claimContributions(1);

        await expect(tx)
                .to.emit(crowdfunding, 'ContributionsClaimed')
                .withArgs(1, creator.address, ethers.parseEther("10"));
      });
    });
  });
  
  describe("Function claimTokens", function () {
    describe("Claim token CF/Refund contribution", function () {
      it("Should be possible to claim token CF!", async function() {
        await createCampaign();
        await crowdfunding.connect(backer1).contributeToCampaign(1, ethers.parseEther("4"), {value: ethers.parseEther("4")});
        await crowdfunding.connect(backer2).contributeToCampaign(1, ethers.parseEther("6"), {value: ethers.parseEther("6")});
        let tx1 = await crowdfunding.connect(backer1).claimTokens(1);
        let tx2 = await crowdfunding.connect(backer2).claimTokens(1);
        let ratio = await crowdfunding.ratio();

        await expect(tx1).changeTokenBalances(
          token,
          [await crowdfunding.getAddress(), backer1.address],
          [-(ethers.parseEther("4") / ratio), ethers.parseEther("4") / ratio]
        );
        await expect(tx2).changeTokenBalances(
          token,
          [await crowdfunding.getAddress(), backer2.address],
          [-(ethers.parseEther("6") / ratio), ethers.parseEther("6") / ratio]
        );
        expect(await crowdfunding.connect(creator).getContributionBalances(1, backer1.address)).to.eq(0)
        expect(await crowdfunding.connect(creator).getContributionBalances(1, backer2.address)).to.eq(0)
      });

      it("Should be possible to refund contribution!", async function() {
        await createCampaign();
        await crowdfunding.connect(backer1).contributeToCampaign(1, ethers.parseEther("2"), {value: ethers.parseEther("2")});
        await crowdfunding.connect(backer2).contributeToCampaign(1, ethers.parseEther("4"), {value: ethers.parseEther("4")});
        await time.increase(2592000);
        let backer1Balance = await crowdfunding.connect(backer1).getContributionBalances(1, backer1.address);
        let backer2Balance = await crowdfunding.connect(backer2).getContributionBalances(1, backer2.address);
        let tx1 = await crowdfunding.connect(backer1).claimTokens(1);
        let tx2 = await crowdfunding.connect(backer2).claimTokens(1);

        await expect(tx1).changeEtherBalances(
          [await crowdfunding.getAddress(), backer1.address],
          [-backer1Balance, backer1Balance]
        );
        await expect(tx2).changeEtherBalances(
          [await crowdfunding.getAddress(), backer2.address],
          [-backer2Balance, backer2Balance]
        );
        expect(await crowdfunding.connect(creator).getContributionBalances(1, backer1.address)).to.eq(0)
        expect(await crowdfunding.connect(creator).getContributionBalances(1, backer2.address)).to.eq(0)
      });
    });

    describe("Require", function() {
      it("Should reverted with 'Crowdfunding: Invalid campaign id!'", async function () {
        await createCampaign();
        await crowdfunding.connect(backer1).contributeToCampaign(1, ethers.parseEther("2"), {value: ethers.parseEther("2")});
        await crowdfunding.connect(backer2).contributeToCampaign(1, ethers.parseEther("4"), {value: ethers.parseEther("4")});
        
        let tx = crowdfunding.connect(creator).claimContributions(2);
        await expect(tx)
          .to.revertedWith("Crowdfunding: Invalid campaign id!");
      });

      it("Should reverted with 'Crowdfunding: Goal not achieved!'", async function () {
        await createCampaign();
        await crowdfunding.connect(backer1).contributeToCampaign(1, ethers.parseEther("2"), {value: ethers.parseEther("2")});
        await crowdfunding.connect(backer2).contributeToCampaign(1, ethers.parseEther("4"), {value: ethers.parseEther("4")});
        
        let tx = crowdfunding.connect(backer1).claimTokens(1);
        await expect(tx)
          .to.revertedWith("Crowdfunding: Goal not achieved!");
      });

      it("Should reverted with 'Crowdfunding: You aren't backer in this campaign or the contribution balance is 0!'", async function () {
        await createCampaign();
        await crowdfunding.connect(backer1).contributeToCampaign(1, ethers.parseEther("2"), {value: ethers.parseEther("2")});
        await time.increase(2592000);
        let tx = crowdfunding.connect(backer2).claimTokens(1);
        
        await expect(tx)
          .to.revertedWith("Crowdfunding: You aren't backer in this campaign or the contribution balance is 0!");
      });
    });

    describe("Events", function() {
      it("Should emited with correct args", async function() {
        await createCampaign();
        await crowdfunding.connect(backer1).contributeToCampaign(1, ethers.parseEther("4"), {value: ethers.parseEther("4")});
        await crowdfunding.connect(backer2).contributeToCampaign(1, ethers.parseEther("6"), {value: ethers.parseEther("6")});
        let tx1 = await crowdfunding.connect(backer1).claimTokens(1);
        let ratio = await crowdfunding.ratio();

        await expect(tx1)
                .to.emit(crowdfunding, 'TokensClaimed')
                .withArgs(1, backer1.address, ethers.parseEther("4")/ ratio);
        await expect(tx1)
                .to.emit(token, 'Transfer')
                .withArgs(await crowdfunding.getAddress(), backer1.address, ethers.parseEther("4")/ ratio);                

        await createCampaign();
        await crowdfunding.connect(backer2).contributeToCampaign(2, ethers.parseEther("6"), {value: ethers.parseEther("6")});
        await time.increase(2592000)
        let tx2 = await crowdfunding.connect(backer2).claimTokens(2);    
        
        await expect(tx2)
                .to.emit(crowdfunding, 'ContributionsRefunded')
                .withArgs(2, backer2.address, ethers.parseEther("6"));
      });
    });
  });
});