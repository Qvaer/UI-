
import React, { useMemo } from 'react';
import { AnalysisResult, Issue, BoundingBox } from '../types';
import { useConfig } from '../contexts/ConfigContext';

interface ReportViewProps {
  result: AnalysisResult;
  designImage: string;
  devImage: string; // This should be the aligned dev image
  onClose: () => void;
  canvasWidth: number;
  canvasHeight: number;
}

// Sub-component to render a specific crop of an image
const EvidenceCrop: React.FC<{
  imageSrc: string;
  box: BoundingBox;
  canvasWidth: number;
  canvasHeight: number;
  label: string;
  color: string;
}> = ({ imageSrc, box, canvasWidth, canvasHeight, label, color }) => {
  // Add context padding to the crop
  const padding = 20;
  
  // Calculate crop coordinates ensuring they stay within bounds
  const x = Math.max(0, box.x - padding);
  const y = Math.max(0, box.y - padding);
  const w = Math.min(canvasWidth - x, box.width + (padding * 2));
  const h = Math.min(canvasHeight - y, box.height + (padding * 2));

  // Determine display size (limit max width for UI consistency)
  const displayHeight = 120;
  const displayWidth = (w / h) * displayHeight;

  return (
    <div className="flex flex-col gap-2">
      <span className={`text-[10px] font-bold uppercase tracking-wider ${color}`}>
        {label}
      </span>
      <div 
        className="relative rounded-lg overflow-hidden border border-white/10 shadow-sm bg-black/50"
        style={{
          width: Math.min(displayWidth, 300), // Max width cap
          height: displayHeight,
        }}
      >
        <div 
          className="absolute top-0 left-0 w-full h-full bg-no-repeat"
          style={{
            backgroundImage: `url(${imageSrc})`,
            backgroundSize: `${canvasWidth}px ${canvasHeight}px`,
            backgroundPosition: `-${x}px -${y}px`,
            transform: `scale(${displayHeight / h})`,
            transformOrigin: 'top left',
            width: w,
            height: h 
          }}
        />
        
        {/* Draw the specific issue box overlay (scaled) */}
        <div 
            className="absolute border-2 border-red-500/80 z-10 box-content"
            style={{
                left: (box.x - x),
                top: (box.y - y),
                width: box.width,
                height: box.height,
                transform: `scale(${displayHeight / h})`,
                transformOrigin: 'top left'
            }}
        ></div>
      </div>
    </div>
  );
};

