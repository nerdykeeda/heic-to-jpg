const express = require('express');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const heicConvert = require('heic-convert');

const app = express();
const port = 3000;

app.use(express.static('public'));

const storage = multer.diskStorage({
  destination: 'uploads/',
  filename: (req, file, cb) => cb(null, file.originalname)
});

const upload = multer({ storage });

const archiver = require('archiver');

app.post('/convert', upload.array('heicFiles'), async (req, res) => {
  const archive = archiver('zip');
  const zipFilename = 'converted_images.zip';
  const zipPath = path.join(__dirname, zipFilename);
  const output = fs.createWriteStream(zipPath);

  archive.pipe(output);

  try {
    for (const file of req.files) {
      const inputBuffer = fs.readFileSync(file.path);
      const jpgBuffer = await heicConvert({
        buffer: inputBuffer,
        format: 'JPEG',
        quality: 1
      });

      const jpgName = file.originalname.replace(/\.[^/.]+$/, '') + '.jpg';
      archive.append(jpgBuffer, { name: jpgName });

      fs.unlinkSync(file.path); // cleanup uploaded HEIC
    }

    await archive.finalize();

    output.on('close', () => {
      res.download(zipPath, zipFilename, () => {
        fs.unlinkSync(zipPath); // cleanup ZIP after download
      });
    });
  } catch (err) {
    console.error('Batch conversion error:', err);
    res.status(500).send('Batch conversion failed');
  }
});

app.listen(port, () => {
  console.log(`HEIC to JPG app running at http://localhost:${port}`);
});
