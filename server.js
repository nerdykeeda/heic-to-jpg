const express = require('express');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const heicConvert = require('heic-convert');
const archiver = require('archiver');
const { v4: uuidv4 } = require('uuid');

const app = express();
const port = 3000;

app.use(express.static('public'));

const upload = multer({ dest: 'uploads/' });

// POST /convert
app.post('/convert', upload.array('inputFiles'), async (req, res) => {
  const outputFormat = req.body.outputFormat || 'jpg';

  // Create unique session folder
  const sessionId = uuidv4();
  const sessionPath = path.join(__dirname, 'public', 'converted', sessionId);
  fs.mkdirSync(sessionPath, { recursive: true });

  const zipFilename = 'converted_images.zip';
  const zipPath = path.join(sessionPath, zipFilename);
  const output = fs.createWriteStream(zipPath);
  const archive = archiver('zip');
  archive.pipe(output);

  const imageBuffers = [];

  try {
    for (const file of req.files) {
      const ext = path.extname(file.originalname).toLowerCase();
      const nameWithoutExt = path.parse(file.originalname).name;
      const newFileName = `${nameWithoutExt}.${outputFormat}`;
      const inputBuffer = fs.readFileSync(file.path);
      let convertedBuffer;

      if (ext === '.heic') {
        if (outputFormat !== 'jpg') {
          throw new Error('HEIC files can only be converted to JPG');
        }

        convertedBuffer = await heicConvert({
          buffer: inputBuffer,
          format: 'JPEG',
          quality: 1
        });
      } else {
        convertedBuffer = await sharp(inputBuffer)
          .toFormat(outputFormat)
          .toBuffer();
      }

      archive.append(convertedBuffer, { name: newFileName });

      imageBuffers.push({
        name: newFileName,
        buffer: convertedBuffer.toString('base64')
      });

      console.log(`✅ Converted: ${file.originalname} → ${newFileName}`);
      fs.unlinkSync(file.path); // cleanup temp upload
    }

    await archive.finalize();

    output.on('close', () => {
      res.json({
        success: true,
        images: imageBuffers,
        downloadLink: `/download/${sessionId}`
      });
    });
  } catch (err) {
    console.error('Conversion error:', err);
    res.status(500).json({ success: false, message: 'Conversion failed' });
  }
});

// Serve the ZIP download
app.get('/download/:sessionId', (req, res) => {
  const zipPath = path.join(__dirname, 'public', 'converted', req.params.sessionId, 'converted_images.zip');

  if (!fs.existsSync(zipPath)) {
    return res.status(404).send('File not found or expired.');
  }

  res.download(zipPath);
});

// 🔁 Auto-delete old sessions (older than 15 mins)
const CLEANUP_INTERVAL = 5 * 60 * 1000; // every 5 minutes
const MAX_AGE = 15 * 60 * 1000; // 15 minutes

setInterval(() => {
  const baseDir = path.join(__dirname, 'public', 'converted');

  fs.readdir(baseDir, (err, folders) => {
    if (err) return;

    folders.forEach(folder => {
      const folderPath = path.join(baseDir, folder);
      fs.stat(folderPath, (err, stats) => {
        if (!err && Date.now() - stats.ctimeMs > MAX_AGE) {
          fs.rm(folderPath, { recursive: true, force: true }, () => {
            console.log(`🧹 Deleted expired session folder: ${folder}`);
          });
        }
      });
    });
  });
}, CLEANUP_INTERVAL);

app.listen(port, () => {
  console.log(`🚀 Server running at http://localhost:${port}`);
});
