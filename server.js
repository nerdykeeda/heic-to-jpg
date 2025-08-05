// server.js
const express = require('express');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const archiver = require('archiver');
const { v4: uuidv4 } = require('uuid');
const Bree = require('bree');

const app = express();
const port = 3000;

app.use(express.static('public'));

const upload = multer({ dest: 'uploads/' });

const bree = new Bree({
  root: path.join(__dirname, 'jobs'),
  defaultExtension: 'js'
});

// POST /convert
app.post('/convert', upload.array('inputFiles'), async (req, res) => {
  const outputFormat = req.body.outputFormat || 'jpg';
  const sessionId = uuidv4();
  const sessionPath = path.join(__dirname, 'public', 'converted', sessionId);
  fs.mkdirSync(sessionPath, { recursive: true });

  const jobData = {
    files: req.files.map(f => ({
      path: f.path,
      originalname: f.originalname
    })),
    outputFormat,
    sessionPath,
    sessionId
  };

  // Store job data temporarily
  fs.writeFileSync(path.join(sessionPath, 'jobData.json'), JSON.stringify(jobData));

  await bree.add({
    name: `convert-${sessionId}`,
    path: path.join(__dirname, 'jobs', 'convert.js'),
    worker: {
      workerData: jobData
    }
  });

  await bree.run(`convert-${sessionId}`);

  res.json({
    success: true,
    message: 'Conversion in progress',
    downloadLink: `/download/${sessionId}`
  });
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
