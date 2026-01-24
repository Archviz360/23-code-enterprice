import React, { useEffect, useRef } from 'react';
import MonacoEditor, { OnMount } from '@monaco-editor/react';
import type * as monaco from 'monaco-editor';
import { useEditorStore } from '../store/editorStore';
import { useCollaborationStore } from '../store/collaborationStore';
import { MonacoBinding } from 'y-monaco';

export function Editor() {
  const { content, setContent, language, theme, fontSize, wordWrap } = useEditorStore();
  const { doc, roomId, setBinding } = useCollaborationStore();
  const editorRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null);

  useEffect(() => {
    if (doc && editorRef.current && roomId) {
      const ytext = doc.getText('monaco');
      const binding = new MonacoBinding(
        ytext,
        editorRef.current,
        new Set([editorRef.current])
      );
      setBinding(binding);
    }
  }, [doc, roomId, setBinding]);

  const handleEditorDidMount: OnMount = (editor) => {
    editorRef.current = editor;
    
    // Add VS Code-like keybindings
    editor.addAction({
      id: 'format-document',
      label: 'Format Document',
      keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyF],
      run: () => {
        editor.getAction('editor.action.formatDocument')?.run();
      }
    });
  };

  const handleEditorChange = (value: string | undefined) => {
    if (!doc) {
      setContent(value || '');
    }
  };

  return (
    <div className="flex-1 h-full">
      <MonacoEditor
        height="100%"
        language={language}
        value={content}
        theme={theme === 'vs-dark' ? 'vs-dark' : 'vs'}
        onChange={handleEditorChange}
        onMount={handleEditorDidMount}
        options={{
          fontSize,
          wordWrap,
          minimap: { enabled: true },
          scrollBeyondLastLine: false,
          lineNumbers: 'on',
          renderWhitespace: 'selection',
          automaticLayout: true,
          padding: { top: 10 },
          fontFamily: "'Fira Code', 'Consolas', 'Courier New', monospace",
          fontLigatures: true,
          suggest: {
            showKeywords: true,
            showSnippets: true
          },
          quickSuggestions: true,
          parameterHints: {
            enabled: true
          },
          selectionHighlight: true,
          occurrencesHighlight: true,
          folding: true,
          lineDecorationsWidth: 3,
          lineNumbersMinChars: 3,
          smoothScrolling: true,
          mouseWheelZoom: true,
          scrollbar: {
            vertical: 'auto',
            horizontal: 'auto',
            verticalScrollbarSize: 14,
            horizontalScrollbarSize: 14,
          }
        }}
      />
    </div>
  );
}