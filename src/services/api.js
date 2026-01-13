const ccxt = require('ccxt');
const config = require('../config');

let exchange = null;

const initExchange = async () => {
    const exchangeId = config.exchange.id;
    if (!ccxt[exchangeId]) {
        throw new Error(`Exchange ${exchangeId} not found in ccxt`);
    }
    exchange = new ccxt[exchangeId]();
    // Load markets to ensure we have the correct symbols
    await exchange.loadMarkets();
};

const getOHLCV = async (symbol, timeframe) => {
    if (!exchange) await initExchange();

    try {
        // fetchOHLCV (symbol, timeframe, since, limit, params)
        // We get the last 100 candles to ensure enough data for indicators
        const candles = await exchange.fetchOHLCV(symbol, timeframe, undefined, 100);

        // map to a cleaner format if needed, but array of arrays is standard
        // [timestamp, open, high, low, close, volume]
        return candles;
    } catch (error) {
        console.error(`Error fetching data for ${symbol}:`, error.message);
        return [];
    }
};

module.exports = { getOHLCV };
