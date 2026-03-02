
import React, { useEffect, useRef } from 'react';
import { AnalysisResult, Issue, IssueType } from '../types';
import { useConfig } from '../contexts/ConfigContext';

interface AnalysisPanelProps {
  loading: boolean;
  result: AnalysisResult | null;
  pixelScore: number;
  onSelectIssue: (issue: Issue | null) => void;
  selectedIssueId?: string;
  designImageWidth: number;
}

const AnalysisPanel: React.FC<AnalysisPanelProps> = ({ 
  loading, 
  result, 
  pixelScore, 
  onSelectIssue,
  selectedIssueId,
  designImageWidth
}) => {
  const { t } = useConfig();
  
  const containerRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<{[key: string]: HTMLDivElement | null}>({});

  useEffect(() => {
    if (selectedIssueId && itemRefs.current[selectedIssueId] && containerRef.current) {
      const item = itemRefs.current[selectedIssueId];
      const container = containerRef.current;
      if (item) {
        const itemTop = item.offsetTop;
        const itemHeight = item.offsetHeight;
        const containerHeight = container.clientHeight;
        const targetScrollTop = itemTop - (containerHeight / 2) + (itemHeight / 2);
        container.scrollTo({ top: targetScrollTop, behavior: 'smooth' });
      }
    }
  }, [selectedIssueId]);

  // Score Card - Centered Layout
  const renderScoreSection = () => {
    const score = result?.score || 0;
    
    // Determine status color/logic
    let statusColor = 'text-red-500 bg-red-500/10 border-red-500/20';
    let ringColor = 'text-red-500';
    let gradientText = 'from-red-400 to-red-600';
    let statusText = t('analysis.poor');
    let shadowColor = 'shadow-red-500/20';

    // >= 95: Perfect
    if (score >= 95) {
        statusColor = 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20';
        ringColor = 'text-emerald-400';
        gradientText = 'from-emerald-300 to-emerald-500';
        statusText = t('analysis.perfect');
        shadowColor = 'shadow-emerald-500/20';
    } 
    // 80 - 95: Good (Review)
    else if (score >= 80) {
        statusColor = 'text-blue-400 bg-blue-500/10 border-blue-500/20';
        ringColor = 'text-blue-500';
        gradientText = 'from-blue-300 to-blue-600';
        statusText = t('analysis.good');
        shadowColor = 'shadow-blue-500/20';
    } 
    // < 80: Fail (Reject)
    else {
        // Keep defaults (Red)
        statusText = t('analysis.reject');
    }
    
    return (
        <div className={`relative overflow-hidden rounded-3xl p-8 transition-all duration-500 group border border-white/10 bg-bg-card/60 backdrop-blur-xl hover:bg-bg-card/80 shadow-lg ${shadowColor} hover:shadow-xl flex flex-col items-center justify-center`}>
            
            {/* Dynamic Background Gradient Blob - Centered */}
            <div className={`absolute top-1/2 left-1/2 w-48 h-48 rounded-full blur-[60px] opacity-20 pointer-events-none transition-colors duration-700 bg-gradient-to-br ${gradientText} -translate-x-1/2 -translate-y-1/2 group-hover:opacity-30`}></div>

            {/* Header - Centered */}
            <div className="relative z-10 flex flex-col items-center mb-4 gap-3">
                <span className="text-xs font-bold text-text-muted uppercase tracking-widest">{t('analysis.scoreTitle')}</span>
                <div className={`px-4 py-1.5 rounded-full text-[11px] font-black uppercase tracking-wide border backdrop-blur-md transition-colors ${statusColor} animate-fade-in`}>
                    {loading ? t('analysis.calculating') : statusText}
                </div>
            </div>

            {/* Main Content: Centered Big Number */}
            <div className="relative z-10 flex flex-col items-center justify-center">
                <div className="flex items-baseline justify-center">
                     <span className={`text-7xl font-black tracking-tighter text-transparent bg-clip-text bg-gradient-to-b ${gradientText} transition-all duration-700 drop-shadow-sm`}>
                        {loading ? '--' : score}
                     </span>
                     <span className={`text-4xl font-bold ml-1 ${ringColor} opacity-80`}>%</span>
                </div>
                <span className="text-xs font-bold text-text-muted/60 mt-2">
                    {t('analysis.matchRate')}
                </span>
            </div>
        </div>
    );
  };

  return (
    <div className="flex flex-col gap-6 h-full min-h-0">
      {renderScoreSection()}

      {/* Issues List Container */}
      <div className="bg-bg-card/60 backdrop-blur-xl border border-white/10 rounded-3xl flex flex-col flex-1 min-h-0 overflow-hidden shadow-card">
          
          <div className="p-5 border-b border-white/5 flex items-center justify-between shrink-0 min-h-[60px]">
              <h3 className="text-sm font-bold text-text-main flex items-center">
                  {t('analysis.issuesTitle')}
              </h3>
              
              {result && (
                  <div className="flex items-center justify-center gap-2 bg-bg-lighter/30 border border-white/5 pl-4 pr-3 py-1.5 rounded-full shadow-inner">
                      <div className="flex flex-col items-end leading-none">
                           <span className="text-[18px] font-black text-text-main tabular-nums">{result.issues.length}</span>
                      </div>
                      <div className="text-[9px] font-bold text-text-muted uppercase tracking-widest border-l border-white/10 pl-2">
                          ISSUES
                      </div>
                  </div>
              )}
          </div>

          <div className="px-5 py-3 border-b border-white/5 flex text-[10px] font-bold text-text-muted uppercase tracking-wider shrink-0">
              <div className="w-10 text-center">{t('analysis.colType')}</div>
              <div className="flex-1 pl-4">{t('analysis.colDesc')}</div>
              <div className="w-16 text-right">{t('analysis.colStatus')}</div>
          </div>

          <div 
            ref={containerRef}
            className="flex-1 overflow-y-auto custom-scrollbar p-2 space-y-1"
          >
            {loading ? (
                <div className="flex flex-col gap-3 p-2">
                    {[1, 2, 3, 4].map(i => (
                        <div key={i} className="h-12 bg-bg-lighter/50 rounded-xl animate-pulse"></div>
                    ))}
                </div>
            ) : !result ? (
                <div className="h-full flex flex-col items-center justify-center text-text-dim">
                    <div className="w-12 h-12 rounded-full bg-bg-lighter/50 flex items-center justify-center mb-3">
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" /></svg>
                    </div>
                    <p className="text-xs font-bold">{t('analysis.waiting')}</p>
                </div>
            ) : result.issues.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-text-dim">
                    <p className="text-xs font-bold text-accent-success">{t('analysis.perfectMatch')}</p>
                </div>
            ) : (
                result.issues.map((issue, idx) => {
                    const isSelected = selectedIssueId === issue.id;
                    
                    // Unified Badge Style (No longer color-coded by severity)
                    const badgeStyle = 'border-white/10 text-text-muted bg-white/5';
                    
                    return (
                        <div 
                            key={issue.id}
                            ref={el => { itemRefs.current[issue.id] = el }}
                            onClick={() => onSelectIssue(isSelected ? null : issue)}
                            className={`
                                flex items-start p-3 rounded-xl cursor-pointer transition-all border
                                ${isSelected 
                                    ? 'bg-bg-lighter/80 border-primary shadow-glow' 
                                    : 'bg-transparent border-transparent hover:bg-bg-lighter/30 hover:border-white/5'}
                            `}
                        >
                             {/* Index Column: Linear Square */}
                            <div className={`w-6 h-6 rounded border ${badgeStyle} flex items-center justify-center text-[11px] font-mono font-bold shrink-0 mr-4 mt-0.5`}>
                                {idx + 1}
                            </div>

                            {/* Content without Icon */}
                            <div className="flex-1 min-w-0 pr-4">
                                {issue.location && (
                                    <div className="text-[10px] font-bold text-text-main/80 mb-0.5 uppercase tracking-wide opacity-70 flex items-center gap-1.5">
                                        {issue.location}
                                    </div>
                                )}
                                <div className="flex items-start gap-2">
                                     <div className="text-xs text-text-muted leading-relaxed whitespace-pre-wrap font-medium pt-0.5">
                                        {issue.description}
                                     </div>
                                </div>
                            </div>

                            {/* Status/AI Column: Only show AI Tag */}
                            <div className="shrink-0 flex flex-col items-end gap-1 w-16">
                                {issue.isAiEnhanced ? (
                                    <div className="flex items-center gap-1.5 bg-gradient-to-r from-violet-600/20 to-fuchsia-600/20 border border-violet-500/30 text-violet-300 px-2 py-1 rounded-md shadow-[0_0_10px_rgba(139,92,246,0.15)]">
                                        <svg className="w-3 h-3 animate-pulse" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
                                        </svg>
                                        <span className="text-[9px] font-bold tracking-wide">AI</span>
                                    </div>
                                ) : null}
                            </div>
                        </div>
                    );
                })
            )}
          </div>
      </div>
    </div>
  );
};

export default AnalysisPanel;
