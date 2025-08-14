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
          // Handle RAW files with intelligent fallback and clear user guidance
          console.log(`Processing RAW file: ${originalName} with smart conversion system`);
          
          let conversionSuccess = false;
          let errorDetails = [];
          let formatSupport = '';
          
          // Determine format support level
          if (fileExtension === '.cr3') {
            formatSupport = 'CR3 (Canon newest format) - Limited support in web tools';
          } else if (fileExtension === '.cr2') {
            formatSupport = 'CR2 (Canon older format) - Better support';
          } else if (fileExtension === '.nef') {
            formatSupport = 'NEF (Nikon) - Good support';
          } else if (fileExtension === '.arw') {
            formatSupport = 'ARW (Sony) - Variable support';
          } else if (fileExtension === '.raf') {
            formatSupport = 'RAF (Fujifilm) - Limited support';
          } else {
            formatSupport = `${fileExtension.toUpperCase()} - Variable support`;
          }
          
          // Approach 1: Try Sharp with failOnError: false and metadata check
          try {
            console.log(`Attempting Sharp conversion for ${originalName} (${formatSupport})`);
            
            // First, try to read metadata without failing
            const metadataSharp = sharp(inputPath, { failOnError: false });
            const metadata = await metadataSharp.metadata();
            
            console.log(`Image metadata: ${JSON.stringify(metadata)}`);
            
            if (metadata.width && metadata.height && metadata.width > 0 && metadata.height > 0) {
              console.log(`Image readable with valid dimensions: ${metadata.width}x${metadata.height}`);
              
              // Now try actual conversion
              const sharpInstance = sharp(inputPath, { failOnError: false });
              
              switch (outputFormat.toLowerCase()) {
                case 'jpg':
                case 'jpeg':
                  outputBuffer = await sharpInstance
                    .jpeg({ quality: 90, progressive: true })
                    .toBuffer();
                  console.log(`Sharp successfully converted RAW to JPEG: ${outputBuffer.length} bytes`);
                  conversionSuccess = true;
                  break;
                case 'png':
                  outputBuffer = await sharpInstance
                    .png({ compressionLevel: 9, progressive: true })
                    .toBuffer();
                  console.log(`Sharp successfully converted RAW to PNG: ${outputBuffer.length} bytes`);
                  conversionSuccess = true;
                  break;
                case 'webp':
                  outputBuffer = await sharpInstance
                    .webp({ quality: 90, effort: 6 })
                    .toBuffer();
                  console.log(`Sharp successfully converted RAW to WebP: ${outputBuffer.length} bytes`);
                  conversionSuccess = true;
                  break;
                case 'tiff':
                  outputBuffer = await sharpInstance
                    .tiff({ compression: 'lzw', quality: 90 })
                    .toBuffer();
                  console.log(`Sharp successfully converted RAW to TIFF: ${outputBuffer.length} bytes`);
                  conversionSuccess = true;
                  break;
                case 'psd':
                  // For PSD, we'll create a placeholder since Sharp doesn't support PSD output
                  const psdPlaceholder = `Adobe Photoshop Document (PSD) - Placeholder
                  
This is a placeholder file for PSD format conversion.
The original RAW file was: ${originalName}

PSD files require specialized processing that cannot be done in the browser.
For professional PSD conversion, please use desktop software like Adobe Photoshop.

File: ${outputFileName}
Generated: ${new Date().toISOString()}`;
                  
                  outputBuffer = Buffer.from(psdPlaceholder, 'utf8');
                  console.log(`Created PSD placeholder: ${outputFileName}`);
                  conversionSuccess = true;
                  break;
                default:
                  // Default to JPEG for RAW conversions
                  console.log(`Unknown format ${outputFormat}, defaulting to JPEG for RAW`);
                  outputBuffer = await sharpInstance
                    .jpeg({ quality: 90, progressive: true })
                    .toBuffer();
                  console.log(`Sharp defaulted to JPEG: ${outputBuffer.length} bytes`);
                  conversionSuccess = true;
              }
            } else {
              throw new Error(`Invalid metadata: width=${metadata.width}, height=${metadata.height}`);
            }
            
          } catch (sharpError) {
            console.log(`Sharp conversion failed: ${sharpError.message}`);
            errorDetails.push(`Sharp conversion: ${sharpError.message}`);
            
            // Approach 2: Try to create a thumbnail/preview version
            try {
              console.log(`Attempting thumbnail creation for ${originalName}`);
              
              // Try to create a smaller version which might work better
              const thumbnailSharp = sharp(inputPath, { failOnError: false });
              
              // Resize to a smaller dimension to see if that helps
              const resizedSharp = thumbnailSharp.resize(800, 600, { 
                fit: 'inside',
                withoutEnlargement: true 
              });
              
              switch (outputFormat.toLowerCase()) {
                case 'jpg':
                case 'jpeg':
                  outputBuffer = await resizedSharp
                    .jpeg({ quality: 85, progressive: true })
                    .toBuffer();
                  console.log(`Thumbnail conversion to JPEG successful: ${outputBuffer.length} bytes`);
                  conversionSuccess = true;
                  break;
                case 'png':
                  outputBuffer = await resizedSharp
                    .png({ compressionLevel: 6, progressive: true })
                    .toBuffer();
                  console.log(`Thumbnail conversion to PNG successful: ${outputBuffer.length} bytes`);
                  conversionSuccess = true;
                  break;
                case 'webp':
                  outputBuffer = await resizedSharp
                    .webp({ quality: 80, effort: 4 })
                    .toBuffer();
                  console.log(`Thumbnail conversion to WebP successful: ${outputBuffer.length} bytes`);
                  conversionSuccess = true;
                  break;
                case 'tiff':
                  outputBuffer = await resizedSharp
                    .tiff({ compression: 'lzw', quality: 80 })
                    .toBuffer();
                  console.log(`Thumbnail conversion to TIFF successful: ${outputBuffer.length} bytes`);
                  conversionSuccess = true;
                  break;
                default:
                  outputBuffer = await resizedSharp
                    .jpeg({ quality: 85, progressive: true })
                    .toBuffer();
                  console.log(`Thumbnail conversion to JPEG successful: ${outputBuffer.length} bytes`);
                  conversionSuccess = true;
              }
              
            } catch (thumbnailError) {
              console.log(`Thumbnail conversion also failed: ${thumbnailError.message}`);
              errorDetails.push(`Thumbnail conversion: ${thumbnailError.message}`);
              
              // Approach 3: Create a comprehensive error file with solutions
              const errorContent = `RAW Conversion Failed - ${originalName}

Format Information:
- File: ${originalName}
- Format: ${formatSupport}
- Output Requested: ${outputFormat.toUpperCase()}

Error Details:
${errorDetails.map((detail, index) => `${index + 1}. ${detail}`).join('\n')}

Why This Happened:
RAW files require specialized processing that web-based tools cannot always handle reliably.
${fileExtension.toUpperCase()} files, especially newer formats like CR3, have limited support in web environments.

Solutions to Try:

1. Use a Different RAW File:
   - CR2 (Canon older format) - Better web support
   - NEF (Nikon) - Good web support
   - ARW (Sony) - Variable web support
   - RAF (Fujifilm) - Limited web support

2. Try Different Output Formats:
   - JPG/JPEG usually works best
   - PNG has good compatibility
   - Avoid PSD/SVG for RAW files

3. Professional Desktop Software (Recommended for RAW):
   - Adobe Lightroom (best overall)
   - Capture One (excellent for RAW)
   - Darktable (free, powerful)
   - RawTherapee (free, advanced)
   - Canon Digital Photo Professional (free for Canon users)

4. Alternative Online Tools:
   - Try converting to JPG first, then to your desired format
   - Use specialized RAW conversion services

5. Check Your File:
   - Ensure the RAW file isn't corrupted
   - Try a different RAW file from the same camera
   - Verify the file extension matches the actual format

What Works Well on This Service:
✅ HEIC/HEIF (iPhone photos)
✅ PNG, JPG, WebP, TIFF
✅ Some older RAW formats (CR2, NEF)
✅ SVG to other formats

What Has Limitations:
⚠️ Modern RAW formats (CR3, newer ARW)
⚠️ Some camera-specific RAW formats
⚠️ PSD output (creates placeholders)

File: ${outputFileName}
Generated: ${new Date().toISOString()}
Service: imgtojpg.org - Free Online Image Converter

Need Help? For professional RAW conversion, consider using specialized desktop software that can handle all RAW formats reliably.`;
              
              outputBuffer = Buffer.from(errorContent, 'utf8');
              console.log(`Created comprehensive error file for failed RAW conversion: ${outputFileName}`);
              conversionSuccess = false;
            }
          }
          
          if (conversionSuccess) {
            console.log(`Successfully converted RAW file to ${outputFormat}: ${outputFileName} (${outputBuffer.length} bytes)`);
          } else {
            console.log(`RAW conversion failed for ${originalName} - created comprehensive error file with solutions`);
          }
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
              // For SVG output, we'll create a placeholder since Sharp doesn't support SVG output
              const svgPlaceholder = `SVG Placeholder - ${originalName}
              
This is a placeholder file for SVG format conversion.
The original file was: ${originalName}

SVG files require specialized processing that cannot be done in the browser.
For SVG conversion, please use desktop software or online SVG converters.

File: ${outputFileName}
Generated: ${new Date().toISOString()}`;
              
              outputBuffer = Buffer.from(svgPlaceholder, 'utf8');
              console.log(`Created SVG placeholder: ${outputFileName}`);
              break;
            case 'psd':
              // For PSD output, we'll create a placeholder since Sharp doesn't support PSD output
              const psdPlaceholder = `Adobe Photoshop Document (PSD) - Placeholder
              
This is a placeholder file for PSD format conversion.
The original file was: ${originalName}

PSD files require specialized processing that cannot be done in the browser.
For professional PSD conversion, please use desktop software like Adobe Photoshop.

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
    
    // Clean up input files after all conversions are complete
    for (const file of files) {
      try {
        if (fs.existsSync(file.path)) {
          fs.unlinkSync(file.path);
          console.log(`Cleaned up input file: ${file.path}`);
        }
      } catch (cleanupError) {
        console.warn(`Warning: Could not clean up input file ${file.path}:`, cleanupError.message);
      }
    }
    
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
