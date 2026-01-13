const fs = require('fs');
const path = require('path');
const TelegramBot = require('node-telegram-bot-api');
const config = require('../config');
const moment = require('moment-timezone');

// File to store subscribed users and their preferences
const USER_DATA_FILE = path.join(__dirname, '../../user_data.json');

let bot = null;
let users = {}; // Map of chatId -> { pairs: [], interval: '15m', timezone: 'UTC', alert_frequency: 0 }

// Load users from file
if (fs.existsSync(USER_DATA_FILE)) {
    try {
        const data = fs.readFileSync(USER_DATA_FILE, 'utf8');
        users = JSON.parse(data);
        for (const id in users) {
            if (users[id].alert_frequency === undefined) users[id].alert_frequency = 0;
        }
    } catch (err) {
        console.error('Error loading user data:', err);
    }
}

const saveUserData = () => {
    try {
        fs.writeFileSync(USER_DATA_FILE, JSON.stringify(users, null, 2));
    } catch (err) {
        console.error('Error saving user data:', err);
    }
};

// Default User Settings
const DEFAULT_SETTINGS = {
    pairs: ['BTC/USDT', 'ETH/USDT'],
    interval: '15m',
    timezone: 'UTC',
    alert_frequency: 0
};

// Keyboard Layout
const MAIN_MENU = {
    reply_markup: {
        keyboard: [
            ['📊 Current Status', '⚙️ Settings'],
            ['🛠 Set Pairs', '⏱ Set Interval'],
            ['🌍 Set Timezone', '🔔 Alert Frequency'],
            ['🛑 Stop Bot', 'ℹ️ Help']
        ],
        resize_keyboard: true,
        one_time_keyboard: false
    }
};

