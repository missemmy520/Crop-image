import React, { useState, useRef, useEffect } from 'react';
import { Plus, Trash2, MoveHorizontal, MoveVertical, Scissors } from 'lucide-react';
import { cn } from '../lib/utils';

interface CustomSplitEditorProps {
  image: string;
  horizontalLines: number[];
  verticalLines: number[];
  onLinesChange: (hLines: number[], vLines: number[]) => void;
  onSplit: () => void;
}

export const CustomSplitEditor: React.FC<CustomSplitEditorProps> = ({
  image,
  horizontalLines,
  verticalLines,
  onLinesChange,
  onSplit
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [addMode, setAddMode] = useState<'h' | 'v' | 'both'>('both');
  const [draggingLine, setDraggingLine] = useState<{ type: 'h' | 'v', index: number } | null>(null);

  const handleMouseDown = (type: 'h' | 'v', index: number) => {
    setDraggingLine({ type, index });
  };

  const handleMouseMove = (e: React.MouseEvent | MouseEvent) => {
    if (!draggingLine || !containerRef.current) return;

    const rect = containerRef.current.getBoundingClientRect();
    let percentage = 0;

    if (draggingLine.type === 'h') {
      percentage = ((e.clientY - rect.top) / rect.height) * 100;
    } else {
      percentage = ((e.clientX - rect.left) / rect.width) * 100;
    }

    // Clamp percentage
    percentage = Math.max(0, Math.min(100, percentage));

    const newHLines = [...horizontalLines];
    const newVLines = [...verticalLines];

    if (draggingLine.type === 'h') {
      newHLines[draggingLine.index] = percentage;
    } else {
      newVLines[draggingLine.index] = percentage;
    }

    onLinesChange(newHLines, newVLines);
  };

  const handleMouseUp = () => {
    setDraggingLine(null);
  };

  useEffect(() => {
    if (draggingLine) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
      window.addEventListener('touchmove', handleTouchMove, { passive: false });
      window.addEventListener('touchend', handleMouseUp);
    } else {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      window.removeEventListener('touchmove', handleTouchMove);
      window.removeEventListener('touchend', handleMouseUp);
    }
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      window.removeEventListener('touchmove', handleTouchMove);
      window.removeEventListener('touchend', handleMouseUp);
    };
  }, [draggingLine, horizontalLines, verticalLines]);

  const handleTouchMove = (e: TouchEvent) => {
    if (draggingLine) {
      e.preventDefault(); // Prevent scrolling while dragging
      handleMouseMove(e.touches[0] as any);
    }
  };

  const addLine = (type: 'h' | 'v') => {
    if (type === 'h') {
      onLinesChange([...horizontalLines, 50], verticalLines);
    } else {
      onLinesChange(horizontalLines, [...verticalLines, 50]);
    }
  };

  const removeLine = (type: 'h' | 'v', index: number) => {
    if (type === 'h') {
      onLinesChange(horizontalLines.filter((_, i) => i !== index), verticalLines);
    } else {
      onLinesChange(horizontalLines, verticalLines.filter((_, i) => i !== index));
    }
  };

  return (
    <div className="flex flex-col gap-6 w-full">
      <div className="flex items-center justify-between bg-white dark:bg-gray-900 p-4 rounded-2xl shadow-sm dark:shadow-none border border-gray-100 dark:border-gray-800">
        <div className="flex gap-3">
          <div className="flex bg-gray-100 dark:bg-gray-800 p-1.5 rounded-2xl">
            <button 
              onClick={() => setAddMode('h')}
              className={cn(
                "px-4 py-2.5 rounded-xl text-sm font-bold transition-all flex items-center gap-2",
                addMode === 'h' ? "bg-white dark:bg-gray-700 text-blue-600 dark:text-blue-400 shadow-sm dark:shadow-none" : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
              )}
            >
              <MoveHorizontal size={16} />
              水平
            </button>
            <button 
              onClick={() => setAddMode('v')}
              className={cn(
                "px-4 py-2.5 rounded-xl text-sm font-bold transition-all flex items-center gap-2",
                addMode === 'v' ? "bg-white dark:bg-gray-700 text-blue-600 dark:text-blue-400 shadow-sm dark:shadow-none" : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
              )}
            >
              <MoveVertical size={16} />
              垂直
            </button>
            <button 
              onClick={() => setAddMode('both')}
              className={cn(
                "px-4 py-2.5 rounded-xl text-sm font-bold transition-all flex items-center gap-2",
                addMode === 'both' ? "bg-white dark:bg-gray-700 text-blue-600 dark:text-blue-400 shadow-sm dark:shadow-none" : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
              )}
            >
              <Plus size={16} />
              十字
            </button>
          </div>
          <div className="w-px h-10 bg-gray-200 dark:bg-gray-700 mx-2" />
          <button 
            onClick={() => addLine('h')}
            className="flex items-center gap-2 px-5 py-3 bg-gray-50 dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-2xl text-sm font-bold transition-all active:scale-95 text-gray-700 dark:text-gray-200"
          >
            <MoveHorizontal size={20} className="text-blue-600 dark:text-blue-400" />
            添加水平线
          </button>
          <button 
            onClick={() => addLine('v')}
            className="flex items-center gap-2 px-5 py-3 bg-gray-50 dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-2xl text-sm font-bold transition-all active:scale-95 text-gray-700 dark:text-gray-200"
          >
            <MoveVertical size={20} className="text-blue-600 dark:text-blue-400" />
            添加垂直线
          </button>
          <button 
            onClick={() => onLinesChange([], [])}
            className="flex items-center gap-2 px-5 py-3 bg-red-50 dark:bg-red-900/20 hover:bg-red-100 dark:hover:bg-red-900/40 text-red-600 dark:text-red-400 rounded-2xl text-sm font-bold transition-all active:scale-95"
          >
            <Trash2 size={20} />
            清空参考线
          </button>
        </div>
        
        <button 
          onClick={onSplit}
          className="flex items-center gap-2 px-8 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-2xl text-sm font-bold shadow-lg shadow-blue-100 dark:shadow-none transition-all active:scale-95"
        >
          <Scissors size={20} />
          立即分割
        </button>
      </div>

      <div 
        className="relative w-full bg-transparent select-none my-8 flex justify-center"
        style={{ cursor: draggingLine ? (draggingLine.type === 'h' ? 'ns-resize' : 'ew-resize') : 'default' }}
      >
        <div ref={containerRef} className="relative inline-block max-w-full">
          <img 
            src={image} 
            alt="Split Editor" 
            className="w-full h-auto block pointer-events-none rounded-3xl shadow-2xl dark:shadow-none"
            referrerPolicy="no-referrer"
          />

          {/* Click area to add lines */}
          <div 
            className="absolute inset-0 cursor-crosshair z-0"
            onClick={(e) => {
              if (!containerRef.current) return;
              const rect = containerRef.current.getBoundingClientRect();
              const x = ((e.clientX - rect.left) / rect.width) * 100;
              const y = ((e.clientY - rect.top) / rect.height) * 100;
              
              const newHLines = [...horizontalLines];
              const newVLines = [...verticalLines];

              if (addMode === 'h' || addMode === 'both') {
                newHLines.push(Number(y.toFixed(2)));
              }
              if (addMode === 'v' || addMode === 'both') {
                newVLines.push(Number(x.toFixed(2)));
              }
              
              onLinesChange(newHLines.sort((a, b) => a - b), newVLines.sort((a, b) => a - b));
            }}
          />

          {/* Horizontal Lines */}
          {horizontalLines.map((pos, idx) => (
            <div 
              key={`h-${idx}`}
              className="absolute left-0 right-0 group z-20"
              style={{ top: `${pos}%`, height: '1px', transform: 'translateY(-50%)' }}
            >
              <div className="absolute inset-0 bg-blue-500 shadow-[0_0_4px_rgba(59,130,246,0.5)]" />
              
              {/* Left Handle */}
              <div 
                className="absolute -left-10 top-1/2 -translate-y-1/2 w-10 h-10 bg-blue-600 rounded-full border-2 border-white dark:border-gray-800 shadow-lg dark:shadow-none cursor-ns-resize z-30 hover:scale-110 transition-transform flex items-center justify-center active:scale-90"
                onMouseDown={(e) => { e.stopPropagation(); handleMouseDown('h', idx); }}
                onTouchStart={(e) => { e.stopPropagation(); handleMouseDown('h', idx); }}
              >
                <div className="w-1.5 h-1.5 bg-white rounded-full" />
              </div>
              
              {/* Right Handle */}
              <div 
                className="absolute -right-10 top-1/2 -translate-y-1/2 w-10 h-10 bg-blue-600 rounded-full border-2 border-white dark:border-gray-800 shadow-lg dark:shadow-none cursor-ns-resize z-30 hover:scale-110 transition-transform flex items-center justify-center active:scale-90"
                onMouseDown={(e) => { e.stopPropagation(); handleMouseDown('h', idx); }}
                onTouchStart={(e) => { e.stopPropagation(); handleMouseDown('h', idx); }}
              >
                <div className="w-1.5 h-1.5 bg-white rounded-full" />
              </div>

              <div 
                className="absolute inset-x-0 -top-6 -bottom-6 cursor-ns-resize z-10"
                onMouseDown={(e) => { e.stopPropagation(); handleMouseDown('h', idx); }}
                onTouchStart={(e) => { e.stopPropagation(); handleMouseDown('h', idx); }}
              />
              <button 
                onClick={(e) => { e.stopPropagation(); removeLine('h', idx); }}
                className="absolute right-4 -top-10 bg-white dark:bg-gray-800 p-3 rounded-full shadow-lg dark:shadow-none text-red-500 opacity-0 group-hover:opacity-100 transition-opacity z-40 hover:scale-110 active:scale-90"
              >
                <Trash2 size={20} />
              </button>
            </div>
          ))}

          {/* Vertical Lines */}
          {verticalLines.map((pos, idx) => (
            <div 
              key={`v-${idx}`}
              className="absolute top-0 bottom-0 group z-20"
              style={{ left: `${pos}%`, width: '1px', transform: 'translateX(-50%)' }}
            >
              <div className="absolute inset-0 bg-blue-500 shadow-[0_0_4px_rgba(59,130,246,0.5)]" />
              
              {/* Top Handle */}
              <div 
                className="absolute left-1/2 -top-10 -translate-x-1/2 w-10 h-10 bg-blue-600 rounded-full border-2 border-white dark:border-gray-800 shadow-lg dark:shadow-none cursor-ew-resize z-30 hover:scale-110 transition-transform flex items-center justify-center active:scale-90"
                onMouseDown={(e) => { e.stopPropagation(); handleMouseDown('v', idx); }}
                onTouchStart={(e) => { e.stopPropagation(); handleMouseDown('v', idx); }}
              >
                <div className="w-1.5 h-1.5 bg-white rounded-full" />
              </div>
              
              {/* Bottom Handle */}
              <div 
                className="absolute left-1/2 -bottom-10 -translate-x-1/2 w-10 h-10 bg-blue-600 rounded-full border-2 border-white dark:border-gray-800 shadow-lg dark:shadow-none cursor-ew-resize z-30 hover:scale-110 transition-transform flex items-center justify-center active:scale-90"
                onMouseDown={(e) => { e.stopPropagation(); handleMouseDown('v', idx); }}
                onTouchStart={(e) => { e.stopPropagation(); handleMouseDown('v', idx); }}
              >
                <div className="w-1.5 h-1.5 bg-white rounded-full" />
              </div>

              <div 
                className="absolute inset-y-0 -left-6 -right-6 cursor-ew-resize z-10"
                onMouseDown={(e) => { e.stopPropagation(); handleMouseDown('v', idx); }}
                onTouchStart={(e) => { e.stopPropagation(); handleMouseDown('v', idx); }}
              />
              <button 
                onClick={(e) => { e.stopPropagation(); removeLine('v', idx); }}
                className="absolute -left-10 top-4 bg-white dark:bg-gray-800 p-3 rounded-full shadow-lg dark:shadow-none text-red-500 opacity-0 group-hover:opacity-100 transition-opacity z-40 hover:scale-110 active:scale-90"
              >
                <Trash2 size={20} />
              </button>
            </div>
          ))}
        </div>
      </div>
      
      <div className="bg-blue-50/50 dark:bg-blue-900/20 p-4 rounded-2xl border border-blue-100 dark:border-blue-800">
        <p className="text-xs text-blue-600/80 dark:text-blue-400/80 leading-relaxed">
          <span className="font-bold">提示：</span>
          拖动蓝色线条来调整分割位置。点击线条末端的垃圾桶图标可删除线条。
          分割后的图片将按照线条围成的区域生成。
        </p>
      </div>
    </div>
  );
};
