import React from 'react';
import { X } from 'lucide-react';
import { useEditorStore } from '../store/editorStore';

export function Tabs() {
  const { files, currentFile, switchFile, closeFile } = useEditorStore();

  return (
    <div className="flex bg-gray-800 border-b border-gray-700 overflow-x-auto h-8">
      {files.map((file, index) => (
        <button
          key={index}
          onClick={() => switchFile(index)}
          className={`group flex items-center gap-2 px-3 py-1 text-xs border-r border-gray-700 ${
            currentFile === index
              ? 'bg-gray-900 text-white'
              : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
          }`}
        >
          <span className="mr-1">{file.name}</span>
          {files.length > 1 && (
            <X
              className="w-3 h-3 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
              onClick={(e) => {
                e.stopPropagation();
                closeFile(index);
              }}
            />
          )}
        </button>
      ))}
    </div>
  );
}