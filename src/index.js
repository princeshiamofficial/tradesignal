const config = require('./config');
const api = require('./services/api');
const indicators = require('./services/indicators');
const telegram = require('./services/telegram');
const moment = require('moment-timezone');

const signalState = {};
const lastAlertTime = {};

// Helper to calculate estimated time until RSI hits target (simple linear projection)
// This is a rough estimation based on RSI momentum
function estimateEntryTime(currentRSI, targetRSI, interval) {
    // Map interval to minutes
    const minutesMap = { '1m': 1, '3m': 3, '5m': 5, '15m': 15, '30m': 30, '1h': 60, '2h': 120, '4h': 240, '1d': 1440 };
    const minutesPerCandle = minutesMap[interval] || 15;

    // Assuming RSI moves about 2-5 points per candle in volatile markets?
    // This is highly heuristic. Let's use a dynamic approach if possible, but for now linear distance:
    const distance = Math.abs(currentRSI - targetRSI);

    // Rough estimate: Assume 3 RSI points change per candle
    const candlesNeeded = Math.ceil(distance / 2.5);
    const minutesNeeded = candlesNeeded * minutesPerCandle;

    const estimatedTime = moment().add(minutesNeeded, 'minutes');
    return {
        minutes: minutesNeeded,
        time: estimatedTime
    };
}

async function getAnalysis(symbol, interval) {
    const candles = await api.getOHLCV(symbol, interval);
    if (candles.length < config.strategy.rsiPeriod) return { error: 'Not enough data' };

    const rsiValues = indicators.calculateRSI(candles, config.strategy.rsiPeriod);
    const currentRSI = rsiValues[rsiValues.length - 1];
    const lastPrice = candles[candles.length - 1][4];

    let signal = 'NEUTRAL';
    let estimatedEntry = null;

    if (currentRSI < config.strategy.rsiOversold) {
        signal = 'BUY';
    } else if (currentRSI > config.strategy.rsiOverbought) {
        signal = 'SELL';
    } else if (currentRSI <= config.strategy.rsiWarningBuy) {
        signal = 'PRE-BUY'; // e.g. RSI is 30-40
        estimatedEntry = estimateEntryTime(currentRSI, config.strategy.rsiOversold, interval);
    } else if (currentRSI >= config.strategy.rsiWarningSell) {
        signal = 'PRE-SELL'; // e.g. RSI is 60-70
        estimatedEntry = estimateEntryTime(currentRSI, config.strategy.rsiOverbought, interval);
    }

    return { signal, price: lastPrice, rsi: currentRSI, timestamp: Date.now(), estimatedEntry };
}

// Handle Manual Status Requests
const bot = telegram.getBot();
if (bot) {
    bot.on('request_status', async (chatId) => {
        const users = telegram.getUsers();
        const user = users[chatId];
        if (!user) return telegram.sendUserAlert(chatId, 'Please /start first.');

        // await telegram.sendUserAlert(chatId, '🔍 *Checking market status...*');

        for (const pair of user.pairs) {
            try {
                const data = await getAnalysis(pair, user.interval);
                if (data.error) continue;

                const localTime = moment(data.timestamp).tz(user.timezone).format('HH:mm:ss');
                let color = '⚪️';
                if (data.signal === 'BUY') color = '🟢';
                if (data.signal === 'SELL') color = '🔴';
                if (data.signal.startsWith('PRE')) color = '⚠️';

                let msg = `${color} *${data.signal}* | ${pair} | ${user.interval}\n` +
                    `Price: ${data.price} | RSI: ${data.rsi.toFixed(2)}\n` +
                    `Time: ${localTime}`;

                if (data.estimatedEntry) {
                    const entryTime = data.estimatedEntry.time.tz(user.timezone).format('HH:mm');
                    msg += `\n⏳ Est. Entry: ~${entryTime} (${data.estimatedEntry.minutes}m)`;
                }

                await telegram.sendUserAlert(chatId, msg);
            } catch (err) {
                console.error('Status check error:', err);
            }
        }
    });
}

async function processSignals() {
    const users = telegram.getUsers();
    const chatIds = Object.keys(users);

    if (chatIds.length === 0) return;

    const requirements = new Set();
    chatIds.forEach(id => {
        const user = users[id];
        user.pairs.forEach(pair => requirements.add(`${pair}|${user.interval}`));
    });

    console.log(`>> Processing ${requirements.size} market configs...`);

    const results = {};
    for (const req of requirements) {
        const [symbol, interval] = req.split('|');
        try {
            results[req] = await getAnalysis(symbol, interval);
            const data = results[req];
            console.log(`[${interval}] ${symbol}: RSI ${data.rsi?.toFixed(2)} | Signal: ${data.signal}`);
        } catch (err) {
            console.error(`Error processing ${req}:`, err.message);
        }
    }

    // Distribute Alerts
    for (const chatId of chatIds) {
        const user = users[chatId];
        const alertFreq = (user.alert_frequency || 0) * 60 * 1000;

        for (const pair of user.pairs) {
            const key = `${pair}|${user.interval}`;
            const data = results[key];

            if (!data || !data.signal) continue;

            const userStateKey = `${chatId}-${key}`;

            // If Neutral, reset state
            if (data.signal === 'NEUTRAL') {
                signalState[userStateKey] = 'NEUTRAL';
                continue;
            }

            const uniqueState = signalState[userStateKey];
            const lastSent = lastAlertTime[userStateKey] || 0;
            const now = Date.now();

            let shouldSend = false;

            // Condition A: Signal Changed
            if (uniqueState !== data.signal) {
                shouldSend = true;
            }
            // Condition B: Repeat Alert
            else if (alertFreq > 0 && (now - lastSent) >= alertFreq) {
                shouldSend = true;
            }

            if (shouldSend) {
                let title = `🚨 *${data.signal} SIGNAL* 🚨`;
                if (data.signal === 'PRE-BUY') title = `⚠️ *PRE-ALERT: Approaching BUY Zone*`;
                if (data.signal === 'PRE-SELL') title = `⚠️ *PRE-ALERT: Approaching SELL Zone*`;

                const localTime = moment(data.timestamp).tz(user.timezone).format('YYYY-MM-DD HH:mm:ss');

                let message = `${title}\n\n` +
                    `SYMBOL: *${pair}*\n` +
                    `PRICE: ${data.price}\n` +
                    `RSI: ${data.rsi.toFixed(2)}\n` +
                    `TIMEFRAME: ${user.interval}\n` +
                    `⏰ TIME: ${localTime} (${user.timezone})`;

                if (data.estimatedEntry) {
                    const entryTime = data.estimatedEntry.time.tz(user.timezone).format('HH:mm');
                    message += `\n⏳ *EST. ENTRY*: ~${entryTime} (in ${data.estimatedEntry.minutes} mins)`;
                }

                await telegram.sendUserAlert(chatId, message);

                signalState[userStateKey] = data.signal;
                lastAlertTime[userStateKey] = now;
            }
        }
    }
}

async function startBot() {
    console.log('🚀 Trade Signal Bot Started (Multi-User Mode)');
    await processSignals();
    setInterval(processSignals, 60000);
}

startBot();
