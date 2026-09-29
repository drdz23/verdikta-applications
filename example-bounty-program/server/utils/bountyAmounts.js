const { ethers } = require('ethers');

// Parse decimal/scientific notation directly into wei. Never round through Number:
// e.g. "1.23456789012345678e-1" must retain all 18 ETH decimal places.
function parseEthAmountWei(value) {
  if (!['string', 'number'].includes(typeof value)) throw new Error('Expected a decimal ETH amount');
  const match = /^\+?(?:(\d+)(?:\.(\d*))?|\.(\d+))(?:e([+-]?\d+))?$/i.exec(String(value).trim());
  if (!match) throw new Error('Expected decimal or scientific notation (hex is not accepted)');
  const fraction = match[2] ?? match[3] ?? '';
  let digits = ((match[1] || '') + fraction).replace(/^0+/, '');
  if (!digits) return 0n;
  let scale = 18 + Number(match[4] || 0) - fraction.length;
  const trailingZeros = digits.length - digits.replace(/0+$/, '').length;
  digits = digits.slice(0, digits.length - trailingZeros);
  scale += trailingZeros;
  if (!Number.isSafeInteger(scale) || scale < 0) throw new Error('Amount must be an exact whole number of wei');
  // Bound the expansion before allocating or exponentiating attacker input.
  if (digits.length + scale > 78) throw new Error('Amount exceeds uint256');
  const wei = BigInt(digits) * 10n ** BigInt(scale);
  if (wei >= (1n << 256n)) throw new Error('Amount exceeds uint256');
  return wei;
}

function bountyAmountWei(job) {
  if (job.bountyAmountWei == null) return parseEthAmountWei(job.bountyAmount);
  if (typeof job.bountyAmountWei !== 'string' || !/^(0|[1-9][0-9]*)$/.test(job.bountyAmountWei)) throw new Error('Invalid bountyAmountWei');
  const wei = BigInt(job.bountyAmountWei);
  if (wei >= (1n << 256n)) throw new Error('bountyAmountWei exceeds uint256');
  return wei;
}

function bountyAmountFields(job) {
  const wei = bountyAmountWei(job);
  return { bountyAmount: Number(ethers.formatEther(wei)), bountyAmountWei: wei.toString() };
}

module.exports = { parseEthAmountWei, bountyAmountWei, bountyAmountFields };
