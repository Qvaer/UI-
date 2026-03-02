
import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import UploadCard from './components/UploadCard';
import ComparisonView from './components/ComparisonView';
import AnalysisPanel from './components/AnalysisPanel';
import LoadingOverlay from './components/LoadingOverlay';
import Toast from './components/Toast';
import ReportView from './components/ReportView'; 
import { ViewMode, ComparisonResult, AnalysisResult, Issue } from './types';
import { compareImages, checkThumbnailSimilarity } from './utils/imageProcessor';
import { analyzeLocalDifferences } from './services/localAnalysisService';
import { enhanceIssuesWithAI } from './services/geminiService';
import { useConfig } from './contexts/ConfigContext';

type Tab = 'upload' | 'analysis' | 'report';

const App: React.FC = () => {
  const { t, language, theme, toggleTheme, setLanguage } = useConfig();
  
  const [designImage, setDesignImage] = useState<string | null>(null);
  const [devImage, setDevImage] = useState<string | null>(null);
  // New state for filename
  const [designFileName, setDesignFileName] = useState<string>('');
  
  // Navigation State
  const [activeTab, setActiveTab] = useState<Tab>('upload');

  const [comparisonResult, setComparisonResult] = useState<ComparisonResult | null>(null);
  
  // Analysis State
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisProgress, setAnalysisProgress] = useState(0);
  const [analysisStatus, setAnalysisStatus] = useState('');
  const [analysisResult, setAnalysisResult] = useState<AnalysisResult | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  
  const [viewMode, setViewMode] = useState<ViewMode>(ViewMode.SIDE_BY_SIDE);
  const [sensitivityLevel, setSensitivityLevel] = useState<1 | 2 | 3 | 4 | 5>(3);
  const [showDiffBoxes, setShowDiffBoxes] = useState(true);

  const [selectedIssueId, setSelectedIssueId] = useState<string | undefined>(undefined);
  const [showSettings, setShowSettings] = useState(false); // Settings Popover state
  const settingsRef = useRef<HTMLDivElement>(null);
  const settingsButtonRef = useRef<HTMLButtonElement>(null);

  const analysisDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isFirstRun = useRef(true);

  // Refs to hold latest config values for stable callbacks
  const tRef = useRef(t);
  const languageRef = useRef(language);

  useEffect(() => {
    tRef.current = t;
    languageRef.current = language;
  }, [t, language]);

  // Click Outside Handler for Settings
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
        if (showSettings && 
            settingsRef.current && 
            !settingsRef.current.contains(event.target as Node) &&
            !settingsButtonRef.current?.contains(event.target as Node)) {
            setShowSettings(false);
        }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
        document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showSettings]);

  const handleFile = (file: File, type: 'design' | 'dev') => {
    const reader = new FileReader();
    reader.onload = (e) => {
      if (e.target?.result) {
        if (type === 'design') {
          setDesignImage(e.target.result as string);
          // Store filename without extension
          const name = file.name.substring(0, file.name.lastIndexOf('.')) || file.name;
          setDesignFileName(name);
        }
        else {
          setDevImage(e.target.result as string);
        }
        
        // Reset states
        setComparisonResult(null);
        setAnalysisResult(null);
        setSelectedIssueId(undefined);
        setActiveTab('upload');
        isFirstRun.current = true;
      }
    };
    reader.readAsDataURL(file);
  };

  const updateProgress = useCallback((progress: number, status: string) => {
    setAnalysisProgress(progress);
    setAnalysisStatus(status);
  }, []);

  const handleReset = () => {
    setIsAnalyzing(false);
    setDesignImage(null);
    setDevImage(null);
    setDesignFileName('');
    setComparisonResult(null);
    setAnalysisResult(null);
    setSelectedIssueId(undefined);
    setActiveTab('upload');
    isFirstRun.current = true;
  };

  const runFullAnalysis = useCallback(async (level: number) => {
    if (!designImage || !devImage) return;

    // Use Refs to get latest config without adding to dependencies
    const currentT = tRef.current;
    const currentLang = languageRef.current;

    setIsAnalyzing(true);
    setToastMessage(null);
    
    // --- Step 0: Quick Thumbnail Check ---
    if (isFirstRun.current) {
         updateProgress(5, currentT('loading.init'));
         const isSimilar = await checkThumbnailSimilarity(designImage, devImage);
         
         if (!isSimilar) {
             setIsAnalyzing(false);
             setToastMessage(currentT('toast.imageMismatch'));
             return;
         }
    } else {
        updateProgress(10, currentT('loading.recalc'));
    }

    try {
      const configMap: Record<number, { tolerance: number, merge: number }> = {
          1: { tolerance: 40, merge: 60 },
          2: { tolerance: 25, merge: 40 },
          3: { tolerance: 10, merge: 25 },
          4: { tolerance: 5, merge: 15 },
          5: { tolerance: 0, merge: 5 } 
      };
      
      const config = configMap[level] ?? configMap[3];
      
      // Step 1: Pixel Scan
      if (isFirstRun.current) updateProgress(20, currentT('loading.scanPixel'));
      const newComparisonResult = await compareImages(
          designImage, 
          devImage, 
          config.tolerance, 
          config.merge
      );

      // --- VALIDATION: Secondary Check (Pixel Score) ---
      // Increased Strictness: If < 40% match after alignment, reject it.
      if (newComparisonResult.pixelScore < 40) {
          setIsAnalyzing(false);
          setToastMessage(currentT('toast.imageMismatch'));
          return;
      }

      // Validation passed, switch to analysis tab and set result
      setActiveTab('analysis');
      setComparisonResult(newComparisonResult);

      // Step 2 & 3: Spatial & Structural
      if (isFirstRun.current) updateProgress(45, currentT('loading.scanSpatial'));
      await new Promise(r => setTimeout(r, 100));

      if (isFirstRun.current) updateProgress(60, currentT('loading.scanSSIM'));
      const localResult = await analyzeLocalDifferences(
        newComparisonResult, 
        designImage, 
        newComparisonResult.alignedDevImageUrl,
        devImage
      );
      
      let finalResult = localResult;
      const needsAi = localResult.issues.length > 0;
      
      if (needsAi) {
          if (isFirstRun.current) updateProgress(80, currentT('loading.aiCheck'));
          else updateProgress(70, currentT('loading.aiCheckRetry'));

          try {
              const enhancedIssues = await enhanceIssuesWithAI(
                  localResult.issues,
                  designImage,
                  newComparisonResult.alignedDevImageUrl,
                  currentLang // Pass language to AI service
              );
              finalResult = { ...localResult, issues: enhancedIssues };
          } catch (error: any) {
              console.warn("AI Module Failed", error);
              const isQuota = error.status === 429 || error.message?.includes('429') || error.message?.includes('quota');

              if (isQuota) {
                  setToastMessage(currentT('toast.quota'));
              } else {
                  setToastMessage(currentT('toast.error'));
              }
          }
      }

      if (isFirstRun.current) updateProgress(100, currentT('loading.genReport'));
      if (isFirstRun.current) await new Promise(r => setTimeout(r, 400));

      setAnalysisResult(finalResult);
      setIsAnalyzing(false);
      isFirstRun.current = false;

    } catch (e) {
      console.error(e);
      setIsAnalyzing(false);
      setToastMessage(currentT('toast.unknown'));
    }
  }, [designImage, devImage, updateProgress]); 

  const handleStartWorkflow = () => {
      // Do not switch tab immediately. Wait for basic validation in runFullAnalysis.
      runFullAnalysis(sensitivityLevel);
  };

  const handleIssueSelect = (issue: Issue | null) => {
    setSelectedIssueId(issue?.id);
  };

  const handleBoxClick = (issueId: string) => {
    setSelectedIssueId(issueId);
  };

  const displayDevImage = comparisonResult?.alignedDevImageUrl || devImage || '';

  const visualIssues = useMemo<Issue[]>(() => {
    if (isAnalyzing) return [];
    if (analysisResult) return analysisResult.issues;
    if (comparisonResult) {
        return comparisonResult.diffBoxes.map((b, i) => ({
            id: `diff-${i}`,
            type: 'content',
            description: t('analysis.visualDiff'),
            severity: 'high',
            relatedBox: b,
            designBox: b,
            specificSuggestions: []
        }));
    }
    return []; 
  }, [isAnalyzing, analysisResult, comparisonResult, t]);

  // Sidebar navigation logic
  const handleNavClick = (tab: Tab) => {
      if (tab === 'upload') {
          handleReset();
      } else if (tab === 'analysis') {
          // Only allow switching to analysis if we have data
          if (designImage && devImage) {
              setActiveTab('analysis');
          }
      } else if (tab === 'report') {
          if (analysisResult) {
              setActiveTab('report');
          }
      }
  };

  const getNavIconClass = (tab: Tab) => {
      const isActive = activeTab === tab;
      
      let isDisabled = false;
      if (tab === 'analysis') isDisabled = !designImage || !devImage;
      if (tab === 'report') isDisabled = !analysisResult;

      let base = "w-10 h-10 rounded-xl flex items-center justify-center transition-all ";
      
      if (isDisabled) return base + "text-text-muted/30 cursor-not-allowed";
      if (isActive) return base + "text-primary bg-bg-lighter shadow-sm";
      return base + "text-text-muted hover:text-text-main hover:bg-bg-lighter";
  };

  return (
    <div className="h-screen w-screen bg-bg-main text-text-main flex font-sans overflow-hidden transition-colors duration-300">
      
      {toastMessage && <Toast message={toastMessage} onClose={() => setToastMessage(null)} />}
      {isAnalyzing && <LoadingOverlay progress={analysisProgress} status={analysisStatus} />}

      {/* GLOBAL ANIMATED BACKGROUND */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none z-0">
           {/* Blobs - Increased size and spread. Only animate on 'upload' tab to save performance. */}
           <div className={`absolute top-[-20%] left-[-10%] w-[900px] h-[900px] bg-blue-600/20 dark:bg-blue-500/10 rounded-full blur-[120px] mix-blend-multiply dark:mix-blend-screen ${activeTab === 'upload' ? 'animate-blob' : ''}`}></div>
           <div className={`absolute top-[20%] right-[-20%] w-[800px] h-[800px] bg-indigo-600/20 dark:bg-indigo-500/10 rounded-full blur-[120px] animation-delay-2000 mix-blend-multiply dark:mix-blend-screen ${activeTab === 'upload' ? 'animate-blob' : ''}`} style={{ animationDelay: '2s' }}></div>
           <div className={`absolute bottom-[-20%] left-[10%] w-[1000px] h-[1000px] bg-purple-600/20 dark:bg-purple-500/10 rounded-full blur-[140px] animation-delay-4000 mix-blend-multiply dark:mix-blend-screen ${activeTab === 'upload' ? 'animate-blob' : ''}`} style={{ animationDelay: '4s' }}></div>
      </div>

      {/* SIDEBAR - Added Glassmorphism and Border fix */}
      <aside className="w-20 shrink-0 bg-bg-main/60 backdrop-blur-xl border-r border-border-light flex flex-col items-center py-8 z-30 transition-colors">
          {/* Logo */}
          <div className="mb-10 w-10 h-10 bg-gradient-to-br from-primary to-blue-600 rounded-xl flex items-center justify-center shadow-lg shadow-primary/20">
             <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M13 10V3L4 14h7v7l9-11h-7z" />
             </svg>
          </div>

          <nav className="flex flex-col gap-8 w-full items-center">
              {/* Home / Upload */}
              <button 
                onClick={() => handleNavClick('upload')}
                className={getNavIconClass('upload')}
                title={t('dashboard.reset')}
              >
                 <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" /></svg>
              </button>

              {/* Analysis */}
              <button 
                onClick={() => handleNavClick('analysis')}
                className={getNavIconClass('analysis')}
                title="Analysis"
              >
                 <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 3.055A9.001 9.001 0 1020.945 13H11V3.055z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.488 9H15V3.512A9.025 9.025 0 0120.488 9z" /></svg>
              </button>

              {/* Report - Added */}
              <button 
                onClick={() => handleNavClick('report')}
                className={getNavIconClass('report')}
                title={t('report.title')}
              >
                 <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
              </button>
          </nav>

          <div className="mt-auto mb-6 relative">
               {/* Settings Popover - Glass */}
               {showSettings && (
                 <div ref={settingsRef} className="absolute bottom-full left-14 mb-4 w-48 bg-bg-card/80 backdrop-blur-xl border border-border-light rounded-xl shadow-float p-3 z-50 flex flex-col gap-3 animate-fade-in">
                    {/* Language Toggle */}
                    <div className="flex flex-col gap-2">
                      <span className="text-[10px] font-bold text-text-muted uppercase tracking-wider px-1">{t('app.language')}</span>
                      <div className="flex bg-bg-lighter/50 p-1 rounded-lg">
                        <button 
                          onClick={() => setLanguage('zh')}
                          className={`flex-1 py-1.5 text-xs font-bold rounded-md transition-all ${language === 'zh' ? 'bg-bg-card text-text-main shadow-sm' : 'text-text-muted hover:text-text-main'}`}
                        >
                          中文
                        </button>
                        <button 
                          onClick={() => setLanguage('en')}
                          className={`flex-1 py-1.5 text-xs font-bold rounded-md transition-all ${language === 'en' ? 'bg-bg-card text-text-main shadow-sm' : 'text-text-muted hover:text-text-main'}`}
                        >
                          EN
                        </button>
                      </div>
                    </div>

                    {/* Theme Toggle */}
                    <div className="flex flex-col gap-2">
                       <span className="text-[10px] font-bold text-text-muted uppercase tracking-wider px-1">{t('app.theme')}</span>
                       <div className="flex bg-bg-lighter/50 p-1 rounded-lg">
                          <button 
                             onClick={() => theme !== 'light' && toggleTheme()}
                             className={`flex-1 py-1.5 text-xs font-bold rounded-md transition-all flex items-center justify-center gap-1 ${theme === 'light' ? 'bg-bg-card text-text-main shadow-sm' : 'text-text-muted hover:text-text-main'}`}
                             title={t('app.lightMode')}
                          >
                             {/* Sun Icon (Linear) */}
                             <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
                             </svg>
                          </button>
                          <button 
                             onClick={() => theme !== 'dark' && toggleTheme()}
                             className={`flex-1 py-1.5 text-xs font-bold rounded-md transition-all flex items-center justify-center gap-1 ${theme === 'dark' ? 'bg-bg-card text-text-main shadow-sm' : 'text-text-muted hover:text-text-main'}`}
                             title={t('app.darkMode')}
                          >
                             {/* Moon Icon (Linear) */}
                             <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
                             </svg>
                          </button>
                       </div>
                    </div>
                 </div>
               )}

               <button 
                  ref={settingsButtonRef}
                  onClick={() => setShowSettings(!showSettings)}
                  className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all ${showSettings ? 'bg-bg-lighter text-text-main' : 'text-text-muted hover:text-text-main hover:bg-bg-lighter'}`}
               >
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
               </button>
          </div>
      </aside>

      {/* Main Content Area - Glass Compatible */}
      <div className="flex-1 flex flex-col min-w-0 bg-transparent relative transition-colors duration-300">
          
          <div className="flex-1 p-8 overflow-hidden flex flex-col gap-6 relative z-10">

             {/* Upload State */}
             {activeTab === 'upload' && (
                 <div className="flex-1 flex flex-col items-center justify-center animate-fade-in">
                     
                     {/* Enlarged Centered Title */}
                     <div className="text-center mb-12 relative z-10">
                         <h1 className="text-4xl font-extrabold text-text-main mb-3 tracking-tight drop-shadow-sm">{t('app.title')}</h1>
                         <p className="text-lg text-text-muted font-bold uppercase tracking-[0.2em]">{t('app.subtitle')}</p>
                     </div>

                     <div className="max-w-5xl w-full">
                         <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-10">
                            {/* Upload Cards - Use glass-like effect with border adaptation */}
                            <div className="h-[450px] bg-bg-card/80 backdrop-blur-sm rounded-3xl p-1 border border-border-light hover:border-primary/30 transition-colors shadow-card">
                                <UploadCard 
                                    title={t('upload.designTitle')}
                                    imageSrc={designImage} 
                                    onUpload={(f) => handleFile(f, 'design')} 
                                    color="blue"
                                />
                            </div>
                            <div className="h-[450px] bg-bg-card/80 backdrop-blur-sm rounded-3xl p-1 border border-border-light hover:border-accent-purple/30 transition-colors shadow-card">
                                <UploadCard 
                                    title={t('upload.devTitle')}
                                    imageSrc={devImage} 
                                    onUpload={(f) => handleFile(f, 'dev')} 
                                    color="purple"
                                />
                            </div>
                         </div>
                         
                         <div className={`flex justify-center transition-all duration-500 ${designImage && devImage ? 'opacity-100 translate-y-0' : 'opacity-50 translate-y-4 grayscale pointer-events-none'}`}>
                            <button 
                                onClick={handleStartWorkflow}
                                className="group relative overflow-hidden rounded-full bg-primary px-10 py-4 font-bold text-white shadow-[0_0_40px_-10px_rgba(61,92,255,0.5)] transition-all hover:scale-105 hover:shadow-[0_0_60px_-10px_rgba(61,92,255,0.7)] active:scale-95"
                            >
                                <span className="relative z-10 flex items-center gap-3">
                                    {t('upload.startBtn')}
                                    <svg className="w-5 h-5 group-hover:translate-x-1 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M14 5l7 7m0 0l-7 7m7-7H3" />
                                    </svg>
                                </span>
                            </button>
                         </div>
                     </div>
                 </div>
             )}

             {/* Dashboard State (Analysis) */}
             {activeTab === 'analysis' && (
                 <div className="flex-1 flex flex-col gap-6 overflow-hidden animate-slide-up">
                    
                    {/* Page Header - Modified Layout */}
                    <div className="flex items-center justify-between shrink-0 relative min-h-[50px]">
                        {/* Left: App Branding (Restored) */}
                        <div className="flex flex-col justify-center">
                             <h1 className="text-xl font-black text-text-main tracking-tight leading-none">
                                {t('app.title')}
                             </h1>
                             <span className="text-[10px] font-bold text-text-muted uppercase tracking-[0.2em] mt-1">
                                {t('app.subtitle')}
                             </span>
                        </div>

                        {/* Center: Page/File Name (Smaller and Centered) */}
                        {designFileName && (
                            <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 hidden md:flex items-center justify-center pointer-events-none">
                                <div className="bg-bg-card/40 backdrop-blur-md border border-border-light px-4 py-1.5 rounded-full shadow-sm flex items-center gap-2">
                                     <svg className="w-3.5 h-3.5 text-text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                     </svg>
                                     <span className="text-xs font-bold text-text-main max-w-[200px] lg:max-w-[400px] truncate" title={designFileName}>
                                        {designFileName}
                                     </span>
                                </div>
                            </div>
                        )}
                        
                        {/* Right: Reset Button */}
                        <button 
                            onClick={() => handleNavClick('upload')}
                            className="group flex items-center gap-2 px-4 py-2.5 rounded-xl bg-bg-card/60 backdrop-blur-xl border border-border-light hover:bg-bg-lighter/50 transition-all shadow-sm text-xs font-bold text-text-main"
                        >
                            <svg className="w-4 h-4 text-text-muted group-hover:text-primary transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                            </svg>
                            {t('dashboard.reset')}
                        </button>
                    </div>

                    <div className="flex-1 flex gap-6 min-h-0">
                        {/* Main Viewer (Center) */}
                        <div className="flex-[3] flex flex-col min-w-0 gap-6">
                            
                            {/* Control Bar (Glass Style) */}
                            <div className="flex items-center justify-between gap-6">
                                
                                {/* Left: View Mode + Diff Toggle */}
                                <div className="flex items-center gap-4">
                                    <div className="bg-bg-card/60 backdrop-blur-xl border border-border-light rounded-2xl p-1.5 flex items-center gap-2 shadow-sm h-[52px] pl-4">
                                        {/* Added Label */}
                                        <span className="text-xs font-bold text-text-muted">{t('dashboard.compareMode')}</span>
                                        <div className="w-px h-4 bg-gray-300 dark:bg-white/10"></div>
                                        
                                        {[
                                            { 
                                                mode: ViewMode.SIDE_BY_SIDE, 
                                                label: t('dashboard.viewSide'),
                                                icon: (
                                                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h4a2 2 0 012 2v12a2 2 0 01-2 2H6a2 2 0 01-2-2V6zm10 0a2 2 0 012-2h4a2 2 0 012 2v12a2 2 0 01-2 2h-4a2 2 0 01-2-2V6z" />
                                                    </svg>
                                                ) 
                                            },
                                            { 
                                                mode: ViewMode.OVERLAY, 
                                                label: t('dashboard.viewOverlay'),
                                                icon: (
                                                     <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                                                    </svg>
                                                )
                                            },
                                            { 
                                                mode: ViewMode.SLIDER, 
                                                label: t('dashboard.viewSwipe'),
                                                icon: (
                                                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
                                                    </svg>
                                                )
                                            }
                                        ].map((opt) => (
                                            <button
                                                key={opt.mode}
                                                onClick={() => setViewMode(opt.mode)}
                                                title={opt.label}
                                                className={`w-12 h-full flex items-center justify-center rounded-xl transition-all ${viewMode === opt.mode ? 'bg-bg-lighter/80 text-text-main shadow-sm' : 'text-text-muted hover:text-text-main hover:bg-bg-lighter/30'}`}
                                            >
                                                {opt.icon}
                                            </button>
                                        ))}
                                    </div>

                                    <div className="bg-bg-card/60 backdrop-blur-xl border border-border-light rounded-2xl px-4 py-2 flex items-center gap-3 shadow-sm h-[52px]">
                                        <span className="text-xs font-bold text-text-muted">{t('dashboard.showDiff')}</span>
                                        <button 
                                            onClick={() => setShowDiffBoxes(!showDiffBoxes)}
                                            className={`w-10 h-6 rounded-full relative transition-colors duration-300 ${showDiffBoxes ? 'bg-primary' : 'bg-bg-lighter/50 border border-border-light'}`}
                                        >
                                            <div className={`absolute top-1 left-1 w-4 h-4 rounded-full bg-white shadow-sm transition-transform duration-300 ${showDiffBoxes ? 'translate-x-4' : 'translate-x-0'}`}></div>
                                        </button>
                                    </div>
                                </div>

                                {/* Right: Sensitivity + Re-analyze */}
                                <div className="flex items-center gap-4">
                                    <div className="bg-bg-card/60 backdrop-blur-xl border border-border-light rounded-2xl p-1.5 flex items-center gap-3 shadow-sm h-[52px] px-4">
                                         <span className="text-xs font-bold text-text-muted">{t('dashboard.sensitivity')}</span>
                                         <div className="flex bg-bg-lighter/50 rounded-xl p-1">
                                            {[1, 2, 3, 4, 5].map(level => (
                                                <button
                                                    key={level}
                                                    onClick={() => setSensitivityLevel(level as any)}
                                                    className={`w-8 h-8 rounded-lg text-xs font-bold transition-all ${
                                                        sensitivityLevel === level 
                                                        ? 'bg-bg-card text-primary shadow-sm border border-border-light' 
                                                        : 'text-text-muted hover:text-text-main hover:bg-bg-card/50'
                                                    }`}
                                                >
                                                    {level}
                                                </button>
                                            ))}
                                         </div>
                                    </div>

                                    <button 
                                        onClick={() => runFullAnalysis(sensitivityLevel)}
                                        className="h-[52px] px-6 bg-primary hover:bg-primary-hover text-white rounded-2xl font-bold text-xs shadow-glow transition-all flex items-center gap-2 active:scale-95"
                                    >
                                         <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                             <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                                         </svg>
                                         {t('dashboard.reanalyze')}
                                    </button>
                                </div>
                            </div>

                            {/* Viewer Card - Keeps opaque background for better visibility of design */}
                            <div className="flex-1 dashboard-card overflow-hidden relative shadow-2xl">
                                 <ComparisonView 
                                    designImage={designImage || ''}
                                    devImage={displayDevImage}
                                    diffImage={comparisonResult?.diffImageUrl || ''}
                                    viewMode={viewMode}
                                    issues={visualIssues}
                                    selectedIssueId={selectedIssueId}
                                    onBoxClick={handleBoxClick}
                                    showBoxes={showDiffBoxes}
                                />
                            </div>
                        </div>

                        {/* Right Analysis Panel - Container is transparent, items are glass */}
                        <div className="w-[340px] shrink-0 flex flex-col gap-6">
                            <AnalysisPanel 
                                loading={isAnalyzing} 
                                result={analysisResult} 
                                pixelScore={analysisResult?.score || 0}
                                onSelectIssue={handleIssueSelect}
                                selectedIssueId={selectedIssueId}
                                designImageWidth={comparisonResult?.width || 375}
                            />
                            
                            {/* Report Button - Glass */}
                            {analysisResult && (
                                 <div className="bg-bg-card/60 backdrop-blur-xl border border-border-light rounded-3xl p-6 flex flex-col gap-4 shadow-card">
                                     <div className="flex items-center justify-between">
                                         <div className="text-sm font-bold text-text-main">完整报告</div>
                                         <span className="text-xs text-primary font-bold">PDF</span>
                                     </div>
                                     <p className="text-xs text-text-muted leading-relaxed">
                                         {language === 'zh' ? '生成包含 AI 建议的详细差异分析报告。' : 'Generate detailed report with AI suggestions.'}
                                     </p>
                                     <button 
                                         onClick={() => setActiveTab('report')}
                                         className="w-full py-3 bg-text-main text-bg-main font-bold rounded-xl hover:opacity-90 transition-opacity"
                                     >
                                         {language === 'zh' ? '查看报告' : 'View Report'}
                                     </button>
                                 </div>
                            )}
                        </div>
                    </div>
                 </div>
             )}

            {/* Report Tab - Transparent background to show animation */}
            {activeTab === 'report' && analysisResult && designImage && displayDevImage && comparisonResult && (
                <div className="flex-1 h-full overflow-hidden animate-fade-in relative z-20">
                    <ReportView 
                        result={analysisResult}
                        designImage={designImage}
                        designFileName={designFileName}
                        devImage={displayDevImage}
                        onClose={() => setActiveTab('analysis')}
                        canvasWidth={comparisonResult.width}
                        canvasHeight={comparisonResult.height}
                    />
                </div>
            )}

          </div>
      </div>
    </div>
  );
};

export default App;
