// server.js
// Load environment variables from .env file (for local development)
if (process.env.NODE_ENV !== 'production') {
  require('dotenv').config();
}

const express = require('express');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const archiver = require('archiver');
const { v4: uuidv4 } = require('uuid');
const { Worker } = require('worker_threads');
const nodemailer = require('nodemailer');

const app = express();
const port = process.env.PORT || 3000;

// Email configuration - using environment variables
const emailUser = process.env.EMAIL_USER;
const emailPass = process.env.EMAIL_PASS;

// Debug: Log environment variable values (without showing passwords)
console.log('Environment variables loaded:');
console.log('EMAIL_USER:', emailUser ? 'SET' : 'NOT SET');
console.log('EMAIL_PASS:', emailPass ? 'SET' : 'NOT SET');
console.log('NODE_ENV:', process.env.NODE_ENV);

// Only create transporter if email credentials are provided
let transporter = null;
if (emailUser && emailPass) {
  transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: emailUser,
      pass: emailPass
    }
  });
  console.log('✅ Email transporter created successfully');
} else {
  console.log('❌ Email credentials not configured. Contact form will be disabled.');
}

app.use(express.static('public'));
app.use(express.json()); // Add this line for parsing JSON requests

// Security headers middleware
app.use((req, res, next) => {
  // Strict Transport Security (HSTS) - Force HTTPS
  res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  
  // Content Security Policy
  res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self' 'unsafe-inline' https://www.googletagmanager.com https://kit.fontawesome.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: https:; connect-src 'self' https://www.google-analytics.com;");
  
  // X-Frame-Options - Prevent clickjacking
  res.setHeader('X-Frame-Options', 'DENY');
  
  // X-Content-Type-Options - Prevent MIME type sniffing
  res.setHeader('X-Content-Type-Options', 'nosniff');
  
  // Referrer Policy
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  
  next();
});

// Canonicalization redirects - Handle URL variations and redirects
app.use((req, res, next) => {
  const host = req.get('host');
  const protocol = req.protocol;
  const url = req.url;
  
  // Force HTTPS (but not on localhost for development)
  if (protocol === 'http' && !host.includes('localhost') && !host.includes('127.0.0.1')) {
    return res.redirect(301, `https://${host}${url}`);
  }
  
  // Force non-www (imgtojpg.org instead of www.imgtojpg.org) - but not on localhost
  if (host.startsWith('www.') && !host.includes('localhost') && !host.includes('127.0.0.1')) {
    const newHost = host.replace('www.', '');
    return res.redirect(301, `https://${newHost}${url}`);
  }
  
  // Handle .html extensions and clean URLs
  if (url.endsWith('.html') && url !== '/index.html') {
    const cleanUrl = url.replace('.html', '');
    return res.redirect(301, cleanUrl);
  }
  
  // Handle index.html redirects
  if (url === '/index.html') {
    return res.redirect(301, '/');
  }
  
  // Handle common URL variations
  const urlVariations = {
    '/home': '/',
    '/homepage': '/',
    '/heic-to-jpg': '/heic-to-jpg.html',
    '/png-to-jpg': '/png-to-jpg.html',
    '/webp-to-jpg': '/webp-to-jpg.html',
    '/tiff-to-jpg': '/tiff-to-jpg.html',
    '/svg-to-jpg': '/svg-to-jpg.html',
    '/camera-raw-converter': '/camera-raw-converter.html',
    '/blog': '/blog.html',
    '/about': '/about.html',
    '/contact': '/contact.html',
    '/help': '/help-center.html',
    '/help-center': '/help-center.html',
    '/privacy': '/privacy-policy.html',
    '/privacy-policy': '/privacy-policy.html',
    '/terms': '/terms-of-use.html',
    '/terms-of-use': '/terms-of-use.html'
  };
  
  if (urlVariations[url]) {
    return res.redirect(301, urlVariations[url]);
  }
  
  next();
});

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

    // Copy uploaded files to session directory
    const copiedFiles = [];
    for (const file of req.files) {
      const fileName = file.originalname;
      const sessionFilePath = path.join(sessionPath, fileName);
      
      try {
        // Copy file to session directory
        fs.copyFileSync(file.path, sessionFilePath);
        
        // Clean up temporary upload file
        fs.unlinkSync(file.path);
        
        copiedFiles.push({
          path: sessionFilePath,
          originalname: fileName,
          size: file.size
        });
        
        console.log(`Copied ${fileName} to session directory`);
      } catch (copyError) {
        console.error(`Failed to copy ${fileName}:`, copyError);
        // Clean up temporary file even if copy fails
        try {
          fs.unlinkSync(file.path);
        } catch (cleanupError) {
          console.log(`Warning: Could not clean up temp file ${file.path}`);
        }
        throw new Error(`Failed to copy file ${fileName}: ${copyError.message}`);
      }
    }

    const jobData = {
      sessionId,
      sessionPath,
      files: copiedFiles,
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

// Contact form endpoint
app.post('/api/contact', async (req, res) => {
  try {
    const { name, email, subject, message } = req.body;
    
    // Validate required fields
    if (!name || !email || !subject || !message) {
      return res.status(400).json({
        success: false,
        message: 'All fields are required'
      });
    }
    
    // Email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({
        success: false,
        message: 'Please enter a valid email address'
      });
    }
    
    // Check if email is configured
    if (!transporter) {
      return res.status(503).json({
        success: false,
        message: 'Contact form is temporarily unavailable. Please try again later or contact us directly.'
      });
    }

    // Email content
    const mailOptions = {
      from: emailUser,
      to: 'neerdykeeda@gmail.com',
      subject: `Contact Form: ${subject}`,
      html: `
        <h2>New Contact Form Submission</h2>
        <p><strong>Name:</strong> ${name}</p>
        <p><strong>Email:</strong> ${email}</p>
        <p><strong>Subject:</strong> ${subject}</p>
        <p><strong>Message:</strong></p>
        <p>${message.replace(/\n/g, '<br>')}</p>
        <hr>
        <p><em>This message was sent from the contact form on imgtojpg.org</em></p>
      `,
      text: `
        New Contact Form Submission
        
        Name: ${name}
        Email: ${email}
        Subject: ${subject}
        Message:
        ${message}
        
        ---
        This message was sent from the contact form on imgtojpg.org
      `
    };
    
    // Send email
    const info = await transporter.sendMail(mailOptions);
    
    console.log('Email sent successfully:', info.messageId);
    
    res.json({
      success: true,
      message: 'Your message has been sent successfully! We\'ll get back to you soon.',
      messageId: info.messageId
    });
    
  } catch (error) {
    console.error('Error sending email:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to send email. Please try again later.'
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

// 404 Error Handler - Must be placed after all other routes
app.use((req, res) => {
  // Log 404 errors for debugging
  console.log(`404 Error - Page not found: ${req.method} ${req.url}`);
  console.log(`Referrer: ${req.get('Referrer') || 'Direct access'}`);
  console.log(`User Agent: ${req.get('User-Agent')}`);
  
  // Serve custom 404 page
  res.status(404).sendFile(path.join(__dirname, 'public', '404.html'));
});

app.listen(port, () => {
  console.log(`🚀 Server running at http://localhost:${port}`);
});
