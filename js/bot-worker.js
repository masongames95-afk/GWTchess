importScripts('engine.js?v=2.3', 'bot.js?v=1');

self.onmessage = ({ data }) => {
    try {
        self.postMessage(ChessBot.chooseMove(data));
    } catch (error) {
        self.postMessage({ error: error.message });
    }
};
