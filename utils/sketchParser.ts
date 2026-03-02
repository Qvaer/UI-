
import JSZip from 'jszip';
import { SketchData, SketchLayer } from '../types';

/**
 * Extracts useful data from a .sketch file.
 */
export const parseSketchFile = async (file: File): Promise<SketchData> => {
  try {
    const zip = await JSZip.loadAsync(file);

    // 1. Find Preview Image
    let previewPath: string | null = null;
    
    // Check standard path first
    if (zip.file('previews/preview.png')) {
        previewPath = 'previews/preview.png';
    } else {
        const files = Object.keys(zip.files);
        const previewCandidates = files.filter(f => f.startsWith('previews/') && /\.(png|jpg|jpeg)$/i.test(f));
        
        if (previewCandidates.length > 0) {
            previewCandidates.sort((a, b) => {
                if (a.includes('preview.png')) return -1;
                return 0;
            });
            previewPath = previewCandidates[0];
        }
    }

    if (!previewPath) {
        throw new Error("Sketch 文件中未找到预览图。请确保在 Sketch 中保存文件时勾选了 'Save with preview'。");
    }

    const previewFile = zip.file(previewPath);
    let previewBase64 = '';
    
    if (previewFile) {
        const isPng = previewPath.toLowerCase().endsWith('.png');
        const mime = isPng ? 'image/png' : 'image/jpeg';
        const base64 = await previewFile.async('base64');
        previewBase64 = `data:${mime};base64,${base64}`;
    }

    // 2. Parse Pages
    const textLayers: SketchLayer[] = [];
    let artboardWidth = 0;

    const pageFiles = Object.keys(zip.files).filter(path => path.startsWith('pages/') && path.endsWith('.json'));
    
    for (const pagePath of pageFiles) {
        const pageStr = await zip.file(pagePath)?.async('string');
        if (!pageStr) continue;
        
        try {
            const page = JSON.parse(pageStr);
            if (page.layers) {
                for (const layer of page.layers) {
                    if (layer._class === 'artboard') {
                        if (artboardWidth === 0 && layer.frame && layer.frame.width > 0) {
                            artboardWidth = layer.frame.width;
                            if (layer.layers) {
                                crawlLayers(layer.layers, textLayers, 0, 0);
                            }
                        }
                    }
                }
            }
        } catch (e) {
            console.warn("Error parsing page JSON:", pagePath, e);
        }
    }

    return {
        previewImage: previewBase64,
        artboardWidth: artboardWidth || 375, 
        meta: {}, 
        textLayers
    };

  } catch (e: any) {
    console.error("Sketch Parse Error:", e);
    throw new Error(e.message || "解析 Sketch 文件失败");
  }
};

const crawlLayers = (layers: any[], result: SketchLayer[], parentX: number, parentY: number) => {
    if (!layers) return;

    for (const layer of layers) {
        const currentX = parentX + (layer.frame?.x || 0);
        const currentY = parentY + (layer.frame?.y || 0);

        if (layer._class === 'text') {
            let content = layer.name; 
            
            if (layer.attributedString) {
                if (typeof layer.attributedString === 'string') {
                     content = layer.attributedString;
                } else if (layer.attributedString.string) {
                     content = layer.attributedString.string;
                } else if (layer.attributedString.value) {
                     content = layer.attributedString.value;
                }
            } else if (layer.text) {
                content = layer.text;
            }

            result.push({
                class: 'text',
                name: layer.name,
                frame: { 
                    x: currentX, 
                    y: currentY, 
                    width: layer.frame?.width || 0, 
                    height: layer.frame?.height || 0 
                },
                text: content,
                style: layer.style,
                attributedString: layer.attributedString
            });
        }

        if (layer.layers) {
            crawlLayers(layer.layers, result, currentX, currentY);
        }
    }
};
