const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const svgPath = path.join(__dirname, 'media', 'icon.svg');
const pngPath = path.join(__dirname, 'media', 'icon.png');

const svgBuffer = fs.readFileSync(svgPath);
const svgString = svgBuffer.toString().replace(/stroke="currentColor"/g, 'stroke="white"');

sharp(Buffer.from(svgString))
    .resize(128, 128)
    .png()
    .toFile(pngPath)
    .then(function (info) {
        console.log(info);
    })
    .catch(function (err) {
        console.log(err);
    });
