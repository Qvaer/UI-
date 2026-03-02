
import React, { useRef, useState } from 'react';
import { useConfig } from '../contexts/ConfigContext';
import { processMasterGoImport } from '../services/masterGoService';

interface UploadCardProps {
  title: string;
  imageSrc: string | null;
  onUpload: (file: File) => void;
  color: 'blue' | 'purple';
  isSketch?: boolean;
  onMasterGoLoaded?: (data: any, fileName: string) => void; // Callback for MasterGo data
}

type InputMode = 'file' | 'mastergo';

const UploadCard: React.FC<UploadCardProps> = ({ 
    title, 
    imageSrc, 
    onUpload, 
    color, 
    isSketch = false,
    onMasterGoLoaded
}) => {
  const { t } = useConfig();
  const inputRef = useRef<HTMLInputElement>(null);
  
  const [mode, setMode] = useState<InputMode>('file');
  const [mgUrl, setMgUrl] = useState('');
  const [mgToken, setMgToken] = useState(localStorage.getItem('mastergo_token') || '');
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    if (mode === 'file' && e.dataTransfer.files && e.dataTransfer.files[0]) {
      onUpload(e.dataTransfer.files[0]);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      onUpload(e.target.files[0]);
    }
  };

  const handleMasterGoImport = async () => {
      if (!mgUrl || !mgToken) {
          setErrorMsg("请输入链接和 Token");
          return;
      }
      
      setIsLoading(true);
      setErrorMsg(null);
      localStorage.setItem('mastergo_token', mgToken); // Persist token

      try {
          const data = await processMasterGoImport(mgUrl, mgToken);
          if (onMasterGoLoaded) {
             onMasterGoLoaded(data, "MasterGo Design");
          }
      } catch (e: any) {
          setErrorMsg(e.message || "导入失败");
      } finally {
          setIsLoading(false);
      }
  };

  // Styles adapted for deep dark theme
  const accentColor = color === 'blue' ? 'text-primary' : 'text-accent-purple';
  const borderHighlight = color === 'blue' ? 'group-hover:border-primary/40' : 'group-hover:border-accent-purple/40';
  const bgHighlight = color === 'blue' ? 'group-hover:bg-primary/5' : 'group-hover:bg-accent-purple/5';
  
  const acceptTypes = color === 'blue' ? "image/*,.sketch" : "image/*";
  const showTabs = color === 'blue'; // Only show MasterGo tab for Design card

  return (
    <div 
      className="flex flex-col h-full w-full"
      onDragOver={(e) => e.preventDefault()}
      onDrop={handleDrop}
    >
      <div className="mb-4 flex items-center justify-between px-2">
           <span className="font-bold text-text-main text-sm tracking-wide">{title}</span>
           {/* Tab Switcher */}
           {showTabs ? (
               <div className="flex bg-bg-lighter/50 rounded-lg p-0.5 border border-border-light">
                   <button 
                      onClick={() => setMode('file')}
                      className={`px-3 py-0.5 text-[10px] font-bold rounded-md transition-all ${mode === 'file' ? 'bg-bg-card text-text-main shadow-sm' : 'text-text-muted hover:text-text-main'}`}
                   >
                       本地文件
                   </button>
                   <button 
                      onClick={() => setMode('mastergo')}
                      className={`px-3 py-0.5 text-[10px] font-bold rounded-md transition-all ${mode === 'mastergo' ? 'bg-bg-card text-primary shadow-sm' : 'text-text-muted hover:text-text-main'}`}
                   >
                       MasterGo
                   </button>
               </div>
           ) : (
                <span className={`text-[10px] font-bold bg-bg-lighter px-2 py-0.5 rounded border border-border-light text-text-muted group-hover:text-text-main transition-colors`}>
                    {t('upload.required')}
                </span>
           )}
      </div>

      {mode === 'file' ? (
          <div 
            onClick={() => inputRef.current?.click()}
            className={`
              group relative flex-1 w-full 
              rounded-2xl flex flex-col items-center justify-center cursor-pointer 
              transition-all duration-300 overflow-hidden
              border border-dashed
              ${imageSrc ? 'border-transparent bg-black/40' : 'border-border-light bg-bg-secondary hover:shadow-card'}
              ${borderHighlight} ${bgHighlight}
            `}
          >
            <input 
              type="file" 
              ref={inputRef} 
              className="hidden" 
              accept={acceptTypes}
              onChange={handleChange}
            />
            
            {imageSrc ? (
              <div className="w-full h-full relative overflow-hidden flex items-center justify-center p-4">
                <div className="absolute inset-0 opacity-20" 
                      style={{backgroundImage: 'radial-gradient(circle, #333 1px, transparent 1px)', backgroundSize: '20px 20px'}}>
                </div>
                
                <img 
                    src={imageSrc} 
                    alt="Uploaded" 
                    className="max-w-full max-h-full object-contain relative z-10 shadow-2xl rounded-lg"
                />
                
                {/* Indicators */}
                {isSketch && (
                  <div className="absolute top-4 right-4 z-20">
                      <div className="bg-[#F7B500] text-black text-[10px] font-bold px-2 py-1 rounded shadow-lg flex items-center gap-1">
                          SKETCH
                      </div>
                  </div>
                )}
                
                <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center z-20 backdrop-blur-sm">
                    <div className="flex items-center gap-2 text-white font-bold bg-white/10 px-5 py-2 rounded-full border border-white/10 hover:bg-white/20 transition-transform hover:scale-105">
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                        <span>{t('upload.replace')}</span>
                    </div>
                </div>
              </div>
            ) : (
              <div className="text-center p-8 relative z-10">
                <div className="w-20 h-20 mx-auto mb-6 rounded-full bg-bg-main border border-border-light flex items-center justify-center shadow-inner group-hover:scale-110 transition-transform duration-300">
                  <svg className={`w-8 h-8 ${accentColor}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                  </svg>
                </div>
                
                <h3 className="text-text-main font-bold text-base mb-2">{t('upload.dropText')}</h3>
                <p className="text-text-dim text-xs max-w-[180px] mx-auto leading-relaxed">
                  {color === 'blue' 
                      ? '支持 .png, .jpg, .sketch, MasterGo 链接' 
                      : t('upload.dropSubText')}
                </p>
              </div>
            )}
          </div>
      ) : (
          // MasterGo Input Form
          <div className="flex-1 w-full rounded-2xl border border-border-light bg-bg-secondary p-6 flex flex-col gap-4 overflow-y-auto">
             <div className="flex items-center gap-2 mb-2">
                 <div className="w-8 h-8 rounded-lg bg-[#4F54F7] flex items-center justify-center text-white">
                    <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2L2 19h20L12 2zm0 3.8l6.8 11.2H5.2L12 5.8z"/></svg>
                 </div>
                 <div>
                     <h3 className="text-sm font-bold text-text-main">MasterGo Import</h3>
                     <p className="text-[10px] text-text-muted">自动获取高清设计图与图层数据</p>
                 </div>
             </div>

             <div className="space-y-3">
                 <div>
                     <label className="text-[10px] font-bold text-text-muted uppercase tracking-wider block mb-1">文件链接 (URL)</label>
                     <input 
                        type="text" 
                        value={mgUrl}
                        onChange={(e) => setMgUrl(e.target.value)}
                        placeholder="https://mastergo.com/file/...?layer_id=..."
                        className="w-full bg-bg-main border border-border-light rounded-lg px-3 py-2 text-xs text-text-main focus:border-primary focus:outline-none transition-colors"
                     />
                     <div className="mt-1.5 p-2 bg-blue-500/10 border border-blue-500/20 rounded text-[10px] text-blue-400">
                        <strong>提示：</strong> 请务必在 MasterGo 画布上<strong className="text-white">点击选中画板</strong>，然后复制浏览器地址栏的链接（支持包含 nodeId 或 layer_id 参数的链接）。
                     </div>
                 </div>

                 <div>
                     <label className="text-[10px] font-bold text-text-muted uppercase tracking-wider block mb-1">Personal Access Token</label>
                     <input 
                        type="password" 
                        value={mgToken}
                        onChange={(e) => setMgToken(e.target.value)}
                        placeholder="mk-..."
                        className="w-full bg-bg-main border border-border-light rounded-lg px-3 py-2 text-xs text-text-main focus:border-primary focus:outline-none transition-colors"
                     />
                     <p className="text-[9px] text-text-dim mt-1">在 MasterGo 设置 → 账号设置 → 个人凭证 中获取</p>
                 </div>
             </div>

             {errorMsg && (
                 <div className="p-2 rounded bg-red-500/10 border border-red-500/20 text-red-500 text-[10px] font-bold animate-fade-in">
                     {errorMsg}
                 </div>
             )}

             <div className="mt-auto">
                 <button 
                    onClick={handleMasterGoImport}
                    disabled={isLoading}
                    className={`w-full py-2.5 rounded-lg font-bold text-xs flex items-center justify-center gap-2 transition-all ${isLoading ? 'bg-bg-lighter text-text-muted cursor-wait' : 'bg-primary text-white hover:bg-primary-hover shadow-lg shadow-primary/20'}`}
                 >
                    {isLoading ? (
                        <>
                            <svg className="animate-spin h-3 w-3 text-current" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path>
                            </svg>
                            解析中...
                        </>
                    ) : (
                        '解析并导入'
                    )}
                 </button>
             </div>
          </div>
      )}
    </div>
  );
};

export default UploadCard;
