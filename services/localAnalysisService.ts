
import { AnalysisResult, ComparisonResult, Issue, IssueType, IssueSubType, BoundingBox } from "../types";
import { loadImage } from "../utils/imageProcessor";

// --- Helper Functions ---

const getImageData = (img: HTMLImageElement, width: number, height: number): ImageData => {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) throw new Error("Canvas context failed");
    ctx.drawImage(img, 0, 0, width, height);
    return ctx.getImageData(0, 0, width, height);
};

// Efficiently downsample an ImageData object for coarse searching
const downsampleImageData = (source: ImageData, ratio: number): ImageData => {
    const w = Math.floor(source.width * ratio);
    const h = Math.floor(source.height * ratio);
    if (w === 0 || h === 0) return source; // Safety

    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return source;

    // Create temp canvas for source to draw from
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = source.width;
    tempCanvas.height = source.height;
    const tempCtx = tempCanvas.getContext('2d');
    if (!tempCtx) return source;
    tempCtx.putImageData(source, 0, 0);

    // Draw scaled down
    ctx.drawImage(tempCanvas, 0, 0, w, h);
    return ctx.getImageData(0, 0, w, h);
};

const getPatch = (source: ImageData, x: number, y: number, w: number, h: number): ImageData | null => {
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    const sourceW = source.width;
    const sourceH = source.height;
    const intersectX = Math.max(0, x);
    const intersectY = Math.max(0, y);
    const intersectW = Math.min(x + w, sourceW) - intersectX;
    const intersectH = Math.min(y + h, sourceH) - intersectY;

    if (intersectW > 0 && intersectH > 0) {
        const sourceCanvas = document.createElement('canvas');
        sourceCanvas.width = sourceW;
        sourceCanvas.height = sourceH;
        const sCtx = sourceCanvas.getContext('2d');
        if (!sCtx) return null;
        sCtx.putImageData(source, 0, 0);

        const destX = intersectX - x;
        const destY = intersectY - y;
        ctx.drawImage(sourceCanvas, intersectX, intersectY, intersectW, intersectH, destX, destY, intersectW, intersectH);
    }
    return ctx.getImageData(0, 0, w, h);
};

const isSolidColor = (patch: ImageData): boolean => {
    const { data, width, height } = patch;
    if (width === 0 || height === 0) return true;
    let rSum = 0, gSum = 0, bSum = 0, count = 0;
    const step = 2; // Optimize
    for (let i = 0; i < data.length; i += 4 * step) {
        rSum += data[i]; gSum += data[i+1]; bSum += data[i+2]; count++;
    }
    const rAvg = rSum / count;
    const gAvg = gSum / count;
    const bAvg = bSum / count;
    let variance = 0;
    for (let i = 0; i < data.length; i += 4 * step) {
        const dr = data[i] - rAvg; const dg = data[i+1] - gAvg; const db = data[i+2] - bAvg;
        variance += (dr*dr + dg*dg + db*db);
    }
    return (variance / count) < 50; // Threshold for solidness
};

const getActiveContentBounds = (patch: ImageData) => {
    const { data, width, height } = patch;
    const getPx = (i: number) => [data[i], data[i+1], data[i+2]];
    const bg = getPx(0); 
    const isBg = (idx: number) => {
        const r = data[idx], g = data[idx+1], b = data[idx+2];
        return (Math.abs(r - bg[0]) + Math.abs(g - bg[1]) + Math.abs(b - bg[2])) < 30;
    };
    let minX = width, minY = height, maxX = 0, maxY = 0;
    let hasContent = false;
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const idx = (y * width + x) * 4;
            if (!isBg(idx)) {
                if (x < minX) minX = x; if (x > maxX) maxX = x;
                if (y < minY) minY = y; if (y > maxY) maxY = y;
                hasContent = true;
            }
        }
    }
    if (!hasContent) return null;
    return { relativeX: minX, relativeY: minY, width: maxX - minX + 1, height: maxY - minY + 1 };
};

/**
 * SCAN METHOD 3: SIMPLIFIED SSIM (Structural Similarity)
 */
