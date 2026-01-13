const { RSI } = require('technicalindicators');

const calculateRSI = (candles, period = 14) => {
    // Candles are [timestamp, open, high, low, close, volume]
    // We need close prices
    const closePrices = candles.map(candle => candle[4]);

    const input = {
        values: closePrices,
        period: period
    };

    const rsiValues = RSI.calculate(input);
    return rsiValues; // Returns array, last one is most recent
};

module.exports = { calculateRSI };
