var pickFiles = require('broccoli-static-compiler');
var moveFile = require('broccoli-file-mover');
var concatFiles = require('broccoli-concat');
var mergeTrees = require('broccoli-merge-trees');
var transpileES6 = require('broccoli-es6-module-transpiler');
var globalizeAMD = require('broccoli-globalize-amd');

var lib = 'lib';

// Named and concatenated AMD

var transpiledAMD = transpileES6(lib, { moduleName: true });
var namedAMD = concatFiles(transpiledAMD, {
  inputFiles: ['**/*.js'],
  outputFile: '/htmlbars.amd.js' // TODO: use package.json for versioning
});

module.exports = namedAMD;
