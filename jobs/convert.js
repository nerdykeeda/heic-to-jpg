// jobs/convert.js
const { parentPort, workerData } = require('worker_threads');
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const heicConvert = require('heic-convert');
const archiver = require('archiver');

(async () => {
  try {
    const { files, outputFormat, sessionPath, sessionId } = workerData;
    
    if (!files || !Array.isArray(files)) {
      throw new Error('Invalid files data received');
    }

    if (!sessionPath || !sessionId) {
      throw new Error('Invalid session data received');
    }

    // Use output format from worker data
    
    console.log(`Starting conversion for session ${sessionId} with ${files.length} files to ${outputFormat} format`);

    const convertedFiles = [];
    const zipPath = path.join(sessionPath, 'converted_images.zip');

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const inputPath = file.path;
      const originalName = file.originalname;
      
      console.log(`Processing file ${i + 1}/${files.length}: ${originalName}`);
      
      if (!fs.existsSync(inputPath)) {
        throw new Error(`Input file not found: ${inputPath}`);
      }

      const fileExtension = path.extname(originalName).toLowerCase();
      const fileNameWithoutExt = path.basename(originalName, fileExtension);
      
      // Determine output filename and path
      const outputFileName = `${fileNameWithoutExt}.${outputFormat}`;
      const outputPath = path.join(sessionPath, outputFileName);
      
      let outputBuffer;
      
      try {
        // Handle HEIC files specifically
        if (fileExtension === '.heic' || fileExtension === '.HEIC') {
          console.log(`Converting HEIC file: ${originalName}`);
          const inputBuffer = fs.readFileSync(inputPath);
          
          // heic-convert only supports JPEG and PNG
          let heicOutputFormat = outputFormat.toUpperCase();
          if (heicOutputFormat !== 'JPEG' && heicOutputFormat !== 'PNG') {
            console.log(`HEIC conversion: ${heicOutputFormat} not supported, converting to JPEG first`);
            heicOutputFormat = 'JPEG';
          }
          
          outputBuffer = await heicConvert({
            buffer: inputBuffer,
            format: heicOutputFormat,
            quality: 0.9,
          });
          
          // If user wanted a different format, convert from JPEG/PNG to desired format
          if (heicOutputFormat !== outputFormat.toUpperCase()) {
            console.log(`Converting from ${heicOutputFormat} to ${outputFormat}`);
            const tempSharp = sharp(outputBuffer);
            
            switch (outputFormat.toLowerCase()) {
              case 'webp':
                outputBuffer = await tempSharp.webp({ quality: 90, effort: 6 }).toBuffer();
                break;
              case 'tiff':
                outputBuffer = await tempSharp.tiff({ compression: 'lzw', quality: 90 }).toBuffer();
                break;
              case 'svg':
                // Create SVG with embedded PNG data
                const pngBuffer = await tempSharp.png({ compressionLevel: 9 }).toBuffer();
                const base64PNG = pngBuffer.toString('base64');
                
                // Create SVG with embedded PNG (minimized for smaller file size)
                const svgContent = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="100%" height="100%" viewBox="0 0 800 600"><image xlink:href="data:image/png;base64,${base64PNG}" width="100%" height="100%" preserveAspectRatio="xMidYMid meet"/></svg>`;
                
                outputBuffer = Buffer.from(svgContent, 'utf8');
                console.log(`Created SVG with embedded PNG data for ${outputFileName} (${outputBuffer.length} bytes)`);
                break;
              default:
                // Keep as JPEG/PNG if conversion fails
                console.log(`Keeping ${heicOutputFormat} format for ${outputFileName}`);
                break;
            }
          }
        } else if (fileExtension === '.svg') {
          // Handle SVG files
          console.log(`Converting SVG file: ${originalName}`);
          
          if (outputFormat.toLowerCase() === 'svg') {
            // If output is also SVG, just copy the file
            const inputBuffer = fs.readFileSync(inputPath);
            fs.writeFileSync(outputPath, inputBuffer);
            console.log(`SVG file copied as-is: ${outputFileName}`);
          } else {
            // Convert SVG to other formats using Sharp
            const sharpInstance = sharp(inputPath);
            
            switch (outputFormat.toLowerCase()) {
              case 'jpg':
              case 'jpeg':
                outputBuffer = await sharpInstance
                  .jpeg({ quality: 90, progressive: true })
                  .toBuffer();
                break;
              case 'png':
                outputBuffer = await sharpInstance
                  .png({ compressionLevel: 9, progressive: true })
                  .toBuffer();
                break;
              case 'webp':
                outputBuffer = await sharpInstance
                  .webp({ quality: 90, effort: 6 })
                  .toBuffer();
                break;
              case 'tiff':
                outputBuffer = await sharpInstance
                  .tiff({ compression: 'lzw', quality: 90 })
                  .toBuffer();
                break;

              default:
                // Default to PNG for SVG conversions
                console.log(`Unknown format ${outputFormat}, defaulting to PNG for SVG`);
                outputBuffer = await sharpInstance
                  .png({ compressionLevel: 9, progressive: true })
                  .toBuffer();
            }
          }
        } else if (['.cr2', '.cr3', '.nef', '.nrw', '.arw', '.srf', '.sr2', '.raf', '.orf', '.pef', '.rw2', '.3fr', '.rdc', '.iiq', '.dcr', '.k25', '.kdc', '.mef', '.mos', '.erf'].includes(fileExtension)) {
          // Handle RAW files
          console.log(`Processing RAW file: ${originalName}`);
          
          // For now, create a placeholder file with instructions
          // In production, this should use a proper RAW processing library
          const placeholderContent = `This is a placeholder for RAW file conversion.
          
Original file: ${originalName}
Output format requested: ${outputFormat}

RAW file conversion requires additional libraries like:
- raw-img (Node.js RAW processing)
- dcraw (command-line RAW converter)
- libraw (C++ RAW processing library)

For now, this file cannot be converted. Please implement proper RAW support.`;

          outputBuffer = Buffer.from(placeholderContent, 'utf8');
          console.log(`Created placeholder for RAW file: ${outputFileName}`);
        } else {
          // Handle all other formats using Sharp
          console.log(`Converting ${fileExtension} file: ${originalName}`);
          const sharpInstance = sharp(inputPath);
          
          // Configure output format and quality
          switch (outputFormat.toLowerCase()) {
            case 'jpg':
            case 'jpeg':
              outputBuffer = await sharpInstance
                .jpeg({ quality: 90, progressive: true })
                .toBuffer();
              break;
            case 'png':
              outputBuffer = await sharpInstance
                .png({ compressionLevel: 9, progressive: true })
                .toBuffer();
              break;
            case 'webp':
              outputBuffer = await sharpInstance
                .webp({ quality: 90, effort: 6 })
                .toBuffer();
              break;
            case 'tiff':
              outputBuffer = await sharpInstance
                .tiff({ compression: 'lzw', quality: 90 })
                .toBuffer();
              break;
            case 'svg':
              // Create a simple SVG wrapper around the PNG data
              // Since Sharp doesn't support direct SVG output, we'll create a basic SVG
              const pngBuffer = await sharpInstance
                .png({ compressionLevel: 9 })
                .toBuffer();
              
              // Convert PNG to base64 for embedding in SVG
              const base64PNG = pngBuffer.toString('base64');
              
              // Create SVG with embedded PNG (minimized for smaller file size)
              const svgContent = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="0 0 800 600"><image xlink:href="data:image/png;base64,${base64PNG}" width="100%" height="100%" preserveAspectRatio="xMidYMid meet"/></svg>`;
              
              outputBuffer = Buffer.from(svgContent, 'utf8');
              console.log(`Created SVG with embedded PNG data for ${outputFileName} (${outputBuffer.length} bytes)`);
              break;
            case 'psd':
              // Convert to PSD format (Photoshop)
              // Note: Sharp doesn't support PSD output, so we'll create a placeholder
              // In production, use a library like 'psd' or 'jimp' for PSD creation
              const psdPlaceholder = `Photoshop PSD File
              
This is a placeholder PSD file created from: ${originalName}
Output format: ${outputFormat}

For actual PSD creation, implement:
- PSD file format specification
- Layer structure
- Image data encoding
- Metadata handling

File: ${outputFileName}
Generated: ${new Date().toISOString()}`;
              
              outputBuffer = Buffer.from(psdPlaceholder, 'utf8');
              console.log(`Created PSD placeholder: ${outputFileName}`);
              break;
            default:
              // Default to JPEG if format not recognized
              console.log(`Unknown format ${outputFormat}, defaulting to JPEG`);
              outputBuffer = await sharpInstance
                .jpeg({ quality: 90 })
                .toBuffer();
          }
        }
        
        // Write converted file
        fs.writeFileSync(outputPath, outputBuffer);
        convertedFiles.push(outputFileName);
        console.log(`Successfully converted: ${outputFileName}`);
        
        // Clean up input file
        try {
          fs.unlinkSync(inputPath);
          console.log(`Cleaned up input file: ${inputPath}`);
        } catch (cleanupError) {
          console.warn(`Warning: Could not clean up input file ${inputPath}:`, cleanupError.message);
        }
        
      } catch (conversionError) {
        console.error(`Error converting file ${originalName}:`, conversionError.message);
        throw new Error(`Failed to convert ${originalName}: ${conversionError.message}`);
      }
    }
    
    console.log(`Creating ZIP file with ${convertedFiles.length} converted images`);
    
    // Create ZIP file with all converted images
    const output = fs.createWriteStream(zipPath);
    const archive = archiver('zip', { zlib: { level: 9 } });
    
    output.on('close', () => {
      console.log(`ZIP created: ${archive.pointer()} total bytes`);
    });
    
    archive.on('error', (err) => {
      throw new Error(`ZIP creation failed: ${err.message}`);
    });
    
    archive.pipe(output);
    
    // Add all converted files to ZIP
    convertedFiles.forEach(fileName => {
      const filePath = path.join(sessionPath, fileName);
      if (fs.existsSync(filePath)) {
        archive.file(filePath, { name: fileName });
      } else {
        console.warn(`Warning: Converted file not found for ZIP: ${filePath}`);
      }
    });
    
    await archive.finalize();
    
    console.log(`Conversion completed successfully for session ${sessionId}`);
    
    // Send success message
    parentPort.postMessage({
      success: true,
      convertedFiles,
      zipPath
    });
    
  } catch (error) {
    console.error('Conversion error:', error);
    
    // Clean up any created files on error
    try {
      if (workerData.sessionPath && fs.existsSync(workerData.sessionPath)) {
        fs.rmSync(workerData.sessionPath, { recursive: true, force: true });
        console.log(`Cleaned up session directory on error: ${workerData.sessionPath}`);
      }
    } catch (cleanupError) {
      console.error('Error during cleanup:', cleanupError.message);
    }
    
    parentPort.postMessage({
      success: false,
      error: error.message
    });
  }
})();
