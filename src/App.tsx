import React, { useState, useEffect, useRef } from 'react';
import { 
  Plus, 
  Trash2, 
  Download, 
  Grid, 
  Image as ImageIcon, 
  ChevronLeft, 
  Maximize2, 
  X, 
  Layers,
  CheckCircle2,
  DownloadCloud,
  FolderOpen,
  Scissors,
  User,
  UserPlus,
  Library,
  Sparkles,
  Loader2,
  Brush,
  Paintbrush,
  Save,
  GripVertical,
  RefreshCw
} from 'lucide-react';
import { motion, AnimatePresence, Reorder } from 'motion/react';
import JSZip from 'jszip';
import { saveAs } from 'file-saver';
import { Project, Tile, GridMode, Character, MaskedImage, CompositeImage } from './types';
import { splitImage, splitImageCustom, createComposite } from './lib/imageUtils';
import { CustomSplitEditor } from './components/CustomSplitEditor';
import { CharacterGenerationModal } from './components/CharacterGenerationModal';
import { ImageEditorModal } from './components/ImageEditorModal';
import { CompositePreviewModal } from './components/CompositePreviewModal';
import { cn } from './lib/utils';
import { GoogleGenAI } from "@google/genai";

import { get, set } from 'idb-keyval';

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

export default function App() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);
  const [isCreatingProject, setIsCreatingProject] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');
  const [selectedTile, setSelectedTile] = useState<Tile | null>(null);
  const [isRecomposing, setIsRecomposing] = useState(false);
  const [recomposeColumns, setRecomposeColumns] = useState<number>(3);
  const [isStorageError, setIsStorageError] = useState(false);
  const [activeTab, setActiveTab] = useState<'editor' | 'library' | 'masked' | 'composite'>('editor');
  const [isGeneratingCharacter, setIsGeneratingCharacter] = useState(false);
  const [pendingReplacementImage, setPendingReplacementImage] = useState<string | null>(null);
  const [compositeModal, setCompositeModal] = useState<{
    isOpen: boolean;
    selectedTiles: Tile[];
    columns: number;
    editingId?: string;
  }>({
    isOpen: false,
    selectedTiles: [],
    columns: 3
  });
  const [characterModal, setCharacterModal] = useState<{
    isOpen: boolean;
    sourceImageUrl: string;
  }>({
    isOpen: false,
    sourceImageUrl: ''
  });
  const [imageEditorModal, setImageEditorModal] = useState<{
    isOpen: boolean;
    imageUrl: string;
    initialMode?: 'mask' | 'crop';
    onSave?: (maskedImage: MaskedImage) => void;
    onCrop?: (dataUrl: string) => void;
  }>({
    isOpen: false,
    imageUrl: '',
  });
  const [compositePreviewUrl, setCompositePreviewUrl] = useState<string | null>(null);

  const [confirmModal, setConfirmModal] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
  }>({
    isOpen: false,
    title: '',
    message: '',
    onConfirm: () => {}
  });
  const fileInputRef = useRef<HTMLInputElement>(null);
  const singleFileInputRef = useRef<HTMLInputElement>(null);

  const [isDragOver, setIsDragOver] = useState(false);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);

    const files = e.dataTransfer.files;
    if (!files || files.length === 0) return;

    // Filter to only image files safely
    const imageFiles: File[] = [];
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      if (file && file.type.startsWith('image/')) {
        imageFiles.push(file);
      }
    }
    if (imageFiles.length === 0) return;

    if (activeProjectId) {
      if (activeTab === 'editor') {
        const file = imageFiles[0];
        const dataUrl = await new Promise<string>((resolve) => {
          const reader = new FileReader();
          reader.onload = (event) => resolve(event.target?.result as string);
          reader.readAsDataURL(file);
        });

        setProjects(prev => prev.map(p => 
          p.id === activeProjectId 
            ? { ...p, sourceImage: dataUrl } 
            : p
        ));
      } else {
        const newTiles: Tile[] = [];
        for (const file of imageFiles) {
          const dataUrl = await new Promise<string>((resolve) => {
            const reader = new FileReader();
            reader.onload = (event) => resolve(event.target?.result as string);
            reader.readAsDataURL(file);
          });
          
          newTiles.push({
            id: crypto.randomUUID(),
            dataUrl: dataUrl,
            row: 0,
            col: 0,
            isSelected: false,
            selectionOrder: undefined
          });
        }

        setProjects(prev => prev.map(p => 
          p.id === activeProjectId 
            ? { ...p, tiles: [...newTiles, ...p.tiles] } 
            : p
        ));
      }
    } else {
      const file = imageFiles[0];
      const dataUrl = await new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onload = (event) => resolve(event.target?.result as string);
        reader.readAsDataURL(file);
      });

      const newProjectId = crypto.randomUUID();
      const newProject: Project = {
        id: newProjectId,
        name: file.name.split('.')[0] || "新拖拽项目",
        createdAt: Date.now(),
        splitMode: 'grid',
        rows: 3,
        cols: 3,
        horizontalLines: [33.33, 66.66],
        verticalLines: [33.33, 66.66],
        tiles: [],
        sourceImage: dataUrl
      };
      
      setProjects(prev => [newProject, ...prev]);
      setActiveProjectId(newProjectId);
    }
  };

  // Load projects from IndexedDB
  useEffect(() => {
    const loadProjects = async () => {
      try {
        const saved = await get<Project[]>('grid-splitter-projects');
        if (saved) {
          // Migration: Ensure all projects have new fields and unique IDs
          const seenIds = new Set<string>();
          const migrated = saved
            .filter(p => {
              if (seenIds.has(p.id)) return false;
              seenIds.add(p.id);
              return true;
            })
            .map(p => ({
              ...p,
              splitMode: p.splitMode || 'grid',
              horizontalLines: p.horizontalLines || [33.33, 66.66],
              verticalLines: p.verticalLines || [33.33, 66.66],
            }));
          setProjects(migrated);
        }
      } catch (e) {
        console.error("Failed to load projects from IndexedDB", e);
      }
    };
    loadProjects();
  }, []);

  // Save projects to IndexedDB whenever they change
  useEffect(() => {
    const saveProjects = async () => {
      if (projects.length === 0) return;
      try {
        await set('grid-splitter-projects', projects);
        setIsStorageError(false);
      } catch (e) {
        console.error("Failed to save projects to IndexedDB", e);
        if (e instanceof Error && (e.name === 'QuotaExceededError' || e.name === 'NS_ERROR_DOM_QUOTA_REACHED')) {
          setIsStorageError(true);
        }
      }
    };
    saveProjects();
  }, [projects]);

  const activeProject = projects.find(p => p.id === activeProjectId);

  const [isGeneratingSidebarPreview, setIsGeneratingSidebarPreview] = useState(false);

  const generatePreview = async (tiles?: Tile[], cols?: number) => {
    if (!activeProject) return;
    
    const targetTiles = tiles || activeProject.tiles
      .filter(t => t.isSelected)
      .sort((a, b) => (a.selectionOrder || 0) - (b.selectionOrder || 0));
    
    if (targetTiles.length < 2) {
      setCompositePreviewUrl(null);
      return;
    }

    setIsGeneratingSidebarPreview(true);
    try {
      const url = await createComposite(targetTiles.map(t => t.dataUrl), cols || recomposeColumns);
      setCompositePreviewUrl(url);
    } catch (err) {
      console.error("Failed to generate sidebar preview", err);
    } finally {
      setIsGeneratingSidebarPreview(false);
    }
  };

  const createProject = () => {
    if (!newProjectName.trim()) return;
    const newProject: Project = {
      id: crypto.randomUUID(),
      name: newProjectName,
      createdAt: Date.now(),
      splitMode: 'grid',
      rows: 3,
      cols: 3,
      horizontalLines: [33.33, 66.66],
      verticalLines: [33.33, 66.66],
      tiles: []
    };
    setProjects(prev => [newProject, ...prev]);
    setActiveProjectId(newProject.id);
    setNewProjectName('');
    setIsCreatingProject(false);
  };

  const deleteProject = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setConfirmModal({
      isOpen: true,
      title: '删除项目',
      message: '确定要删除这个项目吗？此操作不可撤销。',
      onConfirm: () => {
        setProjects(prev => prev.filter(p => p.id !== id));
        if (activeProjectId === id) setActiveProjectId(null);
        setConfirmModal(prev => ({ ...prev, isOpen: false }));
      }
    });
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0 || !activeProjectId) return;

    const file = files[0]; // Only handle one image at a time for the new workflow
    const dataUrl = await new Promise<string>((resolve) => {
      const reader = new FileReader();
      reader.onload = (event) => resolve(event.target?.result as string);
      reader.readAsDataURL(file);
    });

    setProjects(prev => prev.map(p => 
      p.id === activeProjectId 
        ? { ...p, sourceImage: dataUrl } 
        : p
    ));
    
    // Reset input
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const addSingleImages = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0 || !activeProjectId) return;

    const newTiles: Tile[] = [];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const dataUrl = await new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onload = (event) => resolve(event.target?.result as string);
        reader.readAsDataURL(file);
      });
      
      newTiles.push({
        id: crypto.randomUUID(),
        dataUrl: dataUrl,
        row: 0,
        col: 0,
        isSelected: false,
        selectionOrder: undefined
      });
    }

    setProjects(prev => prev.map(p => 
      p.id === activeProjectId 
        ? { ...p, tiles: [...newTiles, ...p.tiles] } 
        : p
    ));
    
    if (singleFileInputRef.current) singleFileInputRef.current.value = '';
  };

  const performSplit = async () => {
    if (!activeProject || !activeProject.sourceImage) {
      alert('请先上传图片');
      return;
    }

    const splitTiles = activeProject.splitMode === 'custom'
      ? await splitImageCustom(
          activeProject.sourceImage,
          activeProject.horizontalLines,
          activeProject.verticalLines
        )
      : await splitImage(
          activeProject.sourceImage, 
          activeProject.rows, 
          activeProject.cols
        );
    
    const tiles: Tile[] = splitTiles.map((t, idx) => ({
      id: crypto.randomUUID(),
      dataUrl: t.dataUrl,
      row: t.row,
      col: t.col,
      isSelected: false,
      selectionOrder: undefined
    }));

    setProjects(prev => prev.map(p => 
      p.id === activeProjectId 
        ? { ...p, tiles: [...tiles, ...p.tiles] } 
        : p
    ));
  };

  const reSplitLastImage = async () => {
    if (!activeProject || !activeProject.sourceImage) {
      alert('没有可重新分割的图片');
      return;
    }

    const splitTiles = activeProject.splitMode === 'custom'
      ? await splitImageCustom(
          activeProject.sourceImage!,
          activeProject.horizontalLines,
          activeProject.verticalLines
        )
      : await splitImage(
          activeProject.sourceImage!, 
          activeProject.rows, 
          activeProject.cols
        );
    
    const tiles: Tile[] = splitTiles.map((t, idx) => ({
      id: crypto.randomUUID(),
      dataUrl: t.dataUrl,
      row: t.row,
      col: t.col,
      isSelected: false,
      selectionOrder: undefined
    }));

    setProjects(prev => prev.map(p => 
      p.id === activeProjectId 
        ? { ...p, tiles: [...tiles, ...p.tiles] } 
        : p
    ));
  };

  const clearTiles = () => {
    setConfirmModal({
      isOpen: true,
      title: '清空图片',
      message: '确定要清空当前项目的所有图片吗？',
      onConfirm: () => {
        setProjects(prev => prev.map(p => 
          p.id === activeProjectId ? { ...p, tiles: [] } : p
        ));
        setConfirmModal(prev => ({ ...prev, isOpen: false }));
      }
    });
  };

  const selectAllTiles = (select: boolean) => {
    setProjects(prev => prev.map(p => 
      p.id === activeProjectId 
        ? { ...p, tiles: p.tiles.map((t, idx) => ({ ...t, isSelected: select, selectionOrder: select ? idx + 1 : undefined })) } 
        : p
    ));
  };

  const updateGridConfig = (rows: number, cols: number) => {
    setProjects(prev => prev.map(p => 
      p.id === activeProjectId 
        ? { ...p, rows, cols, splitMode: 'grid' } 
        : p
    ));
  };

  const updateSplitMode = (mode: 'grid' | 'custom') => {
    setProjects(prev => prev.map(p => 
      p.id === activeProjectId ? { ...p, splitMode: mode } : p
    ));
  };

  const updateCustomLines = (hLines: number[], vLines: number[]) => {
    const sortedH = [...hLines].sort((a, b) => a - b);
    const sortedV = [...vLines].sort((a, b) => a - b);
    setProjects(prev => prev.map(p => 
      p.id === activeProjectId 
        ? { ...p, horizontalLines: sortedH, verticalLines: sortedV, splitMode: 'custom' } 
        : p
    ));
  };

  const setSplitMode = (mode: 'grid' | 'custom') => {
    setProjects(prev => prev.map(p => 
      p.id === activeProjectId 
        ? { ...p, splitMode: mode } 
        : p
    ));
  };

  const toggleTileSelection = (tileId: string) => {
    setProjects(prev => prev.map(p => {
      if (p.id !== activeProjectId) return p;
      
      const currentSelectedCount = p.tiles.filter(t => t.isSelected).length;
      const isCurrentlySelected = p.tiles.find(t => t.id === tileId)?.isSelected;
      
      return { 
        ...p, 
        tiles: p.tiles.map(t => {
          if (t.id === tileId) {
            const newIsSelected = !t.isSelected;
            return { 
              ...t, 
              isSelected: newIsSelected, 
              selectionOrder: newIsSelected ? currentSelectedCount + 1 : undefined 
            };
          }
          return t;
        }).map((t, _, array) => {
          // Re-calculate selection orders if a tile was deselected to keep them sequential
          if (!isCurrentlySelected) return t; // If we just selected, no need to re-order others
          
          const selectedTiles = array.filter(item => item.isSelected).sort((a, b) => (a.selectionOrder || 0) - (b.selectionOrder || 0));
          const newOrder = selectedTiles.findIndex(item => item.id === t.id) + 1;
          return t.isSelected ? { ...t, selectionOrder: newOrder } : t;
        })
      };
    }));
  };

  const deleteTile = (tileId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setProjects(prev => prev.map(p => 
      p.id === activeProjectId 
        ? { ...p, tiles: p.tiles.filter(t => t.id !== tileId) } 
        : p
    ));
  };

  const deleteSelectedTiles = () => {
    setConfirmModal({
      isOpen: true,
      title: '删除选中',
      message: '确定要删除选中的图片吗？',
      onConfirm: () => {
        setProjects(prev => prev.map(p => 
          p.id === activeProjectId 
            ? { ...p, tiles: p.tiles.filter(t => !t.isSelected) } 
            : p
        ));
        setConfirmModal(prev => ({ ...prev, isOpen: false }));
      }
    });
  };

  const reorderSelectedTiles = (newSelectedTiles: Tile[]) => {
    if (!activeProject) return;
    const otherTiles = activeProject.tiles.filter(t => !t.isSelected);
    const updatedSelectedTiles = newSelectedTiles.map((t, index) => ({
      ...t,
      selectionOrder: index + 1
    }));
    setProjects(prev => prev.map(p => 
      p.id === activeProjectId 
        ? { ...p, tiles: [...otherTiles, ...updatedSelectedTiles] } 
        : p
    ));
  };

  const addCharacterToLibrary = (character: Character) => {
    setProjects(prev => prev.map(p => 
      p.id === activeProjectId 
        ? { ...p, characters: [...(p.characters || []), character] } 
        : p
    ));
  };

  const addMaskedImageToLibrary = (maskedImage: MaskedImage) => {
    setProjects(prev => prev.map(p => 
      p.id === activeProjectId 
        ? { ...p, maskedImages: [maskedImage, ...(p.maskedImages || [])] } 
        : p
    ));
  };

  const addCompositeImageToLibrary = (compositeImage: CompositeImage, isEdit?: boolean) => {
    setProjects(prev => prev.map(p => {
      if (p.id !== activeProjectId) return p;
      const currentComposites = p.compositeImages || [];
      if (isEdit) {
        return {
          ...p,
          compositeImages: currentComposites.map(c => c.id === compositeImage.id ? compositeImage : c)
        };
      }
      return { ...p, compositeImages: [compositeImage, ...currentComposites] };
    }));
  };

  const syncProjectTilesOrder = (newOrderTiles: Tile[], newColumns?: number) => {
    if (newColumns !== undefined) {
      setRecomposeColumns(newColumns);
    }
    setProjects(prev => prev.map(p => {
      if (p.id !== activeProjectId) return p;
      
      // Update the selectionOrder for the tiles that are in the new order
      const updatedTiles = p.tiles.map(tile => {
        const indexInNewOrder = newOrderTiles.findIndex(t => t.id === tile.id);
        if (indexInNewOrder !== -1) {
          return { ...tile, selectionOrder: indexInNewOrder + 1, isSelected: true };
        }
        return { ...tile, isSelected: false, selectionOrder: undefined };
      });

      return { ...p, tiles: updatedTiles };
    }));
  };
  
  const editComposite = (composite: CompositeImage) => {
    if (!activeProject) return;
    
    // Find the actual tiles from the project that match the IDs in the composite
    const selectedTiles = composite.tileIds
      .map(id => activeProject.tiles.find(t => t.id === id))
      .filter((t): t is Tile => !!t)
      .map((t, index) => ({ ...t, isSelected: true, selectionOrder: index + 1 }));

    // Set editing state for the composite modal and open it
    setCompositeModal({
      isOpen: true,
      selectedTiles,
      columns: composite.columns,
      editingId: composite.id
    });
  };

  const handleReplacement = (type: 'tile' | 'masked' | 'composite', id: string) => {
    if (!pendingReplacementImage) return;

    setProjects(prev => prev.map(p => {
      if (p.id !== activeProjectId) return p;

      if (type === 'tile') {
        return {
          ...p,
          tiles: p.tiles.map(t => t.id === id ? { ...t, dataUrl: pendingReplacementImage } : t)
        };
      } else if (type === 'masked') {
        return {
          ...p,
          maskedImages: (p.maskedImages || []).map(m => m.id === id ? { ...m, dataUrl: pendingReplacementImage } : m)
        };
      } else if (type === 'composite') {
        return {
          ...p,
          compositeImages: (p.compositeImages || []).map(c => c.id === id ? { ...c, dataUrl: pendingReplacementImage } : c)
        };
      }
      return p;
    }));

    setPendingReplacementImage(null);
  };

  const updateCompositeImage = (id: string, dataUrl: string) => {
    setProjects(prev => prev.map(p => 
      p.id === activeProjectId 
        ? { ...p, compositeImages: (p.compositeImages || []).map(c => c.id === id ? { ...c, dataUrl } : c) } 
        : p
    ));
  };

  const deleteCharacter = (characterId: string) => {
    setConfirmModal({
      isOpen: true,
      title: '删除角色',
      message: '确定要从角色库中删除这个角色吗？',
      onConfirm: () => {
        setProjects(prev => prev.map(p => 
          p.id === activeProjectId 
            ? { ...p, characters: (p.characters || []).filter(c => c.id !== characterId) } 
            : p
        ));
        setConfirmModal(prev => ({ ...prev, isOpen: false }));
      }
    });
  };

  const deleteMaskedImage = (maskedImageId: string) => {
    setConfirmModal({
      isOpen: true,
      title: '删除涂抹图',
      message: '确定要删除这张涂抹图吗？',
      onConfirm: () => {
        setProjects(prev => prev.map(p => 
          p.id === activeProjectId 
            ? { ...p, maskedImages: (p.maskedImages || []).filter(m => m.id !== maskedImageId) } 
            : p
        ));
        setConfirmModal(prev => ({ ...prev, isOpen: false }));
      }
    });
  };

  const deleteCompositeImage = (compositeImageId: string) => {
    setConfirmModal({
      isOpen: true,
      title: '删除组合图',
      message: '确定要删除这张组合图吗？',
      onConfirm: () => {
        setProjects(prev => prev.map(p => 
          p.id === activeProjectId 
            ? { ...p, compositeImages: (p.compositeImages || []).filter(c => c.id !== compositeImageId) } 
            : p
        ));
        setConfirmModal(prev => ({ ...prev, isOpen: false }));
      }
    });
  };

  const clearCharacters = () => {
    setConfirmModal({
      isOpen: true,
      title: '清空角色库',
      message: '确定要清空所有角色吗？此操作不可撤销。',
      onConfirm: () => {
        setProjects(prev => prev.map(p => 
          p.id === activeProjectId ? { ...p, characters: [] } : p
        ));
        setConfirmModal(prev => ({ ...prev, isOpen: false }));
      }
    });
  };

  const clearMaskedImages = () => {
    setConfirmModal({
      isOpen: true,
      title: '清空涂抹图库',
      message: '确定要清空所有涂抹图吗？此操作不可撤销。',
      onConfirm: () => {
        setProjects(prev => prev.map(p => 
          p.id === activeProjectId ? { ...p, maskedImages: [] } : p
        ));
        setConfirmModal(prev => ({ ...prev, isOpen: false }));
      }
    });
  };

  const clearCompositeImages = () => {
    setConfirmModal({
      isOpen: true,
      title: '清空组合图库',
      message: '确定要清空所有组合图吗？此操作不可撤销。',
      onConfirm: () => {
        setProjects(prev => prev.map(p => 
          p.id === activeProjectId ? { ...p, compositeImages: [] } : p
        ));
        setConfirmModal(prev => ({ ...prev, isOpen: false }));
      }
    });
  };

  const clearInitialLibrary = () => {
    setConfirmModal({
      isOpen: true,
      title: '清空初始图库',
      message: '确定要清空所有初始切片吗？此操作不可撤销。',
      onConfirm: () => {
        setProjects(prev => prev.map(p => 
          p.id === activeProjectId ? { ...p, tiles: [] } : p
        ));
        setConfirmModal(prev => ({ ...prev, isOpen: false }));
      }
    });
  };

  const downloadSingleTile = (tile: Tile) => {
    saveAs(tile.dataUrl, `tile-${tile.row}-${tile.col}.png`);
  };

  const downloadBatch = async () => {
    if (!activeProject) return;
    const zip = new JSZip();
    const selectedTiles = activeProject.tiles.filter(t => t.isSelected);
    const tilesToDownload = selectedTiles.length > 0 ? selectedTiles : activeProject.tiles;

    tilesToDownload.forEach((tile, i) => {
      const base64Data = tile.dataUrl.split(',')[1];
      zip.file(`tile-${tile.row}-${tile.col}.png`, base64Data, { base64: true });
    });

    const content = await zip.generateAsync({ type: 'blob' });
    saveAs(content, `${activeProject.name}-tiles.zip`);
  };

  const downloadComposite = () => {
    if (!compositePreviewUrl) return;
    saveAs(compositePreviewUrl, `composite-${Date.now()}.png`);
  };

  const saveCompositeToLibrary = () => {
    if (!compositePreviewUrl || !activeProject) return;
    const newComposite: CompositeImage = {
      id: crypto.randomUUID(),
      dataUrl: compositePreviewUrl,
      tileIds: activeProject.tiles.filter(t => t.isSelected).map(t => t.id),
      columns: recomposeColumns,
      createdAt: Date.now()
    };
    addCompositeImageToLibrary(newComposite);
    setActiveTab('composite');
  };

  const handleRecompose = async () => {
    if (!activeProject) return;
    const selectedTiles = [...activeProject.tiles]
      .filter(t => t.isSelected);
      
    if (selectedTiles.length === 0) {
      alert('请先选择要组合的图片');
      return;
    }

    setCompositeModal({
      isOpen: true,
      selectedTiles,
      columns: recomposeColumns
    });
  };

  return (
    <div 
      onDragOver={handleDragOver}
      className="min-h-screen bg-[#F5F5F7] text-[#1D1D1F] font-sans selection:bg-blue-100 relative"
    >
      {/* Header */}
      <header className="sticky top-0 z-30 bg-white/80 backdrop-blur-md border-b border-gray-200 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="bg-blue-600 p-2 rounded-xl text-white shadow-lg shadow-blue-200">
            <Grid size={24} />
          </div>
          <h1 className="text-xl font-bold tracking-tight">GridSplitter Pro</h1>
        </div>
        
        {activeProjectId && (
          <button 
            onClick={() => setActiveProjectId(null)}
            className="flex items-center gap-2 text-sm font-medium text-gray-500 hover:text-gray-900 transition-colors"
          >
            <ChevronLeft size={18} />
            返回项目列表
          </button>
        )}
      </header>

      <main className="max-w-7xl mx-auto p-6">
        {isStorageError && (
          <div className="mb-6 bg-red-50 border border-red-200 text-red-600 px-6 py-4 rounded-2xl flex items-center justify-between">
            <div className="flex items-center gap-3">
              <X size={20} className="bg-red-100 p-1 rounded-full" />
              <p className="text-sm font-bold">存储空间已满！请删除旧项目以保存新数据。</p>
            </div>
            <button onClick={() => setIsStorageError(false)} className="text-xs font-bold uppercase tracking-wider hover:underline">
              忽略
            </button>
          </div>
        )}
        {!activeProjectId ? (
          /* Project List View */
          <div className="space-y-8">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-3xl font-extrabold tracking-tight">我的项目</h2>
                <p className="text-gray-500 mt-1">管理您的组图分割与重组任务</p>
              </div>
              <button 
                onClick={() => setIsCreatingProject(true)}
                className="bg-blue-600 hover:bg-blue-700 text-white px-5 py-2.5 rounded-full font-semibold flex items-center gap-2 transition-all shadow-lg shadow-blue-100 active:scale-95"
              >
                <Plus size={20} />
                新建项目
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              <AnimatePresence>
                {projects.map((project) => (
                  <motion.div
                    key={project.id}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    onClick={() => setActiveProjectId(project.id)}
                    className="group bg-white rounded-3xl p-6 shadow-sm hover:shadow-xl transition-all cursor-pointer border border-transparent hover:border-blue-100 relative overflow-hidden"
                  >
                    <div className="flex justify-between items-start mb-4">
                      <div className="bg-gray-100 p-3 rounded-2xl group-hover:bg-blue-50 transition-colors">
                        <FolderOpen className="text-gray-400 group-hover:text-blue-500" size={24} />
                      </div>
                      <button 
                        onClick={(e) => deleteProject(project.id, e)}
                        className="text-gray-300 hover:text-red-500 p-2 transition-colors"
                      >
                        <Trash2 size={18} />
                      </button>
                    </div>
                    <h3 className="text-lg font-bold mb-1">{project.name}</h3>
                    <p className="text-xs text-gray-400 font-mono">
                      {new Date(project.createdAt).toLocaleDateString()}
                    </p>
                    
                    {project.sourceImage && (
                      <div className="mt-4 aspect-video rounded-xl overflow-hidden bg-gray-100 relative">
                        <img 
                          src={project.sourceImage} 
                          alt={project.name} 
                          className="w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-opacity"
                          referrerPolicy="no-referrer"
                        />
                        <div className="absolute inset-0 bg-gradient-to-t from-black/20 to-transparent" />
                        <div className="absolute bottom-2 right-2 bg-white/90 backdrop-blur px-2 py-1 rounded-lg text-[10px] font-bold">
                          {project.rows} × {project.cols}
                        </div>
                      </div>
                    )}
                  </motion.div>
                ))}
              </AnimatePresence>

              {projects.length === 0 && !isCreatingProject && (
                <div className="col-span-full py-20 flex flex-col items-center justify-center text-gray-400 border-2 border-dashed border-gray-200 rounded-3xl">
                  <ImageIcon size={48} className="mb-4 opacity-20" />
                  <p>暂无项目，点击右上角新建一个吧</p>
                </div>
              )}
            </div>
          </div>
        ) : (
          /* Editor View */
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
            {/* Sidebar Controls */}
            <aside className="lg:col-span-1 space-y-6">
              <div className="bg-white rounded-3xl p-6 shadow-sm border border-gray-100">
                <div className="flex flex-col gap-2 mb-6">
                  <button 
                    onClick={() => setActiveTab('editor')}
                    className={cn(
                      "flex items-center gap-3 px-5 py-4 rounded-2xl font-bold transition-all text-sm flex-1 sm:flex-none justify-center sm:justify-start",
                      activeTab === 'editor' ? "bg-blue-600 text-white shadow-lg shadow-blue-100" : "text-gray-500 hover:bg-gray-100"
                    )}
                  >
                    <Scissors size={20} />
                    分割编辑器
                  </button>
                  <button 
                    onClick={() => setActiveTab('library')}
                    className={cn(
                      "flex items-center gap-3 px-5 py-4 rounded-2xl font-bold transition-all text-sm flex-1 sm:flex-none justify-center sm:justify-start",
                      activeTab === 'library' ? "bg-blue-600 text-white shadow-lg shadow-blue-100" : "text-gray-500 hover:bg-gray-100"
                    )}
                  >
                    <Library size={20} />
                    角色三视图库
                  </button>
                  <button 
                    onClick={() => setActiveTab('masked')}
                    className={cn(
                      "flex items-center gap-3 px-5 py-4 rounded-2xl font-bold transition-all text-sm flex-1 sm:flex-none justify-center sm:justify-start",
                      activeTab === 'masked' ? "bg-blue-600 text-white shadow-lg shadow-blue-100" : "text-gray-500 hover:bg-gray-100"
                    )}
                  >
                    <Paintbrush size={20} />
                    涂抹图库
                  </button>
                  <button 
                    onClick={() => setActiveTab('composite')}
                    className={cn(
                      "flex items-center gap-3 px-5 py-4 rounded-2xl font-bold transition-all text-sm flex-1 sm:flex-none justify-center sm:justify-start",
                      activeTab === 'composite' ? "bg-blue-600 text-white shadow-lg shadow-blue-100" : "text-gray-500 hover:bg-gray-100"
                    )}
                  >
                    <Layers size={20} />
                    组合图库
                  </button>
                </div>

                {activeTab === 'editor' ? (
                  <>
                    <div className="space-y-6">
                      <h3 className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-4">分割设置</h3>
                      
                      {activeProject?.sourceImage && (
                        <div className="mb-6">
                          <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest block mb-2">待分割预览</label>
                          <div className="relative aspect-video rounded-2xl overflow-hidden bg-gray-50 border border-gray-100 group">
                            <img 
                              src={activeProject.sourceImage} 
                              alt="Source Thumbnail" 
                              className="w-full h-full object-cover"
                              referrerPolicy="no-referrer"
                            />
                            <div className="absolute inset-0 bg-black/5 group-hover:bg-transparent transition-colors" />
                          </div>
                        </div>
                      )}

                      <div className="space-y-6">
                        {activeProject && (
                          <>
                            <div className="flex bg-gray-100 p-1 rounded-xl">
                              <button 
                                onClick={() => updateSplitMode('grid')}
                                className={cn(
                                  "flex-1 py-2 text-xs font-bold rounded-lg transition-all",
                                  activeProject.splitMode === 'grid' ? "bg-white shadow-sm text-blue-600" : "text-gray-400"
                                )}
                              >
                                网格分割
                              </button>
                              <button 
                                onClick={() => updateSplitMode('custom')}
                                className={cn(
                                  "flex-1 py-2 text-xs font-bold rounded-lg transition-all",
                                  activeProject.splitMode === 'custom' ? "bg-white shadow-sm text-blue-600" : "text-gray-400"
                                )}
                              >
                                自定义划线
                              </button>
                            </div>

                            {activeProject.splitMode === 'grid' ? (
                              <div className="space-y-4">
                                <div>
                                  <label className="text-xs font-bold text-gray-500 block mb-2">快速预设</label>
                                  <div className="grid grid-cols-2 gap-3">
                                    {[2, 3, 4, 5].map((size) => (
                                      <button
                                        key={size}
                                        onClick={() => updateGridConfig(size, size)}
                                        className={cn(
                                          "py-4 rounded-xl text-sm font-bold border-2 transition-all active:scale-95",
                                          activeProject.rows === size && activeProject.cols === size
                                            ? "bg-blue-600 border-blue-600 text-white shadow-md shadow-blue-100" 
                                            : "bg-white border-gray-100 text-gray-600 hover:border-blue-200"
                                        )}
                                      >
                                        {size} × {size}
                                      </button>
                                    ))}
                                  </div>
                                </div>

                                <div className="grid grid-cols-2 gap-4">
                                  <div>
                                    <label className="text-xs font-bold text-gray-500 block mb-1">行数 (Rows)</label>
                                    <input 
                                      type="number" 
                                      min="1" 
                                      max="10"
                                      value={activeProject.rows}
                                      onChange={(e) => updateGridConfig(parseInt(e.target.value) || 1, activeProject.cols)}
                                      className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-blue-500"
                                    />
                                  </div>
                                  <div>
                                    <label className="text-xs font-bold text-gray-500 block mb-1">列数 (Cols)</label>
                                    <input 
                                      type="number" 
                                      min="1" 
                                      max="10"
                                      value={activeProject.cols}
                                      onChange={(e) => updateGridConfig(activeProject.rows, parseInt(e.target.value) || 1)}
                                      className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-blue-500"
                                    />
                                  </div>
                                </div>
                              </div>
                            ) : (
                              <div className="space-y-4">
                                <div className="grid grid-cols-2 gap-2">
                                  <div className="bg-gray-50 p-3 rounded-xl border border-gray-100">
                                    <div className="text-[10px] uppercase font-bold text-gray-400 mb-1">水平线</div>
                                    <div className="text-lg font-bold text-blue-600">{activeProject.horizontalLines.length}</div>
                                  </div>
                                  <div className="bg-gray-50 p-3 rounded-xl border border-gray-100">
                                    <div className="text-[10px] uppercase font-bold text-gray-400 mb-1">垂直线</div>
                                    <div className="text-lg font-bold text-blue-600">{activeProject.verticalLines.length}</div>
                                  </div>
                                </div>
                                <p className="text-[10px] text-gray-400 leading-relaxed">
                                  在右侧编辑器中拖动线条，或点击“重新分割”应用更改。
                                </p>
                              </div>
                            )}

                            <div className="pt-2 space-y-2">
                              <button 
                                onClick={() => fileInputRef.current?.click()}
                                className="w-full bg-blue-600 hover:bg-blue-700 text-white py-5 rounded-xl font-bold flex items-center justify-center gap-2 transition-all active:scale-95 shadow-lg shadow-blue-100"
                              >
                                <Plus size={24} />
                                上传图片
                              </button>
                              
                              {activeProject.sourceImage && (
                                <button 
                                  onClick={activeProject.tiles.length === 0 ? performSplit : reSplitLastImage}
                                  className={cn(
                                    "w-full py-5 rounded-xl font-bold flex items-center justify-center gap-2 transition-all active:scale-95",
                                    activeProject.tiles.length === 0 
                                      ? "bg-green-600 hover:bg-green-700 text-white shadow-lg shadow-green-100"
                                      : "bg-blue-50 text-blue-600 hover:bg-blue-100"
                                  )}
                                >
                                  <Scissors size={24} />
                                  {activeProject.tiles.length === 0 ? "立即开始分割" : "继续分割并添加"}
                                </button>
                              )}
                            </div>
                          </>
                        )}

                        <input 
                          type="file" 
                          ref={fileInputRef} 
                          onChange={handleImageUpload} 
                          accept="image/*" 
                          className="hidden" 
                        />
                        <input 
                          type="file" 
                          ref={singleFileInputRef} 
                          onChange={addSingleImages} 
                          accept="image/*" 
                          multiple
                          className="hidden" 
                        />
                      </div>
                    </div>

                    {/* Move Recompose Preview and Sorting here */}
                    {activeProject?.sourceImage && (
                      <div className="space-y-6 pt-6 border-t border-gray-100">
                        {/* Composite Preview Area */}
                        {compositePreviewUrl && (
                          <motion.div 
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            className="space-y-4"
                          >
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <div className="bg-blue-600 p-1.5 rounded-lg text-white">
                                  <Layers size={16} />
                                </div>
                                <h3 className="text-sm font-bold whitespace-nowrap">组合预览</h3>
                              </div>
                              <button 
                                onClick={() => setCompositePreviewUrl(null)}
                                className="p-1.5 hover:bg-gray-100 rounded-full transition-colors text-gray-400"
                              >
                                <X size={16} />
                              </button>
                            </div>

                            <div className="space-y-4">
                              <div 
                                onClick={handleRecompose}
                                className="bg-gray-50 rounded-2xl overflow-hidden border border-gray-100 relative w-full flex items-center justify-center group cursor-pointer hover:border-blue-300 transition-all"
                              >
                                {isGeneratingSidebarPreview ? (
                                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-white/60 backdrop-blur-sm aspect-square">
                                    <Loader2 className="animate-spin text-blue-600" size={24} />
                                    <span className="text-[10px] font-bold text-blue-600">生成中...</span>
                                  </div>
                                ) : (
                                  <>
                                    <img 
                                      src={compositePreviewUrl} 
                                      alt="Composite Preview" 
                                      className="w-full h-auto object-contain max-h-[300px]" 
                                      referrerPolicy="no-referrer"
                                    />
                                    <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors flex items-center justify-center opacity-0 group-hover:opacity-100">
                                      <div className="bg-white/90 backdrop-blur px-4 py-2 rounded-xl shadow-xl text-blue-600 flex items-center gap-2 font-bold text-xs transform translate-y-2 group-hover:translate-y-0 transition-all">
                                        <Maximize2 size={14} />
                                        放大并调整顺序
                                      </div>
                                    </div>
                                  </>
                                )}
                              </div>

                              <div className="space-y-2">
                                <button 
                                  onClick={saveCompositeToLibrary}
                                  className="w-full bg-blue-600 text-white py-3 rounded-xl text-sm font-bold flex items-center justify-center gap-2 hover:bg-blue-700 transition-all shadow-md shadow-blue-100 active:scale-95"
                                >
                                  <Save size={18} />
                                  保存到图库
                                </button>

                                <div className="grid grid-cols-2 gap-2">
                                  <button 
                                    onClick={() => setImageEditorModal({ 
                                      isOpen: true, 
                                      imageUrl: compositePreviewUrl!,
                                      initialMode: 'crop',
                                      onCrop: (croppedUrl) => setPendingReplacementImage(croppedUrl)
                                    })}
                                    className="bg-blue-50 text-blue-600 py-2.5 rounded-xl font-bold flex items-center justify-center gap-1.5 hover:bg-blue-100 transition-all active:scale-95 text-[10px]"
                                  >
                                    <Scissors size={14} />
                                    分割替换
                                  </button>
                                  
                                  <button 
                                    onClick={downloadComposite}
                                    className="bg-white border border-gray-100 text-gray-600 py-2.5 rounded-xl font-bold flex items-center justify-center gap-1.5 hover:border-blue-500 hover:text-blue-600 transition-all active:scale-95 text-[10px]"
                                  >
                                    <Download size={14} />
                                    下载图片
                                  </button>
                                </div>
                              </div>
                            </div>
                          </motion.div>
                        )}

                        {/* Slice Sorting Area */}
                        {activeProject.tiles.some(t => t.isSelected) && (
                          <motion.div 
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            className="space-y-4"
                          >
                            <div className="space-y-4">
                              <div className="flex items-center gap-2">
                                <div className="bg-blue-600 p-1.5 rounded-lg text-white">
                                  <GripVertical size={16} />
                                </div>
                                <h3 className="text-sm font-bold whitespace-nowrap">切片排序</h3>
                              </div>
                              
                              <div className="space-y-2">
                                <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest block">切片列数</label>
                                <div className="flex items-center gap-1 bg-gray-50 p-1 rounded-lg border border-gray-100 w-fit">
                                  {[1, 2, 3, 4, 5, 6].map(cols => (
                                    <button
                                      key={cols}
                                      onClick={() => setRecomposeColumns(cols)}
                                      className={cn(
                                        "w-6 h-6 flex items-center justify-center rounded-md text-[8px] font-bold transition-all",
                                        recomposeColumns === cols 
                                          ? "bg-blue-600 text-white shadow-sm" 
                                          : "text-gray-400 hover:bg-gray-100"
                                      )}
                                    >
                                      {cols}
                                    </button>
                                  ))}
                                </div>
                              </div>

                              <Reorder.Group 
                                axis="x" 
                                values={activeProject.tiles.filter(t => t.isSelected).sort((a, b) => (a.selectionOrder || 0) - (b.selectionOrder || 0))} 
                                onReorder={reorderSelectedTiles}
                                className="flex gap-2 overflow-x-auto pb-2 pt-1 px-0.5 scrollbar-hide"
                              >
                                <AnimatePresence mode="popLayout">
                                  {activeProject.tiles
                                    .filter(t => t.isSelected)
                                    .sort((a, b) => (a.selectionOrder || 0) - (b.selectionOrder || 0))
                                    .map((tile) => (
                                      <Reorder.Item 
                                        key={tile.id} 
                                        value={tile}
                                        initial={{ opacity: 0, scale: 0.8 }}
                                        animate={{ opacity: 1, scale: 1 }}
                                        exit={{ opacity: 0, scale: 0.8 }}
                                        whileDrag={{ scale: 1.05 }}
                                        className="relative flex-shrink-0 w-14 h-14 rounded-lg overflow-hidden border-2 border-blue-500 shadow-sm cursor-grab active:cursor-grabbing bg-gray-50 group"
                                      >
                                        <img src={tile.dataUrl} className="w-full h-full object-cover" />
                                        <div className="absolute top-0.5 left-0.5 bg-blue-600 text-white text-[7px] font-bold w-3.5 h-3.5 rounded-full flex items-center justify-center border border-white shadow-sm">
                                          {tile.selectionOrder}
                                        </div>
                                        <button 
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            toggleTileSelection(tile.id);
                                          }}
                                          className="absolute top-0.5 right-0.5 p-0.5 bg-white/80 backdrop-blur-sm rounded text-gray-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
                                        >
                                          <X size={8} />
                                        </button>
                                      </Reorder.Item>
                                    ))
                                  }
                                </AnimatePresence>
                              </Reorder.Group>

                              <div className="flex gap-2">
                                <button
                                  onClick={() => generatePreview()}
                                  disabled={activeProject.tiles.filter(t => t.isSelected).length < 2 || isGeneratingSidebarPreview}
                                  className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-200 disabled:text-gray-400 text-white py-3 rounded-xl text-xs font-bold shadow-md shadow-blue-100 transition-all active:scale-95 flex items-center justify-center gap-1.5"
                                >
                                  {isGeneratingSidebarPreview ? (
                                    <Loader2 size={14} className="animate-spin" />
                                  ) : (
                                    <Sparkles size={14} />
                                  )}
                                  预览组合
                                </button>
                                <button 
                                  onClick={() => selectAllTiles(false)}
                                  className="px-3 py-3 bg-gray-50 text-gray-400 hover:bg-gray-100 rounded-xl font-bold transition-colors text-[10px]"
                                >
                                  清空
                                </button>
                              </div>
                            </div>
                          </motion.div>
                        )}
                      </div>
                    )}
                  </>
                ) : (
                  <div className="space-y-4">
                    <h3 className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-4">角色库说明</h3>
                    <p className="text-xs text-gray-400 leading-relaxed">
                      在这里管理您的角色三视图。您可以从分割后的图片中提取角色，并生成标准的全身三视图。
                    </p>
                    <div className="bg-blue-50 p-4 rounded-2xl border border-blue-100">
                      <h4 className="text-sm font-bold text-blue-700 mb-1 flex items-center gap-2">
                        <Sparkles size={16} />
                        AI 角色生成
                      </h4>
                      <p className="text-[11px] text-blue-600/80">
                        选定图库中的图片，点击“生成三视图”按钮即可开始。
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </aside>

            {/* Main Editor Area */}
            <div className="lg:col-span-3 space-y-12">
              {activeTab === 'editor' ? (
                <>
                  {/* 1. Split Editor Section (At the very top) */}
                  <div className="space-y-6">
                    {!activeProject?.sourceImage ? (
                      <div 
                        onClick={() => fileInputRef.current?.click()}
                        className="bg-white border-4 border-dashed border-gray-200 rounded-[40px] aspect-video flex flex-col items-center justify-center cursor-pointer hover:border-blue-400 hover:bg-blue-50/30 transition-all group"
                      >
                        <div className="bg-gray-100 p-6 rounded-full mb-4 group-hover:bg-blue-100 transition-colors">
                          <ImageIcon size={48} className="text-gray-400 group-hover:text-blue-500" />
                        </div>
                        <h3 className="text-xl font-bold mb-2">添加您的第一张图</h3>
                        <p className="text-gray-400">支持单张或多张同时上传</p>
                      </div>
                    ) : activeProject.splitMode === 'grid' ? (
                      <>
                        <div className="space-y-6">
                          <div className="flex items-center justify-between">
                            <h2 className="text-2xl font-bold">网格分割预览</h2>
                            <button 
                              onClick={() => performSplit()}
                              className="bg-green-600 hover:bg-green-700 text-white px-6 py-2 rounded-xl font-bold shadow-lg shadow-green-100 transition-all active:scale-95 flex items-center gap-2"
                            >
                              <Scissors size={18} />
                              确认并分割
                            </button>
                          </div>
                          <div className="relative w-full bg-transparent rounded-3xl overflow-hidden flex justify-center">
                            <div className="relative inline-block max-w-full">
                              <img 
                                src={activeProject.sourceImage} 
                                alt="Grid Preview" 
                                className="w-full h-auto block rounded-3xl shadow-2xl"
                                referrerPolicy="no-referrer"
                              />
                              {/* Grid Overlay */}
                              <div className="absolute inset-0 pointer-events-none">
                                {Array.from({ length: activeProject.rows - 1 }).map((_, i) => (
                                  <div 
                                    key={`h-${i}`} 
                                    className="absolute left-0 right-0 border-t border-white/50 shadow-[0_0_2px_rgba(0,0,0,0.5)]"
                                    style={{ top: `${((i + 1) / activeProject.rows) * 100}%` }}
                                  />
                                ))}
                                {Array.from({ length: activeProject.cols - 1 }).map((_, i) => (
                                  <div 
                                    key={`v-${i}`} 
                                    className="absolute top-0 bottom-0 border-l border-white/50 shadow-[0_0_2px_rgba(0,0,0,0.5)]"
                                    style={{ left: `${((i + 1) / activeProject.cols) * 100}%` }}
                                  />
                                ))}
                              </div>
                            </div>
                          </div>
                        </div>

                        {pendingReplacementImage && (
                          <motion.div 
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            className="p-6 bg-blue-600 text-white rounded-[32px] shadow-xl flex items-center justify-between"
                          >
                            <div className="flex items-center gap-6">
                              <div className="w-16 h-16 rounded-xl overflow-hidden border-2 border-white/30 bg-white/10 flex-shrink-0">
                                <img src={pendingReplacementImage} alt="Pending" className="w-full h-full object-cover" />
                              </div>
                              <div>
                                <h3 className="text-lg font-bold">替换模式已开启</h3>
                                <p className="text-blue-100 text-sm">请在下方图库中点击您想要替换的图片</p>
                              </div>
                            </div>
                            <button 
                              onClick={() => setPendingReplacementImage(null)}
                              className="px-6 py-3 bg-white/20 hover:bg-white/30 rounded-xl font-bold transition-all"
                            >
                              取消替换
                            </button>
                          </motion.div>
                        )}
                      </>
                    ) : (
                      <div className="space-y-6">
                        <div className="flex items-center justify-between">
                          <h2 className="text-2xl font-bold">自定义分割编辑器</h2>
                          <button 
                            onClick={() => setSplitMode('grid')}
                            className="text-sm font-bold text-blue-600 hover:underline"
                          >
                            返回网格模式
                          </button>
                        </div>
                        <CustomSplitEditor 
                          image={activeProject.sourceImage}
                          horizontalLines={activeProject.horizontalLines}
                          verticalLines={activeProject.verticalLines}
                          onLinesChange={updateCustomLines}
                          onSplit={reSplitLastImage}
                        />
                      </div>
                    )}
                  </div>

                  {/* 2. Consolidated Area (Gallery) */}
                  {activeProject?.sourceImage && (
                    <div className="space-y-8">
                      {/* Gallery (Initial Library) Section */}
                        {activeProject?.tiles.length! > 0 && (
                          <div className="bg-white rounded-[40px] p-8 shadow-sm border border-gray-100">
                            <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-8">
                              <div className="flex items-center gap-4">
                                <div className="bg-gray-100 p-3 rounded-2xl text-gray-600">
                                  <ImageIcon size={24} />
                                </div>
                                <div>
                                  <h2 className="text-2xl font-bold">初始图库</h2>
                                  <p className="text-xs text-gray-400 mt-1">分割后的原始切片</p>
                                </div>
                                <button 
                                  onClick={() => singleFileInputRef.current?.click()}
                                  className="flex items-center gap-2 px-4 py-2 bg-blue-50 text-blue-600 hover:bg-blue-100 rounded-xl text-xs font-bold transition-all ml-4"
                                >
                                  <Plus size={16} />
                                  添加单图
                                </button>
                              </div>
                              <div className="flex items-center gap-4">
                                <div className="text-right">
                                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">已选择</p>
                                  <p className="text-lg font-bold text-blue-600">
                                    {activeProject.tiles.filter(t => t.isSelected).length} <span className="text-gray-300 font-normal">/ {activeProject.tiles.length}</span>
                                  </p>
                                </div>
                            <div className="flex items-center gap-2">
                                  <button 
                                    onClick={() => selectAllTiles(activeProject.tiles.filter(t => t.isSelected).length < activeProject.tiles.length)}
                                    className="px-3 py-2 bg-blue-600 text-white hover:bg-blue-700 rounded-xl text-xs font-bold transition-all shadow-sm"
                                  >
                                    {activeProject.tiles.filter(t => t.isSelected).length < activeProject.tiles.length ? "全选" : "取消全选"}
                                  </button>
                                  <button 
                                    onClick={() => selectAllTiles(false)}
                                    className="p-2 bg-gray-100 hover:bg-gray-200 rounded-xl text-gray-500 transition-all"
                                    title="取消选择"
                                  >
                                    <X size={18} />
                                  </button>
                                  <button 
                                    onClick={deleteSelectedTiles}
                                    className="p-2 bg-red-50 text-red-500 hover:bg-red-100 rounded-xl transition-all"
                                    title="删除选中"
                                  >
                                    <Trash2 size={18} />
                                  </button>
                                  <button 
                                    onClick={downloadBatch}
                                    className="p-2 bg-blue-50 text-blue-600 hover:bg-blue-100 rounded-xl transition-all"
                                    title="批量下载选中"
                                  >
                                    <DownloadCloud size={18} />
                                  </button>
                                  <button 
                                    onClick={clearInitialLibrary}
                                    className="px-3 py-2 bg-red-50 text-red-500 hover:bg-red-100 rounded-xl text-xs font-bold transition-all"
                                  >
                                    清空
                                  </button>
                                </div>
                              </div>
                            </div>

                            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-4">
                            {activeProject.tiles.map((tile) => (
                              <div 
                                key={tile.id}
                                className={cn(
                                  "relative aspect-square bg-white rounded-[20px] overflow-hidden cursor-pointer group transition-all duration-300 border-2",
                                  tile.isSelected ? "border-blue-500 shadow-lg scale-[0.98]" : "border-transparent hover:border-blue-200"
                                )}
                              >
                                <img 
                                  src={tile.dataUrl} 
                                  alt="Tile"
                                  onClick={() => {
                                    if (pendingReplacementImage) {
                                      handleReplacement('tile', tile.id);
                                    } else {
                                      toggleTileSelection(tile.id);
                                    }
                                  }}
                                  className={cn(
                                    "w-full h-full object-cover transition-opacity",
                                    tile.isSelected ? "opacity-100" : "opacity-90 group-hover:opacity-100",
                                    pendingReplacementImage && "hover:ring-4 ring-blue-500 ring-inset"
                                  )}
                                  referrerPolicy="no-referrer"
                                />
                                
                                {/* Selection Button */}
                                <div className="absolute top-1.5 left-1.5 flex items-center gap-1">
                                  <button 
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      toggleTileSelection(tile.id);
                                    }}
                                    className={cn(
                                      "p-1 rounded-md transition-all shadow-sm",
                                      tile.isSelected ? "bg-blue-500 text-white" : "bg-white/80 text-gray-400 hover:text-blue-500"
                                    )}
                                  >
                                    <CheckCircle2 size={12} />
                                  </button>
                                  {tile.isSelected && (
                                    <span className="bg-blue-600 text-white text-[8px] font-bold w-4 h-4 rounded-full flex items-center justify-center shadow-sm border border-white/20">
                                      {tile.selectionOrder}
                                    </span>
                                  )}
                                </div>

                                {/* Preview & Delete Buttons */}
                                <div className="absolute top-1.5 right-1.5 flex flex-col gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                  <button 
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setSelectedTile(tile);
                                    }}
                                    className="bg-white/80 backdrop-blur p-1 rounded-md shadow-sm hover:bg-white text-gray-700 active:scale-95"
                                  >
                                    <Maximize2 size={12} />
                                  </button>
                                  <button 
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setImageEditorModal({ isOpen: true, imageUrl: tile.dataUrl });
                                    }}
                                    className="bg-white/80 backdrop-blur p-1 rounded-md shadow-sm hover:bg-blue-50 text-blue-600 active:scale-95"
                                    title="编辑/涂抹人脸"
                                  >
                                    <Brush size={12} />
                                  </button>
                                  <button 
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setCharacterModal({ isOpen: true, sourceImageUrl: tile.dataUrl });
                                    }}
                                    className="bg-white/80 backdrop-blur p-1 rounded-md shadow-sm hover:bg-blue-50 text-blue-600 active:scale-95"
                                    title="生成三视图"
                                  >
                                    <UserPlus size={12} />
                                  </button>
                                  <button 
                                    onClick={(e) => deleteTile(tile.id, e)}
                                    className="bg-white/80 backdrop-blur p-1 rounded-md shadow-sm hover:bg-red-50 text-red-500 active:scale-95"
                                  >
                                    <Trash2 size={12} />
                                  </button>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </>
              ) : activeTab === 'library' ? (
                <div className="space-y-8">
                  <div className="flex items-center justify-between">
                    <h2 className="text-3xl font-bold">角色三视图库</h2>
                    <div className="flex items-center gap-6">
                      <div className="text-sm text-gray-500">
                        共 {(activeProject?.characters || []).length} 个角色
                      </div>
                      {(activeProject?.characters || []).length > 0 && (
                        <button 
                          onClick={clearCharacters}
                          className="flex items-center gap-2 px-4 py-2 bg-red-50 text-red-500 hover:bg-red-100 rounded-xl text-sm font-bold transition-all"
                        >
                          <Trash2 size={16} />
                          清空库
                        </button>
                      )}
                    </div>
                  </div>

                  {(activeProject?.characters || []).length === 0 ? (
                    <div className="bg-white border-4 border-dashed border-gray-100 rounded-[40px] py-20 flex flex-col items-center justify-center text-center px-6">
                      <div className="bg-gray-50 p-6 rounded-full mb-6">
                        <User size={48} className="text-gray-300" />
                      </div>
                      <h3 className="text-xl font-bold mb-2">角色库空空如也</h3>
                      <p className="text-gray-400 max-w-sm">
                        从您的切片中选择一个角色，点击“生成三视图”按钮，AI 将为您生成标准的角色设定图。
                      </p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                      {(activeProject?.characters || []).map((char) => (
                        <motion.div 
                          key={char.id}
                          layout
                          initial={{ opacity: 0, scale: 0.9 }}
                          animate={{ opacity: 1, scale: 1 }}
                          className="bg-white rounded-[32px] overflow-hidden shadow-sm border border-gray-100 group hover:shadow-xl transition-all"
                        >
                          <div className="aspect-square relative bg-gray-50">
                            <img 
                              src={char.threeViewImageUrl} 
                              alt={char.name}
                              className="w-full h-full object-contain cursor-pointer"
                              onClick={() => setSelectedTile({ id: char.id, dataUrl: char.threeViewImageUrl, isSelected: false })}
                              referrerPolicy="no-referrer"
                            />
                            <div className="absolute top-4 right-4 flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                              <button 
                                onClick={() => setImageEditorModal({ 
                                  isOpen: true, 
                                  imageUrl: char.threeViewImageUrl,
                                  onSave: (masked) => {
                                    // Update character with masked image
                                    setProjects(prev => prev.map(p => 
                                      p.id === activeProjectId 
                                        ? { ...p, characters: (p.characters || []).map(c => c.id === char.id ? { ...c, threeViewImageUrl: masked.dataUrl } : c) } 
                                        : p
                                    ));
                                    setImageEditorModal({ isOpen: false, imageUrl: '' });
                                  }
                                })}
                                className="bg-white/90 backdrop-blur p-2 rounded-xl shadow-sm hover:bg-blue-50 text-blue-600"
                                title="涂抹/编辑"
                              >
                                <Brush size={18} />
                              </button>
                              <button 
                                onClick={() => saveAs(char.threeViewImageUrl, `${char.name}-three-view.png`)}
                                className="bg-white/90 backdrop-blur p-2 rounded-xl shadow-sm hover:bg-white text-gray-700"
                              >
                                <Download size={18} />
                              </button>
                              <button 
                                onClick={() => deleteCharacter(char.id)}
                                className="bg-white/90 backdrop-blur p-2 rounded-xl shadow-sm hover:bg-red-50 text-red-500"
                              >
                                <Trash2 size={18} />
                              </button>
                            </div>
                            <div className="absolute bottom-4 left-4">
                              <span className="bg-black/60 backdrop-blur text-white text-[10px] font-bold px-2 py-1 rounded-lg uppercase tracking-wider">
                                {char.heightSetting === 'child' ? '儿童 (5-6头身)' : 
                                 char.heightSetting === 'normal' ? '普通 (7头身)' : 
                                 char.heightSetting === 'aesthetic' ? '美型 (7.5-8头身)' : '高大 (8.5-9头身)'}
                              </span>
                            </div>
                          </div>
                          <div className="p-5">
                            <div className="flex items-center justify-between mb-2">
                              <h4 className="font-bold text-lg">{char.name}</h4>
                              <div className="flex -space-x-2">
                                {char.faceSourceUrl && (
                                  <div className="w-6 h-6 rounded-full border-2 border-white overflow-hidden bg-gray-100 shadow-sm" title="面部参考">
                                    <img src={char.faceSourceUrl} alt="Face Ref" className="w-full h-full object-cover" />
                                  </div>
                                )}
                                {char.bodySourceUrl && (
                                  <div className="w-6 h-6 rounded-full border-2 border-white overflow-hidden bg-gray-100 shadow-sm" title="全身参考">
                                    <img src={char.bodySourceUrl} alt="Body Ref" className="w-full h-full object-cover" />
                                  </div>
                                )}
                              </div>
                            </div>
                            <p className="text-[10px] text-gray-400 uppercase tracking-widest">
                              创建于 {new Date(char.createdAt).toLocaleDateString()}
                            </p>
                          </div>
                        </motion.div>
                      ))}
                    </div>
                  )}
                </div>
              ) : activeTab === 'masked' ? (
                <div className="space-y-8">
                  <div className="flex items-center justify-between">
                    <h2 className="text-3xl font-bold">涂抹图库</h2>
                    <div className="flex items-center gap-6">
                      <div className="text-sm text-gray-500">
                        共 {(activeProject?.maskedImages || []).length} 张图片
                      </div>
                      {(activeProject?.maskedImages || []).length > 0 && (
                        <button 
                          onClick={clearMaskedImages}
                          className="flex items-center gap-2 px-4 py-2 bg-red-50 text-red-500 hover:bg-red-100 rounded-xl text-sm font-bold transition-all"
                        >
                          <Trash2 size={16} />
                          清空库
                        </button>
                      )}
                    </div>
                  </div>

                  {(activeProject?.maskedImages || []).length === 0 ? (
                    <div className="bg-white border-4 border-dashed border-gray-100 rounded-[40px] py-20 flex flex-col items-center justify-center text-center px-6">
                      <div className="bg-gray-50 p-6 rounded-full mb-6">
                        <Paintbrush size={48} className="text-gray-300" />
                      </div>
                      <h3 className="text-xl font-bold mb-2">涂抹图库空空如也</h3>
                      <p className="text-gray-400 max-w-sm">
                        在编辑器中选择图片并点击“涂抹”按钮，您可以手动或自动遮罩人脸，并将其保存到这里。
                      </p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
                      {(activeProject?.maskedImages || []).map((img) => (
                        <motion.div 
                          key={img.id}
                          layout
                          initial={{ opacity: 0, scale: 0.9 }}
                          animate={{ opacity: 1, scale: 1 }}
                          className="bg-white rounded-[32px] overflow-hidden shadow-sm border border-gray-100 group hover:shadow-xl transition-all"
                        >
                          <div className="aspect-square relative bg-gray-50">
                            <img 
                              src={img.dataUrl} 
                              alt="Masked"
                              className={cn(
                                "w-full h-full object-contain cursor-pointer",
                                pendingReplacementImage && "hover:ring-4 ring-blue-500 ring-inset"
                              )}
                              onClick={() => {
                                if (pendingReplacementImage) {
                                  handleReplacement('masked', img.id);
                                } else {
                                  setSelectedTile({ id: img.id, dataUrl: img.dataUrl, isSelected: false });
                                }
                              }}
                              referrerPolicy="no-referrer"
                            />
                            <div className="absolute top-4 right-4 flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                              <button 
                                onClick={() => setImageEditorModal({ 
                                  isOpen: true, 
                                  imageUrl: img.dataUrl,
                                  onSave: (masked) => {
                                    addMaskedImageToLibrary(masked);
                                    setImageEditorModal({ isOpen: false, imageUrl: '' });
                                  }
                                })}
                                className="bg-white/90 backdrop-blur p-2 rounded-xl shadow-sm hover:bg-blue-50 text-blue-600"
                                title="涂抹/编辑"
                              >
                                <Brush size={18} />
                              </button>
                              <button 
                                onClick={() => setCharacterModal({ isOpen: true, sourceImageUrl: img.dataUrl })}
                                className="bg-white/90 backdrop-blur p-2 rounded-xl shadow-sm hover:bg-blue-50 text-blue-600"
                                title="生成三视图"
                              >
                                <UserPlus size={18} />
                              </button>
                              <button 
                                onClick={() => saveAs(img.dataUrl, `masked-${img.id}.png`)}
                                className="bg-white/90 backdrop-blur p-2 rounded-xl shadow-sm hover:bg-white text-gray-700"
                              >
                                <Download size={18} />
                              </button>
                              <button 
                                onClick={() => deleteMaskedImage(img.id)}
                                className="bg-white/90 backdrop-blur p-2 rounded-xl shadow-sm hover:bg-red-50 text-red-500"
                              >
                                <Trash2 size={18} />
                              </button>
                            </div>
                          </div>
                          <div className="p-4">
                            <p className="text-[10px] text-gray-400 uppercase tracking-widest text-center">
                              创建于 {new Date(img.createdAt).toLocaleDateString()}
                            </p>
                          </div>
                        </motion.div>
                      ))}
                    </div>
                  )}
                </div>
              ) : activeTab === 'composite' ? (
                <div className="space-y-8">
                  <div className="flex items-center justify-between">
                    <h2 className="text-3xl font-bold">组合图库</h2>
                    <div className="flex items-center gap-6">
                      <div className="text-sm text-gray-500">
                        共 {(activeProject?.compositeImages || []).length} 张图片
                      </div>
                      {(activeProject?.compositeImages || []).length > 0 && (
                        <button 
                          onClick={clearCompositeImages}
                          className="flex items-center gap-2 px-4 py-2 bg-red-50 text-red-500 hover:bg-red-100 rounded-xl text-sm font-bold transition-all"
                        >
                          <Trash2 size={16} />
                          清空库
                        </button>
                      )}
                    </div>
                  </div>

                  {(activeProject?.compositeImages || []).length === 0 ? (
                    <div className="bg-white border-4 border-dashed border-gray-100 rounded-[40px] py-20 flex flex-col items-center justify-center text-center px-6">
                      <div className="bg-gray-50 p-6 rounded-full mb-6">
                        <Layers size={48} className="text-gray-300" />
                      </div>
                      <h3 className="text-xl font-bold mb-2">组合图库空空如也</h3>
                      <p className="text-gray-400 max-w-sm">
                        在编辑器中选择多张切片并点击“组合”按钮，您可以调整顺序并生成长图，保存后将显示在这里。
                      </p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                      {(activeProject?.compositeImages || []).map((img) => (
                        <motion.div 
                          key={img.id}
                          layout
                          initial={{ opacity: 0, y: 20 }}
                          animate={{ opacity: 1, y: 0 }}
                          className="bg-white rounded-[32px] overflow-hidden shadow-sm border border-gray-100 group hover:shadow-xl transition-all flex flex-col"
                        >
                          <div className="flex-1 relative bg-gray-50 overflow-hidden flex items-center justify-center p-4">
                            <img 
                              src={img.dataUrl} 
                              alt="Composite"
                              className={cn(
                                "max-w-full max-h-[400px] object-contain shadow-lg rounded-lg cursor-pointer",
                                pendingReplacementImage && "hover:ring-4 ring-blue-500 ring-inset"
                              )}
                              onClick={() => {
                                if (pendingReplacementImage) {
                                  handleReplacement('composite', img.id);
                                } else {
                                  setSelectedTile({ id: img.id, dataUrl: img.dataUrl, isSelected: false });
                                }
                              }}
                              referrerPolicy="no-referrer"
                            />
                            <div className="absolute top-4 right-4 flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                              <button 
                                onClick={() => editComposite(img)}
                                className="bg-white/90 backdrop-blur p-2 rounded-xl shadow-sm hover:bg-blue-50 text-blue-600"
                                title="二次编辑组合"
                              >
                                <RefreshCw size={18} />
                              </button>
                              <button 
                                onClick={() => setImageEditorModal({ 
                                  isOpen: true, 
                                  imageUrl: img.dataUrl,
                                  onSave: (masked) => {
                                    updateCompositeImage(img.id, masked.dataUrl);
                                    setImageEditorModal({ isOpen: false, imageUrl: '' });
                                  }
                                })}
                                className="bg-white/90 backdrop-blur p-2 rounded-xl shadow-sm hover:bg-blue-50 text-blue-600"
                                title="涂抹/编辑"
                              >
                                <Brush size={18} />
                              </button>
                              <button 
                                onClick={() => setCharacterModal({ isOpen: true, sourceImageUrl: img.dataUrl })}
                                className="bg-white/90 backdrop-blur p-2 rounded-xl shadow-sm hover:bg-blue-50 text-blue-600"
                                title="生成三视图"
                              >
                                <UserPlus size={18} />
                              </button>
                              <button 
                                onClick={() => saveAs(img.dataUrl, `composite-${img.id}.png`)}
                                className="bg-white/90 backdrop-blur p-2 rounded-xl shadow-sm hover:bg-white text-gray-700"
                                title="下载长图"
                              >
                                <Download size={18} />
                              </button>
                              <button 
                                onClick={() => deleteCompositeImage(img.id)}
                                className="bg-white/90 backdrop-blur p-2 rounded-xl shadow-sm hover:bg-red-50 text-red-500"
                                title="删除"
                              >
                                <Trash2 size={18} />
                              </button>
                            </div>
                          </div>
                          <div className="p-6 bg-gray-50/50 border-t border-gray-100 flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <Grid size={14} className="text-gray-400" />
                              <span className="text-xs font-bold text-gray-500">{img.columns} 列组合</span>
                            </div>
                            <p className="text-[10px] text-gray-400 uppercase tracking-widest">
                              {new Date(img.createdAt).toLocaleDateString()}
                            </p>
                          </div>
                        </motion.div>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <></>
              )}
            </div>
          </div>
        )}
      </main>

      {/* Modals */}
      <AnimatePresence mode="wait">
        {confirmModal.isOpen && (
          <motion.div 
            key="confirm-modal" 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[60] flex items-center justify-center p-6"
          >
            <div 
              onClick={() => setConfirmModal(prev => ({ ...prev, isOpen: false }))}
              className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="relative bg-white rounded-[32px] p-8 w-full max-w-sm shadow-2xl"
            >
              <h3 className="text-xl font-bold mb-2">{confirmModal.title}</h3>
              <p className="text-gray-500 mb-8 text-sm">{confirmModal.message}</p>
              <div className="flex gap-3">
                <button 
                  onClick={() => setConfirmModal(prev => ({ ...prev, isOpen: false }))}
                  className="flex-1 py-3 rounded-xl font-bold text-gray-500 hover:bg-gray-100 transition-colors"
                >
                  取消
                </button>
                <button 
                  onClick={confirmModal.onConfirm}
                  className="flex-1 py-3 rounded-xl font-bold bg-red-500 text-white hover:bg-red-600 shadow-lg shadow-red-100 transition-all active:scale-95"
                >
                  确定
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}

        {isCreatingProject && (
          <motion.div 
            key="create-project-modal" 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-6"
          >
            <div 
              onClick={() => setIsCreatingProject(false)}
              className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="relative bg-white rounded-[32px] p-8 w-full max-w-md shadow-2xl"
            >
              <button 
                onClick={() => setIsCreatingProject(false)}
                className="absolute top-6 right-6 p-2 hover:bg-gray-100 rounded-full transition-colors text-gray-400 hover:text-gray-600"
              >
                <X size={20} />
              </button>
              <h3 className="text-2xl font-bold mb-6">新建项目</h3>
              <div className="space-y-4">
                <div>
                  <label className="text-xs font-bold text-gray-500 block mb-2 uppercase tracking-wider">项目名称</label>
                  <input 
                    autoFocus
                    type="text" 
                    value={newProjectName}
                    onChange={(e) => setNewProjectName(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && createProject()}
                    placeholder="例如：夏日旅行组图"
                    className="w-full bg-gray-50 border-2 border-transparent focus:border-blue-500 focus:bg-white rounded-2xl px-5 py-4 outline-none transition-all font-medium"
                  />
                </div>
                <div className="flex gap-3 pt-4">
                  <button 
                    onClick={() => setIsCreatingProject(false)}
                    className="flex-1 py-4 rounded-2xl font-bold text-gray-500 hover:bg-gray-100 transition-colors"
                  >
                    取消
                  </button>
                  <button 
                    onClick={createProject}
                    className="flex-1 py-4 rounded-2xl font-bold bg-blue-600 text-white hover:bg-blue-700 shadow-lg shadow-blue-100 transition-all active:scale-95"
                  >
                    创建
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}

        {selectedTile && (
          <motion.div 
            key="tile-preview-modal" 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-6"
          >
            <div 
              onClick={() => setSelectedTile(null)}
              className="absolute inset-0 bg-black/95 backdrop-blur-xl"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="relative max-w-6xl w-full flex flex-col items-center"
            >
              <div className="flex items-start gap-8 w-full justify-center">
                {/* Image Container */}
                <div className="bg-white rounded-[40px] shadow-2xl relative overflow-hidden border-8 border-white/10 group">
                  <button 
                    onClick={() => setSelectedTile(null)}
                    className="absolute top-6 right-6 bg-white/80 backdrop-blur-sm p-3 rounded-2xl text-gray-900 hover:bg-white transition-all shadow-xl z-10 active:scale-90"
                  >
                    <X size={28} />
                  </button>
                  <img 
                    src={selectedTile.dataUrl} 
                    alt="Preview" 
                    className="max-h-[80vh] block"
                    referrerPolicy="no-referrer"
                  />
                </div>

                {/* Side Actions Panel */}
                <div className="flex flex-col gap-4 py-4">
                  <div className="bg-white/10 backdrop-blur-2xl border border-white/20 rounded-[24px] p-2 flex flex-col gap-3 shadow-2xl">
                    <button 
                      onClick={() => {
                        setImageEditorModal({ 
                          isOpen: true, 
                          imageUrl: selectedTile.dataUrl,
                          onSave: (masked) => {
                            addMaskedImageToLibrary(masked);
                            setImageEditorModal({ isOpen: false, imageUrl: '' });
                            setSelectedTile(null);
                          }
                        });
                      }}
                      className="bg-blue-600 hover:bg-blue-500 text-white p-3.5 rounded-[18px] transition-all group active:scale-90 shadow-lg shadow-blue-900/20"
                      title="涂抹/编辑人脸"
                    >
                      <Brush size={24} className="group-hover:scale-110 transition-transform" />
                    </button>
                    
                    <button 
                      onClick={() => {
                        setCharacterModal({ isOpen: true, sourceImageUrl: selectedTile.dataUrl });
                        setSelectedTile(null);
                      }}
                      className="bg-purple-600 hover:bg-purple-500 text-white p-3.5 rounded-[18px] transition-all group active:scale-90 shadow-lg shadow-purple-900/20"
                      title="生成三视图"
                    >
                      <UserPlus size={24} className="group-hover:scale-110 transition-transform" />
                    </button>

                    <div className="h-px bg-white/10 mx-3" />

                    <button 
                      onClick={() => downloadSingleTile(selectedTile)}
                      className="bg-white/10 hover:bg-white hover:text-black text-white p-3.5 rounded-[18px] transition-all group active:scale-90"
                      title="下载原图"
                    >
                      <Download size={24} className="group-hover:scale-110 transition-transform" />
                    </button>
                  </div>
                  
                  <p className="text-white/40 text-[9px] font-bold uppercase tracking-[0.2em] text-center mt-1">操作面板</p>
                </div>
              </div>

              <div className="mt-12">
                <button 
                  onClick={() => setSelectedTile(null)}
                  className="bg-white/10 text-white px-16 py-5 rounded-3xl font-bold hover:bg-white/20 transition-all active:scale-95 border border-white/10 backdrop-blur-md text-lg"
                >
                  返回图库
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}

        {compositeModal.isOpen && (
          <CompositePreviewModal 
            selectedTiles={compositeModal.selectedTiles}
            availableTiles={activeProject?.tiles || []}
            columns={compositeModal.columns}
            editingId={compositeModal.editingId}
            onClose={() => setCompositeModal(prev => ({ ...prev, isOpen: false, editingId: undefined }))}
            onSave={(composite, isEdit) => {
              addCompositeImageToLibrary(composite, isEdit);
              setCompositePreviewUrl(composite.dataUrl);
              setCompositeModal(prev => ({ ...prev, isOpen: false, editingId: undefined }));
              setActiveTab('composite');
            }}
            onSyncLayout={(tiles, columns) => {
              syncProjectTilesOrder(tiles, columns);
              // We don't close the modal, just show a hint or something if needed
            }}
          />
        )}

        {characterModal.isOpen && (
          <CharacterGenerationModal 
            sourceImageUrl={characterModal.sourceImageUrl}
            availableTiles={activeProject?.tiles.map(t => t.dataUrl) || []}
            onClose={() => setCharacterModal({ isOpen: false, sourceImageUrl: '' })}
            onSave={addCharacterToLibrary}
          />
        )}

        {imageEditorModal.isOpen && (
          <ImageEditorModal 
            imageUrl={imageEditorModal.imageUrl}
            initialMode={imageEditorModal.initialMode}
            onClose={() => setImageEditorModal({ isOpen: false, imageUrl: '' })}
            onSave={imageEditorModal.onSave || addMaskedImageToLibrary}
            onCrop={imageEditorModal.onCrop}
          />
        )}

        {isDragOver && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            className="fixed inset-0 z-50 bg-blue-600/10 backdrop-blur-sm flex items-center justify-center p-6"
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white border-4 border-dashed border-blue-500 rounded-[40px] p-12 max-w-md w-full text-center shadow-2xl flex flex-col items-center justify-center gap-4 pointer-events-none"
            >
              <div className="bg-blue-50 p-6 rounded-full text-blue-600 animate-bounce">
                <Plus size={48} />
              </div>
              <h3 className="text-2xl font-black text-gray-800">
                {!activeProjectId 
                  ? "创建新项目" 
                  : activeTab === 'editor' 
                    ? "导入分割图片" 
                    : "添加图片到图库"
                }
              </h3>
              <p className="text-gray-500 font-medium leading-relaxed">
                {!activeProjectId 
                  ? "松开鼠标，将自动创建新项目并导入此图片！" 
                  : activeTab === 'editor' 
                    ? "松开鼠标，导入或替换主分割图片！" 
                    : "松开鼠标，添加这些单图到当前图库！"
                }
              </p>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
