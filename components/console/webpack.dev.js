const { merge } = require('webpack-merge');

const commonConfig = require('./webpack.common');

// Get backend URL from environment variable, default to localhost
const backendUrl = process.env.BACKEND_URL || 'http://localhost:8085';

console.log(`🔗 Proxying API calls to: ${backendUrl}`);

const devConfig = {
  mode: 'development',
  devtool: 'eval-source-map',
  devServer: {
    port: 3000,
    historyApiFallback: true,
    compress: true,
    proxy: [
      {
        context: ['/api'],
        target: backendUrl,
        changeOrigin: true,
        secure: false
      },
      {
        context: ['/compose'],
        target: backendUrl,
        changeOrigin: true,
        secure: false
      }
    ]
  },

  module: {
    rules: [
      {
        test: /\.css/,
        use: ['style-loader', 'css-loader']
      }
    ]
  }
};

module.exports = merge(commonConfig, devConfig);
