#!/usr/bin/env node

const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 8080;
const HOST = 'localhost';

const MIME_TYPES = {
    '.html': 'text/html',
    '.css': 'text/css',
    '.js': 'application/javascript',
    '.mjs': 'application/javascript',
    '.json': 'application/json',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml',
    '.webm': 'video/webm',
    '.mp4': 'video/mp4',
    '.wav': 'audio/wav',
    '.mp3': 'audio/mpeg',
    '.woff': 'font/woff',
    '.woff2': 'font/woff2',
    '.ttf': 'font/ttf',
    '.ico': 'image/x-icon'
};

const server = http.createServer((req, res) => {
    let filePath = '.' + req.url;
    
    if (filePath === './') {
        filePath = './index.html';
    }
    
    const extname = String(path.extname(filePath)).toLowerCase();
    const contentType = MIME_TYPES[extname] || 'application/octet-stream';
    
    fs.readFile(filePath, (error, content) => {
        if (error) {
            if (error.code === 'ENOENT') {
                res.writeHead(404, { 'Content-Type': 'text/html' });
                res.end('<h1>404 - File Not Found</h1>', 'utf-8');
            } else {
                res.writeHead(500);
                res.end(`Server Error: ${error.code}`, 'utf-8');
            }
        } else {
            res.writeHead(200, { 'Content-Type': contentType });
            res.end(content, 'utf-8');
        }
    });
});

server.listen(PORT, HOST, () => {
    console.log('='.repeat(60));
    console.log('Starting development server...');
    console.log(`Server address: http://${HOST}:${PORT}`);
    console.log('Press Ctrl+C to stop the server');
    console.log('='.repeat(60));
    console.log();
    console.log(`[OK] Server is running on port ${PORT}`);
    console.log(`[INFO] Open your browser and navigate to http://${HOST}:${PORT}`);
    console.log();
});

server.on('error', (error) => {
    if (error.code === 'EADDRINUSE') {
        console.error(`[ERROR] Port ${PORT} is already in use`);
        console.error('[TIP] Try a different port or close the application using this port');
    } else {
        console.error(`[ERROR] Server error: ${error.message}`);
    }
    process.exit(1);
});

process.on('SIGINT', () => {
    console.log('\n');
    console.log('[INFO] Server stopped by user');
    console.log('Goodbye!');
    process.exit(0);
});