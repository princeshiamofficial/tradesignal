require('dotenv').config();

module.exports = {
  telegram: {
    token: process.env.TELEGRAM_BOT_TOKEN,
  },
  exchange: {
    id: process.env.EXCHANGE || 'binance',
    pairs: (process.env.PAIRS || 'BTC/USDT,ETH/USDT').split(','),
    timeframe: process.env.TIMEFRAME || '15m',
  },
  strategy: {
    rsiPeriod: 14,
    rsiOverbought: 70,
    rsiOversold: 30,
    // Warning thresholds for early alerts
    rsiWarningBuy: 40,  // Alert when RSI goes under 40 (Approaching 30)
    rsiWarningSell: 60, // Alert when RSI goes over 60 (Approaching 70)
  }
};
