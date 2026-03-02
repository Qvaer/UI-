
import { ComparisonResult, BoundingBox } from '../types';

/**
 * loads an image from a source string (URL or Base64)
 */
export const loadImage = (src: string): Promise<HTMLImageElement> => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "Anonymous";
    img.onload = () => resolve(img);
    img.onerror = (e) => reject(e);
    img.src = src;
  });
};

/**
 * Rapidly checks if two images are roughly similar using low-res thumbnails.
 * Used to detect complete mismatches before running heavy analysis.
 * UPDATED: Much stricter thresholds to prevent dissimilar images.
 */
export const checkThumbnailSimilarity = async (designSrc: string, devSrc: string): Promise<boolean> => {
  try {
    const [designImg, devImg] = await Promise.all([loadImage(designSrc), loadImage(devSrc)]);
    
    // 1. Aspect Ratio Sanity Check
    // Calculate the Aspect Ratio of Design
    const designAR = designImg.width / designImg.height;
    
    // For Dev, we assume it might be a scrollshot, so its height can be very large (low AR).
    // However, its WIDTH should be somewhat comparable relative to height when cropped.
    // If Design is Landscape (AR > 1.2) and Dev is extremely Portrait (AR < 0.3), 
    // it's likely a complete mismatch or wrong device screenshot.
    const devRawAR = devImg.width / devImg.height;
    
    // If Design is clearly Landscape (>1.2) and Dev is extremely tall/skinny (<0.4), warn.
    if (designAR > 1.2 && devRawAR < 0.4) {
        console.warn("Aspect Ratio Mismatch: Landscape Design vs Scrollshot Dev");
        // We don't return false immediately as it MIGHT be a partial crop, 
        // but this is a strong signal. We proceed to pixel check.
    }

    const size = 64;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (!ctx) return true; // Fail safe

    // 2. Draw Design squashed to 64x64
    ctx.drawImage(designImg, 0, 0, size, size);
    const d1 = ctx.getImageData(0, 0, size, size).data;

    // 3. Draw Dev cropped to match Design's aspect ratio
    // cropHeight = devWidth / designAR
    const cropHeight = Math.min(devImg.height, devImg.width / designAR);
    
    ctx.clearRect(0, 0, size, size);
    // Draw only the top-part (viewport) of the dev image that matches design AR
    ctx.drawImage(devImg, 0, 0, devImg.width, cropHeight, 0, 0, size, size);
    const d2 = ctx.getImageData(0, 0, size, size).data;

    let totalDiff = 0;
    
    // Iterate pixels
    for (let i = 0; i < d1.length; i += 4) {
        // Calculate Perceptual Brightness (Luminance)
        // L = 0.299R + 0.587G + 0.114B
        const l1 = 0.299 * d1[i] + 0.587 * d1[i+1] + 0.114 * d1[i+2];
        const l2 = 0.299 * d2[i] + 0.587 * d2[i+1] + 0.114 * d2[i+2];
        
        // Luminance difference
        const lumDiff = Math.abs(l1 - l2);

        // Color difference (Manhattan distance of RGB)
        const colDiff = (Math.abs(d1[i] - d2[i]) + 
                         Math.abs(d1[i+1] - d2[i+1]) + 
                         Math.abs(d1[i+2] - d2[i+2])) / 3;

        // Weighted sum: Luminance (Structure) + Color
        totalDiff += (lumDiff * 0.6) + (colDiff * 0.4);
    }
    
    const avgDiff = totalDiff / (size * size); // 0-255
    
    console.log(`Thumbnail Diff Score: ${avgDiff.toFixed(2)} / 255`);

    // STRICTER THRESHOLD:
    // Previous: 100 (allows ~40% diff)
    // New: 45 (allows ~17.5% diff)
    // - Identical images: ~0
    // - Same layout, minor color tweaks: ~10-25
    // - Dark mode vs Light mode: ~150+
    // - Totally different image: ~80+
    return avgDiff < 45;

  } catch (e) {
    console.error("Thumbnail check failed", e);
    return true; // Assume safe to proceed on error
  }
};

/**
 * Resizes the development screenshot to match the design width, maintaining aspect ratio.
 */
