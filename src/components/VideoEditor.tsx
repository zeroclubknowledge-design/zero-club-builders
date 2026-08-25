import React, { useState, useRef, useEffect, useCallback } from 'react';
import { X, Scissors, Play, Pause, Loader2, Check, ChevronLeft, Brush, Crop, Wand2, RefreshCw } from "@/components/icons/solar";
import { toast } from 'sonner';

interface VideoEditorProps {
  videoSrc: string;
  onSave: (editedBlob: Blob) => void;
  onCancel: () => void;
}

/*
 * Grades, not effects.
 *
 * The old set was the CSS-filter tutorial list: sepia(100%), grayscale(100%),
 * hue-rotate(180deg). Each is a single property pushed to its maximum, which
 * is why they read as novelty — a full hue rotation turns skin green, and
 * sepia at 100% is a photo booth, not a look.
 *
 * These are built the way a colour grade is: a small contrast move, a small
 * saturation move, and a temperature shift, none of them near their limit. The
 * point of a filter is that the footage still looks like the room it was shot
 * in, only better.
 */
const FILTERS = [
  { name: 'Original', value: 'none' },
  // Slightly brighter, slightly crisper. The one most clips actually want.
  { name: 'Clean', value: 'contrast(106%) saturate(105%) brightness(103%)' },
  // Warmth without the orange cast of sepia.
  { name: 'Warm', value: 'sepia(18%) saturate(118%) contrast(104%) brightness(103%)' },
  // Cool without rotating hues; a touch of blue via reduced warmth.
  { name: 'Cool', value: 'saturate(92%) contrast(107%) brightness(102%) hue-rotate(-6deg)' },
  // Deep and contrasty, for screen recordings and dark rooms.
  { name: 'Bold', value: 'contrast(122%) saturate(124%) brightness(98%)' },
  // Lifted blacks and low saturation — the faded film look.
  { name: 'Faded', value: 'contrast(90%) saturate(82%) brightness(107%) sepia(12%)' },
  // Monochrome that keeps its midtones instead of crushing to pure grey.
  { name: 'Mono', value: 'grayscale(100%) contrast(112%) brightness(103%)' },
  // High-key monochrome, for text-heavy screen captures.
  { name: 'Ink', value: 'grayscale(100%) contrast(135%) brightness(108%)' },
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
  // Read inside the render loop, where state would be a stale closure value.
  const processingRef = useRef(false);
  const stripRef = useRef<HTMLDivElement>(null);
  const draggingRef = useRef<'start' | 'end' | null>(null);

  /*
   * Move one end of the selection, keeping half a second between them so the
   * clip can never collapse to nothing, and show the frame being chosen —
   * trimming blind is guesswork.
   */
  const scrubTo = useCallback((seconds: number, handle: 'start' | 'end') => {
    const clamped = Math.max(0, Math.min(duration, seconds));
    if (handle === 'start') {
      const next = Math.min(clamped, endTime - 0.5);
      if (next < 0) return;
      setStartTime(next);
      if (videoRef.current) videoRef.current.currentTime = next;
      setCurrentTime(next);
      return;
    }
    const next = Math.max(clamped, startTime + 0.5);
    if (next > duration) return;
    setEndTime(next);
    if (videoRef.current) videoRef.current.currentTime = next;
    setCurrentTime(next);
  }, [duration, startTime, endTime]);

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

    processingRef.current = true;
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

    /*
     * Carry the sound across.
     *
     * A canvas stream is pictures only, and the source video was being muted
     * on top of that, so every trimmed clip came out silent — you could edit a
     * video of someone talking and publish it with the talking removed.
     * captureStream on the source element exposes its audio track, which is
     * added to the recording alongside the drawn frames.
     */
    try {
      const sourceStream = (video as any).captureStream?.() || (video as any).mozCaptureStream?.();
      sourceStream?.getAudioTracks?.().forEach((track: MediaStreamTrack) => stream.addTrack(track));
    } catch {
      // No audio track available; the clip is silent because the source was.
    }

    // MP4 first: Safari cannot record WebM at all, and plenty of places cannot
    // play it back. WebM stays as the fallback for browsers without MP4.
    const mimeType = [
      'video/mp4;codecs=avc1',
      'video/mp4',
      'video/webm;codecs=vp9,opus',
      'video/webm',
    ].find((type) => MediaRecorder.isTypeSupported(type)) || 'video/webm';

    const recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 2500000 });
    const chunks: Blob[] = [];

    recorder.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };
    recorder.onstop = () => {
      video.muted = false;
      const blob = new Blob(chunks, { type: mimeType });
      onSave(blob);
      processingRef.current = false;
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

    recorder.start(250);
    void video.play();

    /*
     * Why trimming produced a black clip.
     *
     * The loop below used to begin `if (!isProcessing) return`. isProcessing is
     * state, and setIsProcessing(true) three lines earlier had not applied yet
     * — a render has to happen first — so the closure captured `false` and the
     * loop returned before drawing a single frame. The recorder then ran for
     * the length of the clip over a canvas nothing was painting, and saved
     * exactly what it was given: nothing.
     *
     * A ref holds the current value rather than the value at the time the
     * closure was made, which is the whole reason refs exist.
     */
    const renderProcessLoop = () => {
      if (!processingRef.current) return;

      outCtx.drawImage(
        video,
        sx, sy, targetWidth, targetHeight,
        0, 0, targetWidth, targetHeight,
      );

      if (video.currentTime >= endTime) {
        video.pause();
        if (recorder.state !== 'inactive') recorder.stop();
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
                {/* The one you are holding grows, so there is no doubt about
                    which end you are moving. */}
                <div
                  className={`absolute z-20 flex h-full items-center justify-center rounded-l-md bg-white shadow-lg transition-[width] ${activeHandle === 'start' ? 'w-5' : 'w-4'}`}
                  style={{ left: `${(startTime / duration) * 100}%`, marginLeft: '-2px' }}
                >
                  <div className="h-6 w-0.5 rounded-full bg-black/50" />
                </div>
                <div
                  className={`absolute z-20 flex h-full items-center justify-center rounded-r-md bg-white shadow-lg transition-[width] ${activeHandle === 'end' ? 'w-5' : 'w-4'}`}
                  style={{ left: `${(endTime / duration) * 100}%`, marginLeft: '-14px' }}
                >
                  <div className="h-6 w-0.5 rounded-full bg-black/50" />
                </div>

                {/* Playhead Scrubber */}
                <div 
                  className="absolute h-full w-0.5 bg-white z-30 shadow-[0_0_8px_rgba(255,255,255,0.8)] pointer-events-none transition-all duration-75"
                  style={{ left: `${(currentTime / duration) * 100}%` }}
                />

                {/*
                  One surface, and it grabs the handle you reached for.

                  This was two invisible range inputs, each stretched across the
                  entire strip and stacked on top of each other. Whichever sat
                  higher swallowed every touch, so reaching for the left handle
                  regularly moved the right one — and because a range input
                  jumps to wherever you press, the handle teleported instead of
                  dragging. That is the whole of "trim is not working properly".

                  Now the pointer position decides: whichever handle is nearer
                  the place you pressed is the one that moves, and it moves with
                  your finger from where it already was.
                */}
                <div
                  ref={stripRef}
                  onPointerDown={(event) => {
                    if (!duration) return;
                    const rect = event.currentTarget.getBoundingClientRect();
                    const at = ((event.clientX - rect.left) / rect.width) * duration;
                    const handle = Math.abs(at - startTime) <= Math.abs(at - endTime) ? 'start' : 'end';
                    setActiveHandle(handle);
                    draggingRef.current = handle;
                    event.currentTarget.setPointerCapture(event.pointerId);
                    scrubTo(at, handle);
                  }}
                  onPointerMove={(event) => {
                    if (!draggingRef.current || !duration) return;
                    const rect = event.currentTarget.getBoundingClientRect();
                    const at = ((event.clientX - rect.left) / rect.width) * duration;
                    scrubTo(at, draggingRef.current);
                  }}
                  onPointerUp={(event) => {
                    draggingRef.current = null;
                    event.currentTarget.releasePointerCapture(event.pointerId);
                  }}
                  onPointerCancel={() => { draggingRef.current = null; }}
                  className="absolute inset-0 z-40 cursor-ew-resize touch-none"
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
                    loading="lazy" decoding="async" />
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
