import React, { useState, useEffect } from 'react';
import { Reorder, motion, AnimatePresence } from 'motion/react';
import { X, Download, Save, Layers, GripVertical, RefreshCw, Loader2 } from 'lucide-react';
import { Tile, CompositeImage } from '../types';
import { createComposite } from '../lib/imageUtils';
import { saveAs } from 'file-saver';
import { cn } from '../lib/utils';

interface Props {
  selectedTiles: Tile[];
  availableTiles: Tile[];
  columns: number;
  onClose: () => void;
  onSave: (composite: CompositeImage, isEdit?: boolean) => void;
  onSyncLayout?: (tiles: Tile[], columns: number) => void;
  editingId?: string;
}

export function CompositePreviewModal({ selectedTiles, availableTiles, columns, onClose, onSave, onSyncLayout, editingId }: Props) {
  const [items, setItems] = useState<Tile[]>([]);
  const [localColumns, setLocalColumns] = useState(columns);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [showConfirm, setShowConfirm] = useState<'save' | 'download' | 'sync' | null>(null);
  const [showAddLibrary, setShowAddLibrary] = useState(false);
  const [syncFeedback, setSyncFeedback] = useState(false);

  useEffect(() => {
    setItems([...selectedTiles].sort((a, b) => (a.selectionOrder || 0) - (b.selectionOrder || 0)));
  }, [selectedTiles]);

  const generatePreview = async (currentItems: Tile[]) => {
    if (currentItems.length === 0) {
      setPreviewUrl(null);
      return;
    }
    setIsGenerating(true);
    try {
      const url = await createComposite(currentItems.map(t => t.dataUrl), localColumns);
      setPreviewUrl(url);
    } catch (err) {
      console.error(err);
    } finally {
      setIsGenerating(false);
    }
  };

  // Debounce preview generation
  useEffect(() => {
    const timer = setTimeout(() => {
      generatePreview(items);
    }, 300);
    return () => clearTimeout(timer);
  }, [items, localColumns]);

  const handleSyncLayout = () => {
    if (onSyncLayout) {
      onSyncLayout(items, localColumns);
      setSyncFeedback(true);
      setTimeout(() => setSyncFeedback(false), 2000);
    }
  };

  const handleSave = () => {
    if (!previewUrl) return;
    onSave({
      id: editingId || crypto.randomUUID(),
      dataUrl: previewUrl,
      tileIds: items.map(t => t.id),
      columns: localColumns,
      createdAt: Date.now()
    }, !!editingId);
    onClose();
  };

  const handleDownload = () => {
    if (!previewUrl) return;
    saveAs(previewUrl, `composite-${Date.now()}.png`);
  };

  const removeItem = (id: string) => {
    setItems(prev => prev.filter(item => item.id !== id));
  };

  const addItem = (tile: Tile) => {
    if (items.find(item => item.id === tile.id)) return;
    setItems(prev => [...prev, tile]);
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
        className="relative bg-white w-full max-w-7xl rounded-[40px] shadow-2xl overflow-hidden flex flex-col md:flex-row max-h-[90vh]"
      >
        {/* Left Side: Reorder List */}
        <div className="w-full md:w-[280px] p-6 flex flex-col bg-gray-50 border-r border-gray-100 overflow-hidden">
          <div className="flex flex-col gap-4 mb-6">
            <h3 className="text-lg font-bold flex items-center gap-2">
              <GripVertical className="text-gray-400" size={20} />
              调整顺序
            </h3>
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">
                拖拽排序
              </span>
              <button 
                onClick={() => setShowAddLibrary(!showAddLibrary)}
                className={cn(
                  "text-[10px] font-bold px-3 py-1.5 rounded-full transition-all",
                  showAddLibrary ? "bg-blue-600 text-white" : "bg-white text-blue-600 border border-blue-200"
                )}
              >
                {showAddLibrary ? "关闭" : "添加"}
              </button>
            </div>
          </div>
          
          <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar">
            {showAddLibrary && (
              <div className="mb-6 p-3 bg-white rounded-2xl border-2 border-blue-100 shadow-sm animate-in fade-in slide-in-from-top-4 duration-300">
                <div className="flex items-center justify-between mb-3">
                  <h4 className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">库</h4>
                </div>
                <div className="flex gap-2 overflow-x-auto pb-2 custom-scrollbar">
                  {availableTiles.filter(t => !items.find(item => item.id === t.id)).map(tile => (
                    <button 
                      key={tile.id}
                      onClick={() => addItem(tile)}
                      className="w-14 h-14 rounded-lg overflow-hidden flex-shrink-0 bg-gray-100 border border-gray-100 hover:border-blue-400 transition-all active:scale-95 group relative"
                    >
                      <img src={tile.dataUrl} alt="Library Tile" className="w-full h-full object-cover" />
                      <div className="absolute inset-0 bg-blue-600/0 group-hover:bg-blue-600/20 flex items-center justify-center transition-colors">
                        <Save className="text-white opacity-0 group-hover:opacity-100" size={12} />
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}

            <Reorder.Group 
              axis="y" 
              values={items} 
              onReorder={setItems}
              className="space-y-3"
            >
              {items.map((item) => (
                <Reorder.Item 
                  key={item.id} 
                  value={item}
                  className="bg-white p-3 rounded-xl shadow-sm border border-gray-100 flex items-center gap-3 cursor-grab active:cursor-grabbing hover:border-blue-200 transition-colors group"
                >
                  <div className="w-10 h-10 rounded-lg overflow-hidden flex-shrink-0 bg-gray-100">
                    <img src={item.dataUrl} alt="Tile" className="w-full h-full object-cover" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-bold text-gray-700 truncate">画面 {items.indexOf(item) + 1}</div>
                    <div className="text-[9px] text-gray-400 truncate">{item.row + 1}行 {item.col + 1}列</div>
                  </div>
                  <div className="flex items-center gap-1">
                    <button 
                      onClick={(e) => {
                        e.stopPropagation();
                        removeItem(item.id);
                      }}
                      className="p-1.5 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all"
                    >
                      <X size={16} />
                    </button>
                    <GripVertical className="text-gray-300 group-hover:text-gray-400" size={18} />
                  </div>
                </Reorder.Item>
              ))}
              {items.length === 0 && (
                <div className="flex flex-col items-center justify-center py-20 text-gray-400">
                  <Layers size={48} className="mb-4 opacity-20" />
                  <p className="text-sm">请从上方添加图片</p>
                </div>
              )}
            </Reorder.Group>
          </div>
          
          <div className="mt-6 p-4 bg-blue-50 rounded-2xl border border-blue-100">
            <p className="text-[10px] text-blue-600 leading-relaxed">
              提示：拖动列表项可以改变图片在组合图中的排列顺序。点击 X 可以删除图片。点击“添加”可以从库中补充图片。
            </p>
          </div>
        </div>

        {/* Right Side: Preview & Actions */}
        <div className="flex-1 p-8 flex flex-col bg-white overflow-y-auto">
          <div className="flex items-center justify-between mb-8">
            <div className="flex items-center gap-2">
              <Layers className="text-blue-600" size={24} />
              <h2 className="text-2xl font-bold tracking-tight">组合预览</h2>
            </div>
            <div className="flex items-center gap-3">
              <button 
                onClick={handleDownload}
                disabled={!previewUrl || isGenerating}
                className="p-2 border border-gray-100 rounded-xl hover:border-blue-500 hover:text-blue-600 transition-all active:scale-95 disabled:opacity-30"
                title="立即下载图片"
              >
                <Download size={20} />
              </button>
              <button 
                onClick={handleSave}
                disabled={!previewUrl || isGenerating}
                className="p-2 border border-gray-100 rounded-xl hover:border-blue-500 hover:text-blue-600 transition-all active:scale-95 disabled:opacity-30"
                title="保存至图库"
              >
                <Save size={20} />
              </button>
              <div className="w-px h-6 bg-gray-100 mx-1" />
              <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-full transition-colors">
                <X size={24} className="text-gray-400" />
              </button>
            </div>
          </div>

          <div className="flex-1 space-y-8">
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest block">组合列数</label>
                <div className="flex gap-1 bg-gray-50 p-1 rounded-xl border border-gray-100">
                  {[1, 2, 3, 4, 5, 6].map(cols => (
                    <button
                      key={cols}
                      onClick={() => setLocalColumns(cols)}
                      className={cn(
                        "w-8 h-8 flex items-center justify-center rounded-lg text-xs font-bold transition-all",
                        localColumns === cols 
                          ? "bg-blue-600 text-white shadow-sm" 
                          : "text-gray-400 hover:bg-white hover:text-gray-600"
                      )}
                    >
                      {cols}
                    </button>
                  ))}
                </div>
              </div>
              
              <div className="relative flex-1 bg-gray-50 rounded-[32px] border border-gray-100 shadow-inner overflow-hidden group">
                {isGenerating && (
                  <div className="absolute inset-0 z-10 bg-white/60 backdrop-blur-[2px] flex flex-col items-center justify-center gap-3">
                    <Loader2 className="animate-spin text-blue-600" size={32} />
                    <span className="text-xs font-bold text-blue-600">正在生成预览...</span>
                  </div>
                )}
                
                <div className="w-full h-full p-4 overflow-auto custom-scrollbar">
                  <div 
                    className="grid gap-2"
                    style={{ 
                      gridTemplateColumns: `repeat(${localColumns}, 1fr)`,
                      width: '100%',
                      height: 'fit-content'
                    }}
                  >
                    <AnimatePresence mode="popLayout">
                      {items.map((item, index) => (
                        <motion.div 
                          key={item.id} 
                          layout
                          initial={{ opacity: 0, scale: 0.8 }}
                          animate={{ opacity: 1, scale: 1 }}
                          exit={{ opacity: 0, scale: 0.8 }}
                          transition={{ 
                            type: "spring",
                            stiffness: 300,
                            damping: 30,
                            opacity: { duration: 0.2 }
                          }}
                          className="aspect-square bg-white rounded-xl overflow-hidden shadow-sm border border-gray-100 relative group/item"
                        >
                          <img src={item.dataUrl} alt="Tile" className="w-full h-full object-cover" />
                          <div className="absolute bottom-1 right-1 bg-black/50 text-white text-[8px] px-1 rounded">
                            {index + 1}
                          </div>
                          <div className="absolute inset-0 bg-blue-500/0 hover:bg-blue-500/5 transition-colors" />
                        </motion.div>
                      ))}
                    </AnimatePresence>
                  </div>
                </div>
                
                <div className="absolute bottom-4 right-4 bg-white/90 backdrop-blur px-3 py-1.5 rounded-xl text-[10px] font-bold shadow-sm border border-gray-100 pointer-events-none">
                  {localColumns} 列布局
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest block">操作说明</label>
              <ul className="space-y-3">
                <li className="flex gap-3 text-xs text-gray-500 leading-relaxed">
                  <div className="w-5 h-5 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center flex-shrink-0 text-[10px] font-bold">1</div>
                  <span>在左侧列表中拖拽图片调整它们在最终大图中的排列顺序。</span>
                </li>
                <li className="flex gap-3 text-xs text-gray-500 leading-relaxed">
                  <div className="w-5 h-5 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center flex-shrink-0 text-[10px] font-bold">2</div>
                  <span>点击下方蓝色“保存当前图片排版”，可将此排序实时同步到主编辑器中。</span>
                </li>
                <li className="flex gap-3 text-xs text-gray-500 leading-relaxed">
                  <div className="w-5 h-5 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center flex-shrink-0 text-[10px] font-bold">3</div>
                  <span>确认满意后，可以下载或保存到组合图库中。</span>
                </li>
              </ul>
            </div>
          </div>

          <div className="mt-10 pt-8 border-t border-gray-100 relative">
            <AnimatePresence>
              {syncFeedback && (
                <motion.div 
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="absolute -top-10 left-1/2 -translate-x-1/2 bg-green-500 text-white px-4 py-1.5 rounded-full text-xs font-bold shadow-lg"
                >
                  排版已同步至主编辑器
                </motion.div>
              )}
            </AnimatePresence>

            {showConfirm ? (
              <div className="space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
                <p className="text-sm font-bold text-center text-gray-600 mb-2">
                  确认{showConfirm === 'save' ? '保存到组合图库' : showConfirm === 'sync' ? '保存当前排版到编辑器' : '下载到本地'}吗？
                </p>
                <div className="flex gap-4">
                  <button 
                    onClick={() => setShowConfirm(null)}
                    className="flex-1 py-5 rounded-2xl font-bold bg-gray-100 text-gray-500 hover:bg-gray-200 transition-all active:scale-95"
                  >
                    取消
                  </button>
                  <button 
                    onClick={() => {
                      if (showConfirm === 'save') handleSave();
                      else if (showConfirm === 'sync') handleSyncLayout();
                      else handleDownload();
                      setShowConfirm(null);
                    }}
                    className="flex-1 py-5 rounded-2xl font-bold bg-blue-600 text-white hover:bg-blue-700 shadow-lg shadow-blue-100 transition-all active:scale-95"
                  >
                    确认
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <button 
                    onClick={() => setShowConfirm('sync')}
                    className={cn(
                      "flex items-center justify-center gap-2 py-5 rounded-2xl font-bold border-2 transition-all active:scale-95",
                      syncFeedback 
                        ? "bg-green-50 border-green-200 text-green-600" 
                        : "bg-blue-50 border-blue-100 text-blue-600 hover:border-blue-300"
                    )}
                  >
                    <RefreshCw size={20} />
                    保存图片排版
                  </button>
                  <button 
                    onClick={() => setShowConfirm('download')}
                    disabled={!previewUrl || isGenerating}
                    className="flex items-center justify-center gap-2 py-5 rounded-2xl font-bold bg-white border-2 border-gray-100 text-gray-600 hover:border-blue-500 hover:text-blue-600 transition-all active:scale-95 disabled:opacity-50"
                  >
                    <Download size={20} />
                    下载组合长图
                  </button>
                </div>
                <button 
                  onClick={() => setShowConfirm('save')}
                  disabled={!previewUrl || isGenerating}
                  className="w-full bg-black text-white py-6 rounded-2xl font-bold flex items-center justify-center gap-3 hover:bg-gray-800 transition-all shadow-xl active:scale-95 disabled:opacity-50"
                >
                  <Layers size={24} />
                  保存到组合图库
                </button>
              </div>
            )}
          </div>
        </div>
      </motion.div>
    </div>
  );
}
