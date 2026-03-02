
import React, { useState, useRef, useEffect, useLayoutEffect } from 'react';
import { ViewMode, Issue } from '../types';
import { useConfig } from '../contexts/ConfigContext';

interface ComparisonViewProps {
  designImage: string;
  devImage: string;
  diffImage: string;
  viewMode: ViewMode;
  issues?: Issue[];
  selectedIssueId?: string;
  onBoxClick?: (issueId: string) => void;
  showBoxes?: boolean;
}

const ComparisonView: React.FC<ComparisonViewProps> = ({ 
  designImage, 
  devImage, 
  diffImage, 
  viewMode,
  issues = [],
  selectedIssueId,
  onBoxClick,
  showBoxes = true
}) => {
  const { t } = useConfig();
  const [opacity, setOpacity] = useState(50);
  const [isBlinking, setIsBlinking] = useState(false);
  
  // Slider State
  const [sliderPos, setSliderPos] = useState(50);
  const [isResizingSlider, setIsResizingSlider] = useState(false);
  const imageWrapperRef = useRef<HTMLDivElement>(null);

  // Zoom & Pan State
  const [scale, setScale] = useState(1);
  const [baseScale, setBaseScale] = useState(1);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  
  // Ref to lock scale after initial calculation
  const isScaleLocked = useRef(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const [designSize, setDesignSize] = useState<{w: number, h: number} | null>(null);
  const [devSize, setDevSize] = useState<{w: number, h: number} | null>(null);

  // Transition Guard
  const prevViewModeRef = useRef(viewMode);
  // Force update trigger
  const [, forceUpdate] = useState({});

  const effectiveScale = baseScale * scale;

  const handleDesignLoad = (e: React.SyntheticEvent<HTMLImageElement>) => {
    const img = e.currentTarget;
    setDesignSize({ w: img.naturalWidth, h: img.naturalHeight });
  };

  const handleDevLoad = (e: React.SyntheticEvent<HTMLImageElement>) => {
    const img = e.currentTarget;
    setDevSize({ w: img.naturalWidth, h: img.naturalHeight });
  };

  const calculateScale = (natW: number, natH: number) => {
    // If we have already locked the scale (calculated once), do not update on resize
    if (isScaleLocked.current) return;

    if (containerRef.current) {
       const ch = containerRef.current.clientHeight;
       if (ch === 0) return;

       const padding = 40; 
       
       // Strict Height-based scaling as requested
       // This calculates the scale factor so the image height fits exactly within the container height (minus padding)
       // Width is ignored, meaning wide images might exceed the container width (pan required).
       const fitScale = (ch - padding) / natH;
       
       setBaseScale(fitScale);
       isScaleLocked.current = true;
    }
  };

  // Synchronous Layout Effect to handle View Mode switching
  useLayoutEffect(() => {
    // 1. Reset Zoom/Pan & Lock
    setScale(1);
    setPosition({ x: 0, y: 0 });
    setSliderPos(50);
    isScaleLocked.current = false; // Allow calculation again for new view/images

    // 2. Calculate new Base Scale for the new layout
    if (containerRef.current && (designSize || devSize)) {
       const target = designSize || devSize;
       if (target) calculateScale(target.w, target.h);
    }

    // 3. Mark transition as complete
    if (prevViewModeRef.current !== viewMode) {
        prevViewModeRef.current = viewMode;
        forceUpdate({}); 
    }
  }, [viewMode, designImage, devImage, designSize, devSize]);

  // Observer for window resizing
  useLayoutEffect(() => {
    const updateScale = () => {
       if (containerRef.current && (designSize || devSize)) {
         const target = designSize || devSize;
         if (target) calculateScale(target.w, target.h);
       }
    };
    const resizeObserver = new ResizeObserver(() => updateScale());
    if (containerRef.current) resizeObserver.observe(containerRef.current);
    return () => resizeObserver.disconnect();
  }, [designSize, devSize, viewMode]);


  const handleWheel = (e: React.WheelEvent) => {
    e.stopPropagation(); 
    e.preventDefault();
    const sensitivity = 0.001;
    const delta = -e.deltaY * sensitivity;
    const newScale = Math.min(Math.max(0.1, scale + delta), 20); 
    setScale(newScale);
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    if (isResizingSlider) return;
    setIsDragging(true);
    setDragStart({ x: e.clientX - position.x, y: e.clientY - position.y });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (isDragging) {
      setPosition({ x: e.clientX - dragStart.x, y: e.clientY - dragStart.y });
    }
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  const handleSliderMouseDown = (e: React.MouseEvent) => {
    e.stopPropagation(); 
    setIsResizingSlider(true);
  };

  useEffect(() => {
    const handleGlobalMouseUp = () => setIsResizingSlider(false);
    const handleGlobalMouseMove = (e: MouseEvent) => {
        if (!isResizingSlider || !imageWrapperRef.current) return;
        const rect = imageWrapperRef.current.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const newPos = Math.max(0, Math.min(100, (x / rect.width) * 100));
        setSliderPos(newPos);
    };

    if (isResizingSlider) {
        window.addEventListener('mouseup', handleGlobalMouseUp);
        window.addEventListener('mousemove', handleGlobalMouseMove);
    }
    return () => {
        window.removeEventListener('mouseup', handleGlobalMouseUp);
        window.removeEventListener('mousemove', handleGlobalMouseMove);
    };
  }, [isResizingSlider]);


  const renderBoxes = (containerSize: {w: number, h: number} | null, type: 'design' | 'dev', zIndexClass: string = 'z-30') => {
    if (!showBoxes || !containerSize) return null;
    const safeScale = Math.max(effectiveScale, 0.001);
    const inverseScale = 1 / safeScale;
    
    const VISUAL_BORDER_WIDTH = 2;
    const VISUAL_BADGE_SIZE = 24;
    const VISUAL_BADGE_FONT = 11;

    return (
       <div className={`absolute inset-0 pointer-events-none ${zIndexClass}`}>
          {issues.map((issue, idx) => {
             const box = type === 'design' ? issue.designBox : issue.relatedBox;
             if (!box) return null;

             const isHighlight = selectedIssueId === issue.id;
             const issueNumber = idx + 1;
             
             const borderWidth = (isHighlight ? VISUAL_BORDER_WIDTH * 2 : VISUAL_BORDER_WIDTH) * inverseScale;
             const badgeSize = (isHighlight ? VISUAL_BADGE_SIZE * 1.25 : VISUAL_BADGE_SIZE) * inverseScale;
             const badgeFontSize = VISUAL_BADGE_FONT * inverseScale;
             
             const badgeTop = -badgeSize;
             const badgeLeft = -badgeSize / 2;

             const baseStyle = type === 'design' 
                ? 'border-primary/80 bg-primary/10 hover:bg-primary/20 hover:border-primary' 
                : 'border-accent-orange/80 bg-accent-orange/10 hover:bg-accent-orange/20 hover:border-accent-orange';

             const highlightStyle = type === 'design'
                ? 'border-primary bg-primary/30 shadow-[0_0_20px_rgba(61,92,255,0.6)] z-50'
                : 'border-accent-orange bg-accent-orange/30 shadow-[0_0_20px_rgba(255,159,45,0.6)] z-50';

             const badgeColor = type === 'design' ? 'bg-primary' : 'bg-accent-orange';

             return (
               <div
                 key={`${issue.id}-${type}`}
                 onClick={(e) => { e.stopPropagation(); onBoxClick?.(issue.id); }}
                 style={{
                   position: 'absolute',
                   left: `${(box.x / containerSize.w) * 100}%`,
                   top: `${(box.y / containerSize.h) * 100}%`,
                   width: `${(box.width / containerSize.w) * 100}%`,
                   height: `${(box.height / containerSize.h) * 100}%`,
                   borderWidth: `${borderWidth}px`,
                 }}
                 className={`
                    transition-colors duration-200 pointer-events-auto cursor-pointer rounded border-solid
                    ${isHighlight ? highlightStyle : baseStyle}
                    z-40
                 `}
               >
                 <div 
                    style={{
                        width: `${badgeSize}px`,
                        height: `${badgeSize}px`,
                        fontSize: `${badgeFontSize}px`,
                        top: `${badgeTop}px`,
                        left: `${badgeLeft}px`,
                    }}
                    className={`
                        absolute rounded-full ${badgeColor} text-white font-bold flex items-center justify-center shadow-lg z-50 leading-none
                 `}>
                    {issueNumber}
                 </div>
               </div>
             );
          })}
       </div>
    );
  };

  const commonTransformStyle: React.CSSProperties = {
     transform: `translate(${position.x}px, ${position.y}px) scale(${effectiveScale})`,
     transformOrigin: 'center center',
     transition: isDragging || isResizingSlider ? 'none' : 'transform 0.1s ease-out',
     cursor: isDragging ? 'grabbing' : isResizingSlider ? 'col-resize' : 'grab',
  };

  const containerBg = "bg-gray-100 dark:bg-[#111116] bg-[radial-gradient(#ccc_1px,transparent_1px)] dark:bg-[radial-gradient(#222_1px,transparent_1px)] bg-[length:20px_20px]";
  const isTransitioning = prevViewModeRef.current !== viewMode;
  const contentOpacity = isTransitioning ? 'opacity-0' : 'opacity-100';

  return (
    <div ref={containerRef} className={`relative h-full w-full flex flex-col ${containerBg}`}>
      {/* 1. SIDE BY SIDE */}
      {viewMode === ViewMode.SIDE_BY_SIDE && (
          <div 
            className={`grid grid-cols-2 h-full w-full overflow-hidden select-none touch-none transition-opacity duration-150 ${contentOpacity}`}
            onWheel={handleWheel}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
          >
            <div className="relative h-full w-full flex flex-col overflow-hidden border-r border-gray-300 dark:border-white/10 shadow-[1px_0_10px_rgba(0,0,0,0.05)] z-10">
                <div className="absolute top-4 left-4 z-10 glass-panel px-3 py-1.5 rounded-lg text-[10px] text-text-main font-bold tracking-wide pointer-events-none flex items-center gap-2 shadow-sm">
                  <span className="w-2 h-2 rounded-full bg-primary"></span>
                  {t('dashboard.designLabel')}
                </div>
                <div className="relative w-full h-full flex items-center justify-center overflow-hidden">
                  <div style={commonTransformStyle} className="relative inline-block">
                    <img src={designImage} alt="Design" onLoad={handleDesignLoad} className="block pointer-events-none select-none rounded shadow-2xl" draggable={false} />
                    {renderBoxes(designSize, 'design')}
                  </div>
                </div>
            </div>
            <div className="relative h-full w-full flex flex-col overflow-hidden">
                <div className="absolute top-4 left-4 z-10 glass-panel px-3 py-1.5 rounded-lg text-[10px] text-text-main font-bold tracking-wide pointer-events-none flex items-center gap-2 shadow-sm">
                  <span className="w-2 h-2 rounded-full bg-accent-orange"></span>
                  {t('dashboard.devLabel')}
                </div>
                <div className="relative w-full h-full flex items-center justify-center overflow-hidden">
                   <div style={commonTransformStyle} className="relative inline-block pointer-events-none">
                      <img src={devImage} alt="Development" onLoad={handleDevLoad} className="block rounded shadow-2xl" draggable={false} />
                      {renderBoxes(devSize, 'dev')}
                   </div>
                </div>
            </div>
          </div>
      )}

      {/* 2. SLIDER */}
      {viewMode === ViewMode.SLIDER && (
           <div className={`relative h-full w-full flex flex-col transition-opacity duration-150 ${contentOpacity}`}>
             <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-50 flex justify-center pointer-events-none">
                 <div className="flex gap-4 pointer-events-auto items-center glass-panel px-4 py-2 rounded-full shadow-float border border-white/10 bg-black/60 backdrop-blur-xl">
                      <span className="text-[10px] font-bold text-primary flex items-center gap-1.5">
                          <span className="w-1.5 h-1.5 rounded-full bg-primary"></span>
                          {t('dashboard.designLabel')}
                      </span>
                      <span className="text-white/20">|</span>
                      <span className="text-[10px] font-bold text-accent-orange flex items-center gap-1.5">
                          {t('dashboard.devLabel')}
                          <span className="w-1.5 h-1.5 rounded-full bg-accent-orange"></span>
                      </span>
                 </div>
             </div>

             <div 
                className="flex-1 w-full h-full overflow-hidden cursor-move flex items-center justify-center select-none touch-none"
                onWheel={handleWheel}
                onMouseDown={handleMouseDown}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
                onMouseLeave={handleMouseUp}
            >
                <div ref={imageWrapperRef} style={commonTransformStyle} className="relative shadow-2xl inline-block">
                    <img src={devImage} alt="Dev Base" onLoad={handleDevLoad} className="block rounded pointer-events-none select-none" draggable={false} />
                    {renderBoxes(devSize, 'dev', 'z-0')}
                    <div className="absolute inset-0 z-10 pointer-events-none" style={{ clipPath: `inset(0 ${100 - sliderPos}% 0 0)` }}>
                        <img src={designImage} alt="Design Overlay" className="block rounded w-full h-full" draggable={false} />
                        {renderBoxes(designSize, 'design')}
                    </div>
                    <div 
                        className="absolute top-0 bottom-0 z-20 w-0.5 bg-white cursor-col-resize hover:shadow-[0_0_15px_rgba(255,255,255,0.8)] transition-shadow"
                        style={{ left: `${sliderPos}%` }}
                        onMouseDown={handleSliderMouseDown}
                    >
                         <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-white shadow-xl flex items-center justify-center border-2 border-black/10">
                             <svg className="w-4 h-4 text-black" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                 <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 9l4-4 4 4m0 6l-4 4-4-4" />
                             </svg>
                         </div>
                    </div>
                </div>
            </div>
        </div>
      )}

      {/* 3. OVERLAY */}
      {viewMode === ViewMode.OVERLAY && (
          <div className={`relative h-full w-full flex flex-col transition-opacity duration-150 ${contentOpacity}`}>
            <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-50 flex justify-center pointer-events-none">
               <div className="flex gap-6 pointer-events-auto items-center glass-panel px-6 py-3 rounded-full shadow-float border border-white/10 bg-black/60 backdrop-blur-xl">
                   <div className="flex items-center gap-3">
                      <span className="text-[10px] text-text-muted uppercase font-bold tracking-wider">{t('dashboard.opacity')}</span>
                      <input 
                        type="range" min="0" max="100" value={opacity} 
                        onChange={(e) => setOpacity(Number(e.target.value))}
                        className="w-32 h-1 bg-white/20 rounded-lg appearance-none cursor-pointer accent-primary"
                      />
                   </div>
                   <div className="w-px h-4 bg-white/10"></div>
                   <button
                      onMouseDown={() => setIsBlinking(true)}
                      onMouseUp={() => setIsBlinking(false)}
                      onMouseLeave={() => setIsBlinking(false)}
                      className="text-white hover:text-primary transition-colors text-xs font-bold flex items-center gap-2 select-none"
                   >
                      <div className="relative flex h-2 w-2">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-2 w-2 bg-primary"></span>
                      </div>
                      {t('dashboard.blink')}
                   </button>
               </div>
            </div>

            <div 
               className="flex-1 w-full h-full overflow-hidden cursor-move flex items-center justify-center select-none touch-none"
               onWheel={handleWheel}
               onMouseDown={handleMouseDown}
               onMouseMove={handleMouseMove}
               onMouseUp={handleMouseUp}
               onMouseLeave={handleMouseUp}
            >
              <div style={commonTransformStyle} className="relative shadow-2xl inline-block pointer-events-none">
                <img src={designImage} alt="Base Design" onLoad={handleDesignLoad} className="block rounded" draggable={false} />
                {renderBoxes(designSize, 'design')}
                <div className="absolute top-0 left-0 z-10" style={{ opacity: isBlinking ? 0 : opacity / 100 }}>
                   <img src={devImage} alt="Overlay Dev" className="block rounded" draggable={false} />
                    {renderBoxes(devSize, 'dev')}
                </div>
              </div>
            </div>
          </div>
      )}
    </div>
  );
};

export default ComparisonView;
