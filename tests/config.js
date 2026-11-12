/* What differs between repos for the shared test runner. */
module.exports = {
  cachePrefix: 'make24-',  // sw.js names its cache cachePrefix + APP_VERSION
  unit: 'tests/run.js',    // prints "N passed, M failed"
  flows: false
};
