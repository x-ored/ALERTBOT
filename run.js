const fs = require('fs'); // For file system operations
const { TelegramClient } = require('telegram');
const { StringSession } = require('telegram/sessions');
const input = require('input'); // For input data
const say = require('say');
const { NewMessage } = require('telegram/events'); // Import NewMessage event
const WebSocket = require('ws');
const ncp = require("copy-paste");
const sessionFilePath = 'session.txt'; // Session file path

const wsConfig = loadConfig();
const notifier = require('node-notifier');
 
// Создаем WebSocket соединения на основе конфигурации
const ws1m = wsConfig['1m'] ? new WebSocket('wss://stream.binance.com:9443/ws/btcusdt@kline_1m') : null;
const ws2m = wsConfig['2m'] ? new WebSocket('wss://stream.binance.com:9443/ws/btcusdt@kline_2m') : null;
const ws5m = wsConfig['5m'] ? new WebSocket('wss://stream.binance.com:9443/ws/btcusdt@kline_5m') : null;
const ws1h = wsConfig['1h'] ? new WebSocket('wss://stream.binance.com:9443/ws/btcusdt@kline_1h') : null;
const ws4h = wsConfig['4h'] ? new WebSocket('wss://stream.binance.com:9443/ws/btcusdt@kline_4h') : null;
const ws1d = wsConfig['1d'] ? new WebSocket('wss://stream.binance.com:9443/ws/btcusdt@kline_1d') : null;
const ws1M = wsConfig['1M'] ? new WebSocket('wss://stream.binance.com:9443/ws/btcusdt@kline_1M') : null;
const apiId = wsConfig['apiId'];
const apiHash = wsConfig['apiHash'];

const phoneNumber = wsConfig['telegram_acc'];

console.error = function() {}; // Игнорировать все вызовы console.error

// Load session from file if it exists
let session = new StringSession('');
if (fs.existsSync(sessionFilePath)) {
    session = new StringSession(fs.readFileSync(sessionFilePath, 'utf8'));
}

function speakText(text) {
    say.speak(text, 'Victoria');
}

(async () => {
    const client = new TelegramClient(session, apiId, apiHash, {
        connectionRetries: 5,
    });

    try {
        console.log('Connecting to Telegram...');
        await client.start({
            phoneNumber: async () => phoneNumber,
            phoneCode: async () => await input.text('Enter the code from SMS: '),
            onError: (err) => console.log(err),
        });

        fs.writeFileSync(sessionFilePath, client.session.save(), 'utf8');
        console.log('Session saved to file.');
        console.log('You are now connected.');

        const group = await client.getEntity('@sharpenerobserver'); // Use the correct username

        // Handler for new messages
        client.addEventHandler(async (event) => {
            const message = event.message;
            if (!message) return; // Ensure there's a message

            let parts = "";
            const msg = message.message || "";
            const data = msg.replace("🔴", "").replace("🟢", "").replace("USDT", "");
            let timeFrame = "";

            if (data.includes(" 5m ")) {
                parts = data.split(' 5m ');
                timeFrame = " in 5 minutes";
            } else if (data.includes(" 1m ")) {
                parts = data.split(' 1m ');
                timeFrame = " in 1 minute";
            }

            const ticker = parts[0].charAt(0).toUpperCase() + parts[0].slice(1).toLowerCase();
            const percentChange = parts[1];
            messageToShow = "";

            console.log(ticker + " " + percentChange);

            if (msg.includes("🔴")) {
                messageToShow = ticker + " dropped by " + percentChange + timeFrame; 
            } else if (msg.includes("🟢")) {
                messageToShow = ticker + " raised by " + percentChange + timeFrame;
            } else {
                messageToShow = ticker + " changed by " + percentChange + timeFrame;
            }
            ncp.copy(ticker, function () { })
            speakText(messageToShow);

            notifier.notify({
                title: 'Shadow Pool Alert',
                message: messageToShow,
                timeout: 8,
              });
        }, new NewMessage({}));

        console.log('Parser is running and listening for messages...');
    } catch (error) {
        console.error('An error occurred:', error);
    }
})().catch(console.error);

