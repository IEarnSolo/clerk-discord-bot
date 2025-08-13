import sharp from 'sharp';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { info, error as logError } from './logger.js';
import { RANK_IMAGES_FOLDER } from '../config.js';

/**
 * Resize an image to specified dimensions using nearest neighbor scaling.
 * Suitable for pixel art to maintain sharp edges.
 * @param {string} inputPath - Path to the input image
 * @param {string} outputPath - Path to save the resized image
 * @param {number} width - Target width
 * @param {number} height - Target height
 * @returns {Promise<void>}
 */
export async function resizeImage(inputPath, outputPath, width, height) {
  if (!fs.existsSync(inputPath)) {
    throw new Error(`Image not found: ${inputPath}`);
  }

  await sharp(inputPath)
    .resize(width, height, {
      fit: 'inside', // Maintain aspect ratio within the box of width x height
      kernel: sharp.kernel.nearest, // Nearest neighbor for pixelated images
    })
    .toFile(outputPath);
}

/** Resize all rank images in the assets/rankimages folder.
 * Skips images that are already the target size.
 * @param {number} width - Target width (default 128) 
 * @param {number} height - Target height (default 128)
 */
export async function resizeRankImages(width = 128, height = 128) {
  const files = fs.readdirSync(RANK_IMAGES_FOLDER)
    .filter(file => file.toLowerCase().endsWith('.png'));

  for (const file of files) {
    const filePath = path.join(RANK_IMAGES_FOLDER, file);
    const tempPath = path.join(RANK_IMAGES_FOLDER, `temp-${file}`);

    try {
      // Get current dimensions
      const metadata = await sharp(filePath).metadata();

      if (metadata.width === width || metadata.height === height) {
        info(`⏩ Skipped (already ${metadata.width}x${metadata.height}): ${file}`);
        continue;
      }

      // Resize into temp file
      await resizeImage(filePath, tempPath, width, height);

      // Replace original with temp file
      fs.renameSync(tempPath, filePath);

      info(`✅ Resized: ${file}`);
    } catch (err) {
      logError(`❌ Failed to resize ${file}:`, err.message);

      // Cleanup if temp file still exists
      if (fs.existsSync(tempPath)) {
        fs.unlinkSync(tempPath);
      }
    }
  }
}

/** Calculate the average color of an image, ignoring fully transparent pixels.
 * Returns the color as a hex string (e.g. #a1b2c3).
 * @param {string} imagePath - Path to the image file
 * @returns {Promise<string>} - Average color in hex format
 */
export async function getAverageColor(imagePath) {
  const { data: pixelBuffer } = await sharp(imagePath)
    .raw()
    .toBuffer({ resolveWithObject: true });

  let totalR = 0, totalG = 0, totalB = 0, count = 0;

  for (let i = 0; i < pixelBuffer.length; i += 4) {
    const a = pixelBuffer[i + 3]; // Alpha channel
    if (a > 0) {
      totalR += pixelBuffer[i];
      totalG += pixelBuffer[i + 1];
      totalB += pixelBuffer[i + 2];
      count++;
    }
  }

  if (count === 0) {
    throw new Error('Image is fully transparent; cannot calculate average color.');
  }

  const avgR = Math.round(totalR / count);
  const avgG = Math.round(totalG / count);
  const avgB = Math.round(totalB / count);

  return `#${avgR.toString(16).padStart(2, '0')}${avgG.toString(16).padStart(2, '0')}${avgB.toString(16).padStart(2, '0')}`;
}
