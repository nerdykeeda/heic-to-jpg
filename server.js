const express = require('express');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const heicConvert = require('heic-convert');
const archiver = require('archiver');

const app = express();
const port = 3000;

app.use(express.static('public'));

// Ensure uploads folder exists
if (!fs.existsSync('uploads')) {
  fs.mkdirSync('uploads');
}

const storage = multer.diskStorage({
  destination: 'uploads/',
  filename: (req, file, cb) => cb(null, Date.now() + '-' + file.originalname)
});
const upload = multer({ storage });

app.post('/convert', upload.array('inputFiles'), async (req, res) => {
  const outputFormat = req.body.outputFormat || 'jpg';
  const zipFilename = 'converted_images.zip';
  const zipPath = path.join(__dirname, 'public', zipFilename);
  const output = fs.createWriteStream(zipPath);
  const archive = archiver('zip');
  const imageBuffers = [];
  
  

  archive.pipe(output);
  

  try {
    for (const file of req.files) {
      const ext = path.extname(file.originalname).toLowerCase();
      const nameWithoutExt = path.parse(file.originalname).name;
      const newFileName = `${nameWithoutExt}.${outputFormat}`;

      try {
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
      } catch (err) {
        console.error(`❌ Failed to convert ${file.originalname}:`, err.message);
      } finally {
        fs.unlinkSync(file.path); // always cleanup
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
  console.log(`🚀 Server running at http://localhost:${port}`);
});
