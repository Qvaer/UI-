
import { MasterGoConfig, SketchData } from "../types";

const API_BASE = "https://open-api.mastergo.com/v1";

// List of public CORS proxies to try in order.
// We rotate these to avoid 530/429 errors from WAFs.
const PROXY_LIST = [
    // Strategy 1: CodeTabs (Often reliable for JSON APIs)
    { 
        url: "https://api.codetabs.com/v1/proxy?quest=", 
        encode: true 
    },
    // Strategy 2: corsproxy.io (Standard)
    { 
        url: "https://corsproxy.io/?", 
        encode: true 
    },
    // Strategy 3: Thingproxy
    { 
        url: "https://thingproxy.freeboard.io/fetch/", 
        encode: false 
    }
];

/**
 * Robust fetch wrapper that rotates through proxies if the request is blocked.
 */
const fetchSafe = async (targetUrl: string, options: RequestInit = {}): Promise<Response> => {
    
    // 1. Try Direct Request first
    try {
        const response = await fetch(targetUrl, options);
        if (response.ok) return response;
        // 401/404 are definitive application errors
        if (response.status === 401 || response.status === 404) {
            return response;
        }
    } catch (e) {
        // Network error, proceed to proxies
    }

    // 2. Try Proxies sequentially
    let lastResponse: Response | null = null;
    let lastError: any = null;

    for (const proxy of PROXY_LIST) {
        try {
            let proxyUrl = '';
            if (proxy.encode) {
                proxyUrl = `${proxy.url}${encodeURIComponent(targetUrl)}`;
            } else {
                proxyUrl = `${proxy.url}${targetUrl}`;
            }

            const response = await fetch(proxyUrl, options);
            
            // If success, return immediately
            if (response.ok) return response;
            
            lastResponse = response;

            // If 401/404, stop rotating
            if (response.status === 401 || response.status === 404) {
                return response;
            }

            // If 403/530, try next proxy
            // console.warn(`Proxy ${proxy.url} failed: ${response.status}`);
            
        } catch (e) {
            lastError = e;
        }
    }

    if (lastResponse) return lastResponse;

    throw lastError || new Error("网络连接失败 (所有代理均无法访问)");
};

export const parseMasterGoUrl = (url: string): { fileKey: string | null, nodeId: string | null } => {
    try {
        let cleanUrl = url.trim();
        if (!cleanUrl.startsWith('http://') && !cleanUrl.startsWith('https://')) {
            cleanUrl = 'https://' + cleanUrl;
        }

        const urlObj = new URL(cleanUrl);
        
        // Extract File Key
        const fileMatch = urlObj.pathname.match(/\/(?:file|js\/design)\/([a-zA-Z0-9\-_]+)/);
        const fileKey = fileMatch ? fileMatch[1] : null;

        // Extract Node ID
        let nodeId = urlObj.searchParams.get('nodeId') || urlObj.searchParams.get('layer_id');

        if (!nodeId && urlObj.hash) {
            if (urlObj.hash.includes('?')) {
                const hashQuery = urlObj.hash.split('?')[1];
                const hashParams = new URLSearchParams(hashQuery);
                nodeId = hashParams.get('nodeId') || hashParams.get('layer_id');
            } 
            else if (urlObj.hash.includes('=')) {
                const hashParts = urlObj.hash.replace('#', '').split('&');
                for (const part of hashParts) {
                    const [k, v] = part.split('=');
                    if (k === 'nodeId' || k === 'layer_id') {
                        nodeId = v;
                        break;
                    }
                }
            }
        }

        if (!nodeId) {
            const regexMatch = cleanUrl.match(/[?&](?:nodeId|layer_id)=([^&]+)/);
            if (regexMatch) {
                nodeId = regexMatch[1];
            }
        }

        return { 
            fileKey, 
            nodeId: nodeId ? decodeURIComponent(nodeId) : null 
        };
    } catch (e) {
        console.warn("URL Parse Error:", e);
        const fileMatch = url.match(/\/(?:file|js\/design)\/([a-zA-Z0-9\-_]+)/);
        const nodeMatch = url.match(/(?:nodeId|layer_id)=([^&]+)/);
        
        return { 
            fileKey: fileMatch ? fileMatch[1] : null, 
            nodeId: nodeMatch ? decodeURIComponent(nodeMatch[1]) : null 
        };
    }
};

