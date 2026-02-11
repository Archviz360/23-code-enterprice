import React from 'react';
import { Menu, Minus, Square, X } from 'lucide-react';

export function TitleBar() {
  return (
    <div className="h-7 bg-gray-900 border-b border-gray-700 flex items-center justify-between px-2">
      <div className="flex items-center gap-2">
        <button className="p-1 hover:bg-gray-800 rounded text-gray-400">
          <Menu className="w-4 h-4" />
        </button>
        <span className="text-xs text-gray-400">VS Code Clone</span>
      </div>
      
      <div className="flex items-center gap-2">
        <span className="text-xs text-gray-400">untitled-1.js</span>
      </div>
      
      <div className="flex items-center gap-1">
        <button className="p-1 hover:bg-gray-800 rounded text-gray-400">
          <Minus className="w-4 h-4" />
        </button>
        <button className="p-1 hover:bg-gray-800 rounded text-gray-400">
          <Square className="w-4 h-4" />
        </button>
        <button className="p-1 hover:bg-red-600 rounded text-gray-400 hover:text-white">
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}