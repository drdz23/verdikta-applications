// Offline test/ABI build: deliberately does not load deployment secrets.
require('@nomicfoundation/hardhat-toolbox');
module.exports = {
  solidity: require('./solidity.settings.cjs'),
  mocha: { timeout: 100000 },
};