const calculateFastSSIM = (img1: ImageData, img2: ImageData): number => {
    if (img1.width !== img2.width || img1.height !== img2.height) return 0;
    
    const w = img1.width;
    const h = img1.height;
    const data1 = img1.data;
    const data2 = img2.data;
    
    let sum1 = 0, sum2 = 0;
    let pixelCount = 0;
    const step = 2; // Performance optimization

    for (let i = 0; i < data1.length; i += 4 * step) {
        const gray1 = 0.299 * data1[i] + 0.587 * data1[i+1] + 0.114 * data1[i+2];
        const gray2 = 0.299 * data2[i] + 0.587 * data2[i+1] + 0.114 * data2[i+2];
        sum1 += gray1;
        sum2 += gray2;
        pixelCount++;
    }
    const mu1 = sum1 / pixelCount;
    const mu2 = sum2 / pixelCount;

    let sigma1Sq = 0, sigma2Sq = 0, sigma12 = 0;
    for (let i = 0; i < data1.length; i += 4 * step) {
        const gray1 = 0.299 * data1[i] + 0.587 * data1[i+1] + 0.114 * data1[i+2];
        const gray2 = 0.299 * data2[i] + 0.587 * data2[i+1] + 0.114 * data2[i+2];
        
        sigma1Sq += (gray1 - mu1) ** 2;
        sigma2Sq += (gray2 - mu2) ** 2;
        sigma12 += (gray1 - mu1) * (gray2 - mu2);
    }
    sigma1Sq /= pixelCount;
    sigma2Sq /= pixelCount;
    sigma12 /= pixelCount;

    const C1 = (0.01 * 255) ** 2;
    const C2 = (0.03 * 255) ** 2;

    const ssim = ((2 * mu1 * mu2 + C1) * (2 * sigma12 + C2)) / 
                 ((mu1 ** 2 + mu2 ** 2 + C1) * (sigma1Sq + sigma2Sq + C2));
                 
    return ssim;
};

const checkWeightDifference = (design: ImageData, dev: ImageData): 'bolder' | 'lighter' | null => {
    const countInk = (img: ImageData) => {
        let count = 0;
        const { data } = img;
        const bgR = data[0], bgG = data[1], bgB = data[2];
        
        for(let i=0; i<data.length; i+=4) {
            const diff = Math.abs(data[i]-bgR) + Math.abs(data[i+1]-bgG) + Math.abs(data[i+2]-bgB);
            if (diff > 40) count++; 
        }
        return count;
    };

    const dInk = countInk(design);
    const vInk = countInk(dev);
    
    if (dInk < 20 || vInk < 20) return null;

    const ratio = vInk / dInk;
    if (ratio > 1.25) return 'bolder'; 
    if (ratio < 0.75) return 'lighter';
    return null;
};

/**
 * SCAN METHOD 2: SPATIAL NEIGHBORHOOD SEARCH
 */
const scanImage = (needle: ImageData, haystack: ImageData, step: number = 1) => {
    const nw = needle.width, nh = needle.height;
    const hw = haystack.width, hh = haystack.height;
    if (nw > hw || nh > hh) return { x: 0, y: 0, error: Infinity };

    let minError = Infinity;
    let bestX = 0, bestY = 0;

    const totalPixels = nw * nh;
    const pixelStep = Math.max(2, Math.ceil(Math.sqrt(totalPixels / 1000)));

    for (let y = 0; y <= hh - nh; y += step) {
        for (let x = 0; x <= hw - nw; x += step) {
            let errorSum = 0;
            let count = 0;
            
            for (let py = 0; py < nh; py += pixelStep) {
                for (let px = 0; px < nw; px += pixelStep) {
                    const nIdx = (py * nw + px) * 4;
                    const hIdx = ((y + py) * hw + (x + px)) * 4;
                    
                    const diff = Math.abs(needle.data[nIdx] - haystack.data[hIdx]) + 
                                 Math.abs(needle.data[nIdx+1] - haystack.data[hIdx+1]) +
                                 Math.abs(needle.data[nIdx+2] - haystack.data[hIdx+2]);
                    errorSum += diff;
                    count++;
                }
            }
            const avgError = errorSum / count;
            if (avgError < minError) {
                minError = avgError;
                bestX = x;
                bestY = y;
                if (minError < 2) return { x, y, error: minError };
            }
        }
    }
    return { x: bestX, y: bestY, error: minError };
};

