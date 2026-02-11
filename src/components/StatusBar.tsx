import React from 'react';
import { GitBranch, HardDrive, Zap, CircleAlert, Terminal, Settings } from 'lucide-react';

export function StatusBar() {
  return (
    <div className="h-6 bg-blue-600 flex items-center justify-between text-xs text-white px-2">
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-1">
          <GitBranch className="w-3 h-3" />
          <span>main*</span>
        </div>
        
        <div className="flex items-center gap-1">
          <HardDrive className="w-3 h-3" />
          <span>main.tsx</span>
        </div>
      </div>
      
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-1">
          <Zap className="w-3 h-3" />
          <span>Ln 1, Col 1</span>
        </div>
        
        <div className="flex items-center gap-1">
          <CircleAlert className="w-3 h-3" />
          <span>UTF-8</span>
        </div>
        
        <div className="flex items-center gap-1">
          <Terminal className="w-3 h-3" />
          <span>JavaScript</span>
        </div>
        
        <div className="flex items-center gap-1">
          <Settings className="w-3 h-3" />
          <span>Spaces: 2</span>
        </div>
        
        <div className="flex items-center gap-1">
          <span>100%</span>
        </div>
      </div>
    </div>
  );
}