const path = require('path');

const ROOT = process.cwd();

const CopyWebpackPlugin = require('copy-webpack-plugin');
const CssMinimizerPlugin = require('css-minimizer-webpack-plugin');
const MiniCssExtractPlugin = require('mini-css-extract-plugin');
const TerserJSPlugin = require('terser-webpack-plugin');
const webpack = require('webpack');
const { merge } = require('webpack-merge');

const commonConfig = require('./webpack.common');

const prodConfig = {
  mode: 'production',
  devtool: 'source-map',
  output: {
    path: path.join(ROOT, '/build'),
    filename: '[name]-[contenthash].js',
    chunkFilename: 'js/[name]-[contenthash].bundle.js',
    publicPath: '/',
    clean: true
  },
  performance: {
    maxEntrypointSize: 512000,
    maxAssetSize: 512000
  },

  plugins: [
    new webpack.DefinePlugin({
      'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV || 'production'),
      'process.env.ENABLE_MOCK_SERVER': JSON.stringify(process.env.ENABLE_MOCK_SERVER || false)
    }),
    new CopyWebpackPlugin({
      patterns: [
        path.resolve(ROOT, 'public', 'manifest.json'),
        {
          from: process.env.BRAND_FAVICON || path.resolve(ROOT, 'public', 'favicon.ico'),
          to: path.resolve(ROOT, 'build', 'favicon.ico')
        }
      ]
    }),
    new MiniCssExtractPlugin({
      filename: '[name].[contenthash].css',
      chunkFilename: 'css/[name].[contenthash].bundle.css',
      ignoreOrder: true
    })
  ],

  optimization: {
    chunkIds: 'named',
    minimizer: [
      new TerserJSPlugin({}),
      new CssMinimizerPlugin({
        minimizerOptions: {
          preset: ['default', { mergeLonghand: false }]
        }
      })
    ]
  },

  module: {
    rules: [
      {
        test: /\.css/,
        use: [MiniCssExtractPlugin.loader, 'css-loader']
      }
    ]
  }
};

module.exports = merge(commonConfig, prodConfig);
