
import React from 'react';
import { useConfig } from '../contexts/ConfigContext';

interface LoadingOverlayProps {
  progress: number; // 0 to 100
  status: string;
}

const LoadingOverlay: React.FC<LoadingOverlayProps> = ({ progress, status }) => {
  const { t } = useConfig();
  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center bg-gray-200/50 dark:bg-gray-950/70 backdrop-blur-md animate-fade-in transition-all duration-300">
      <div className="bg-white/80 dark:bg-gray-900/90 border border-gray-200 dark:border-gray-700/50 p-10 rounded-3xl shadow-2xl flex flex-col items-center justify-center gap-8 max-w-sm w-full mx-4 transform scale-100 animate-in fade-in zoom-in duration-300 relative overflow-hidden">
        
        {/* Subtle Background Glow (Blue) */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-48 h-48 bg-primary/20 rounded-full blur-[80px] pointer-events-none"></div>

        {/* Central Layout */}
        <div className="relative z-10 w-full flex flex-col items-center">
            {/* Big Percentage Number */}
            <div className="flex items-baseline mb-2">
                <span className="text-7xl font-black text-transparent bg-clip-text bg-gradient-to-b from-gray-800 to-gray-600 dark:from-white dark:to-gray-400 tracking-tighter tabular-nums drop-shadow-sm">
                    {Math.round(progress)}
                </span>
                <span className="text-2xl font-bold text-gray-400 dark:text-gray-500 ml-1 translate-y-[-4px]">%</span>
            </div>

            {/* Title & Status */}
            <div className="text-center space-y-1 mb-6">
                <h3 className="text-lg font-bold text-gray-800 dark:text-gray-200 tracking-tight">{t('loading.title')}</h3>
                <p className="text-xs text-gray-500 dark:text-gray-400 font-medium animate-pulse min-h-[1rem]">{status}</p>
            </div>
            
            {/* Minimalist Progress Bar with Pulse */}
            <div className="w-full bg-gray-200 dark:bg-gray-800/80 rounded-full h-1.5 overflow-hidden border border-gray-300 dark:border-gray-700/50 relative">
                <div 
                    className="h-full bg-primary relative overflow-hidden transition-all duration-300 ease-out shadow-[0_0_10px_rgba(61,92,255,0.4)]"
                    style={{ width: `${progress}%` }}
                >
                    {/* Left-to-Right Pulse Animation (White gradient moving across) */}
                    <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/40 to-transparent w-full -translate-x-full animate-shimmer"></div>
                </div>
            </div>
        </div>

      </div>
    </div>
  );
};

export default LoadingOverlay;