const findSimilarElement = (
    needle: ImageData, 
    devFullData: ImageData, 
    originX: number, 
    originY: number, 
    searchRadius: number
) => {
    const w = needle.width;
    const h = needle.height;

    const searchX = Math.max(0, originX - searchRadius);
    const searchY = Math.max(0, originY - searchRadius);
    const searchW = Math.min(devFullData.width, originX + w + searchRadius) - searchX;
    const searchH = Math.min(devFullData.height, originY + h + searchRadius) - searchY;

    const haystack = getPatch(devFullData, searchX, searchY, searchW, searchH);
    if (!haystack) return { dx: 0, dy: 0, error: Infinity };

    const scale = 0.25;
    const smallNeedle = downsampleImageData(needle, scale);
    const smallHaystack = downsampleImageData(haystack, scale);

    const coarseMatch = scanImage(smallNeedle, smallHaystack, 1);
    
    const refineRange = 8; 
    const estimatedX = (coarseMatch.x / scale);
    const estimatedY = (coarseMatch.y / scale);

    const fineSearchX = Math.max(0, estimatedX - refineRange);
    const fineSearchY = Math.max(0, estimatedY - refineRange);
    const fineSearchW = w + (refineRange * 2);
    const fineSearchH = h + (refineRange * 2);

    const fineHaystack = getPatch(haystack, fineSearchX, fineSearchY, fineSearchW, fineSearchH);
    if (!fineHaystack) return { dx: 0, dy: 0, error: Infinity };

    const fineMatch = scanImage(needle, fineHaystack, 1);

    const finalDevX = searchX + fineSearchX + fineMatch.x;
    const finalDevY = searchY + fineSearchY + fineMatch.y;

    const dx = finalDevX - originX;
    const dy = finalDevY - originY;

    return { dx, dy, error: fineMatch.error, devX: finalDevX, devY: finalDevY };
};


// --- Post-Processing ---

const doBoxesIntersect = (b1: BoundingBox, b2: BoundingBox, tolerance: number = 0): boolean => {
    return !(b2.x > b1.x + b1.width + tolerance || 
             b2.x + b2.width < b1.x - tolerance || 
             b2.y > b1.y + b1.height + tolerance || 
             b2.y + b2.height < b1.y - tolerance);
};

const mergeBoundingBoxes = (b1: BoundingBox, b2: BoundingBox): BoundingBox => {
    const minX = Math.min(b1.x, b2.x);
    const minY = Math.min(b1.y, b2.y);
    const maxX = Math.max(b1.x + b1.width, b2.x + b2.width);
    const maxY = Math.max(b1.y + b1.height, b2.y + b2.height);
    return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
};

const mergeSimilarIssues = (issues: Issue[]): Issue[] => {
    if (issues.length === 0) return [];
    
    const sorted = [...issues].sort((a, b) => (a.relatedBox?.y || 0) - (b.relatedBox?.y || 0));
    const merged: Issue[] = [];
    const processedIds = new Set<string>();

    for (let i = 0; i < sorted.length; i++) {
        if (processedIds.has(sorted[i].id)) continue;
        let current = { ...sorted[i] };
        let count = 1;
        processedIds.add(current.id);

        let changed = true;
        while (changed) {
            changed = false;
            for (let j = i + 1; j < sorted.length; j++) {
                if (processedIds.has(sorted[j].id)) continue;
                const other = sorted[j];
                
                const isSameType = current.type === other.type && current.subType === other.subType;
                const isClose = current.relatedBox && other.relatedBox && doBoxesIntersect(current.relatedBox, other.relatedBox, 40);

                let isSameVector = true;
                if (current.subType === 'position') {
                    const dX1 = current.deltaPx || 0;
                    const dX2 = other.deltaPx || 0;
                    isSameVector = Math.abs(dX1 - dX2) < 5; 
                }

                if (isSameType && isClose && isSameVector) {
                    if (current.relatedBox && other.relatedBox) {
                        current.relatedBox = mergeBoundingBoxes(current.relatedBox, other.relatedBox);
                    }
                    if (current.designBox && other.designBox) {
                        current.designBox = mergeBoundingBoxes(current.designBox, other.designBox);
                    }
                    processedIds.add(other.id);
                    count++;
                    changed = true;
                }
            }
        }
        
        if (count > 1) {
            if (current.subType === 'position') current.description = `多处位置偏移 (${count} 处)`;
            else if (current.subType === 'dimension') current.description = `多处尺寸不一致 (${count} 处)`;
        }
        merged.push(current);
    }
    return merged;
};

