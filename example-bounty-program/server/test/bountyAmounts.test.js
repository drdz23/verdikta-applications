const { ethers } = require('ethers');
const { parseEthAmountWei, bountyAmountWei } = require('../utils/bountyAmounts');
const { normalizeBountyPayments } = require('../utils/validation');

test('decimal and scientific forms round-trip through independent ethers formatting', () => {
  for (const wei of [0n, 1n, 9n, 10n, 999999999999999999n, 123456789012345678n, (1n << 128n) - 1n]) {
    expect(parseEthAmountWei(ethers.formatEther(wei))).toBe(wei);
    expect(parseEthAmountWei(`${wei}e-18`)).toBe(wei);
    expect(parseEthAmountWei(`+${wei}0e-19`)).toBe(wei);
  }
});
test('non-decimal, non-finite and fractional-wei inputs never round into payments', () => {
  for (const value of ['0x10', '1e-19', '-1', '+', '1e', '1e309', '1e-309', true, {}, Infinity, NaN]) {
    expect(() => parseEthAmountWei(value)).toThrow();
  }
  expect(parseEthAmountWei('10e-19')).toBe(1n);
});
test('uint128 payment boundary is enforced before creating a job', () => {
  const max = (1n << 128n) - 1n;
  expect(normalizeBountyPayments({ bountyAmount: ethers.formatEther(max) }).bountyAmountWei).toBe(String(max));
  expect(() => normalizeBountyPayments({ bountyAmount: ethers.formatEther(max + 1n) })).toThrow(/uint128/);
});
test('exact stored wei takes precedence; numeric small legacy amounts remain readable', () => {
  expect(bountyAmountWei({ bountyAmount: 0.12345678901234568, bountyAmountWei: '123456789012345678' })).toBe(123456789012345678n);
  expect(bountyAmountWei({ bountyAmount: 1e-7 })).toBe(100000000000n);
  expect(bountyAmountWei({ bountyAmount: 1, bountyAmountWei: '0' })).toBe(0n);
});
