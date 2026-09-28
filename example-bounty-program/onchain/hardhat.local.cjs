// Offline test/ABI build: deliberately does not load deployment secrets.
require('@nomicfoundation/hardhat-toolbox');
module.exports = {
  solidity: { version: '0.8.23', settings: { optimizer: { enabled: true, runs: 200 }, viaIR: true } },
  mocha: { timeout: 100000 },
};
