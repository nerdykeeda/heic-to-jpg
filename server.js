const express = require('express');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const heicConvert = require('heic-convert');
const archiver = require('archiver');

const app = express();
const port = 3000;

app.use(express.static('public'));

const storage = multer.diskStorage({
  destination: 'uploads/',
  filename: (req, file, cb) => cb(null, file.originalname)
});
const upload = multer({ storage });

app.post('/convert', upload.array('heicFiles'), async (req, res) => {
  const zipFilename = 'converted_images.zip';
  const zipPath = path.join(__dirname, 'public', zipFilename);
  const output = fs.createWriteStream(zipPath);
  const archive = archiver('zip');

  archive.pipe(output);

  const imageBuffers = [];

  try {
    for (const file of req.files) {
      try {
        const inputBuffer = fs.readFileSync(file.path);
        const jpgBuffer = await heicConvert({
          buffer: inputBuffer,
          format: 'JPEG',
          quality: 1
        });

        const jpgName = file.originalname.replace(/\.[^/.]+$/, '') + '.jpg';
        archive.append(jpgBuffer, { name: jpgName });

        imageBuffers.push({
          name: jpgName,
          buffer: jpgBuffer.toString('base64')
        });

        console.log(`✅ Converted: ${file.originalname}`);
      } catch (err) {
        console.error(`❌ Skipping ${file.originalname}: ${err.message}`);
      } finally {
        fs.unlinkSync(file.path);
      }
    }

    await archive.finalize();

    output.on('close', () => {
      res.json({
        success: true,
        images: imageBuffers,
        downloadLink: `/${zipFilename}`
      });
    });
  } catch (err) {
    console.error('Conversion error:', err);
    res.status(500).json({ success: false, message: 'Conversion failed' });
  }
});

app.listen(port, () => {
  console.log(`🚀 Server running: http://localhost:${port}`);
});