export const fetchMasterGoImage = async (config: MasterGoConfig): Promise<string> => {
    if (!config.nodeId) {
        throw new Error("缺少画板 ID (nodeId 或 layer_id)。请在 MasterGo 中选中画板后，复制完整链接。");
    }

    // Use standard Authorization header which passes through proxies better than X- headers
    const headers = {
        'Authorization': `Bearer ${config.token}`,
        'X-MasterGo-Token': config.token
    };

    const encodedNodeId = encodeURIComponent(config.nodeId);
    const url = `${API_BASE}/files/${config.fileKey}/images?ids=${encodedNodeId}&scale=2&format=png`;

    try {
        const response = await fetchSafe(url, { headers });
        
        if (!response.ok) {
            if (response.status === 401) throw new Error("API Token 无效或过期，请检查 Token 设置。");
            if (response.status === 403) throw new Error("权限不足 (403)。请检查：1.Token是否正确 2.是否有该文件权限。");
            if (response.status === 404) throw new Error("文件或画板不存在 (404)。请检查链接。");
            if (response.status === 530) throw new Error("MasterGo 服务连接失败 (530)。代理服务器被拦截，请尝试稍后再试或手动导出图片。");
            throw new Error(`API 请求失败: ${response.status}`);
        }

        const data = await response.json();
        
        let imageUrl = data.images && data.images[config.nodeId];
        
        if (!imageUrl && data.images) {
            const keys = Object.keys(data.images);
            if (keys.length > 0) {
                 imageUrl = data.images[keys[0]];
            }
        }
        
        if (!imageUrl) {
            throw new Error(`无法获取图片 URL。API 返回数据中未找到 ID 为 ${config.nodeId} 的图片。`);
        }

        // Fetch image blob
        const imageRes = await fetchSafe(imageUrl);
        const blob = await imageRes.blob();
        
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result as string);
            reader.onerror = reject;
            reader.readAsDataURL(blob);
        });

    } catch (e: any) {
        console.error("MasterGo API Error:", e);
        if (e.message && e.message.includes('Failed to fetch')) {
             throw new Error("网络连接失败。所有代理尝试均无效，请检查网络或手动上传。");
        }
        throw e;
    }
};

export const fetchMasterGoNodeData = async (config: MasterGoConfig): Promise<{ name: string, width: number }> => {
    if (!config.nodeId) return { name: 'MasterGo Import', width: 375 };

    const headers = {
        'Authorization': `Bearer ${config.token}`,
        'X-MasterGo-Token': config.token
    };
    
    const encodedNodeId = encodeURIComponent(config.nodeId);
    const url = `${API_BASE}/files/${config.fileKey}/nodes?ids=${encodedNodeId}`;

    try {
        const response = await fetchSafe(url, { headers });
        if (!response.ok) return { name: 'MasterGo Design', width: 375 };

        const data = await response.json();
        
        let node = data.nodes && data.nodes[config.nodeId]?.document;
        
        if (!node && data.nodes) {
             const keys = Object.keys(data.nodes);
             if (keys.length > 0) {
                 node = data.nodes[keys[0]]?.document;
             }
        }
        
        if (node) {
            return {
                name: node.name || 'MasterGo Design',
                width: node.absoluteBoundingBox?.width || 375
            };
        }
        return { name: 'MasterGo Design', width: 375 };
    } catch (e) {
        console.warn("Failed to fetch node data:", e);
        return { name: 'MasterGo Design', width: 375 };
    }
};

export const processMasterGoImport = async (url: string, token: string): Promise<SketchData> => {
    const { fileKey, nodeId } = parseMasterGoUrl(url);
    
    if (!fileKey) {
        throw new Error("无效的 MasterGo 链接。请确保链接格式包含 '/file/' 或 '/js/design/'");
    }

    if (!nodeId) {
        throw new Error("链接中未检测到画板 ID (nodeId 或 layer_id)。请在 MasterGo 画布上【点击选中】目标画板，然后复制浏览器地址栏的链接。");
    }

    const config: MasterGoConfig = { fileKey, nodeId, token };

    try {
        // Fetch sequentially to debug better if one fails, or parallel for speed
        // Parallel is better for UX
        const [previewImage, meta] = await Promise.all([
            fetchMasterGoImage(config),
            fetchMasterGoNodeData(config)
        ]);

        return {
            previewImage,
            artboardWidth: meta.width,
            meta: { source: 'mastergo', fileKey, nodeId },
            textLayers: [] 
        };
    } catch (e: any) {
        throw e;
    }
};
