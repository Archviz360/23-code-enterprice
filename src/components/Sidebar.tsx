import React, { useState } from 'react';
import { 
  ChevronRight, 
  ChevronDown, 
  File, 
  Folder, 
  FolderOpen as FolderOpenIcon,
  Search,
  GitBranch,
  PlayCircle,
  Package
} from 'lucide-react';
import { useEditorStore } from '../store/editorStore';
import { Extensions } from './Extensions';

// Mock file system data
const mockFileSystem = [
  {
    name: 'project',
    type: 'folder',
    isOpen: true,
    children: [
      {
        name: 'src',
        type: 'folder',
        isOpen: true,
        children: [
          { name: 'App.tsx', type: 'file', language: 'typescript' },
          { name: 'main.tsx', type: 'file', language: 'typescript' },
          { name: 'index.css', type: 'file', language: 'css' },
        ],
      },
      { name: 'package.json', type: 'file', language: 'json' },
      { name: 'README.md', type: 'file', language: 'markdown' },
      { name: 'tsconfig.json', type: 'file', language: 'json' },
    ],
  },
];

interface FileSystemItem {
  name: string;
  type: 'file' | 'folder';
  isOpen?: boolean;
  children?: FileSystemItem[];
  language?: string;
}

function FileTreeItem({ item, level = 0 }: { item: FileSystemItem; level?: number }) {
  const [isOpen, setIsOpen] = useState(item.isOpen);
  const { switchFile, files } = useEditorStore();
  
  // Find the index of the current file in the files array
  const fileIndex = files.findIndex(f => f.name === item.name);

  const toggleFolder = () => {
    if (item.type === 'folder') {
      setIsOpen(!isOpen);
    } else if (item.type === 'file' && fileIndex !== -1) {
      switchFile(fileIndex);
    } else if (item.type === 'file') {
      // If file is not already open, we would open it here
      console.log(`Opening file: ${item.name}`);
    }
  };

  return (
    <div>
      <div
        className={`flex items-center gap-1 py-1 px-2 hover:bg-gray-800 cursor-pointer ${
          fileIndex === useEditorStore.getState().currentFile ? 'bg-gray-800' : ''
        }`}
        style={{ paddingLeft: `${level * 16 + 8}px` }}
        onClick={toggleFolder}
      >
        {item.type === 'folder' ? (
          <>
            {isOpen ? (
              <ChevronDown className="w-4 h-4 text-gray-500" />
            ) : (
              <ChevronRight className="w-4 h-4 text-gray-500" />
            )}
            {isOpen ? (
              <FolderOpenIcon className="w-4 h-4 text-yellow-500" />
            ) : (
              <Folder className="w-4 h-4 text-yellow-500" />
            )}
          </>
        ) : (
          <>
            <div className="w-4" />
            <File className="w-4 h-4 text-blue-400" />
          </>
        )}
        <span className="text-xs text-gray-300 truncate">{item.name}</span>
      </div>
      
      {item.type === 'folder' && isOpen && item.children && (
        <div>
          {item.children.map((child, index) => (
            <FileTreeItem key={index} item={child} level={level + 1} />
          ))}
        </div>
      )}
    </div>
  );
}

export function Sidebar() {
  const [activeTab, setActiveTab] = useState('explorer');

  const tabs = [
    { id: 'explorer', label: 'EXPLORER', icon: Folder },
    { id: 'search', label: 'SEARCH', icon: Search },
    { id: 'git', label: 'SOURCE CONTROL', icon: GitBranch },
    { id: 'debug', label: 'RUN AND DEBUG', icon: PlayCircle },
    { id: 'extensions', label: 'EXTENSIONS', icon: Package },
  ];

  return (
    <div className="w-60 bg-gray-900 border-r border-gray-700 flex flex-col">
      {/* Tab headers */}
      <div className="flex border-b border-gray-700">
        {tabs.map(tab => (
          <button
            key={tab.id}
            className={`flex-1 py-2 text-xs uppercase tracking-wider ${
              activeTab === tab.id
                ? 'text-blue-400 border-b-2 border-blue-400'
                : 'text-gray-500 hover:text-gray-300'
            }`}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>
      
      {/* Tab content */}
      <div className="flex-1 overflow-y-auto">
        {activeTab === 'explorer' && (
          <div className="py-2">
            {mockFileSystem.map((item, index) => (
              <FileTreeItem key={index} item={item} />
            ))}
          </div>
        )}
        
        {activeTab === 'search' && (
          <div className="p-4">
            <div className="relative">
              <input
                type="text"
                placeholder="Search"
                className="w-full bg-gray-800 text-gray-300 text-sm rounded px-3 py-1 pl-8 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
              <Search className="absolute left-2 top-1.5 w-4 h-4 text-gray-500" />
            </div>
            <div className="mt-4 text-xs text-gray-500">No results found</div>
          </div>
        )}
        
        {activeTab === 'git' && (
          <div className="p-4 text-xs text-gray-500">Source control panel</div>
        )}
        
        {activeTab === 'debug' && (
          <div className="p-4 text-xs text-gray-500">Debug panel</div>
        )}
        
        {activeTab === 'extensions' && (
          <Extensions />
        )}
      </div>
    </div>
  );
}

