const path = require('path');

// MermaidChart.js is loaded by Perspective as a BrowserResource; mermaid and each diagram type
// are split into chunks fetched from the same mount on first use, so nothing leaves the gateway.
module.exports = (_env, argv = {}) => ({
  mode: argv.mode || 'production',
  target: ['web', 'es2020'],
  context: __dirname,
  entry: { MermaidChart: './src/index.ts' },
  output: {
    path: path.resolve(__dirname, 'build/generated-resources/mounted'),
    filename: '[name].js',
    chunkFilename: 'chunks/[name].[contenthash:8].js',
    // Must match MermaidComponents.MOUNT_ALIAS on the Java side.
    publicPath: '/res/gaskony-mermaid/',
    chunkLoadingGlobal: 'webpackChunkGaskonyMermaid',
    library: { name: 'GaskonyMermaid', type: 'umd' },
    clean: true,
  },
  externals: {
    react: 'React',
    '@inductiveautomation/perspective-client': 'PerspectiveClient',
  },
  resolve: { extensions: ['.ts', '.tsx', '.js', '.mjs'] },
  module: {
    rules: [
      { test: /\.tsx?$/, loader: 'esbuild-loader', options: { loader: 'tsx', target: 'es2020', jsx: 'transform' } },
      { test: /\.css$/, type: 'asset/resource', generator: { filename: '[name][ext]' } },
    ],
  },
  performance: { hints: false },
  devtool: false,
});
