import React, { useState, useRef, useEffect, useCallback } from 'react';
import { X, Scissors, Play, Pause, Loader2, Check, ChevronLeft, Brush, Crop, Wand2, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';

interface VideoEditorProps {
  videoSrc: string;
  onSave: (editedBlob: Blob) => void;
  onCancel: () => void;
}

const FILTERS = [
  { name: 'Normal', value: 'none' },
  { name: 'Sepia', value: 'sepia(100%)' },
  { name: 'B&W', value: 'grayscale(100%)' },
  { name: 'Vintage', value: 'sepia(50%) hue-rotate(-30deg) saturate(140%) contrast(110%)' },
  { name: 'Punchy', value: 'contrast(130%) saturate(130%)' },
  { name: 'Cool', value: 'hue-rotate(180deg) saturate(120%)' }
];

const ASPECT_RATIOS = [
  { name: 'Original', value: null },
  { name: '1:1', value: 1 },
  { name: '4:5', value: 4/5 },
  { name: '16:9', value: 16/9 },
  { name: '9:16', value: 9/16 }
];

export function VideoEditor({ videoSrc, onSave, onCancel }: VideoEditorProps) {
  const [activeTab, setActiveTab] = useState<'trim' | 'crop' | 'filter'>('trim');
  
  // Video Metadata
  const [duration, setDuration] = useState(0);
  const [naturalWidth, setNaturalWidth] = useState(0);
  const [naturalHeight, setNaturalHeight] = useState(0);
  
  // Trimming State
  const [startTime, setStartTime] = useState(0);
  const [endTime, setEndTime] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [activeHandle, setActiveHandle] = useState<'start' | 'end'>('start');

  // Filter State
  const [activeFilter, setActiveFilter] = useState(FILTERS[0]);

  // Crop State
  const [aspectRatio, setAspectRatio] = useState<number | null>(null);

  // Processing State
  const [isProcessing, setIsProcessing] = useState(false);
  
  const videoRef = useRef<HTMLVideoElement>(null);
  const previewCanvasRef = useRef<HTMLCanvasElement>(null);

  // Load video metadata
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const handleLoadedMetadata = () => {
      setDuration(video.duration);
      setEndTime(video.duration);
      setNaturalWidth(video.videoWidth);
      setNaturalHeight(video.videoHeight);
    };

    video.addEventListener('loadedmetadata', handleLoadedMetadata);
    return () => video.removeEventListener('loadedmetadata', handleLoadedMetadata);
  }, []);

  // Sync canvas preview with video time
  const drawPreview = useCallback(() => {
    const video = videoRef.current;
    const canvas = previewCanvasRef.current;
    if (!video || !canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Set canvas dimensions based on aspect ratio
    let targetWidth = naturalWidth;
    let targetHeight = naturalHeight;
    
    if (aspectRatio) {
      if (naturalWidth / naturalHeight > aspectRatio) {
        // Video is wider than target aspect ratio (crop sides)
        targetWidth = naturalHeight * aspectRatio;
      } else {
        // Video is taller than target aspect ratio (crop top/bottom)
        targetHeight = naturalWidth / aspectRatio;
      }
    }

    canvas.width = targetWidth;
    canvas.height = targetHeight;

    // Calculate source cropping coordinates (center crop)
    const sx = (naturalWidth - targetWidth) / 2;
    const sy = (naturalHeight - targetHeight) / 2;

    // Apply Filter
    ctx.filter = activeFilter.value;
    
    // Draw
    ctx.drawImage(
      video,
      sx, sy, targetWidth, targetHeight,
      0, 0, targetWidth, targetHeight
    );

  }, [naturalWidth, naturalHeight, aspectRatio, activeFilter]);

  // Handle Playback Loop
  useEffect(() => {
    let animationFrameId: number;
    
    const renderLoop = () => {
      if (videoRef.current) {
        setCurrentTime(videoRef.current.currentTime);
        drawPreview();
        
        if (videoRef.current.currentTime >= endTime && isPlaying) {
          videoRef.current.pause();
          setIsPlaying(false);
          videoRef.current.currentTime = startTime;
        }
      }
      animationFrameId = requestAnimationFrame(renderLoop);
    };

    renderLoop();
    return () => cancelAnimationFrame(animationFrameId);
  }, [endTime, startTime, isPlaying, drawPreview]);

  const togglePlay = () => {
    if (videoRef.current) {
      if (isPlaying) {
        videoRef.current.pause();
      } else {
        if (videoRef.current.currentTime >= endTime) {
          videoRef.current.currentTime = startTime;
        }
        videoRef.current.play();
      }
      setIsPlaying(!isPlaying);
    }
  };

  const handleSave = async () => {
    const video = videoRef.current;
    if (!video || isProcessing) return;

    setIsProcessing(true);
    setIsPlaying(false);
    video.pause();

    // Create a dedicated rendering canvas for output to avoid UI judder
    const outCanvas = document.createElement('canvas');
    const outCtx = outCanvas.getContext('2d');
    
    if (!outCtx) {
      toast.error("Canvas context not supported.");
      setIsProcessing(false);
      return;
    }

    // Set output dimensions
    let targetWidth = naturalWidth;
    let targetHeight = naturalHeight;
    
    if (aspectRatio) {
      if (naturalWidth / naturalHeight > aspectRatio) {
        targetWidth = naturalHeight * aspectRatio;
      } else {
        targetHeight = naturalWidth / aspectRatio;
      }
    }

    outCanvas.width = targetWidth;
    outCanvas.height = targetHeight;
    
    const sx = (naturalWidth - targetWidth) / 2;
    const sy = (naturalHeight - targetHeight) / 2;
    outCtx.filter = activeFilter.value;

    const stream = outCanvas.captureStream(30);
    const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9') 
      ? 'video/webm;codecs=vp9' 
      : 'video/webm';
      
    const recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 2500000 });
    const chunks: Blob[] = [];

    recorder.ondataavailable = (e) => chunks.push(e.data);
    recorder.onstop = () => {
      const blob = new Blob(chunks, { type: mimeType });
      onSave(blob);
      setIsProcessing(false);
    };

    // Prepare rendering loop
    video.currentTime = startTime;
    await new Promise(resolve => {
      const handler = () => {
        video.removeEventListener('seeked', handler);
        resolve(true);
      };
      video.addEventListener('seeked', handler);
    });

    recorder.start();
    video.play();
    video.muted = true; // Mute during processing if needed

    const renderProcessLoop = () => {
      if (!isProcessing) return; // aborted
      
      outCtx.drawImage(
        video,
        sx, sy, targetWidth, targetHeight,
        0, 0, targetWidth, targetHeight
      );

      if (video.currentTime >= endTime) {
        video.pause();
        recorder.stop();
      } else {
        requestAnimationFrame(renderProcessLoop);
      }
    };
    
    renderProcessLoop();
  };

  return (
    <div className="fixed inset-0 z-[200] flex flex-col bg-black text-white animate-in slide-in-from-bottom-full duration-300">
      {/* Header */}
      <header className="flex items-center justify-between px-4 pb-3 pt-[calc(0.75rem+env(safe-area-inset-top))] z-50 bg-gradient-to-b from-black/80 to-transparent">
        <button onClick={onCancel} className="p-2 transition active:opacity-50">
          <X className="h-6 w-6" />
        </button>
        <h2 className="text-sm text-white/90">
          {activeTab}
        </h2>
        <button 
          onClick={handleSave} 
          disabled={isProcessing}
          className="px-4 py-1.5 rounded-full bg-white text-black font-bold text-sm shadow-lg transition active:scale-95 disabled:opacity-50 flex items-center gap-2"
        >
          {isProcessing ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Save'}
        </button>
      </header>

      {/* Main Preview Area */}
      <div className="flex-1 relative flex flex-col items-center justify-center overflow-hidden bg-[#111] p-4">
        {/* Hidden Source Video */}
        <video 
          ref={videoRef}
          src={videoSrc}
          className="hidden"
          playsInline
          loop={false}
          crossOrigin="anonymous"
        />
        
        {/* Rendered Preview Canvas */}
        <div className="relative max-h-full max-w-full rounded-2xl overflow-hidden shadow-2xl border border-white/10 group cursor-pointer" onClick={togglePlay}>
          <canvas 
            ref={previewCanvasRef} 
            className="max-h-[65vh] max-w-full object-contain bg-black"
          />
          
          {/* Play/Pause Overlay */}
          {!isPlaying && !isProcessing && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/20 backdrop-blur-[2px] transition-all">
              <div className="h-16 w-16 rounded-full bg-black/40 backdrop-blur-md border border-white/20 flex items-center justify-center transition hover:bg-black/60 shadow-xl">
                <Play className="h-8 w-8 fill-white ml-1" />
              </div>
            </div>
          )}
          
          {isProcessing && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/80 backdrop-blur-sm z-10">
              <Loader2 className="h-10 w-10 animate-spin text-white mb-4" />
              <p className="text-xs">Exporting Video...</p>
            </div>
          )}
        </div>
      </div>

      {/* Tools Area */}
      <div className="h-[250px] bg-black border-t border-white/10 flex flex-col z-50">
        
        {/* Tool Content Area */}
        <div className="flex-1 relative">
          
          {/* TRIM TAB */}
          {activeTab === 'trim' && (
            <div className="absolute inset-0 flex flex-col items-center justify-center px-6 animate-in fade-in">
              <div className="w-full relative h-16 bg-white/5 rounded-xl border border-white/10 overflow-hidden flex items-center shadow-inner">
                {/* Simulated Filmstrip Background */}
                <div className="absolute inset-0 flex gap-1 opacity-20 pointer-events-none p-1">
                  {[...Array(15)].map((_, i) => (
                    <div key={i} className="flex-1 bg-white/20 rounded-[2px]" />
                  ))}
                </div>

                {/* Selection Overlay */}
                <div 
                  className="absolute h-full bg-[#1d9bf0]/30 border-y-2 border-[#1d9bf0] z-10"
                  style={{
                    left: `${(startTime / duration) * 100}%`,
                    width: `${((endTime - startTime) / duration) * 100}%`
                  }}
                />

                {/* Precision Handles */}
                <div 
                  className="absolute h-full w-4 bg-white rounded-l-md z-20 flex items-center justify-center shadow-lg"
                  style={{ left: `${(startTime / duration) * 100}%`, marginLeft: '-2px' }}
                >
                  <div className="w-0.5 h-6 bg-black/50 rounded-full" />
                </div>
                <div 
                  className="absolute h-full w-4 bg-white rounded-r-md z-20 flex items-center justify-center shadow-lg"
                  style={{ left: `${(endTime / duration) * 100}%`, marginLeft: '-14px' }}
                >
                  <div className="w-0.5 h-6 bg-black/50 rounded-full" />
                </div>

                {/* Playhead Scrubber */}
                <div 
                  className="absolute h-full w-0.5 bg-white z-30 shadow-[0_0_8px_rgba(255,255,255,0.8)] pointer-events-none transition-all duration-75"
                  style={{ left: `${(currentTime / duration) * 100}%` }}
                />

                {/* Hidden Range Inputs for Interaction */}
                <input 
                  type="range"
                  min={0}
                  max={duration || 100}
                  step={0.1}
                  value={startTime}
                  onMouseDown={() => setActiveHandle('start')}
                  onTouchStart={() => setActiveHandle('start')}
                  onChange={(e) => {
                    const val = parseFloat(e.target.value);
                    if (val < endTime - 0.5) {
                      setStartTime(val);
                      if (videoRef.current) {
                        videoRef.current.currentTime = val;
                        setCurrentTime(val);
                      }
                    }
                  }}
                  className={`absolute inset-0 w-full h-full opacity-0 cursor-ew-resize ${activeHandle ==='start' ? 'z-40' : 'z-30'}`}
                />
                <input 
                  type="range"
                  min={0}
                  max={duration || 100}
                  step={0.1}
                  value={endTime}
                  onMouseDown={() => setActiveHandle('end')}
                  onTouchStart={() => setActiveHandle('end')}
                  onChange={(e) => {
                    const val = parseFloat(e.target.value);
                    if (val > startTime + 0.5) {
                      setEndTime(val);
                      if (videoRef.current) {
                        videoRef.current.currentTime = val;
                        setCurrentTime(val);
                      }
                    }
                  }}
                  className={`absolute inset-0 w-full h-full opacity-0 cursor-ew-resize ${activeHandle ==='end' ? 'z-40' : 'z-30'}`}
                />
              </div>
              <div className="mt-4 text-xs font-bold text-white/50 tracking-wider">
                {(endTime - startTime).toFixed(1)}s selected
              </div>
            </div>
          )}

          {/* CROP TAB */}
          {activeTab === 'crop' && (
            <div className="absolute inset-0 flex items-center justify-center gap-4 px-6 overflow-x-auto no-scrollbar animate-in fade-in">
              {ASPECT_RATIOS.map(ratio => (
                <button
                  key={ratio.name}
                  onClick={() => setAspectRatio(ratio.value)}
                  className={`flex flex-col items-center gap-3 p-4 rounded-2xl transition active:scale-95 min-w-[80px] shrink-0 ${aspectRatio === ratio.value ?'bg-white/10 text-white' : 'text-white/50 hover:bg-white/5 hover:text-white/80'}`}
                >
                  <div className={`border-2 border-current rounded-md flex items-center justify-center
                    ${ratio.name ==='1:1' ? 'w-8 h-8' : 
                      ratio.name === '16:9' ? 'w-10 h-6' : 
                      ratio.name === '9:16' ? 'w-6 h-10' : 
                      ratio.name === '4:5' ? 'w-7 h-9' : 'w-9 h-7 border-dashed'}`} 
                  />
                  <span className="text-[10px]">{ratio.name}</span>
                </button>
              ))}
            </div>
          )}

          {/* FILTER TAB */}
          {activeTab === 'filter' && (
            <div className="absolute inset-0 flex items-center justify-start gap-4 px-6 overflow-x-auto no-scrollbar animate-in fade-in">
              {FILTERS.map(filter => (
                <button
                  key={filter.name}
                  onClick={() => setActiveFilter(filter)}
                  className={`flex flex-col items-center gap-3 p-3 rounded-2xl transition active:scale-95 min-w-[70px] shrink-0 ${activeFilter.name === filter.name ?'bg-white/10 text-white shadow-lg' : 'text-white/50 hover:bg-white/5'}`}
                >
                  <div 
                    className="w-12 h-12 rounded-full border-2 border-white/10 overflow-hidden bg-white/5 relative shadow-inner"
                    style={{ filter: filter.value }}
                  >
                    <img 
                      src="https://images.unsplash.com/photo-1550684848-fac1c5b4e853?q=80&w=200&auto=format&fit=crop" 
                      className="w-full h-full object-cover" 
                      alt="" 
                    />
                  </div>
                  <span className="text-[10px]">{filter.name}</span>
                </button>
              ))}
            </div>
          )}

        </div>

        {/* Tab Navigation */}
        <div className="flex items-center justify-around pb-8 pt-4 border-t border-white/10">
          <button 
            onClick={() => setActiveTab('trim')}
            className={`flex flex-col items-center gap-1.5 transition ${activeTab ==='trim' ? 'text-white' : 'text-white/40 hover:text-white/70'}`}
          >
            <Scissors className="h-5 w-5" strokeWidth={activeTab === 'trim' ? 2.5 : 2} />
            <span className="text-[10px]">Trim</span>
          </button>
          
          <button 
            onClick={() => setActiveTab('crop')}
            className={`flex flex-col items-center gap-1.5 transition ${activeTab ==='crop' ? 'text-white' : 'text-white/40 hover:text-white/70'}`}
          >
            <Crop className="h-5 w-5" strokeWidth={activeTab === 'crop' ? 2.5 : 2} />
            <span className="text-[10px]">Crop</span>
          </button>

          <button 
            onClick={() => setActiveTab('filter')}
            className={`flex flex-col items-center gap-1.5 transition ${activeTab ==='filter' ? 'text-white' : 'text-white/40 hover:text-white/70'}`}
          >
            <Wand2 className="h-5 w-5" strokeWidth={activeTab === 'filter' ? 2.5 : 2} />
            <span className="text-[10px]">Filters</span>
          </button>
        </div>
      </div>
    </div>
  );
}
