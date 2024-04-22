const { ethers, Wallet } = require('ethers');

const {
  FlashbotsBundleProvider,
  FlashbotsBundleResolution,
} = require('@flashbots/ethers-provider-bundle');

require('dotenv').config();

require('events').EventEmitter.defaultMaxListeners = 1000;

const FLASHBOTS_URL = process.env.FLASHBOTS_URL;
const TOKEN_ADDRESS = process.env.TOKEN_ADDRESS;

const main = async () => {
  if (
    process.env.SPONSOR_KEY === undefined ||
    process.env.VICTIM_KEY === undefined
  ) {
    console.error('Please set both SPONSOR_KEY and VICTIM_KEY env');
    process.exit(1);
  }

  const provider = new ethers.JsonRpcProvider(
    process.env.PROVIDER_LINK,
  );

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

  provider.on('block', async (blockNumber) => {
    console.log(blockNumber);
    const targetBlockNumber = blockNumber + 1;

    const resp = await flashbotsProvider.sendBundle(
      [
        {
          signer: sponsor,
          transaction: {
            chainId: 5,
            type: 2,
            to: victim.address,
            value: ethers.parseEther('0.01'),
            maxFeePerGas: ethers.parseUnits('3', 'gwei'),
            maxPriorityFeePerGas: ethers.parseUnits('2', 'gwei'),
          },
        },
        {
          signer: victim,
          transaction: {
            chainId: 5,
            type: 2,
            to: TOKEN_ADDRESS,
            gasLimit: '50000',
            data: iface.encodeFunctionData('transfer', [sponsor.address, ethers.parseEther('1000') ]),
            maxFeePerGas: ethers.parseUnits('3', 'gwei'),
            maxPriorityFeePerGas: ethers.parseUnits('2', 'gwei'),
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
      process.exit(0);
    } else if (
      resolution === FlashbotsBundleResolution.BlockPassedWithoutInclusion
    ) {
      console.log(`Not included in ${targetBlockNumber}`);
    } else if (resolution === FlashbotsBundleResolution.AccountNonceTooHigh) {
      console.log('Nonce too high, bailing');
      process.exit(1);
    }
    
  });
};

main();
