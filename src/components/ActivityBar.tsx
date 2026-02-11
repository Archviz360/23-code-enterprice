import React from 'react';
import { FileText, Search, FolderOpen, Settings, Bell, Github } from 'lucide-react';

export function ActivityBar() {
  const activities = [
    { icon: FileText, label: 'Explorer', id: 'explorer' },
    { icon: Search, label: 'Search', id: 'search' },
    { icon: FolderOpen, label: 'Source Control', id: 'source-control' },
    { icon: Bell, label: 'Run and Debug', id: 'debug' },
    { icon: Settings, label: 'Extensions', id: 'extensions' },
    { icon: Github, label: 'GitHub', id: 'github' },
  ];

  return (
    <div className="w-12 bg-gray-900 flex flex-col items-center py-2 gap-4">
      {activities.map((activity) => (
        <button
          key={activity.id}
          title={activity.label}
          className="p-2 text-gray-400 hover:text-white hover:bg-gray-800 rounded group"
        >
          <activity.icon className="w-5 h-5" />
          <div className="absolute left-12 ml-2 hidden group-hover:block bg-gray-800 text-white text-xs px-2 py-1 rounded">
            {activity.label}
          </div>
        </button>
      ))}
      
      <div className="flex-1"></div>
      
      <button title="Manage" className="p-2 text-gray-400 hover:text-white hover:bg-gray-800 rounded group">
        <Settings className="w-5 h-5" />
        <div className="absolute left-12 ml-2 hidden group-hover:block bg-gray-800 text-white text-xs px-2 py-1 rounded">
          Manage
        </div>
      </button>
    </div>
  );
}