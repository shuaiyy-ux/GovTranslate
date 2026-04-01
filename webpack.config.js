const path = require('path');
const CopyPlugin = require('copy-webpack-plugin');
const MiniCssExtractPlugin = require('mini-css-extract-plugin');

module.exports = {
  mode: 'production',
  devtool: 'source-map',
  entry: {
    'background/service-worker': './src/background/service-worker.ts',
    'content/index': './src/content/index.ts',
    'popup/popup': './src/popup/popup.ts',
    'sidepanel/sidepanel': './src/sidepanel/sidepanel.ts',
    'options/options': './src/options/options.ts',
  },
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: '[name].js',
    clean: true,
  },
  resolve: {
    extensions: ['.ts', '.js'],
  },
  module: {
    rules: [
      {
        test: /\.ts$/,
        use: 'ts-loader',
        exclude: /node_modules/,
      },
      {
        test: /\.css$/,
        use: [MiniCssExtractPlugin.loader, 'css-loader'],
      },
    ],
  },
  plugins: [
    new MiniCssExtractPlugin({
      filename: '[name].css',
    }),
    new CopyPlugin({
      patterns: [
        { from: 'manifest.json', to: 'manifest.json' },
        { from: 'assets/icons', to: 'assets/icons' },
        { from: 'assets/_locales', to: '_locales' },
        { from: 'src/popup/popup.html', to: 'popup/popup.html' },
        { from: 'src/sidepanel/sidepanel.html', to: 'sidepanel/sidepanel.html' },
        { from: 'src/options/options.html', to: 'options/options.html' },
      ],
    }),
  ],
  optimization: {
    minimize: true,
  },
};