if (config.telegram.token) {
    bot = new TelegramBot(config.telegram.token, { polling: true });
    console.log('🤖 Telegram Bot is listening...');

    bot.setMyCommands([
        { command: '/start', description: 'Start the bot' },
        { command: '/status', description: 'Check current prices & RSI' },
        { command: '/mysettings', description: 'View current settings' },
        { command: '/help', description: 'Show help message' },
        { command: '/stop', description: 'Stop receiving signals' }
    ]).catch(err => console.error('Failed to set my commands:', err.message));

    // --- Helper Functions ---
    const sendMainMenu = (chatId, text) => {
        bot.sendMessage(chatId, text, { parse_mode: 'Markdown', ...MAIN_MENU });
    };

    const updatePairs = (chatId, input) => {
        const newPairs = input.toUpperCase().replace(/\s/g, '').split(',').filter(p => p.length > 0);
        if (newPairs.length > 0) {
            if (!users[chatId]) users[chatId] = { ...DEFAULT_SETTINGS };
            users[chatId].pairs = newPairs;
            saveUserData();
            sendMainMenu(chatId, `✅ Pairs updated to: *${newPairs.join(', ')}*`);
        } else {
            sendMainMenu(chatId, '❌ Invalid format. Please try again with format: `BTC/USDT,ETH/USDT`');
        }
    };

    const updateInterval = (chatId, input) => {
        const validIntervals = ['1m', '3m', '5m', '15m', '30m', '1h', '2h', '4h', '6h', '8h', '12h', '1d'];
        const newInterval = input.toLowerCase().trim();

        if (validIntervals.includes(newInterval)) {
            if (!users[chatId]) users[chatId] = { ...DEFAULT_SETTINGS };
            users[chatId].interval = newInterval;
            saveUserData();
            sendMainMenu(chatId, `✅ Interval updated to: *${newInterval}*`);
        } else {
            sendMainMenu(chatId, `❌ Invalid interval. Allowed: ${validIntervals.join(', ')}`);
        }
    };

    const updateTimezone = (chatId, input) => {
        const tz = input.trim();
        if (moment.tz.zone(tz)) {
            if (!users[chatId]) users[chatId] = { ...DEFAULT_SETTINGS };
            users[chatId].timezone = tz;
            saveUserData();
            sendMainMenu(chatId, `✅ Timezone updated to: *${tz}*`);
        } else {
            sendMainMenu(chatId, '❌ Invalid Timezone. Example: `Asia/Dhaka`, `America/New_York`, `UTC`');
        }
    };

    const updateFrequency = (chatId, input) => {
        const minutes = parseInt(input.trim());
        if (!isNaN(minutes) && minutes >= 0) {
            if (!users[chatId]) users[chatId] = { ...DEFAULT_SETTINGS };
            users[chatId].alert_frequency = minutes;
            saveUserData();
            const msg = minutes === 0
                ? '✅ Alerts set to **Once per signal** (only when signal changes).'
                : `✅ Alerts will repeat every **${minutes} minutes** while signal persists.`;
            sendMainMenu(chatId, msg);
        } else {
            sendMainMenu(chatId, '❌ Invalid number.');
        }
    };


    // --- Text Message Handler ---
    bot.on('message', (msg) => {
        const chatId = msg.chat.id;
        const text = msg.text;

        if (!text) return;

        // 1. Handle Force Reply Responses
        if (msg.reply_to_message && msg.reply_to_message.text) {
            const originalText = msg.reply_to_message.text;

            if (originalText.includes('Enter your pairs')) {
                updatePairs(chatId, text);
                return;
            }
            if (originalText.includes('Enter your interval')) {
                updateInterval(chatId, text);
                return;
            }
            if (originalText.includes('Enter your timezone')) {
                updateTimezone(chatId, text);
                return;
            }
            if (originalText.includes('Enter alert frequency')) {
                updateFrequency(chatId, text);
                return;
            }
        }

        if (text.startsWith('/')) return;

        // 2. Handle Menu Buttons
        switch (text) {
            case '📊 Current Status':
                // This is handled by main index.js invoking a callback, 
                // OR we can trigger a manual check? 
                // Since we decoupled, we just ack here, but better to emit an event or return help.
                // Actually, we can't easily reach api.js here without refactoring.
                // EASIEST WAY: Tell index.js to run a status check for this user?
                // OR: We export a "RequestStatus" event listener.
                bot.emit('request_status', chatId);
                break;

            case '⚙️ Settings':
                if (!users[chatId]) return sendMainMenu(chatId, 'Please /start first.');
                const u = users[chatId];
                const freqText = u.alert_frequency === 0 ? 'Only on change' : `Every ${u.alert_frequency} mins`;
                sendMainMenu(chatId,
                    `⚙️ *Your Settings*:\n` +
                    `- Pairs: \`${u.pairs.join(', ')}\`\n` +
                    `- Interval: \`${u.interval}\`\n` +
                    `- Timezone: \`${u.timezone}\`\n` +
                    `- Alert Freq: \`${freqText}\``
                );
                break;

            case 'ℹ️ Help':
                sendMainMenu(chatId,
                    `🛠 *Bot Commands*:\n` +
                    `Use the buttons below to configure your bot.\n` +
                    `You can also use commands directly:\n` +
                    `/pairs, /interval, /timezone, /frequency`
                );
                break;

            case '🛑 Stop Bot':
                if (users[chatId]) {
                    delete users[chatId];
                    saveUserData();
                    bot.sendMessage(chatId, '❌ *Stopped.* You will no longer receive alerts.', {
                        parse_mode: 'Markdown',
                        reply_markup: { remove_keyboard: true }
                    });
                }
                break;

            case '🛠 Set Pairs':
                bot.sendMessage(chatId, '📝 *Enter your pairs* (comma separated):\nExample: `BTC/USDT, ETH/USDT`', {
                    parse_mode: 'Markdown',
                    reply_markup: { force_reply: true }
                });
                break;

            case '⏱ Set Interval':
                bot.sendMessage(chatId, '📝 *Enter your interval*:\nOptions: `1m, 5m, 15m, 1h, 4h`', {
                    parse_mode: 'Markdown',
                    reply_markup: { force_reply: true }
                });
                break;

            case '🌍 Set Timezone':
                bot.sendMessage(chatId, '📝 *Enter your timezone*:\nExample: `Asia/Dhaka` or `America/New_York`', {
                    parse_mode: 'Markdown',
                    reply_markup: { force_reply: true }
                });
                break;

            case '🔔 Alert Frequency':
                bot.sendMessage(chatId, '📝 *Enter alert frequency in minutes*:\n\n' +
                    '`0` = Alert only once when signal starts.\n' +
                    '`15` = Repeat alert every 15 minutes if signal continues.', {
                    parse_mode: 'Markdown',
                    reply_markup: { force_reply: true }
                });
                break;
        }
    });

    bot.onText(/\/start/, (msg) => {
        const chatId = msg.chat.id;
        if (!users[chatId]) {
            users[chatId] = { ...DEFAULT_SETTINGS };
            saveUserData();
            sendMainMenu(chatId, '✅ *Welcome!*\n\nYou are now subscribed. Use the buttons below to configure.');
        } else {
            sendMainMenu(chatId, 'You are already active.');
        }
    });

    bot.onText(/\/status/, (msg) => bot.emit('request_status', msg.chat.id));
    bot.onText(/\/pairs (.+)/, (msg, match) => updatePairs(msg.chat.id, match[1]));
    bot.onText(/\/interval (.+)/, (msg, match) => updateInterval(msg.chat.id, match[1]));
    bot.onText(/\/timezone (.+)/, (msg, match) => updateTimezone(msg.chat.id, match[1]));

    bot.on('polling_error', (error) => {
        console.log(`[Polling Error]: ${error.code}`);
    });
}

const getUsers = () => users;
const getBot = () => bot; // Export bot instance for event listening

const sendUserAlert = async (chatId, message) => {
    if (!bot) return;
    try {
        await bot.sendMessage(chatId, message, { parse_mode: 'Markdown' });
    } catch (error) {
        console.error(`Failed to send to ${chatId}:`, error.message);
    }
};

module.exports = { getUsers, sendUserAlert, getBot };