const ReportView: React.FC<ReportViewProps> = ({ 
  result, 
  designImage, 
  devImage, 
  onClose,
  canvasWidth,
  canvasHeight
}) => {
  const { t } = useConfig();
  
  // Calculate stroke dasharray for circle progress
  const radius = 36;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (result.score / 100) * circumference;

  const scoreColor = result.score >= 90 ? 'text-emerald-400' : result.score >= 80 ? 'text-accent-orange' : 'text-red-500';
  const scoreRingColor = result.score >= 90 ? 'stroke-emerald-500' : result.score >= 80 ? 'stroke-accent-orange' : 'stroke-red-500';

  return (
    <div className="w-full h-full bg-transparent overflow-y-auto animate-fade-in custom-scrollbar relative z-10">
      {/* Sticky Header - Glass */}
      <div className="sticky top-0 z-50 bg-bg-main/40 backdrop-blur-md border-b border-white/5 px-8 py-4 flex items-center justify-between">
         <div className="flex items-center gap-4">
             <h2 className="text-xl font-bold text-text-main tracking-tight">{t('report.title')}</h2>
             <span className="px-2 py-0.5 rounded bg-bg-lighter/50 text-xs text-text-muted font-mono">
                {new Date().toLocaleDateString()}
             </span>
         </div>
         <div className="flex items-center gap-4">
             <button 
                onClick={() => window.print()}
                className="text-sm font-medium text-text-muted hover:text-text-main transition-colors flex items-center gap-2"
             >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
                </svg>
                {t('report.export')}
             </button>
             <button 
                onClick={onClose}
                className="w-8 h-8 rounded-full bg-bg-lighter/50 hover:bg-white/20 flex items-center justify-center transition-colors"
             >
                <svg className="w-5 h-5 text-text-main" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
             </button>
         </div>
      </div>

      <div className="max-w-4xl mx-auto py-10 px-6">
        
        {/* Summary Card - Glass */}
        <div className="bg-bg-card/60 backdrop-blur-xl border border-white/10 rounded-3xl p-8 mb-10 flex items-center justify-between shadow-glow relative overflow-hidden">
            <div className="absolute top-0 right-0 w-64 h-64 bg-primary/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2 pointer-events-none"></div>
            
            <div className="relative z-10 max-w-lg">
                <h3 className="text-2xl font-bold text-text-main mb-2">{t('report.summaryTitle')}</h3>
                <p className="text-text-muted leading-relaxed mb-6">
                    {result.summary}
                </p>
                <div className="flex gap-8">
                   <div>
                      <div className="text-sm text-text-muted mb-1">{t('report.totalIssues')}</div>
                      <div className="text-3xl font-mono font-bold text-text-main">{result.issues.length}</div>
                   </div>
                   <div>
                       <div className="text-sm text-text-muted mb-1">{t('report.criticalIssues')}</div>
                       <div className="text-3xl font-mono font-bold text-red-500">
                          {result.issues.filter(i => i.severity === 'high').length}
                       </div>
                   </div>
                </div>
            </div>

            {/* Score Circle */}
            <div className="relative w-32 h-32 flex items-center justify-center shrink-0">
                <svg className="w-full h-full transform -rotate-90">
                    <circle
                        className="text-text-muted/10"
                        strokeWidth="6"
                        stroke="currentColor"
                        fill="transparent"
                        r={radius}
                        cx="64"
                        cy="64"
                    />
                    <circle
                        className={`${scoreRingColor} transition-all duration-1000 ease-out`}
                        strokeWidth="6"
                        strokeDasharray={circumference}
                        strokeDashoffset={strokeDashoffset}
                        strokeLinecap="round"
                        stroke="currentColor"
                        fill="transparent"
                        r={radius}
                        cx="64"
                        cy="64"
                    />
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <span className="text-xs text-text-muted font-bold uppercase tracking-wider">{t('analysis.visualDiff')}</span>
                    <span className={`text-4xl font-black ${scoreColor}`}>{result.score}</span>
                </div>
            </div>
        </div>

        {/* Issue List */}
        <div className="space-y-6">
            <div className="flex items-center justify-between mb-2 px-2">
                <h4 className="text-lg font-bold text-text-main">{t('report.detailTitle')}</h4>
                <span className="text-sm text-text-muted">{t('report.totalIssues')}: {result.issues.length}</span>
            </div>

            {result.issues.map((issue, idx) => {
                const priorityColor = issue.severity === 'high' ? 'bg-red-500 text-white' : issue.severity === 'medium' ? 'bg-accent-orange text-white' : 'bg-blue-500 text-white';
                const priorityLabel = issue.severity === 'high' ? t('analysis.severityHigh') : issue.severity === 'medium' ? t('analysis.severityMedium') : t('analysis.severityLow');

                // Use relatedBox (Dev) primarily, fallback to designBox if needed
                const box = issue.relatedBox || issue.designBox;

                return (
                    <div key={issue.id} className="bg-bg-card/60 backdrop-blur-xl border border-white/10 rounded-2xl overflow-hidden shadow-lg group hover:border-white/20 transition-all">
                        {/* Header */}
                        <div className="bg-bg-lighter/30 px-6 py-4 flex items-center justify-between border-b border-white/5">
                            <div className="flex items-center gap-3">
                                <div className="w-8 h-8 rounded-lg bg-bg-main/50 flex items-center justify-center text-sm font-mono font-bold text-text-muted">
                                    {idx + 1}
                                </div>
                                <div>
                                    <h5 className="text-base font-bold text-text-main leading-tight">{issue.description}</h5>
                                    {issue.location && <span className="text-xs text-text-muted">{issue.location}</span>}
                                </div>
                            </div>
                            <span className={`text-[10px] font-bold px-2 py-1 rounded shadow-sm tracking-wider ${priorityColor}`}>
                                {priorityLabel}
                            </span>
                        </div>

                        <div className="p-6">
                            {/* Description Body */}
                            <p className="text-sm text-text-muted mb-6 leading-relaxed">
                                {issue.location && <span className="text-text-main font-medium">{issue.location}: </span>}
                                {issue.secondaryIssues && issue.secondaryIssues.length > 0 ? (
                                    <span>
                                        {issue.description}, + {issue.secondaryIssues.map(s => s.description).join(', ')}
                                    </span>
                                ) : (
                                    issue.description
                                )}
                            </p>

                            {/* Visual Evidence Section */}
                            {box && (
                                <div className="mb-6 bg-black/40 rounded-xl p-4 border border-white/5">
                                    <div className="text-[10px] font-bold text-text-dim mb-3 flex items-center gap-2">
                                        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                                        {t('report.visualEvidence')}
                                    </div>
                                    <div className="flex flex-wrap gap-8">
                                        {/* Design Crop */}
                                        <EvidenceCrop 
                                            imageSrc={designImage} 
                                            box={issue.designBox || box} 
                                            canvasWidth={canvasWidth} 
                                            canvasHeight={canvasHeight} 
                                            label={t('dashboard.designLabel')}
                                            color="text-primary"
                                        />
                                        
                                        {/* Dev Crop */}
                                        <EvidenceCrop 
                                            imageSrc={devImage} 
                                            box={issue.relatedBox || box} 
                                            canvasWidth={canvasWidth} 
                                            canvasHeight={canvasHeight} 
                                            label={t('dashboard.devLabel')}
                                            color="text-accent-purple"
                                        />
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                );
            })}
        </div>
        
        {/* Footer */}
        <div className="mt-12 pt-8 border-t border-white/5 text-center text-xs text-text-muted/40">
            {t('report.footer')}
        </div>

      </div>
    </div>
  );
};

export default ReportView;
