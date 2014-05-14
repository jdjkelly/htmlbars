var pickFiles = require('broccoli-static-compiler');
var concatFiles = require('broccoli-concat');
var mergeTrees = require('broccoli-merge-trees');
var transpileES6 = require('broccoli-es6-module-transpiler');

var lib = 'lib';

var tests = pickFiles('test', {
  srcDir: '/tests',
  destDir: '/htmlbars/testests'
});

var src = mergeTrees([lib, tests]);
var transpiled = transpileES6(src, { moduleName: true });
var concatted = concatFiles(transpiled, {
  inputFiles: ['**/*.js'],
  outputFile: '/htmlbars-and-tests.amd.js'
});

// Testing assets

var vendor = pickFiles('vendor', {
  srcDir: '/',
  files: [ '**/*.*' ],
  destDir: '/'
});

var qunitIndex = pickFiles('test', {
  srcDir: '/',
  files: ['index.html'],
  destDir: '/'
});

module.exports = mergeTrees([vendor, qunitIndex]);