export const alignImages = async (
  designSrc: string,
  devSrc: string
): Promise<{ designImg: HTMLImageElement; devImg: HTMLImageElement; canvasWidth: number; canvasHeight: number }> => {
  const [designImg, devImgRaw] = await Promise.all([
    loadImage(designSrc),
    loadImage(devSrc)
  ]);

  const targetWidth = designImg.width;
  const scaleFactor = targetWidth / devImgRaw.width;
  const targetHeight = Math.round(devImgRaw.height * scaleFactor);

  const finalWidth = targetWidth;
  const finalHeight = Math.max(designImg.height, targetHeight);

  return { designImg, devImg: devImgRaw, canvasWidth: finalWidth, canvasHeight: finalHeight };
};

/**
 * V16 Logic Port: Iterative Box Merging
 * Scans image with a step, creates small boxes, and merges them if they are close.
 */
const findDiffBoxes = (
  diffData: Uint8ClampedArray, 
  width: number, 
  height: number, 
  mergeTolerance: number = 25
): BoundingBox[] => {
  const step = 6; // Sampling step size
  let rects: BoundingBox[] = [];

  // 1. Initial Scan: Create small boxes for diff pixels
  for (let y = 0; y < height; y += step) {
    for (let x = 0; x < width; x += step) {
      // Check a pixel slightly inside the block to avoid edge artifacts
      const cy = Math.min(y + 2, height - 1);
      const cx = Math.min(x + 2, width - 1);
      const idx = (cy * width + cx) * 4;

      // In compareImages, we set diff pixels to [255, 0, 80, 200]
      // Check if it's our marked red diff color
      if (diffData[idx] === 255 && diffData[idx + 1] === 0) {
        rects.push({ x, y, width: step, height: step });
      }
    }
  }

  // Optimize: If too many initial rects (noisy image), increase step or tolerance to prevent browser freeze
  if (rects.length > 4000) {
      console.warn("High noise detected, merging aggressively");
      mergeTolerance = mergeTolerance * 1.5;
  }

  // 2. Iterative Merge Loop (The V16 Logic)
  // Merges boxes that are within 'mergeTolerance' of each other
  let changed = true;
  let iterations = 0;
  const MAX_ITERATIONS = 50; // Safety break

  while (changed && iterations < MAX_ITERATIONS) {
    changed = false;
    iterations++;
    
    for (let i = 0; i < rects.length; i++) {
      for (let j = i + 1; j < rects.length; j++) {
        const r1 = rects[i];
        const r2 = rects[j];

        // Check if boxes are close enough to merge
        // Condition: r1.x < r2.x + r2.w + sensitivity ...
        const isClose = 
           r1.x < r2.x + r2.width + mergeTolerance && 
           r1.x + r1.width + mergeTolerance > r2.x && 
           r1.y < r2.y + r2.height + mergeTolerance && 
           r1.y + r1.height + mergeTolerance > r2.y;

        if (isClose) {
          const nx = Math.min(r1.x, r2.x);
          const ny = Math.min(r1.y, r2.y);
          const nw = Math.max(r1.x + r1.width, r2.x + r2.width) - nx;
          const nh = Math.max(r1.y + r1.height, r2.y + r2.height) - ny;

          // Update r1 to be the merged box
          rects[i] = { x: nx, y: ny, width: nw, height: nh };
          
          // Remove r2
          rects.splice(j, 1);
          j--; // Adjust index since we removed an element
          changed = true;
        }
      }
    }
  }

  // 3. Filter noise (keep boxes > 8x8px)
  return rects.filter(b => b.width > 8 && b.height > 8);
};

/**
 * Helper to draw a crosshair on a canvas context at a specific rect
 */
const drawCrosshair = (ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) => {
  const cx = x + (w / 2);
  const cy = y + (h / 2);
  
  ctx.strokeStyle = 'rgba(255, 50, 50, 0.8)'; // More opaque red
  ctx.lineWidth = 1;
  ctx.setLineDash([4, 4]); // Bigger dashes

  // Vertical line
  ctx.beginPath();
  ctx.moveTo(cx, y);
  ctx.lineTo(cx, y + h);
  ctx.stroke();

  // Horizontal line
  ctx.beginPath();
  ctx.moveTo(x, cy);
  ctx.lineTo(x + w, cy);
  ctx.stroke();
  
  ctx.setLineDash([]); // Reset
};

/**
 * Creates a "Diagnosis Sheet" image.
 * It crops the Design and Dev images for each diff box and stitches them side-by-side.
 * This provides the AI with high-res "Zoomed In" views.
 */
