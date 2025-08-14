// server.js
const express = require('express');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const archiver = require('archiver');
const { v4: uuidv4 } = require('uuid');
const { Worker } = require('worker_threads');

const app = express();
const port = 3000;

app.use(express.static('public'));
app.use(express.json()); // Add this line for parsing JSON requests

// Admin authentication middleware
const adminAuth = (req, res, next) => {
  const adminToken = req.headers['admin-token'] || req.query.adminToken;
  
  // Simple token-based auth (you can change this to any secure token you want)
  const validToken = 'admin123'; // Change this to a secure token
  
  if (adminToken === validToken) {
    next();
  } else {
    res.status(401).json({ 
      success: false, 
      message: 'Admin access required' 
    });
  }
};

const upload = multer({ dest: 'uploads/' });

// POST /convert
app.post('/convert', upload.array('files'), async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No files uploaded'
      });
    }

    // Validate file types
    const allowedExtensions = ['.heic', '.heif', '.jpg', '.jpeg', '.png', '.webp', '.tiff', '.svg', '.cr2', '.cr3', '.nef', '.nrw', '.arw', '.srf', '.sr2', '.raf', '.orf', '.pef', '.rw2', '.3fr', '.rdc', '.iiq', '.dcr', '.k25', '.kdc', '.mef', '.mos', '.erf'];
    const invalidFiles = req.files.filter(file => {
      const ext = path.extname(file.originalname).toLowerCase();
      return !allowedExtensions.includes(ext);
    });

    if (invalidFiles.length > 0) {
      return res.status(400).json({
        success: false,
        message: `Invalid file type(s): ${invalidFiles.map(f => f.originalname).join(', ')}`
      });
    }

    // Validate file sizes (100MB limit for RAW files)
    const maxSize = 100 * 1024 * 1024; // 100MB
    const oversizedFiles = req.files.filter(file => file.size > maxSize);

    if (oversizedFiles.length > 0) {
      return res.status(400).json({
        success: false,
        message: `File(s) too large: ${oversizedFiles.map(f => f.originalname).join(', ')} (max 50MB)`
      });
    }

    // Get output format from request body
    const outputFormat = req.body.outputFormat || 'jpg';
    
    // Validate output format
    const validOutputFormats = ['jpg', 'jpeg', 'png', 'webp', 'tiff', 'svg', 'psd'];
    if (!validOutputFormats.includes(outputFormat.toLowerCase())) {
      return res.status(400).json({
        success: false,
        message: 'Invalid output format. Supported formats: JPG, PNG, WebP, TIFF, SVG, PSD'
      });
    }

    // Create session directory
    const sessionId = uuidv4();
    const sessionPath = path.join(__dirname, 'public', 'converted', sessionId);
    
    // Create session directory
    try {
      fs.mkdirSync(sessionPath, { recursive: true });
    } catch (dirError) {
      console.error('Error creating session directory:', dirError);
      return res.status(500).json({
        success: false,
        message: 'Failed to create session directory'
      });
    }

    const jobData = {
      sessionId,
      sessionPath,
      files: req.files.map(f => ({
        path: f.path,
        originalname: f.originalname,
        size: f.size
      })),
      outputFormat: outputFormat
    };

    // Store job data temporarily
    try {
      fs.writeFileSync(path.join(sessionPath, 'jobData.json'), JSON.stringify(jobData));
    } catch (writeError) {
      console.error('Error writing job data:', writeError);
      return res.status(500).json({
        success: false,
        message: 'Failed to save job data'
      });
    }

    // Create and run worker
    const worker = new Worker(path.join(__dirname, 'jobs', 'convert.js'), {
      workerData: jobData
    });

    // Set worker timeout (5 minutes)
    const workerTimeout = setTimeout(() => {
      worker.terminate();
      res.status(500).json({
        success: false,
        message: 'Conversion timed out. Please try again with smaller files.'
      });
    }, 5 * 60 * 1000);

    worker.on('message', (message) => {
      clearTimeout(workerTimeout);
      if (message.success) {
        res.json({
          success: true,
          message: 'Conversion completed successfully',
          downloadLink: `/download/${sessionId}`,
          convertedFiles: message.convertedFiles
        });
      } else {
        res.status(500).json({
          success: false,
          message: 'Conversion failed: ' + message.error
        });
      }
      // Give worker a moment to clean up before terminating
      setTimeout(() => worker.terminate(), 100);
    });

    worker.on('error', (error) => {
      clearTimeout(workerTimeout);
      console.error('Worker error:', error);
      if (!res.headersSent) {
        res.status(500).json({
          success: false,
          message: 'Worker error: ' + error.message
        });
      }
      worker.terminate();
    });

    worker.on('exit', (code) => {
      clearTimeout(workerTimeout);
      // Only log non-zero exit codes if response hasn't been sent
      if (code !== 0 && !res.headersSent) {
        console.error(`Worker stopped with exit code ${code}`);
        res.status(500).json({
          success: false,
          message: 'Conversion process failed unexpectedly'
        });
      } else if (code !== 0) {
        // Just log the exit code if response was already sent
        console.log(`Worker completed with exit code ${code} (response already sent)`);
      }
    });

  } catch (error) {
    console.error('Server error:', error);
    if (!res.headersSent) {
      res.status(500).json({
        success: false,
        message: 'Server error: ' + error.message
      });
    }
  }
});