const getHeuristicLocation = (y: number, height: number): string => {
    const ratio = y / height;
    if (ratio < 0.15) return "顶部/导航栏区域";
    if (ratio > 0.85) return "底部/标签栏区域";
    return "内容区域";
};

// --- ALGORITHM: Grid-based Quality Score ---
const calculateGridQuality = (design: ImageData, dev: ImageData): number => {
    const gridSize = 40; 
    const w = design.width;
    const h = design.height;
    
    let totalGrids = 0;
    let goodGrids = 0;

    for (let y = 0; y < h; y += gridSize) {
        for (let x = 0; x < w; x += gridSize) {
            const blockW = Math.min(gridSize, w - x);
            const blockH = Math.min(gridSize, h - y);
            
            let diffSum = 0;
            let pixelCount = 0;
            const step = 2;

            for (let by = 0; by < blockH; by+=step) {
                for (let bx = 0; bx < blockW; bx+=step) {
                     const idx = ((y + by) * w + (x + bx)) * 4;
                     const dR = design.data[idx], dG = design.data[idx+1], dB = design.data[idx+2];
                     const vR = dev.data[idx], vG = dev.data[idx+1], vB = dev.data[idx+2];
                     
                     if (Math.abs(dR - vR) + Math.abs(dG - vG) + Math.abs(dB - vB) > 40) {
                         diffSum++;
                     }
                     pixelCount++;
                }
            }

            const errorRate = diffSum / pixelCount;
            totalGrids++;
            
            // Relaxed threshold from 0.03 to 0.05
            if (errorRate < 0.05) {
                goodGrids++;
            }
        }
    }
    
    return totalGrids === 0 ? 100 : (goodGrids / totalGrids) * 100;
};


// --- Main Analysis Logic ---

