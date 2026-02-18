// Run with: node generate-icons.js
// Generates PNG icons from canvas for the PWA manifest
// Requires no dependencies - uses built-in modules

const fs = require('fs');
const { createCanvas } = (() => {
    try { return require('canvas'); } catch { return { createCanvas: null }; }
})();

// If canvas module not available, create minimal valid PNGs
// These are small but valid PNG files with the right colors
function createMinimalPNG(size) {
    // Create a minimal valid PNG with the app's theme color
    // This is a 1x1 PNG that will be scaled - good enough for basic PWA install
    const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

    function crc32(buf) {
        let c = 0xffffffff;
        const table = new Int32Array(256);
        for (let n = 0; n < 256; n++) {
            let v = n;
            for (let k = 0; k < 8; k++) v = v & 1 ? 0xedb88320 ^ (v >>> 1) : v >>> 1;
            table[n] = v;
        }
        for (let i = 0; i < buf.length; i++) c = table[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
        return (c ^ 0xffffffff) >>> 0;
    }

    function chunk(type, data) {
        const len = Buffer.alloc(4);
        len.writeUInt32BE(data.length);
        const typeData = Buffer.concat([Buffer.from(type), data]);
        const crc = Buffer.alloc(4);
        crc.writeUInt32BE(crc32(typeData));
        return Buffer.concat([len, typeData, crc]);
    }

    // IHDR
    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(size, 0);  // width
    ihdr.writeUInt32BE(size, 4);  // height
    ihdr[8] = 8;  // bit depth
    ihdr[9] = 2;  // color type (RGB)
    ihdr[10] = 0; // compression
    ihdr[11] = 0; // filter
    ihdr[12] = 0; // interlace

    // IDAT - raw image data with simple coloring
    const rowBytes = 1 + size * 3; // filter byte + RGB per pixel
    const raw = Buffer.alloc(rowBytes * size);

    for (let y = 0; y < size; y++) {
        const rowStart = y * rowBytes;
        raw[rowStart] = 0; // no filter

        for (let x = 0; x < size; x++) {
            const px = rowStart + 1 + x * 3;
            // Create a simple icon: dark background with blue accent
            const cx = x - size / 2;
            const cy = y - size / 2;
            const dist = Math.sqrt(cx * cx + cy * cy);
            const radius = size * 0.4;

            if (dist < radius) {
                // Inner: blue accent #4a7cff
                raw[px] = 74;
                raw[px + 1] = 124;
                raw[px + 2] = 255;
            } else if (dist < radius + size * 0.03) {
                // Ring
                raw[px] = 42;
                raw[px + 1] = 46;
                raw[px + 2] = 61;
            } else {
                // Background #0f1117
                raw[px] = 15;
                raw[px + 1] = 17;
                raw[px + 2] = 23;
            }

            // Draw a simple grid pattern in the center
            const gridSize = size * 0.2;
            const gx = Math.abs(cx);
            const gy = Math.abs(cy);
            if (gx < gridSize * 1.5 && gy < gridSize * 1.5) {
                const cellX = Math.floor((cx + gridSize * 1.5) / gridSize);
                const cellY = Math.floor((cy + gridSize * 1.5) / gridSize);
                const inGap = (Math.abs((cx + gridSize * 1.5) % gridSize) < size * 0.01) ||
                              (Math.abs((cy + gridSize * 1.5) % gridSize) < size * 0.01);

                if (inGap && dist < radius) {
                    // Grid lines
                    raw[px] = 26;
                    raw[px + 1] = 29;
                    raw[px + 2] = 39;
                } else if (dist < radius) {
                    // Some cells green (owned), others darker
                    const isOwned = (cellX + cellY) % 3 === 0;
                    if (isOwned) {
                        raw[px] = 61;
                        raw[px + 1] = 214;
                        raw[px + 2] = 140;
                    } else {
                        raw[px] = 34;
                        raw[px + 1] = 38;
                        raw[px + 2] = 51;
                    }
                }
            }
        }
    }

    // Compress with deflate (zlib)
    const zlib = require('zlib');
    const compressed = zlib.deflateSync(raw);

    const idat = chunk('IDAT', compressed);
    const ihdrChunk = chunk('IHDR', ihdr);
    const iend = chunk('IEND', Buffer.alloc(0));

    return Buffer.concat([signature, ihdrChunk, idat, iend]);
}

// Generate icons
const icon192 = createMinimalPNG(192);
const icon512 = createMinimalPNG(512);

fs.writeFileSync('icons/icon-192.png', icon192);
fs.writeFileSync('icons/icon-512.png', icon512);

console.log('Generated icons/icon-192.png (' + icon192.length + ' bytes)');
console.log('Generated icons/icon-512.png (' + icon512.length + ' bytes)');