// Serve the ZIP download
app.get('/download/:sessionId', (req, res) => {
  const sessionId = req.params.sessionId;
  const sessionPath = path.join(__dirname, 'public', 'converted', sessionId);
  const zipPath = path.join(sessionPath, 'converted_images.zip');

  console.log(`Download request for session: ${sessionId}`);
  console.log(`ZIP path: ${zipPath}`);

  if (!fs.existsSync(zipPath)) {
    console.log(`ZIP file not found: ${zipPath}`);
    return res.status(404).send('File not found or expired.');
  }

  // Get file stats for debugging
  const stats = fs.statSync(zipPath);
  console.log(`ZIP file size: ${stats.size} bytes`);

  res.download(zipPath, `converted_images_${sessionId}.zip`, (err) => {
    if (err) {
      console.error('Download error:', err);
    } else {
      console.log(`ZIP download completed successfully for session: ${sessionId}`);
    }
  });
});

// Serve individual converted images
app.get('/converted/:sessionId/:filename', (req, res) => {
  const { sessionId, filename } = req.params;
  const filePath = path.join(__dirname, 'public', 'converted', sessionId, filename);
  
  if (!fs.existsSync(filePath)) {
    return res.status(404).send('File not found.');
  }
  
  // Set proper content type based on file extension
  const ext = path.extname(filename).toLowerCase();
  let contentType = 'application/octet-stream'; // default
  
  switch (ext) {
    case '.jpg':
    case '.jpeg':
      contentType = 'image/jpeg';
      break;
    case '.png':
      contentType = 'image/png';
      break;
    case '.webp':
      contentType = 'image/webp';
      break;
    case '.tiff':
    case '.tif':
      contentType = 'image/tiff';
      break;
    case '.svg':
      contentType = 'image/svg+xml';
      break;
  }
  
  // Set headers for proper download
  res.setHeader('Content-Type', contentType);
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  
  // Send the file
  res.sendFile(filePath);
});

// Blog dashboard route
app.get('/blog-dashboard', adminAuth, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'blog-dashboard.html'));
});

// API endpoint to update blog.html
app.post('/api/update-blog', adminAuth, (req, res) => {
  try {
    const { postData, postHTML } = req.body;
    
    if (!postData || !postHTML) {
      return res.status(400).json({
        success: false,
        message: 'Missing post data or HTML'
      });
    }

    // Read current blog.html
    const blogPath = path.join(__dirname, 'public', 'blog.html');
    let blogContent = fs.readFileSync(blogPath, 'utf8');
    
    // Find the position to insert new post (after the navigation header, before existing content)
    const navEndIndex = blogContent.indexOf('<!-- BLOG POSTS START - New posts will be inserted here -->');
    let newBlogContent;
    
    if (navEndIndex === -1) {
      // Fallback: insert after body tag if nav marker not found
      const bodyTagIndex = blogContent.indexOf('<body>') + 7;
      const beforeBody = blogContent.substring(0, bodyTagIndex);
      const afterBody = blogContent.substring(bodyTagIndex);
      newBlogContent = beforeBody + '\n\n  ' + postHTML + '\n\n  ' + afterBody;
    } else {
      // Insert after the marker comment, so new posts appear at the top
      const markerEndIndex = navEndIndex + '<!-- BLOG POSTS START - New posts will be inserted here -->'.length;
      const beforeMarker = blogContent.substring(0, markerEndIndex);
      const afterMarker = blogContent.substring(markerEndIndex);
      newBlogContent = beforeMarker + '\n\n  ' + postHTML + '\n\n  ' + afterMarker;
    }
    
    // Write updated blog.html
    fs.writeFileSync(blogPath, newBlogContent);
    
    res.json({
      success: true,
      message: 'Blog updated successfully'
    });
    
  } catch (error) {
    console.error('Error updating blog:', error);
    res.status(500).json({
      success: false,
      message: 'Error updating blog: ' + error.message
    });
  }
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
