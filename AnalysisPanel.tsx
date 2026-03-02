
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

  // Score Card - Mimics "Total Balance" card
  const renderScoreSection = () => {
    const score = result?.score || 0;
    
    // Determine status color
    let statusColor = 'text-accent-pink';
    let statusText = t('analysis.poor');
    let percentageColor = 'text-red-400';
    let arrow = '↓';

    if (score >= 95) {
        statusColor = 'text-accent-success';
        statusText = t('analysis.perfect');
        percentageColor = 'text-accent-success';
        arrow = '↑';
    } else if (score >= 85) {
        statusColor = 'text-primary';
        statusText = t('analysis.good');
        percentageColor = 'text-primary';
        arrow = '↑';
    } else if (score >= 70) {
        statusColor = 'text-accent-orange';
        statusText = t('analysis.average');
        percentageColor = 'text-accent-orange';
        arrow = '→';
    }
    
    return (
        // Glassmorphism update
        <div className="bg-bg-card/60 backdrop-blur-xl border border-white/10 rounded-3xl p-6 relative overflow-hidden group shadow-card">
            {/* Background Glow */}
            <div className="absolute top-[-50%] right-[-50%] w-full h-full bg-primary/5 rounded-full blur-3xl pointer-events-none group-hover:bg-primary/10 transition-colors"></div>

            <div className="flex justify-between items-start mb-6 relative z-10">
                <span className="text-sm font-bold text-text-main">{t('analysis.scoreTitle')}</span>
                <span className="bg-bg-lighter/50 border border-border-light px-3 py-1 rounded-lg text-xs font-bold text-text-muted flex items-center gap-2">
                    {t('analysis.visualDiff')} <span className="w-1.5 h-1.5 rounded-full bg-primary"></span>
                </span>
            </div>

            <div className="flex items-baseline gap-1 mb-2 relative z-10">
                <span className="text-4xl font-bold text-text-main tracking-tight">
                    {loading ? '--' : score}
                </span>
                <span className="text-xl text-text-muted font-medium">/ 100</span>
            </div>

            <div className="flex items-center justify-between relative z-10">
                <div className="flex items-center gap-2">
                    <span className={`text-sm font-bold ${percentageColor} flex items-center`}>
                       {arrow} {score}%
                    </span>
                    <span className="text-xs text-text-dim">{t('analysis.matchRate')}</span>
                </div>
                <div className={`px-3 py-1 rounded-lg bg-white/5 border border-white/5 text-xs font-bold ${statusColor}`}>
                    {loading ? t('analysis.calculating') : statusText}
                </div>
            </div>
        </div>
    );
  };

  return (
    <div className="flex flex-col gap-6 h-full min-h-0">
      {renderScoreSection()}

      {/* Issues List Container - Glassmorphism update */}
      <div className="bg-bg-card/60 backdrop-blur-xl border border-white/10 rounded-3xl flex flex-col flex-1 min-h-0 overflow-hidden shadow-card">
          
          <div className="p-5 border-b border-white/5 flex items-center justify-between shrink-0">
              <h3 className="text-sm font-bold text-text-main">{t('analysis.issuesTitle')}</h3>
              <div className="flex items-center gap-2 bg-bg-lighter/50 px-2 py-1 rounded-lg">
                  <span className="text-[10px] font-bold text-text-muted">{t('analysis.sortBy')}:</span>
                  <span className="text-[10px] font-bold text-text-main">{t('analysis.sortSeverity')}</span>
                  <svg className="w-3 h-3 text-text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
              </div>
          </div>

          <div className="px-5 py-3 border-b border-white/5 flex text-[10px] font-bold text-text-muted uppercase tracking-wider shrink-0">
              <div className="w-12">{t('analysis.colType')}</div>
              <div className="flex-1 pl-2">{t('analysis.colDesc')}</div>
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
                    
                    // Icon based on type
                    let Icon = (
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                    );
                    let iconBg = 'bg-gray-500/10 text-gray-500';

                    if (issue.type === 'layout' || issue.subType === 'position' || issue.subType === 'dimension') {
                        iconBg = 'bg-blue-500/10 text-blue-500';
                        Icon = <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 5a1 1 0 011-1h14a1 1 0 011 1v2a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM4 13a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H5a1 1 0 01-1-1v-6zM16 13a1 1 0 011-1h2a1 1 0 011 1v6a1 1 0 01-1 1h-2a1 1 0 01-1-1v-6z" /></svg>;
                    } else if (issue.type === 'color') {
                        iconBg = 'bg-pink-500/10 text-pink-500';
                        Icon = <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01" /></svg>;
                    } else if (issue.type === 'typography' || issue.subType === 'text' || issue.subType === 'font-weight') {
                        iconBg = 'bg-yellow-500/10 text-yellow-500';
                        Icon = <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>;
                    }

                    const severityColor = issue.severity === 'high' ? 'text-red-500 bg-red-500/10 border-red-500/20' : issue.severity === 'medium' ? 'text-orange-500 bg-orange-500/10 border-orange-500/20' : 'text-blue-500 bg-blue-500/10 border-blue-500/20';
                    const severityText = issue.severity === 'high' ? t('analysis.severityHigh') : issue.severity === 'medium' ? t('analysis.severityMedium') : t('analysis.severityLow');

                    return (
                        <div 
                            key={issue.id}
                            ref={el => { itemRefs.current[issue.id] = el }}
                            onClick={() => onSelectIssue(isSelected ? null : issue)}
                            className={`
                                flex items-center p-3 rounded-xl cursor-pointer transition-all border
                                ${isSelected 
                                    ? 'bg-bg-lighter/80 border-primary shadow-glow' 
                                    : 'bg-transparent border-transparent hover:bg-bg-lighter/30 hover:border-white/5'}
                            `}
                        >
                             {/* Icon Column */}
                            <div className={`w-8 h-8 rounded-full ${iconBg} flex items-center justify-center shrink-0 mr-3`}>
                                {Icon}
                            </div>

                            {/* Content */}
                            <div className="flex-1 min-w-0 pr-3">
                                <div className="text-xs font-bold text-text-main mb-0.5 truncate">{issue.location || t('analysis.unknownLoc')}</div>
                                <div className="text-[10px] text-text-muted truncate">{issue.description}</div>
                            </div>

                            {/* Status/Action Button */}
                            <div className="shrink-0">
                                <span className={`text-[9px] font-bold px-2 py-1 rounded-md border ${severityColor} uppercase`}>
                                    {severityText}
                                </span>
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