// Функция для чтения конфигурации из файла
function loadConfig() {
  const rawData = fs.readFileSync('config.json'); // Чтение файла
  return JSON.parse(rawData); // Парсинг JSON
}


 

// Флаги для отслеживания состояния свечей
let lastTransition = {
  '1m': false,
  '2m': false,
  '5m': false,
  '1h': false,
  '4h': false,
  '1d': false,
  '1M': false
};

let isBlocked = false; // Блокировка для предотвращения одновременного срабатывания

// Функция задержки
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Функция для проверки, сработали ли старшие интервалы
const shouldNotify = (interval) => {
  const intervals = {
    '1m': 1,
    '2m': 2,
    '5m': 3,
    '1h': 4,
    '4h': 5,
    '1d': 6,
    '1M': 7
  };

  for (const key of Object.keys(intervals).reverse()) {
    if (lastTransition[key] && intervals[key] > intervals[interval]) {
      return false; // Если сработал старший интервал, не уведомляем
    }
  }
  return true; // Если все старшие интервалы не сработали, можно уведомить
};

// Функция для обработки переходов с задержкой
const processTransition = async (interval, message, voiceMessage) => {
  if (!isBlocked && shouldNotify(interval)) {
    isBlocked = true;
    console.log(`--- ${message} ---`);
    say.speak(voiceMessage);
    lastTransition[interval] = true;

    await delay(800); // Задержка 800 мс
    isBlocked = false; // Снимаем блокировку
  }
};

// Обработчики событий для каждого таймфрейма
const handleMessage = (interval, message, voiceMessage) => (data) => {
  const json = JSON.parse(data);
  const kline = json.k;

  if (kline.x) {
    processTransition(interval, message, voiceMessage);
  } else {
    lastTransition[interval] = false;
  }
};

// Подключаем обработчики сообщений для активных WebSocket соединений
if (ws1m) ws1m.on('message', handleMessage('1m', `Открыта новая 1-минутная свеча в ${new Date().toLocaleTimeString()}`, 'One minute transition'));
if (ws2m) ws2m.on('message', handleMessage('2m', `Открыта новая 2-минутная свеча в ${new Date().toLocaleTimeString()}`, 'Two minute transition'));
if (ws5m) ws5m.on('message', handleMessage('5m', `Открыта новая 5-минутная свеча в ${new Date().toLocaleTimeString()}`, 'Five minute transition'));
if (ws1h) ws1h.on('message', handleMessage('1h', `Открыта новая 1-часовая свеча в ${new Date().toLocaleTimeString()}`, 'One hour transition'));
if (ws4h) ws4h.on('message', handleMessage('4h', `Открыта новая 4-часовая свеча в ${new Date().toLocaleTimeString()}`, 'Four hour transition'));
if (ws1d) ws1d.on('message', handleMessage('1d', `Открыта новая 1-дневная свеча в ${new Date().toLocaleTimeString()}`, 'One day transition'));
if (ws1M) ws1M.on('message', handleMessage('1M', `Открыта новая 1-месячная свеча в ${new Date().toLocaleTimeString()}`, 'One month transition'));

// Обработчик ошибок
const handleError = (interval) => (error) => {
  console.error(`Ошибка WebSocket ${interval}: ${error.message}`);
};

if (ws1m) ws1m.on('error', handleError('1m'));
if (ws2m) ws2m.on('error', handleError('2m'));
if (ws5m) ws5m.on('error', handleError('5m'));
if (ws1h) ws1h.on('error', handleError('1h'));
if (ws4h) ws4h.on('error', handleError('4h'));
if (ws1d) ws1d.on('error', handleError('1d'));
if (ws1M) ws1M.on('error', handleError('1M'));

// Обработчик закрытия соединения
const handleClose = (interval) => () => {
  console.log(`WebSocket соединение ${interval} закрыто`);
};

if (ws1m) ws1m.on('close', handleClose('1m'));
if (ws2m) ws2m.on('close', handleClose('2m'));
if (ws5m) ws5m.on('close', handleClose('5m'));
if (ws1h) ws1h.on('close', handleClose('1h'));
if (ws4h) ws4h.on('close', handleClose('4h'));
if (ws1d) ws1d.on('close', handleClose('1d'));
if (ws1M) ws1M.on('close', handleClose('1M'));
