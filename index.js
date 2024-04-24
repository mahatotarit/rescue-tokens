const { ethers, Wallet, Transaction } = require('ethers');
const {
  FlashbotsBundleProvider,
  FlashbotsBundleResolution,
} = require('@flashbots/ethers-provider-bundle');

const { exit } = require('process');

require('dotenv').config();

const FLASHBOTS_URL = process.env.FLASHBOTS_URL;
const TOKEN_ADDRESS = process.env.TOKEN_ADDRESS;

const main = async () => {
  if (
    process.env.SPONSOR_KEY === undefined ||
    process.env.VICTIM_KEY === undefined
  ) {
    console.error('Please set both SPONSOR_KEY and VICTIM_KEY env');
    exit(1);
  }

  //   const provider = new ethers.JsonRpcProvider(process.env.PROVIDER_URL);
  const provider = new ethers.JsonRpcProvider(process.env.PROVIDER_URL);

  const authSigner = Wallet.createRandom();

  const flashbotsProvider = await FlashbotsBundleProvider.create(
    provider,
    authSigner,
    FLASHBOTS_URL,
  );

  const sponsor = new Wallet(process.env.SPONSOR_KEY).connect(provider);
  const victim = new Wallet(process.env.VICTIM_KEY).connect(provider);

  const abi = ['function transfer(address,uint256) external'];
  const iface = new ethers.Interface(abi);

  const MAX_GAS_PRICE = ethers.parseUnits("50", "gwei");
  const MAX_GAS_LIMIT = 80000;

  provider.on('block', async (blockNumber) => {
    console.log(blockNumber);
    const targetBlockNumber = blockNumber + 1;
    const resp = await flashbotsProvider.sendBundle(
      [
        {
          signer: sponsor,
          transaction: {
            chainId: 11155111,
            type: 2,
            to: victim.address,
            value: ethers.parseEther('0.01'),
            maxFeePerGas: MAX_GAS_PRICE,
            maxPriorityFeePerGas: MAX_GAS_PRICE,
          },
        },
        {
          signer: victim,
          transaction: {
            chainId: 11155111,
            type: 2,
            to: TOKEN_ADDRESS,
            gasLimit: MAX_GAS_LIMIT.toString(),
            data: iface.encodeFunctionData('transfer', [
              sponsor.address,
              ethers.parseEther('1000'),
            ]),
            maxFeePerGas: MAX_GAS_PRICE,
            maxPriorityFeePerGas: MAX_GAS_PRICE,
          },
        },
      ],
      targetBlockNumber,
    );

    if ('error' in resp) {
      console.log(resp.error.message);
      return;
    }

    const resolution = await resp.wait();
    if (resolution === FlashbotsBundleResolution.BundleIncluded) {
      console.log(`Congrats, included in ${targetBlockNumber}`);
      exit(0);
    } else if (
      resolution === FlashbotsBundleResolution.BlockPassedWithoutInclusion
    ) {
      console.log(`Not included in ${targetBlockNumber}`);
    } else if (resolution === FlashbotsBundleResolution.AccountNonceTooHigh) {
      console.log('Nonce too high, bailing');
      exit(1);
    }
  });
  
};

main();
