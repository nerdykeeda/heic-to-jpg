// jobs/convert.js
import { parentPort, workerData } from 'worker_threads';
import fs from 'fs';
import path from 'path';
import heicConvert from 'heic-convert';

(async () => {
  const { inputPath, outputPath } = workerData;

  const inputBuffer = fs.readFileSync(inputPath);

  const outputBuffer = await heicConvert({
    buffer: inputBuffer,
    format: 'JPEG',
    quality: 1,
  });

  fs.writeFileSync(outputPath, outputBuffer);

  parentPort.postMessage('done');
})();
