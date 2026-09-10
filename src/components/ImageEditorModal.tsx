import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Download, Save, Brush, Sparkles, Loader2, Undo, Trash2, Scissors } from 'lucide-react';
import { GoogleGenAI, Type } from "@google/genai";
import { cn } from '../lib/utils';
import { MaskedImage } from '../types';

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

interface Props {
  imageUrl: string;
  onClose: () => void;
  onSave: (maskedImage: MaskedImage) => void;
  onCrop?: (dataUrl: string) => void;
  initialMode?: 'mask' | 'crop';
}

export function ImageEditorModal({ imageUrl, onClose, onSave, onCrop, initialMode = 'mask' }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [mode, setMode] = useState<'mask' | 'crop'>(initialMode);
  const [brushSize, setBrushSize] = useState(20);
  const [isDrawing, setIsDrawing] = useState(false);
  const [isAutoMasking, setIsAutoMasking] = useState(false);
  const [history, setHistory] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [cursorPos, setCursorPos] = useState<{ x: number; y: number } | null>(null);
  const lastPos = useRef<{ x: number; y: number } | null>(null);
  
  // Crop state
  const [cropStart, setCropStart] = useState<{ x: number; y: number } | null>(null);
  const [cropEnd, setCropEnd] = useState<{ x: number; y: number } | null>(null);

  const [showConfirm, setShowConfirm] = useState<'save' | 'download' | 'crop' | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const img = new Image();
    img.crossOrigin = "anonymous";
    img.src = imageUrl;
    img.onload = () => {
      // Calculate available space more accurately
      const isMobile = window.innerWidth < 768;
      const sidebarWidth = isMobile ? 0 : 420;
      const horizontalPadding = isMobile ? 48 : 96; // Padding around the canvas
      const verticalPadding = isMobile ? 240 : 180; // Space for header, footer, and margins
      
      // Modal max width is 7xl (1280px)
      const modalMaxWidth = 1280;
      const effectiveWindowWidth = Math.min(window.innerWidth * 0.95, modalMaxWidth);
      
      const availableWidth = effectiveWindowWidth - sidebarWidth - horizontalPadding;
      const availableHeight = (window.innerHeight * 0.9) - verticalPadding;
      
      let width = img.width;
      let height = img.height;
      
      const ratio = Math.min(availableWidth / width, availableHeight / height);
      canvas.width = width * ratio;
      canvas.height = height * ratio;
      
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      saveToHistory();
    };
  }, [imageUrl]);

  const saveToHistory = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    setHistory(prev => [...prev, canvas.toDataURL()]);
  };

  const undo = () => {
    if (history.length <= 1) return;
    const newHistory = [...history];
    newHistory.pop(); // Remove current state
    const lastState = newHistory[newHistory.length - 1];
    
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const img = new Image();
    img.src = lastState;
    img.onload = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0);
      setHistory(newHistory);
    };
  };

  const startDrawing = (e: React.MouseEvent | React.TouchEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    let x, y;
    if ('touches' in e) {
      x = e.touches[0].clientX - rect.left;
      y = e.touches[0].clientY - rect.top;
    } else {
      x = e.clientX - rect.left;
      y = e.clientY - rect.top;
    }

    if (mode === 'crop') {
      setCropStart({ x, y });
      setCropEnd({ x, y });
    } else {
      setIsDrawing(true);
      lastPos.current = { x, y };
      draw(e);
    }
  };

  const stopDrawing = () => {
    if (mode === 'crop') {
      // Crop selection finished
    } else if (isDrawing) {
      setIsDrawing(false);
      lastPos.current = null;
      saveToHistory();
    }
  };

  const draw = (e: React.MouseEvent | React.TouchEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const rect = canvas.getBoundingClientRect();
    let x, y;
    if ('touches' in e) {
      x = e.touches[0].clientX - rect.left;
      y = e.touches[0].clientY - rect.top;
    } else {
      x = e.clientX - rect.left;
      y = e.clientY - rect.top;
    }

    setCursorPos({ x, y });

    if (mode === 'crop' && cropStart) {
      setCropEnd({ x, y });
      return;
    }

    if (!isDrawing) return;

    ctx.strokeStyle = '#000000';
    ctx.lineWidth = brushSize;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    ctx.beginPath();
    if (lastPos.current) {
      ctx.moveTo(lastPos.current.x, lastPos.current.y);
    } else {
      ctx.moveTo(x, y);
    }
    ctx.lineTo(x, y);
    ctx.stroke();

    lastPos.current = { x, y };
  };

  const autoMaskFace = async () => {
    setIsAutoMasking(true);
    setError(null);
    try {
      const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: {
          parts: [
            {
              inlineData: {
                data: imageUrl.split(',')[1],
                mimeType: "image/png",
              },
            },
            {
              text: "Detect all human faces in this image. Return their bounding boxes as a JSON array of objects, each with [ymin, xmin, ymax, xmax] in normalized 0-1000 scale. Example: [{\"box_2d\": [100, 200, 300, 400]}]",
            },
          ],
        },
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                box_2d: {
                  type: Type.ARRAY,
                  items: { type: Type.NUMBER }
                }
              }
            }
          }
        }
      });

      const faces = JSON.parse(response.text);
      const canvas = canvasRef.current;
      if (!canvas || !faces.length) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      faces.forEach((face: any) => {
        const [ymin, xmin, ymax, xmax] = face.box_2d;
        const x = (xmin / 1000) * canvas.width;
        const y = (ymin / 1000) * canvas.height;
        const w = ((xmax - xmin) / 1000) * canvas.width;
        const h = ((ymax - ymin) / 1000) * canvas.height;

        // Draw a circular/elliptical mask over the face
        // Shrink slightly (0.85) to focus on the face and avoid hair
        const centerX = x + w / 2;
        const centerY = y + h / 2;
        const radiusX = (w / 2) * 0.8;
        const radiusY = (h / 2) * 0.85;

        ctx.fillStyle = '#000000';
        ctx.beginPath();
        ctx.ellipse(centerX, centerY, radiusX, radiusY, 0, 0, Math.PI * 2);
        ctx.fill();
      });
      
      saveToHistory();
    } catch (err) {
      console.error(err);
      setError('自动识别失败，请尝试手动涂抹');
    } finally {
      setIsAutoMasking(false);
    }
  };

  const handleSave = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dataUrl = canvas.toDataURL();
    onSave({
      id: crypto.randomUUID(),
      dataUrl,
      sourceUrl: imageUrl,
      createdAt: Date.now()
    });
    onClose();
  };

  const handleDownload = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const link = document.createElement('a');
    link.download = 'masked-image.png';
    link.href = canvas.toDataURL();
    link.click();
  };

  const handleCrop = () => {
    if (!cropStart || !cropEnd || !onCrop) return;
    
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const x = Math.min(cropStart.x, cropEnd.x);
    const y = Math.min(cropStart.y, cropEnd.y);
    const width = Math.abs(cropStart.x - cropEnd.x);
    const height = Math.abs(cropStart.y - cropEnd.y);

    if (width < 5 || height < 5) return;

    // We need to scale the coordinates back to the original image size
    const originalCanvas = canvasRef.current;
    if (!originalCanvas) return;
    
    canvas.width = width;
    canvas.height = height;
    
    ctx.drawImage(originalCanvas, x, y, width, height, 0, 0, width, height);
    onCrop(canvas.toDataURL());
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <motion.div 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="absolute inset-0 bg-black/80 backdrop-blur-sm"
      />
      
      <motion.div 
        initial={{ opacity: 0, scale: 0.9, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.9, y: 20 }}
        className="relative bg-white dark:bg-gray-900 w-full max-w-7xl rounded-[40px] shadow-2xl dark:shadow-none overflow-hidden flex flex-col md:flex-row max-h-[95vh]"
      >
        {/* Left Side: Editor */}
        <div className="flex-1 p-4 sm:p-6 flex flex-col items-center justify-center bg-gray-50 dark:bg-gray-800 border-r border-gray-100 dark:border-gray-700 overflow-hidden">
          <div className="relative bg-white dark:bg-gray-900 rounded-3xl shadow-inner dark:shadow-none overflow-hidden border border-gray-200 dark:border-gray-800 group/canvas max-w-full max-h-full">
            <canvas 
              ref={canvasRef}
              onMouseDown={startDrawing}
              onMouseMove={draw}
              onMouseUp={stopDrawing}
              onMouseLeave={() => {
                stopDrawing();
                setCursorPos(null);
                if (mode === 'crop') setCropStart(null);
              }}
              onTouchStart={startDrawing}
              onTouchMove={draw}
              onTouchEnd={stopDrawing}
              className={cn(
                "touch-none",
                mode === 'crop' ? "cursor-crosshair" : "cursor-none"
              )}
            />
            {mode === 'crop' && cropStart && cropEnd && (
              <div 
                className="absolute border-2 border-blue-500 bg-blue-500/20 pointer-events-none"
                style={{
                  left: Math.min(cropStart.x, cropEnd.x),
                  top: Math.min(cropStart.y, cropEnd.y),
                  width: Math.abs(cropStart.x - cropEnd.x),
                  height: Math.abs(cropStart.y - cropEnd.y),
                }}
              >
                <div className="absolute -top-6 left-0 bg-blue-500 text-white text-[10px] px-1.5 py-0.5 rounded font-bold">
                  {Math.round(Math.abs(cropStart.x - cropEnd.x))} x {Math.round(Math.abs(cropStart.y - cropEnd.y))}
                </div>
              </div>
            )}
            {mode === 'mask' && cursorPos && (
              <div 
                className="absolute pointer-events-none border-2 border-white rounded-full bg-black/10 mix-blend-difference"
                style={{
                  left: cursorPos.x - brushSize / 2,
                  top: cursorPos.y - brushSize / 2,
                  width: brushSize,
                  height: brushSize,
                }}
              />
            )}
          </div>
          
          <div className="mt-6 flex items-center gap-4 bg-white dark:bg-gray-900 px-6 py-3 rounded-2xl shadow-sm dark:shadow-none border border-gray-100 dark:border-gray-800">
            <div className="flex items-center gap-1.5 bg-gray-100 dark:bg-gray-800 p-1 rounded-xl">
              <button 
                onClick={() => setMode('mask')}
                className={cn(
                  "px-3 py-1.5 rounded-lg text-[10px] font-bold transition-all whitespace-nowrap",
                  mode === 'mask' ? "bg-white dark:bg-gray-700 text-blue-600 dark:text-blue-400 shadow-sm dark:shadow-none" : "text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300"
                )}
              >
                涂抹遮罩
              </button>
              <button 
                onClick={() => setMode('crop')}
                className={cn(
                  "px-3 py-1.5 rounded-lg text-[10px] font-bold transition-all whitespace-nowrap",
                  mode === 'crop' ? "bg-white dark:bg-gray-700 text-blue-600 dark:text-blue-400 shadow-sm dark:shadow-none" : "text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300"
                )}
              >
                分割选区
              </button>
            </div>

            {mode === 'mask' ? (
              <div className="flex items-center gap-3 pr-4 border-r border-gray-100 dark:border-gray-800 flex-1">
                <Brush size={16} className="text-gray-400 dark:text-gray-500" />
                <input 
                  type="range" 
                  min="5" 
                  max="100" 
                  value={brushSize}
                  onChange={(e) => setBrushSize(parseInt(e.target.value))}
                  className="flex-1 h-1.5 bg-gray-200 dark:bg-gray-700 rounded-lg appearance-none cursor-pointer accent-blue-600 dark:accent-blue-400"
                />
                <span className="text-[10px] font-bold text-gray-400 dark:text-gray-500 w-6 text-right">{brushSize}</span>
              </div>
            ) : (
              <div className="flex-1 text-[10px] text-gray-400 dark:text-gray-500 font-medium whitespace-nowrap">
                在图片上拖动鼠标以选择区域
              </div>
            )}
            
            <button 
              onClick={undo}
              disabled={history.length <= 1}
              className="p-2 text-gray-400 dark:text-gray-500 hover:text-blue-600 dark:hover:text-blue-400 disabled:opacity-30 transition-colors active:scale-95"
              title="撤销"
            >
              <Undo size={18} />
            </button>
            
            <button 
              onClick={() => {
                const canvas = canvasRef.current;
                if (!canvas) return;
                const ctx = canvas.getContext('2d');
                if (!ctx) return;
                const img = new Image();
                img.src = imageUrl;
                img.onload = () => {
                  ctx.clearRect(0, 0, canvas.width, canvas.height);
                  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
                  saveToHistory();
                };
              }}
              className="p-2 text-gray-400 dark:text-gray-500 hover:text-red-500 dark:hover:text-red-400 transition-colors active:scale-95"
              title="重置"
            >
              <Trash2 size={18} />
            </button>
          </div>
        </div>

        {/* Right Side: Controls */}
        <div className="w-full md:w-[380px] p-6 flex flex-col bg-white dark:bg-gray-900 overflow-y-auto">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-lg font-bold tracking-tight text-gray-900 dark:text-gray-100 whitespace-nowrap">人脸涂抹编辑</h2>
            <button onClick={onClose} className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full transition-colors">
              <X size={20} className="text-gray-400 dark:text-gray-500" />
            </button>
          </div>

          <div className="space-y-5 flex-1">
            {mode === 'mask' ? (
              <>
                <div className="space-y-3">
                  <label className="text-[10px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-widest block whitespace-nowrap">智能工具</label>
                  <button 
                    onClick={autoMaskFace}
                    disabled={isAutoMasking}
                    className="w-full bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 py-3 rounded-xl font-bold flex items-center justify-center gap-2 hover:bg-blue-100 dark:hover:bg-blue-900/40 transition-all active:scale-95 disabled:opacity-50 whitespace-nowrap"
                  >
                    {isAutoMasking ? <Loader2 className="animate-spin" size={16} /> : <Sparkles size={16} />}
                    <span className="text-xs">自动识别并涂抹人脸</span>
                  </button>
                  {error && <p className="text-[10px] text-red-500 dark:text-red-400 font-bold text-center">{error}</p>}
                </div>

                <div className="space-y-3">
                  <label className="text-[10px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-widest block whitespace-nowrap">操作说明</label>
                  <ul className="space-y-2">
                    <li className="flex gap-2 text-[10px] text-gray-500 dark:text-gray-400 leading-relaxed">
                      <div className="w-4 h-4 rounded-full bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400 flex items-center justify-center flex-shrink-0 text-[8px] font-bold">1</div>
                      <span className="whitespace-nowrap">使用画笔手动涂抹，或使用智能工具。</span>
                    </li>
                    <li className="flex gap-2 text-[10px] text-gray-500 dark:text-gray-400 leading-relaxed">
                      <div className="w-4 h-4 rounded-full bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400 flex items-center justify-center flex-shrink-0 text-[8px] font-bold">2</div>
                      <span className="whitespace-nowrap">涂抹后的区域将变为黑色遮罩。</span>
                    </li>
                    <li className="flex gap-2 text-[10px] text-gray-500 dark:text-gray-400 leading-relaxed">
                      <div className="w-4 h-4 rounded-full bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400 flex items-center justify-center flex-shrink-0 text-[8px] font-bold">3</div>
                      <span className="whitespace-nowrap">确认无误后，点击保存或下载。</span>
                    </li>
                  </ul>
                </div>
              </>
            ) : (
              <div className="space-y-3">
                <label className="text-[10px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-widest block whitespace-nowrap">选区操作</label>
                <div className="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-2xl border border-blue-100 dark:border-blue-800">
                  <h4 className="font-bold text-blue-800 dark:text-blue-300 mb-1 text-xs whitespace-nowrap">分割选区模式</h4>
                  <p className="text-[10px] text-blue-600/80 dark:text-blue-400/80 leading-relaxed">
                    在左侧预览图中拖动鼠标，框选您想要提取的区域。
                  </p>
                </div>
                <ul className="space-y-2 mt-4">
                  <li className="flex gap-2 text-[10px] text-gray-500 dark:text-gray-400 leading-relaxed">
                    <div className="w-4 h-4 rounded-full bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400 flex items-center justify-center flex-shrink-0 text-[8px] font-bold">1</div>
                    <span className="whitespace-nowrap">在图片上拖动以创建选区。</span>
                  </li>
                  <li className="flex gap-2 text-[10px] text-gray-500 dark:text-gray-400 leading-relaxed">
                    <div className="w-4 h-4 rounded-full bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400 flex items-center justify-center flex-shrink-0 text-[8px] font-bold">2</div>
                    <span className="whitespace-nowrap">点击下方的“确认选区并替换”按钮。</span>
                  </li>
                </ul>
              </div>
            )}
          </div>

          <div className="mt-8 pt-6 border-t border-gray-100 dark:border-gray-800">
            {showConfirm ? (
              <div className="space-y-3 animate-in fade-in slide-in-from-bottom-2 duration-300">
                <p className="text-xs font-bold text-center text-gray-600 dark:text-gray-400 mb-1 whitespace-nowrap">
                  确认{showConfirm === 'save' ? '保存到图库' : showConfirm === 'download' ? '下载到本地' : '确认选区并替换'}吗？
                </p>
                <div className="flex gap-3">
                  <button 
                    onClick={() => setShowConfirm(null)}
                    className="flex-1 py-3 rounded-xl font-bold bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700 transition-all active:scale-95 text-xs whitespace-nowrap"
                  >
                    取消
                  </button>
                  <button 
                    onClick={() => {
                      if (showConfirm === 'save') handleSave();
                      else if (showConfirm === 'download') handleDownload();
                      else if (showConfirm === 'crop') handleCrop();
                      setShowConfirm(null);
                    }}
                    className="flex-1 py-3 rounded-xl font-bold bg-blue-600 text-white hover:bg-blue-700 shadow-lg shadow-blue-100 dark:shadow-none transition-all active:scale-95 text-xs whitespace-nowrap"
                  >
                    确认
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                {mode === 'mask' ? (
                  <>
                    <button 
                      onClick={() => setShowConfirm('download')}
                      className="w-full bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 text-gray-600 dark:text-gray-400 py-3 rounded-xl font-bold flex items-center justify-center gap-2 hover:border-blue-500 dark:hover:border-blue-400 hover:text-blue-600 dark:hover:text-blue-400 transition-all active:scale-95 text-xs whitespace-nowrap"
                    >
                      <Download size={18} />
                      下载编辑后的图
                    </button>
                    <button 
                      onClick={() => setShowConfirm('save')}
                      className="w-full bg-black dark:bg-gray-800 text-white py-4 rounded-xl font-bold flex items-center justify-center gap-2 hover:bg-gray-800 dark:hover:bg-gray-700 transition-all shadow-xl dark:shadow-none active:scale-95 text-xs whitespace-nowrap"
                    >
                      <Save size={18} />
                      保存到涂抹图库
                    </button>
                  </>
                ) : (
                  <button 
                    onClick={() => setShowConfirm('crop')}
                    disabled={!cropStart || !cropEnd}
                    className="w-full bg-blue-600 text-white py-4 rounded-xl font-bold flex items-center justify-center gap-2 hover:bg-blue-700 transition-all shadow-xl dark:shadow-none active:scale-95 disabled:opacity-50 text-xs whitespace-nowrap"
                  >
                    <Scissors size={18} />
                    确认选区并替换
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      </motion.div>
    </div>
  );
}
