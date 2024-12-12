const WebSocket = require('ws');

const ws = new WebSocket('wss://3b66-12-2-98-114.ngrok-free.app/connection');

ws.on('open', () => {
    console.log('WebSocket connection opened.');
});

ws.on('message', (data) => {
    console.log('Received:', data);
});

ws.on('error', (err) => {
    console.error('WebSocket error:', err);
});

ws.on('close', () => {
    console.log('WebSocket connection closed.');
});
