import React from 'react';
import { Editor } from './Editor';
import { Tabs } from './Tabs';

export function EditorArea() {
  return (
    <div className="flex-1 flex flex-col bg-gray-900 overflow-hidden">
      <Tabs />
      <div className="flex-1 relative">
        <Editor />
      </div>
    </div>
  );
}