const http = require('http');
const fs = require('fs');
const path = require('path');

http.createServer((req, res) => {
    let filePath = '.' + (req.url === '/' ? '/index.html' : req.url);
    const extname = path.extname(filePath);
    const mimeTypes = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };

    fs.readFile(filePath, (error, content) => {
        if (error) {
            res.writeHead(404); res.end();
            return;
        }
        res.writeHead(200, { 
            'Content-Type': mimeTypes[extname] || 'application/octet-stream',
            'Cross-Origin-Opener-Policy': 'same-origin',
            'Cross-Origin-Embedder-Policy': 'require-corp'
        });
        res.end(content);
    });
}).listen(8080, () => console.log('Serwer: http://localhost:8080'));