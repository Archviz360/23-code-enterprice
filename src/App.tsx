import React from 'react';
import { ActivityBar } from './components/ActivityBar';
import { Sidebar } from './components/Sidebar';
import { EditorArea } from './components/EditorArea';
import { StatusBar } from './components/StatusBar';
import { TitleBar } from './components/TitleBar';

function App() {
  return (
    <div className="flex flex-col h-screen bg-gray-900 overflow-hidden">
      <TitleBar />
      <div className="flex flex-1 overflow-hidden">
        <ActivityBar />
        <Sidebar />
        <EditorArea />
      </div>
      <StatusBar />
    </div>
  );
}

export default App;