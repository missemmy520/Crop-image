import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Sparkles, Loader2, CheckCircle2, User, Maximize2, Upload } from 'lucide-react';
import { GoogleGenAI } from "@google/genai";
import { cn } from '../lib/utils';
import { Character } from '../types';

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

interface Props {
  sourceImageUrl: string;
  availableTiles?: string[];
  onClose: () => void;
  onSave: (character: Character) => void;
}

type HeightSetting = 'child' | 'normal' | 'aesthetic' | 'tall';

interface ReferenceSlot {
  url: string;
  pos: { x: number; y: number };
  size: number; // Percentage of container width
  isConfirmed: boolean;
}

const HEIGHT_OPTIONS: { value: HeightSetting; label: string; desc: string }[] = [
  { value: 'child', label: '儿童', desc: '5-6头身' },
  { value: 'normal', label: '普通成年人', desc: '7头身' },
  { value: 'aesthetic', label: '标准美型', desc: '7.5-8头身' },
  { value: 'tall', label: '高大', desc: '8.5-9头身' },
];

export function CharacterGenerationModal({ sourceImageUrl, availableTiles = [], onClose, onSave }: Props) {
  const [name, setName] = useState('');
  const [height, setHeight] = useState<HeightSetting>('normal');
  const [prompt, setPrompt] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedImage, setGeneratedImage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  
  const [faceRef, setFaceRef] = useState<ReferenceSlot>({
    url: sourceImageUrl,
    pos: { x: 50, y: 50 },
    size: 25,
    isConfirmed: false
  });
  
  const [bodyRef, setBodyRef] = useState<ReferenceSlot>({
    url: sourceImageUrl,
    pos: { x: 50, y: 50 },
    size: 60,
    isConfirmed: false
  });

  const [previewTile, setPreviewTile] = useState<string | null>(null);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const [activeSlot, setActiveSlot] = useState<'face' | 'body'>('face');
  const containerRef = React.useRef<HTMLDivElement>(null);

  const [dragStartPos, setDragStartPos] = useState<{ x: number; y: number } | null>(null);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const dataUrl = event.target?.result as string;
      updateCurrentRef({ url: dataUrl, isConfirmed: false });
    };
    reader.readAsDataURL(file);
  };

  const generate = async () => {
    if (!faceRef.isConfirmed && !bodyRef.isConfirmed && !prompt.trim()) return;
    setIsGenerating(true);
    setError(null);
    try {
      const heightPrompt = {
        child: "5-6 heads tall (child proportions)",
        normal: "7 heads tall (normal adult proportions)",
        aesthetic: "7.5-8 heads tall (standard aesthetic proportions)",
        tall: "8.5-9 heads tall (tall proportions)"
      }[height];

      const parts: any[] = [];
      
      if (faceRef.isConfirmed) {
        parts.push({
          inlineData: {
            data: faceRef.url.split(',')[1],
            mimeType: "image/png",
          },
        });
      }
      
      if (bodyRef.isConfirmed) {
        parts.push({
          inlineData: {
            data: bodyRef.url.split(',')[1],
            mimeType: "image/png",
          },
        });
      }

      let promptText = `Generate a character sheet with three views (front, side, back) on a plain white background. \n\n`;

      if (faceRef.isConfirmed) {
        promptText += `REFERENCE 1 (FACE): Capture ONLY the facial features and hair style from the character located at x=${faceRef.pos.x}%, y=${faceRef.pos.y}% with a selection diameter of ${faceRef.size}% in the first provided image. \n`;
      } else if (prompt.trim()) {
        promptText += `FACE DESCRIPTION: The character's face should be based on the following description: ${prompt}. \n`;
      } else {
        promptText += `FACE DESCRIPTION: A standard neutral face consistent with the body style. \n`;
      }

      promptText += `The generated character MUST have a neutral expression, facing directly forward towards the camera in the front view, with eyes looking straight ahead. No emotions, no smiling. \n\n`;

      if (bodyRef.isConfirmed) {
        const bodyImgIndex = faceRef.isConfirmed ? 'second' : 'first';
        promptText += `REFERENCE 2 (BODY): The character's full-body outfit, clothing style, and accessories should be based on the character located at x=${bodyRef.pos.x}%, y=${bodyRef.pos.y}% with a selection diameter of ${bodyRef.size}% in the ${bodyImgIndex} provided image. \n`;
      } else if (prompt.trim()) {
        promptText += `BODY DESCRIPTION: The character's body and outfit should be based on the following description: ${prompt}. \n`;
      } else {
        promptText += `BODY DESCRIPTION: A standard outfit consistent with the face style. \n`;
      }

      if (prompt.trim()) {
        promptText += `\nADDITIONAL USER INSTRUCTIONS: ${prompt}\n`;
      }

      promptText += `\nPROPORTIONS & ANATOMY:
      - The character must have realistic human proportions.
      - The head-to-body ratio must be natural and anatomically correct (no "small head" or "oversized body").
      - The waist-to-hip ratio and overall silhouette must be consistent with a normal ${height === 'child' ? 'child' : 'adult'} male or female anatomy.
      - The body proportions should be ${heightPrompt}. 
      
      The final character should combine the references and descriptions seamlessly. 
      The aspect ratio must be 1:1.
      The style, colors, and details should be consistent with the provided references. 
      If the sources are photos, the result must be a photo. If they are illustrations, the result must be an illustration.
      The character should be standing in a neutral T-pose or A-pose for all three views.`;

      parts.push({ text: promptText });

      const contents = { parts };

      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash-image',
        contents,
        config: {
          imageConfig: {
            aspectRatio: "1:1",
          }
        }
      });

      if (!response.candidates?.[0]?.content?.parts) {
        throw new Error('API 返回内容为空');
      }

      let imageUrl = '';
      for (const part of response.candidates[0].content.parts) {
        if (part.inlineData) {
          imageUrl = `data:image/png;base64,${part.inlineData.data}`;
          break;
        }
      }

      if (imageUrl) {
        setGeneratedImage(imageUrl);
      } else {
        throw new Error('未能生成图片，请重试');
      }
    } catch (err) {
      console.error(err);
      setError('生成失败，请检查网络或稍后重试');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleSave = () => {
    if (!generatedImage) return;
    const finalName = name.trim() || `角色_${Math.random().toString(36).substr(2, 5)}`;
    onSave({
      id: crypto.randomUUID(),
      name: finalName,
      sourceImageUrl: bodyRef.url, // Use body ref as primary source for preview
      faceSourceUrl: faceRef.url,
      bodySourceUrl: bodyRef.url,
      threeViewImageUrl: generatedImage,
      heightSetting: height,
      createdAt: Date.now()
    });
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>, slot: 'face' | 'body') => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        const url = event.target?.result as string;
        if (slot === 'face') {
          setFaceRef(prev => ({ ...prev, url, isConfirmed: false }));
        } else {
          setBodyRef(prev => ({ ...prev, url, isConfirmed: false }));
        }
      };
      reader.readAsDataURL(file);
    }
  };

  const copyToOther = () => {
    if (activeSlot === 'face') {
      setBodyRef(prev => ({ ...prev, url: faceRef.url, isConfirmed: false }));
    } else {
      setFaceRef(prev => ({ ...prev, url: bodyRef.url, isConfirmed: false }));
    }
  };

  const currentRef = activeSlot === 'face' ? faceRef : bodyRef;
  const otherRef = activeSlot === 'face' ? bodyRef : faceRef;
  
  const updateCurrentRef = (updates: Partial<ReferenceSlot>) => {
    if (activeSlot === 'face') {
      setFaceRef(prev => ({ ...prev, ...updates }));
    } else {
      setBodyRef(prev => ({ ...prev, ...updates }));
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6">
      <motion.div 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
      />
      
      <motion.div 
        initial={{ opacity: 0, scale: 0.9, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.9, y: 20 }}
        className="relative w-full max-w-6xl bg-white dark:bg-gray-900 rounded-[40px] shadow-2xl dark:shadow-none overflow-hidden flex flex-col md:flex-row max-h-[95vh]"
      >
        {/* Left Side: Source & Settings */}
        <div className="w-full md:w-[400px] p-6 border-r border-gray-100 dark:border-gray-800 overflow-y-auto bg-white dark:bg-gray-900">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-lg font-bold flex items-center gap-2 text-gray-900 dark:text-gray-100 whitespace-nowrap">
              <Sparkles className="text-blue-600 dark:text-blue-400" size={20} />
              生成三视图
            </h2>
            <button onClick={onClose} className="md:hidden p-1.5 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full text-gray-500 dark:text-gray-400">
              <X size={18} />
            </button>
          </div>

          <div className="space-y-8">
            {/* Reference Slots Toggles */}
            <div className="space-y-2">
              <label className="text-[10px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-widest block whitespace-nowrap">参考维度</label>
              <div className="flex gap-2 p-1 bg-gray-100 dark:bg-gray-800 rounded-xl">
                <button 
                  onClick={() => setActiveSlot('face')}
                  className={cn(
                    "flex-1 py-2.5 rounded-lg font-bold text-xs transition-all flex flex-col items-center justify-center gap-1 whitespace-nowrap",
                    activeSlot === 'face' ? "bg-white dark:bg-gray-700 text-blue-600 dark:text-blue-400 shadow-sm dark:shadow-none" : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
                  )}
                >
                  <div className="flex items-center gap-2">
                    <div className={cn("w-2 h-2 rounded-full", faceRef.isConfirmed ? "bg-green-500" : "bg-orange-400")} />
                    面部参考
                  </div>
                </button>
                <button 
                  onClick={() => setActiveSlot('body')}
                  className={cn(
                    "flex-1 py-2.5 rounded-lg font-bold text-xs transition-all flex flex-col items-center justify-center gap-1 whitespace-nowrap",
                    activeSlot === 'body' ? "bg-white dark:bg-gray-700 text-blue-600 dark:text-blue-400 shadow-sm dark:shadow-none" : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
                  )}
                >
                  <div className="flex items-center gap-2">
                    <div className={cn("w-2 h-2 rounded-full", bodyRef.isConfirmed ? "bg-green-500" : "bg-orange-400")} />
                    全身造型
                  </div>
                </button>
              </div>
            </div>

              <div className="bg-gray-50 dark:bg-gray-800/50 rounded-2xl p-6 border border-gray-100 dark:border-gray-800">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded-full bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400 flex items-center justify-center text-[10px] font-bold">
                      {activeSlot === 'face' ? '1' : '2'}
                    </div>
                    <label className="text-xs font-bold text-gray-700 dark:text-gray-200 whitespace-nowrap">
                      {activeSlot === 'face' ? '选定面部' : '选定全身'}
                    </label>
                  </div>
                  <div className="flex items-center gap-3">
                    <button 
                      onClick={copyToOther}
                      className="text-[10px] font-bold text-blue-600 dark:text-blue-400 hover:underline whitespace-nowrap"
                    >
                      复制
                    </button>
                    <label className="cursor-pointer text-[10px] font-bold text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 uppercase tracking-widest whitespace-nowrap">
                      更换
                      <input type="file" className="hidden" accept="image/*" onChange={(e) => handleImageUpload(e, activeSlot)} />
                    </label>
                  </div>
                </div>
              
              <div className="relative aspect-square rounded-2xl overflow-hidden bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 group shadow-inner dark:shadow-none">
                <img 
                  src={currentRef.url} 
                  alt="Source" 
                  className="w-full h-full object-contain select-none" 
                  referrerPolicy="no-referrer" 
                  draggable={false}
                />
                <div className="absolute inset-0 bg-black/5 dark:bg-white/5 group-hover:bg-transparent transition-colors" />
                
                {!currentRef.isConfirmed ? (
                  <div className="absolute inset-0" ref={containerRef}>
                    <motion.div 
                      drag
                      dragMomentum={false}
                      onDragStart={() => {
                        setDragStartPos({ x: currentRef.pos.x, y: currentRef.pos.y });
                      }}
                      onDrag={(_, info) => {
                        if (!containerRef.current || !dragStartPos) return;
                        const rect = containerRef.current.getBoundingClientRect();
                        const deltaX = (info.offset.x / rect.width) * 100;
                        const deltaY = (info.offset.y / rect.height) * 100;
                        updateCurrentRef({ 
                          pos: {
                            x: Math.max(0, Math.min(100, dragStartPos.x + deltaX)), 
                            y: Math.max(0, Math.min(100, dragStartPos.y + deltaY)) 
                          }
                        });
                      }}
                      className="absolute border-4 border-blue-500 rounded-full cursor-move flex items-center justify-center shadow-2xl dark:shadow-none bg-blue-500/10 z-10"
                      style={{ 
                        width: `${currentRef.size}%`,
                        height: `${currentRef.size}%`,
                        left: `calc(${currentRef.pos.x}% - ${currentRef.size / 2}%)`, 
                        top: `calc(${currentRef.pos.y}% - ${currentRef.size / 2}%)` 
                      }}
                    >
                      <div className="w-2 h-2 bg-blue-500 rounded-full" />
                      <div className="absolute -bottom-10 bg-blue-600 text-white text-[10px] px-3 py-1.5 rounded-lg font-bold whitespace-nowrap shadow-lg dark:shadow-none">
                        对准{activeSlot === 'face' ? '面部' : '人物'}
                      </div>
                    </motion.div>
                    
                    <div 
                      className="absolute inset-0 cursor-crosshair"
                      onClick={(e) => {
                        const rect = e.currentTarget.getBoundingClientRect();
                        const x = ((e.clientX - rect.left) / rect.width) * 100;
                        const y = ((e.clientY - rect.top) / rect.height) * 100;
                        updateCurrentRef({ pos: { x, y } });
                      }}
                    />
                  </div>
                ) : (
                  <div className="absolute inset-0 pointer-events-none bg-green-500/5">
                    <div className="absolute border-4 border-green-500 rounded-full flex items-center justify-center bg-green-500/10 shadow-lg dark:shadow-none"
                      style={{ 
                        width: `${currentRef.size}%`,
                        height: `${currentRef.size}%`,
                        left: `calc(${currentRef.pos.x}% - ${currentRef.size / 2}%)`, 
                        top: `calc(${currentRef.pos.y}% - ${currentRef.size / 2}%)` 
                      }}
                    >
                      <CheckCircle2 className="text-green-500" size={32} />
                    </div>
                  </div>
                )}
              </div>
              
              {!currentRef.isConfirmed ? (
                <>
                  <div className="px-2 space-y-4">
                    <div className="flex items-center justify-between mb-2">
                      <label className="text-[10px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-widest">范围大小</label>
                      <span className="text-xs font-bold text-blue-600 dark:text-blue-400">{currentRef.size}%</span>
                    </div>
                    <div className="flex items-center gap-4 py-2">
                      <input 
                        type="range" 
                        min="10" 
                        max="90" 
                        value={currentRef.size}
                        onChange={(e) => updateCurrentRef({ size: parseInt(e.target.value) })}
                        className="w-full h-2 bg-gray-200 dark:bg-gray-700 rounded-lg appearance-none cursor-pointer accent-blue-600 dark:accent-blue-400"
                      />
                    </div>
                  </div>
                  <button 
                    onClick={() => updateCurrentRef({ isConfirmed: true })}
                    className="w-full bg-blue-600 hover:bg-blue-700 text-white py-3 rounded-xl font-bold hover:bg-blue-700 transition-all shadow-lg shadow-blue-100 dark:shadow-none active:scale-95 text-xs whitespace-nowrap"
                  >
                    确认选定
                  </button>
                </>
              ) : (
                <button 
                  onClick={() => updateCurrentRef({ isConfirmed: false })}
                  className="w-full mt-4 bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-gray-700 py-3 rounded-2xl text-xs font-bold hover:bg-gray-50 dark:hover:bg-gray-700 transition-all active:scale-95"
                >
                  重新选定
                </button>
              )}
            </div>

            {/* Quick Select from Tiles */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <label className="text-[10px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-widest">选择参考图</label>
                <button 
                  onClick={() => fileInputRef.current?.click()}
                  className="flex items-center gap-2 text-[10px] font-bold text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 transition-colors"
                >
                  <Upload size={12} />
                  <span>上传本地图片</span>
                </button>
                <input 
                  type="file" 
                  ref={fileInputRef} 
                  className="hidden" 
                  accept="image/*" 
                  onChange={handleFileUpload}
                />
              </div>

              {availableTiles.length > 0 && (
                <div>
                  <label className="text-[10px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-widest block mb-3 opacity-50">从项目素材中选择</label>
                  <div className="h-[280px] overflow-y-auto pr-2 custom-scrollbar">
                    <div className="grid grid-cols-3 gap-3">
                      {availableTiles.map((tile, idx) => (
                        <div key={idx} className="relative group/tile">
                          <button 
                            onClick={() => updateCurrentRef({ url: tile, isConfirmed: false })}
                            className={cn(
                              "w-full aspect-square rounded-2xl overflow-hidden border-2 transition-all shadow-sm dark:shadow-none",
                              currentRef.url === tile ? "border-blue-600 dark:border-blue-400 scale-95" : "border-transparent hover:border-gray-300 dark:hover:border-gray-600"
                            )}
                          >
                            <img src={tile} alt={`Tile ${idx}`} className="w-full h-full object-cover" />
                          </button>
                          <button 
                            onClick={() => setPreviewTile(tile)}
                            className="absolute top-1 right-1 p-1.5 bg-white/90 dark:bg-gray-800/90 backdrop-blur rounded-lg shadow-sm dark:shadow-none opacity-0 group-hover/tile:opacity-100 transition-opacity hover:bg-white dark:hover:bg-gray-700 text-gray-600 dark:text-gray-300"
                          >
                            <Maximize2 size={12} />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Reference Summary */}
            <div className="bg-gray-50 dark:bg-gray-800/50 rounded-3xl p-6 border border-gray-100 dark:border-gray-800">
              <label className="text-[10px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-widest block mb-4">参考预览与描述</label>
              <div className="flex gap-4 mb-6">
                <div className="flex-1">
                  <div className="aspect-square rounded-2xl overflow-hidden bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 mb-2 relative shadow-sm dark:shadow-none">
                    <img src={faceRef.url} alt="Face" className="w-full h-full object-cover" />
                    {!faceRef.isConfirmed && (
                      <div className="absolute inset-0 bg-gray-500/10 dark:bg-white/10 backdrop-blur-[1px] flex items-center justify-center">
                        <User size={16} className="text-gray-400 dark:text-gray-500" />
                      </div>
                    )}
                  </div>
                  <div className="text-[10px] text-center font-bold text-gray-500 dark:text-gray-400">面部参考</div>
                </div>
                <div className="flex-1">
                  <div className="aspect-square rounded-2xl overflow-hidden bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 mb-2 relative shadow-sm dark:shadow-none">
                    <img src={bodyRef.url} alt="Body" className="w-full h-full object-cover" />
                    {!bodyRef.isConfirmed && (
                      <div className="absolute inset-0 bg-gray-500/10 dark:bg-white/10 backdrop-blur-[1px] flex items-center justify-center">
                        <User size={16} className="text-gray-400 dark:text-gray-500" />
                      </div>
                    )}
                  </div>
                  <div className="text-[10px] text-center font-bold text-gray-500 dark:text-gray-400">全身造型</div>
                </div>
              </div>

              <div>
                <label className="text-[10px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-widest block mb-2">补充文字描述 (可选)</label>
                <textarea 
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  placeholder="描述角色的样貌、服装、细节等，在缺少图片参考时尤为重要..."
                  className="w-full h-24 bg-white dark:bg-gray-900 border-2 border-gray-100 dark:border-gray-800 focus:border-blue-500 dark:focus:border-blue-400 rounded-2xl p-4 text-xs font-medium transition-all outline-none resize-none custom-scrollbar text-gray-900 dark:text-gray-100"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-6">
              <div>
                <label className="text-[10px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-widest block mb-3">身高比例</label>
                <div className="grid grid-cols-1 gap-2">
                  {HEIGHT_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      onClick={() => setHeight(opt.value)}
                      className={cn(
                        "flex flex-col px-4 py-2 rounded-xl border-2 transition-all text-left active:scale-95 whitespace-nowrap",
                        height === opt.value 
                          ? "border-blue-600 dark:border-blue-400 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 shadow-sm dark:shadow-none" 
                          : "border-gray-100 dark:border-gray-800 hover:border-gray-200 dark:hover:border-gray-700 text-gray-600 dark:text-gray-400"
                      )}
                    >
                      <div className="font-bold text-xs">{opt.label}</div>
                      <div className="text-[9px] opacity-60">{opt.desc}</div>
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex flex-col justify-end">
                <button
                  onClick={generate}
                  disabled={isGenerating || (!faceRef.isConfirmed && !bodyRef.isConfirmed && !prompt.trim())}
                  className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white py-4 rounded-2xl font-bold flex flex-col items-center justify-center gap-1.5 transition-all shadow-xl shadow-blue-100 dark:shadow-none active:scale-95 whitespace-nowrap"
                >
                  {isGenerating ? <Loader2 className="animate-spin" size={20} /> : <Sparkles size={20} />}
                  <span className="text-xs">{isGenerating ? '生成中...' : '开始生成'}</span>
                </button>
                {(!faceRef.isConfirmed && !bodyRef.isConfirmed && !prompt.trim()) && (
                  <p className="text-[9px] text-center text-gray-400 dark:text-gray-500 mt-3 font-medium">请提供至少一个参考或描述</p>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Right Side: Result Preview */}
        <div className="flex-1 bg-gray-50/50 dark:bg-gray-900/50 p-10 flex flex-col items-center justify-center relative min-h-[500px]">
          <button onClick={onClose} className="hidden md:block absolute top-8 right-8 p-2 hover:bg-gray-200 dark:hover:bg-gray-800 rounded-full transition-colors">
            <X size={24} className="text-gray-400 dark:text-gray-500" />
          </button>

          {generatedImage ? (
            <div className="w-full h-full flex flex-col items-center justify-center">
              <motion.div 
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="w-full max-w-3xl aspect-square bg-white dark:bg-gray-900 rounded-[48px] shadow-2xl dark:shadow-none overflow-hidden border border-gray-100 dark:border-gray-800 mb-10 group relative"
              >
                <img src={generatedImage} alt="Generated Three View" className="w-full h-full object-contain" referrerPolicy="no-referrer" />
                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/5 dark:group-hover:bg-white/5 transition-colors pointer-events-none" />
              </motion.div>
              
              <div className="w-full max-w-md">
                <div className="bg-white dark:bg-gray-900 p-8 rounded-[32px] shadow-xl dark:shadow-none border border-gray-100 dark:border-gray-800">
                  <label className="text-[10px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-widest block mb-4 text-center">角色命名</label>
                  <input 
                    type="text" 
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="输入角色名称..."
                    className="w-full bg-gray-50 dark:bg-gray-800 border-2 border-transparent focus:border-blue-500 dark:focus:border-blue-400 focus:bg-white dark:focus:bg-gray-900 rounded-2xl px-6 py-4 font-bold transition-all outline-none mb-8 text-center text-lg text-gray-900 dark:text-gray-100"
                  />
                  
                  <div className="flex gap-4">
                    <button 
                      onClick={() => setGeneratedImage(null)}
                      className="flex-1 py-5 rounded-2xl font-bold text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-all active:scale-95"
                    >
                      重新生成
                    </button>
                    <button 
                      onClick={handleSave}
                      className="flex-1 py-5 bg-black dark:bg-white text-white dark:text-gray-900 rounded-2xl font-bold hover:bg-gray-800 dark:hover:bg-gray-200 transition-all shadow-xl dark:shadow-none active:scale-95"
                    >
                      保存到角色库
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="text-center">
              {error ? (
                <div className="text-red-500">
                  <div className="bg-red-50 dark:bg-red-900/20 p-4 rounded-full inline-block mb-4">
                    <X size={32} />
                  </div>
                  <p className="font-bold">{error}</p>
                </div>
              ) : (
                <div className="text-gray-300 dark:text-gray-600">
                  <div className="bg-white dark:bg-gray-900 p-8 rounded-[32px] shadow-sm dark:shadow-none mb-6 inline-block">
                    {isGenerating ? (
                      <Loader2 size={48} className="animate-spin text-blue-600 dark:text-blue-400" />
                    ) : (
                      <User size={48} />
                    )}
                  </div>
                  <h3 className="text-xl font-bold text-gray-400 dark:text-gray-500">
                    {isGenerating ? 'AI 正在构思您的角色...' : '预览区域'}
                  </h3>
                  <p className="text-sm mt-2 text-gray-400 dark:text-gray-500">生成后的三视图将显示在这里</p>
                </div>
              )}
            </div>
          )}
        </div>
        {/* Tile Preview Modal */}
        <AnimatePresence>
          {previewTile && (
            <div className="fixed inset-0 z-[110] flex items-center justify-center p-8">
              <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setPreviewTile(null)}
                className="absolute inset-0 bg-black/80 backdrop-blur-md"
              />
              <motion.div 
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                className="relative max-w-4xl max-h-full bg-white dark:bg-gray-900 rounded-[40px] overflow-hidden shadow-2xl dark:shadow-none"
              >
                <img src={previewTile} alt="Preview" className="max-w-full max-h-[80vh] object-contain" />
                <div className="p-8 flex items-center justify-between bg-white dark:bg-gray-900 border-t border-gray-100 dark:border-gray-800">
                  <div className="text-sm font-bold text-gray-500 dark:text-gray-400">素材大图预览</div>
                  <div className="flex gap-4">
                    <button 
                      onClick={() => setPreviewTile(null)}
                      className="px-8 py-3 rounded-2xl font-bold text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-all"
                    >
                      关闭
                    </button>
                    <button 
                      onClick={() => {
                        updateCurrentRef({ url: previewTile, isConfirmed: false });
                        setPreviewTile(null);
                      }}
                      className="px-8 py-3 bg-blue-600 text-white rounded-2xl font-bold hover:bg-blue-700 transition-all shadow-lg shadow-blue-100 dark:shadow-none"
                    >
                      使用此素材
                    </button>
                  </div>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  );
}