export const analyzeLocalDifferences = async (
    comparison: ComparisonResult,
    designImageBase64: string,
    alignedDevImageBase64: string,
    originalDevImageBase64: string
): Promise<AnalysisResult> => {

    const { pixelScore, diffBoxes, height: canvasHeight, scaleFactor } = comparison;

    const [designImg, devImg, originalDevImg] = await Promise.all([
        loadImage(designImageBase64),
        loadImage(alignedDevImageBase64),
        loadImage(originalDevImageBase64)
    ]);
    const designData = getImageData(designImg, designImg.width, designImg.height);
    const devData = getImageData(devImg, devImg.width, devImg.height);
    const originalDevData = getImageData(originalDevImg, originalDevImg.width, originalDevImg.height);

    // 1. Calculate Grid-Weighted Score (Penalizes local clusters)
    const gridScore = calculateGridQuality(designData, devData);

    const issues: Issue[] = [];
    
    const validBoxes = diffBoxes
        .filter(b => b.width > 6 && b.height > 6)
        .sort((a, b) => (b.width * b.height) - (a.width * a.height)) 
        .slice(0, 40); 

    for (let i = 0; i < validBoxes.length; i++) {
        const box = validBoxes[i];
        
        const designPatch = getPatch(designData, box.x, box.y, box.width, box.height);
        if (!designPatch) continue;
        
        const designContentBounds = getActiveContentBounds(designPatch);
        
        if (isSolidColor(designPatch) && !designContentBounds) {
             const devPatch = getPatch(devData, box.x, box.y, box.width, box.height);
             if (devPatch && !isSolidColor(devPatch)) {
                 issues.push({
                     id: `issue-${i}`, type: 'content', description: '多余元素',
                     location: getHeuristicLocation(box.y, canvasHeight),
                     severity: 'medium', 
                     relatedBox: box,
                     designBox: box,
                     specificSuggestions: ['检查伪元素', '检查背景']
                 });
             }
             continue;
        }

        const dx = designContentBounds?.relativeX ?? 0;
        const dy = designContentBounds?.relativeY ?? 0;
        const dw = designContentBounds?.width ?? box.width;
        const dh = designContentBounds?.height ?? box.height;
        const actualX = box.x + dx;
        const actualY = box.y + dy;

        const needleBox = { x: actualX, y: actualY, width: dw, height: dh };
        const needle = getPatch(designData, actualX, actualY, dw, dh);
        if (!needle) continue;

        // --- SCAN 1 ---
        const devAtOrigin = getPatch(devData, actualX, actualY, dw, dh);
        if (devAtOrigin && isSolidColor(devAtOrigin) && !isSolidColor(needle)) {
             // Check Raw Image before reporting missing
             let isReallyMissing = true;
             if (scaleFactor && (scaleFactor < 0.98 || scaleFactor > 1.02)) {
                 const rawX = Math.floor(actualX / scaleFactor);
                 const rawY = Math.floor(actualY / scaleFactor);
                 const rawW = Math.floor(dw / scaleFactor);
                 const rawH = Math.floor(dh / scaleFactor);
                 const rawPatch = getPatch(originalDevData, rawX - 5, rawY - 5, rawW + 10, rawH + 10);
                 if (rawPatch && !isSolidColor(rawPatch)) {
                     isReallyMissing = false;
                 }
             }

             if (isReallyMissing) {
                 issues.push({
                    id: `issue-${i}`, type: 'content', subType: 'missing',
                    description: '元素缺失', 
                    location: getHeuristicLocation(actualY, canvasHeight),
                    severity: 'high',
                    relatedBox: needleBox, 
                    designBox: needleBox,
                    specificSuggestions: ['检查 DOM 渲染']
                });
             }
             continue;
        }

        // --- SCAN 2 ---
        const spatialMatch = findSimilarElement(needle, devData, actualX, actualY, 200);

        if (spatialMatch.error < 45) {
            
            const dist = Math.sqrt(spatialMatch.dx * spatialMatch.dx + spatialMatch.dy * spatialMatch.dy);
            
            const checkMargin = 20;
            const devContentCheckPatch = getPatch(
                devData, 
                spatialMatch.devX - checkMargin, 
                spatialMatch.devY - checkMargin, 
                dw + (checkMargin*2), 
                dh + (checkMargin*2)
            );
            
            let devW = dw;
            let devH = dh;
            
            if (devContentCheckPatch) {
                const devBounds = getActiveContentBounds(devContentCheckPatch);
                if (devBounds) {
                    // Sanity Check: If the newly detected bounds are wildly different 
                    // (e.g. > 1.5x size) but we had a good spatial match, assume it's noise/background 
                    // inclusion error and revert to original dimensions.
                    const wRatio = devBounds.width / dw;
                    const hRatio = devBounds.height / dh;
                    
                    if (wRatio >= 0.8 && wRatio <= 1.5 && hRatio >= 0.8 && hRatio <= 1.5) {
                        devW = devBounds.width;
                        devH = devBounds.height;
                    }
                }
            }
            
            const devBox = { x: spatialMatch.devX, y: spatialMatch.devY, width: devW, height: devH };

            let widthDiff = Math.abs(dw - devW);
            let heightDiff = Math.abs(dh - devH);
            
            // --- RAW IMAGE VERIFICATION ---
            // If we detected a size difference, check if it's due to scaling
            if ((widthDiff > 4 || heightDiff > 4) && scaleFactor && (scaleFactor < 0.98 || scaleFactor > 1.02)) {
                const rawX = Math.floor(spatialMatch.devX / scaleFactor);
                const rawY = Math.floor(spatialMatch.devY / scaleFactor);
                // Search in a larger area in raw image to find the element
                const rawSearchMargin = 20;
                const rawPatch = getPatch(
                    originalDevData, 
                    rawX - rawSearchMargin, 
                    rawY - rawSearchMargin, 
                    (devW / scaleFactor) + (rawSearchMargin * 2), 
                    (devH / scaleFactor) + (rawSearchMargin * 2)
                );

                if (rawPatch) {
                    const rawBounds = getActiveContentBounds(rawPatch);
                    if (rawBounds) {
                        // Compare Raw Bounds with Design Bounds (dw, dh)
                        // Note: rawBounds are relative to the patch
                        const rawRealW = rawBounds.width;
                        const rawRealH = rawBounds.height;
                        
                        const rawWidthDiff = Math.abs(dw - rawRealW);
                        const rawHeightDiff = Math.abs(dh - rawRealH);
                        
                        // If raw dimensions match design dimensions better, use them!
                        if (rawWidthDiff < 5 && rawHeightDiff < 5) {
                            // It was a scaling artifact!
                            devW = dw; // Reset to design dimensions (effectively ignoring the error)
                            devH = dh;
                            widthDiff = 0;
                            heightDiff = 0;
                        }
                    }
                }
            }

            const sizeChanged = widthDiff > 4 || heightDiff > 4;
            const posChanged = dist > 2;

            if (sizeChanged && posChanged) {
                 // Combined Issue
                 issues.push({
                    id: `issue-${i}`, type: 'layout', subType: 'dimension',
                    description: '尺寸与位置均不一致', 
                    location: getHeuristicLocation(spatialMatch.devY, canvasHeight),
                    severity: 'high',
                    relatedBox: devBox, 
                    designBox: needleBox,
                    specificSuggestions: ['检查 width/height', '检查 margin'],
                    designVal: `${dw}x${dh}`, devVal: `${devW}x${devH}`,
                    deltaPx: Math.max(widthDiff, heightDiff) + Math.round(dist) // Assign composite delta
                });
            } else if (sizeChanged) {
                 issues.push({
                    id: `issue-${i}`, type: 'typography', subType: 'font-size', 
                    description: '尺寸大小不一致', 
                    location: getHeuristicLocation(spatialMatch.devY, canvasHeight),
                    severity: 'medium',
                    relatedBox: devBox,
                    designBox: needleBox,
                    specificSuggestions: ['检查 Padding', '检查 Font Size'],
                    designVal: `${dw}x${dh}`, devVal: `${devW}x${devH}`,
                    deltaPx: Math.max(widthDiff, heightDiff)
                });
            } else if (posChanged) {
                 let direction: 'up'|'down'|'left'|'right' = 'right';
                 if (Math.abs(spatialMatch.dx) > Math.abs(spatialMatch.dy)) direction = spatialMatch.dx > 0 ? 'right' : 'left';
                 else direction = spatialMatch.dy > 0 ? 'down' : 'up';

                 // Penalize large shifts heavily
                 const severity = dist > 8 ? 'high' : 'medium';

                 issues.push({
                    id: `issue-${i}`, type: 'layout', subType: 'position',
                    description: '位置偏移', 
                    location: getHeuristicLocation(spatialMatch.devY, canvasHeight),
                    severity: severity,
                    relatedBox: devBox,
                    designBox: needleBox,
                    specificSuggestions: ['检查 Flex 对齐', '检查 Margin'],
                    deltaPx: Math.round(dist), direction
                });
            }
        } else {
            // --- SCAN 3 ---
            const devAtExactLoc = getPatch(devData, actualX, actualY, dw, dh);
            if (!devAtExactLoc) continue;

            const ssimScore = calculateFastSSIM(needle, devAtExactLoc);
            
            if (ssimScore > 0.85) {
                issues.push({
                    id: `issue-${i}`, type: 'color', description: '颜色/样式差异',
                    location: getHeuristicLocation(actualY, canvasHeight),
                    severity: 'low', 
                    relatedBox: needleBox,
                    designBox: needleBox,
                    specificSuggestions: ['检查 Hex 值', '检查 Opacity']
                });
            } else {
                const weightResult = checkWeightDifference(needle, devAtExactLoc);

                if (weightResult) {
                     issues.push({
                        id: `issue-${i}`, type: 'typography', subType: 'font-weight',
                        description: weightResult === 'bolder' ? '字重过粗' : '字重过细',
                        location: getHeuristicLocation(actualY, canvasHeight),
                        severity: 'medium',
                        relatedBox: needleBox,
                        designBox: needleBox,
                        specificSuggestions: ['检查 font-weight']
                    });
                } else {
                     // Heuristic for Icons: Small and roughly square (< 50px, ratio ~1)
                     const isIcon = needleBox.width <= 50 && needleBox.height <= 50 && 
                                    Math.abs(needleBox.width - needleBox.height) < 12;
                     
                     issues.push({
                        id: `issue-${i}`, type: 'content', 
                        subType: isIcon ? 'icon' : 'text',
                        description: ssimScore < 0.5 ? (isIcon ? '图标不一致' : '内容错误 (文字/图标)') : '细节构造差异', 
                        location: getHeuristicLocation(actualY, canvasHeight),
                        severity: 'high',
                        relatedBox: needleBox,
                        designBox: needleBox,
                        specificSuggestions: isIcon ? ['检查图标SVG', '检查IconFont'] : ['检查文案', '检查图标资源']
                    });
                }
            }
        }
    }

    let mergedIssues = mergeSimilarIssues(issues);

    mergedIssues.sort((a, b) => {
        const boxA = a.designBox || a.relatedBox || { y: 0, x: 0, width: 0, height: 0 };
        const boxB = b.designBox || b.relatedBox || { y: 0, x: 0, width: 0, height: 0 };
        if (Math.abs(boxA.y - boxB.y) <= 10) {
            return boxA.x - boxB.x;
        }
        return boxA.y - boxB.y;
    });

    // --- FINAL SCORING CALCULATION (Weighted Penalty Model) ---
    // Rule: Base = Pixel(20%) + Grid(80%). 
    
    // 1. Base Score
    const baseScore = (pixelScore * 0.2) + (gridScore * 0.8);

    // 2. Fatal Penalty Calculation
    let penalty = 0;
    
    mergedIssues.forEach(issue => {
        let issuePenalty = 0;
        
        // --- RELAXED PENALTY LOGIC ---
        if (issue.subType === 'position' || issue.subType === 'dimension') {
            const shift = issue.deltaPx || 0;
            if (shift > 10) {
                 issuePenalty = 15; // Reduced from 25
            } else {
                 issuePenalty = 3; // Reduced from 5
            }
        } 
        else if (issue.subType === 'missing') {
            issuePenalty = 12; // Reduced from 20
        }
        else if (issue.type === 'content' && issue.severity === 'high') {
            issuePenalty = 10; // Reduced from 15
        }
        else if (issue.type === 'typography') {
            issuePenalty = 2; // Reduced from 5
        }
        else {
            issuePenalty = 1; // Reduced from 2
        }

        penalty += issuePenalty;
    });

    // Clamp penalty (Reduced from 60 to 50)
    const effectivePenalty = Math.min(penalty, 50); 

    const finalScoreRaw = baseScore - effectivePenalty;
    const finalScore = Math.max(0, Math.min(100, Math.round(finalScoreRaw)));

    let summary = '';
    
    // Rule: < 80 is Reject.
    if (finalScore >= 98 && mergedIssues.length === 0) {
        summary = '完美还原！像素级一致。';
    } else if (finalScore >= 80) {
        summary = `还原度良好（${finalScore}分）。进入人工设计审查阶段。`;
    } else if (finalScore >= 60) {
        summary = `建议打回（${finalScore}分）。检测到明显的布局偏移或元素缺失，请开发修正。`;
    } else {
        summary = `严重失真（${finalScore}分）。页面结构存在重大问题，必须打回。`;
    }

    return { score: finalScore, summary, issues: mergedIssues };
};
