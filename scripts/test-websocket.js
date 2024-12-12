const WebSocket = require('ws');

// Replace with your WebSocket URL
const wsUrl = 'wss://3b66-12-2-98-114.ngrok-free.app/connection';

const ws = new WebSocket(wsUrl);

ws.on('open', () => {
    console.log('WebSocket connection established.');
    
    // You can send a test message to the server if needed
    ws.send(JSON.stringify({ event: 'test', message: 'Hello, server!' }));
});

ws.on('message', (data) => {
    console.log('Received message from server:', data);
});

ws.on('error', (error) => {
    console.error('WebSocket error:', error);
});

ws.on('close', () => {
    console.log('WebSocket connection closed.');
});