export const createDiagnosisSheet = async (
  designSrc: string,
  alignedDevSrc: string,
  boxes: BoundingBox[]
): Promise<string> => {
  const [designImg, devImg] = await Promise.all([
    loadImage(designSrc),
    loadImage(alignedDevSrc)
  ]);

  // Reduced padding to save tokens
  const PADDING = 40; 
  // Reduced max dimensions to save tokens
  const MAX_CROP_DIM = 400;

  // Larger header for clearer text
  const CAPTION_HEIGHT = 40;
  const GAP = 20;
  const SEPARATOR_HEIGHT = 2; // Line between rows
  
  // First pass: Calculate canvas size needed
  let totalHeight = 0;
  let maxWidth = 0;

  // We need to store the calculated crop rects so we don't recalc them
  const crops = boxes.map(box => {
      const centerX = box.x + (box.width / 2);
      const centerY = box.y + (box.height / 2);
      
      const effectiveW = Math.min(box.width, MAX_CROP_DIM);
      const effectiveH = Math.min(box.height, MAX_CROP_DIM);

      let x = centerX - (effectiveW / 2) - PADDING;
      let y = centerY - (effectiveH / 2) - PADDING;
      let w = effectiveW + (PADDING * 2);
      let h = effectiveH + (PADDING * 2);
      
      return { x, y, w, h };
  });

  crops.forEach(c => {
    totalHeight += c.h + CAPTION_HEIGHT + GAP + SEPARATOR_HEIGHT;
    maxWidth = Math.max(maxWidth, (c.w * 2) + GAP);
  });

  const canvas = document.createElement('canvas');
  canvas.width = maxWidth + 40; // Extra side padding
  canvas.height = totalHeight + 40;
  
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';

  ctx.fillStyle = '#0F0F13'; // Very Dark Background
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  let currentY = 20;

  boxes.forEach((box, index) => {
    const c = crops[index];

    // Ensure source coordinates are within bounds
    const sx = Math.max(0, c.x);
    const sy = Math.max(0, c.y);
    // Adjust width/height if we hit image edges
    const sw = Math.min(designImg.width - sx, c.w);
    const sh = Math.min(designImg.height - sy, c.h);

    // 1. Draw Separator Line (except for first item)
    if (index > 0) {
        ctx.fillStyle = '#333344';
        ctx.fillRect(10, currentY - (GAP / 2), canvas.width - 20, 2);
    }

    // 2. Draw Large Caption (Visual Anchor)
    ctx.fillStyle = '#FFFFFF';
    ctx.font = 'bold 24px Arial, sans-serif'; 
    ctx.fillText(`Issue #${index + 1}`, 10, currentY + 28);
    
    // Subtext
    ctx.fillStyle = '#8888AA';
    ctx.font = '12px Arial, sans-serif';
    ctx.fillText(`(Left: Design, Right: Dev)`, 150, currentY + 28);
    
    // Draw Design Crop
    const designDestX = 10;
    const designDestY = currentY + CAPTION_HEIGHT;
    
    // Design Label
    ctx.fillStyle = '#3D5CFF'; // Primary Blue
    ctx.fillRect(designDestX, designDestY - 6, sw, 4); 
    
    ctx.drawImage(designImg, sx, sy, sw, sh, designDestX, designDestY, sw, sh);
    drawCrosshair(ctx, designDestX, designDestY, sw, sh);

    // Draw Dev Crop
    const devDestX = designDestX + sw + GAP;
    const devDestY = currentY + CAPTION_HEIGHT;

    // Dev Label
    ctx.fillStyle = '#FF9F2D'; // Orange
    ctx.fillRect(devDestX, devDestY - 6, sw, 4);

    ctx.drawImage(devImg, sx, sy, sw, sh, devDestX, devDestY, sw, sh);
    drawCrosshair(ctx, devDestX, devDestY, sw, sh);

    currentY += sh + CAPTION_HEIGHT + GAP + SEPARATOR_HEIGHT;
  });

  // --- FORCE RESIZE LOGIC ---
  // If the generated canvas is too large (e.g. > 3000px height), scale it down.
  // This drastically reduces Base64 size and Token usage.
  // Updated to 3000 to allow more issues to be stacked.
  const MAX_FINAL_HEIGHT = 3000;
  if (canvas.height > MAX_FINAL_HEIGHT) {
      const scale = MAX_FINAL_HEIGHT / canvas.height;
      const finalW = Math.floor(canvas.width * scale);
      const finalH = MAX_FINAL_HEIGHT;
      
      const resizedCanvas = document.createElement('canvas');
      resizedCanvas.width = finalW;
      resizedCanvas.height = finalH;
      const rCtx = resizedCanvas.getContext('2d');
      if (rCtx) {
          rCtx.imageSmoothingEnabled = true;
          rCtx.imageSmoothingQuality = 'high';
          rCtx.drawImage(canvas, 0, 0, finalW, finalH);
          return resizedCanvas.toDataURL('image/jpeg', 0.8);
      }
  }

  // Use JPEG with 0.8 quality to further reduce size
  return canvas.toDataURL('image/jpeg', 0.8);
};

