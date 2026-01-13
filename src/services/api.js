const ccxt = require('ccxt');
const config = require('../config');

let exchange = null;

const initExchange = async () => {
    let exchangeId = config.exchange.id;
    if (!ccxt[exchangeId]) {
        throw new Error(`Exchange ${exchangeId} not found in ccxt`);
    }

    let tempExchange = new ccxt[exchangeId]();

    try {
        // Load markets to ensure we have the correct symbols
        await tempExchange.loadMarkets();
        exchange = tempExchange;
    } catch (error) {
        // Handle Restricted Location (Binance 451)
        if (exchangeId === 'binance' && (error.message.includes('451') || error.message.toLowerCase().includes('restricted'))) {
            console.warn('⚠️ Restricted location detected for Binance. Attempting to switch to Binance US...');
            try {
                tempExchange = new ccxt.binanceus();
                await tempExchange.loadMarkets();
                exchange = tempExchange;
                console.log('✅ Successfully switched to Binance US.');
                return;
            } catch (usError) {
                console.error('❌ Failed to switch to Binance US:', usError.message);
                throw error; // Throw original error if fallback fails
            }
        }

        console.error(`Failed to initialize exchange ${exchangeId}:`, error.message);
        throw error;
    }
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
