import React, { useState } from 'react';
import { Search, Download, Star, Filter } from 'lucide-react';

interface Extension {
  id: string;
  name: string;
  displayName: string;
  publisher: string;
  description: string;
  rating: number;
  downloadCount: number;
  installed: boolean;
  category: string;
}

const mockExtensions: Extension[] = [
  {
    id: 'ms-python.python',
    name: 'Python',
    displayName: 'Python',
    publisher: 'ms-python',
    description: 'IntelliSense, Linting, Debugging, Jupyter Notebooks, Code Formatting, and more.',
    rating: 4.5,
    downloadCount: 23456789,
    installed: true,
    category: 'Programming Languages'
  },
  {
    id: 'bradlc.vscode-tailwindcss',
    name: 'Tailwind CSS IntelliSense',
    displayName: 'Tailwind CSS IntelliSense',
    publisher: 'bradlc',
    description: 'Intelligent Tailwind CSS tooling for VS Code',
    rating: 4.8,
    downloadCount: 12345678,
    installed: true,
    category: 'Snippets'
  },
  {
    id: 'ms-vscode.vscode-typescript-next',
    name: 'TypeScript and JavaScript Language Features',
    displayName: 'TypeScript and JavaScript Language Features',
    publisher: 'ms-vscode',
    description: 'Provides rich language support for JavaScript and TypeScript',
    rating: 4.7,
    downloadCount: 34567890,
    installed: false,
    category: 'Programming Languages'
  },
  {
    id: 'esbenp.prettier-vscode',
    name: 'Prettier - Code formatter',
    displayName: 'Prettier - Code formatter',
    publisher: 'esbenp',
    description: 'Code formatter using prettier',
    rating: 4.6,
    downloadCount: 45678901,
    installed: false,
    category: 'Formatters'
  },
  {
    id: 'ms-toolsai.jupyter',
    name: 'Jupyter',
    displayName: 'Jupyter',
    publisher: 'ms-toolsai',
    description: 'Jupyter notebook support, intelligent code completion, formatting, and more.',
    rating: 4.4,
    downloadCount: 12345678,
    installed: false,
    category: 'Data Science'
  }
];

export function Extensions() {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [installingExtension, setInstallingExtension] = useState<string | null>(null);

  const categories = ['All', ...Array.from(new Set(mockExtensions.map(ext => ext.category)))];

  const filteredExtensions = mockExtensions.filter(ext => {
    const matchesSearch = ext.displayName.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         ext.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         ext.publisher.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCategory = selectedCategory === 'All' || ext.category === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  const handleInstall = (id: string) => {
    setInstallingExtension(id);
    setTimeout(() => {
      setInstallingExtension(null);
      // In a real app, this would update the extension status
      console.log(`Installed extension: ${id}`);
    }, 1000);
  };

  return (
    <div className="flex flex-col h-full">
      <div className="p-4 border-b border-gray-700">
        <div className="relative">
          <Search className="absolute left-3 top-2.5 w-4 h-4 text-gray-500" />
          <input
            type="text"
            placeholder="Search Extensions in Marketplace"
            className="w-full bg-gray-800 text-gray-300 text-sm rounded px-10 py-2 focus:outline-none focus:ring-1 focus:ring-blue-500"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        
        <div className="flex gap-2 mt-3 overflow-x-auto pb-2">
          {categories.map(category => (
            <button
              key={category}
              className={`px-3 py-1 text-xs rounded-full whitespace-nowrap ${
                selectedCategory === category
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
              }`}
              onClick={() => setSelectedCategory(category)}
            >
              {category}
            </button>
          ))}
        </div>
      </div>
      
      <div className="flex-1 overflow-y-auto p-2">
        {filteredExtensions.map(extension => (
          <div key={extension.id} className="p-3 hover:bg-gray-800 rounded flex items-start gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-purple-600 rounded flex items-center justify-center text-white text-xs font-bold">
              {extension.displayName.charAt(0)}
            </div>
            
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <h3 className="font-medium text-gray-200">{extension.displayName}</h3>
                <span className="text-xs text-gray-500">{extension.publisher}</span>
              </div>
              
              <p className="text-xs text-gray-400 mt-1 line-clamp-2">{extension.description}</p>
              
              <div className="flex items-center gap-4 mt-2 text-xs text-gray-500">
                <div className="flex items-center gap-1">
                  <Star className="w-3 h-3 fill-current" />
                  <span>{extension.rating}</span>
                </div>
                
                <div className="flex items-center gap-1">
                  <Download className="w-3 h-3" />
                  <span>{(extension.downloadCount / 1000000).toFixed(1)}M</span>
                </div>
                
                <span>{extension.category}</span>
              </div>
            </div>
            
            <button
              className={`px-3 py-1 text-xs rounded ${
                extension.installed
                  ? 'bg-gray-700 text-gray-300'
                  : 'bg-blue-600 text-white hover:bg-blue-700'
              } ${installingExtension === extension.id ? 'opacity-75' : ''}`}
              onClick={() => handleInstall(extension.id)}
              disabled={installingExtension !== null}
            >
              {installingExtension === extension.id ? 'Installing...' : extension.installed ? 'Installed' : 'Install'}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}