/**
 * Compares two images pixel by pixel.
 */
export const compareImages = async (
  designSrc: string,
  devSrc: string,
  tolerance: number = 10,
  mergeTolerance: number = 25
): Promise<ComparisonResult> => {
  const { designImg, devImg, canvasWidth, canvasHeight } = await alignImages(designSrc, devSrc);

  const canvas = document.createElement('canvas');
  canvas.width = canvasWidth;
  canvas.height = canvasHeight;
  const ctx = canvas.getContext('2d');

  if (!ctx) throw new Error("Could not get canvas context");

  // 1. Draw Design Image
  ctx.drawImage(designImg, 0, 0);
  const designData = ctx.getImageData(0, 0, canvasWidth, canvasHeight);

  // 2. Clear and Draw Dev Image (Scaled)
  const scaleFactor = canvasWidth / devImg.width;
  const targetHeight = Math.round(devImg.height * scaleFactor);

  ctx.clearRect(0, 0, canvasWidth, canvasHeight);
  // Improved smoothing for alignment
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(devImg, 0, 0, canvasWidth, targetHeight); 
  
  const alignedDevImageUrl = canvas.toDataURL("image/png");

  const devData = ctx.getImageData(0, 0, canvasWidth, canvasHeight);

  // 3. Prepare Diff Data
  const diffImgData = ctx.createImageData(canvasWidth, canvasHeight);
  
  const dData = designData.data;
  const vData = devData.data;
  const diffData = diffImgData.data;
  
  let mismatchCount = 0;
  
  let diffTop = 0;
  let diffMid = 0;
  let diffBot = 0;

  const totalPixels = canvasWidth * canvasHeight;
  const topBoundary = Math.floor(canvasHeight * 0.2);
  const botBoundary = Math.floor(canvasHeight * 0.8);

  const threshold = (tolerance / 100) * 441; 

  for (let i = 0; i < dData.length; i += 4) {
    const r1 = dData[i], g1 = dData[i + 1], b1 = dData[i + 2], a1 = dData[i + 3];
    const r2 = vData[i], g2 = vData[i + 1], b2 = vData[i + 2], a2 = vData[i + 3];

    // Ignore transparent areas in both
    if (a1 < 10 && a2 < 10) continue;

    const dist = Math.sqrt(
      Math.pow(r1 - r2, 2) +
      Math.pow(g1 - g2, 2) +
      Math.pow(b1 - b2, 2)
    );

    if (dist > threshold) {
      mismatchCount++;
      
      const pixelIndex = i / 4;
      const y = Math.floor(pixelIndex / canvasWidth);
      
      if (y < topBoundary) diffTop++;
      else if (y > botBoundary) diffBot++;
      else diffMid++;

      diffData[i] = 255; diffData[i + 1] = 0; diffData[i + 2] = 80; diffData[i + 3] = 200;
    } else {
      diffData[i] = 0; diffData[i + 1] = 0; diffData[i + 2] = 0; diffData[i + 3] = 0;
    }
  }

  // Use the new Iterative Merge Algorithm
  const diffBoxes = findDiffBoxes(diffData, canvasWidth, canvasHeight, mergeTolerance);

  ctx.putImageData(diffImgData, 0, 0);
  
  const diffImageUrl = canvas.toDataURL("image/png");
  
  const mismatchRate = mismatchCount / totalPixels;
  const pixelScore = Math.max(0, Math.round((1 - mismatchRate) * 100));

  return {
    diffImageUrl,
    alignedDevImageUrl, 
    pixelScore,
    width: canvasWidth,
    height: canvasHeight,
    scaleFactor,
    diffSegments: {
      top: diffTop,
      middle: diffMid,
      bottom: diffBot
    },
    diffBoxes,
    totalPixels
  };
};
