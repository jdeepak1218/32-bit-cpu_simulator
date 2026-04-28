'use client';

import React, { useEffect, useRef, useState } from 'react';
import Editor, { useMonaco } from '@monaco-editor/react';
import { useCPUStore } from '@/lib/store';
import { EXAMPLE_PROGRAMS } from '@/lib/assembler';
import { Play, Pause, RotateCcw, StepForward, Download, Upload, BookOpen } from 'lucide-react';

const customLanguage = {
  id: 'cpu32-asm',
  extensions: ['.asm', '.s'],
  aliases: ['CPU32 Assembly', 'asm32'],
  mimetypes: ['text/x-asm'],
};

const customTheme = {
  base: 'vs-dark' as const,
  inherit: true,
  rules: [
    { token: 'keyword.instruction', foreground: 'C586C0', fontStyle: 'bold' },
    { token: 'keyword.register', foreground: '9CDCFE' },
    { token: 'number.hex', foreground: 'B5CEA8' },
    { token: 'number.decimal', foreground: 'B5CEA8' },
    { token: 'comment', foreground: '6A9955' },
    { token: 'label', foreground: '4EC9B0', fontStyle: 'bold' },
    { token: 'string', foreground: 'CE9178' },
  ],
  colors: {
    'editor.background': '#1e1e1e',
    'editor.lineHighlightBackground': '#2d2d2d',
    'editorLineNumber.foreground': '#858585',
    'editorLineNumber.activeForeground': '#c6c6c6',
  },
};

export default function AssemblyEditor() {
  const editorRef = useRef<any>(null);
  const monaco = useMonaco();

  const {
    sourceCode,
    setSourceCode,
    assembleCode,
    isRunning,
    isPaused,
    run,
    pause,
    step,
    reset,
    assemblyErrors,
    assemblyLines,
    currentLine,
    breakpoints,
    toggleBreakpoint,
    loadExample,
  } = useCPUStore();

  const [selectedExample, setSelectedExample] = useState<keyof typeof EXAMPLE_PROGRAMS>('factorial');
  const [showExamples, setShowExamples] = useState(false);

  useEffect(() => {
    if (monaco) {
      // Register language
      monaco.languages.register(customLanguage);

      // Define language configuration
      monaco.languages.setMonarchTokensProvider('cpu32-asm', {
        keywords: [
          'NOP', 'HALT', 'MOV', 'LOAD', 'LDR', 'STR', 'PUSH', 'POP',
          'ADD', 'SUB', 'MUL', 'DIV', 'MOD', 'AND', 'OR', 'XOR', 'NOT',
          'SHL', 'SHR', 'ROL', 'ROR', 'CMP', 'SWAP',
          'JMP', 'JZ', 'JNZ', 'JN', 'JGT', 'JLT', 'JGE', 'JLE', 'CALL', 'RET',
          'STI', 'CLI', 'IRET',
        ],
        registers: [
          'R0', 'R1', 'R2', 'R3', 'R4', 'R5', 'R6', 'R7',
          'R8', 'R9', 'R10', 'R11', 'R12', 'R13', 'R14', 'R15',
        ],
        tokenizer: {
          root: [
            [/;.*$/, 'comment'],
            [/^[a-zA-Z_]\w*:/, 'label'],
            [
              /@?[a-zA-Z_]\w*/,
              {
                cases: {
                  '@keywords': 'keyword.instruction',
                  '@registers': 'keyword.register',
                  '@default': 'identifier',
                },
              },
            ],
            [/0x[0-9a-fA-F]+/, 'number.hex'],
            [/0b[01]+/, 'number.binary'],
            [/-?\d+/, 'number.decimal'],
            [/"[^"]*"/, 'string'],
          ],
        },
      });

      // Define theme
      monaco.editor.defineTheme('cpu32-dark', customTheme);

      // Set editor options
      monaco.editor.setTheme('cpu32-dark');
    }
  }, [monaco]);

  useEffect(() => {
    // Assemble on mount
    assembleCode();
    // Clear any existing markers (safe default)
    if (monaco && editorRef.current) {
      const model = editorRef.current.getModel();
      if (model) monaco.editor.setModelMarkers(model, 'asm', []);
    }
  }, []);

  // Update Monaco markers when assembly errors change
  useEffect(() => {
    if (!monaco || !editorRef.current) return;
    const model = editorRef.current.getModel();
    if (!model) return;

    const markers: any[] = assemblyErrors.map((err) => {
      // Try to extract line number if assembler reported one
      const m = err.match(/line\s*(\d+)/i);
      const line = m ? Math.max(1, parseInt(m[1], 10)) : 1;
      return {
        severity: monaco.MarkerSeverity.Error,
        startLineNumber: line,
        startColumn: 1,
        endLineNumber: line,
        endColumn: 200,
        message: err,
      };
    });

    monaco.editor.setModelMarkers(model, 'asm', markers);
  }, [assemblyErrors, monaco]);

  useEffect(() => {
    // Highlight current line
    if (editorRef.current && monaco) {
      const editor = editorRef.current;
      const decorations: any[] = [];

      // Highlight current execution line
      if (currentLine >= 0) {
        const line = assemblyLines[currentLine]?.source;
        if (line) {
          // Find the line number in the editor
          const lines = sourceCode.split('\n');
          for (let i = 0; i < lines.length; i++) {
            if (lines[i].includes(line.split('\n')[0]?.trim() || '')) {
              decorations.push({
                range: new monaco.Range(i + 1, 1, i + 1, 1),
                options: {
                  isWholeLine: true,
                  className: 'current-line-highlight',
                  glyphMarginClassName: 'current-line-glyph',
                },
              });
              break;
            }
          }
        }
      }

      // Show breakpoints
      assemblyLines.forEach((line, idx) => {
        if (breakpoints.has(line.address)) {
          const lines = sourceCode.split('\n');
          for (let i = 0; i < lines.length; i++) {
            if (lines[i].includes(line.source?.split('\n')[0]?.trim() || '')) {
              decorations.push({
                range: new monaco.Range(i + 1, 1, i + 1, 1),
                options: {
                  glyphMarginClassName: 'breakpoint-glyph',
                },
              });
              break;
            }
          }
        }
      });

      // Store decoration IDs to clear them later
      const decorationIds = editor.createDecorationsCollection(decorations);
      return () => {
        decorationIds.clear();
      };
    }
  }, [currentLine, assemblyLines, breakpoints, monaco, sourceCode]);

  const handleEditorDidMount = (editor: any) => {
    editorRef.current = editor;

    // Add click handler for breakpoints
    editor.onMouseDown((e: any) => {
      if (e.target.type === monaco?.editor.MouseTargetType.GUTTER_GLYPH_MARGIN) {
        const lineNumber = e.target.position?.lineNumber;
        if (lineNumber) {
          // Find the corresponding assembly line
          const lineContent = editor.getModel().getLineContent(lineNumber);
          const match = lineContent.match(/^[a-zA-Z_]\w*:\s*$/);
          if (!match) {
            // Find address for this line
            const lines = sourceCode.split('\n');
            let addr = 0;
            for (let i = 0; i < lineNumber - 1 && i < lines.length; i++) {
              const trimmed = lines[i].trim();
              if (trimmed && !trimmed.startsWith(';') && !trimmed.match(/^[a-zA-Z_]\w*:$/)) {
                addr += 4;
              }
            }
            toggleBreakpoint(addr);
          }
        }
      }
    });
  };

  const handleLoadExample = (name: keyof typeof EXAMPLE_PROGRAMS) => {
    loadExample(name);
    setSelectedExample(name);
    setShowExamples(false);
  };

  const handleAssemble = () => {
    assembleCode();
  };

  return (
    <div className="flex flex-col h-full bg-gray-900 rounded-lg overflow-hidden border border-gray-700">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-4 py-2 bg-gray-800 border-b border-gray-700">
        <div className="flex items-center gap-2">
          <button
            onClick={isRunning && !isPaused ? pause : run}
            className={`flex items-center gap-1 px-3 py-1 rounded text-sm font-medium transition-colors ${
              isRunning && !isPaused
                ? 'bg-yellow-600 hover:bg-yellow-700 text-white'
                : 'bg-green-600 hover:bg-green-700 text-white'
            }`}
          >
            {isRunning && !isPaused ? (
              <>
                <Pause size={16} />
                Pause
              </>
            ) : (
              <>
                <Play size={16} />
                Run
              </>
            )}
          </button>

          <button
            onClick={step}
            disabled={isRunning && !isPaused}
            className="flex items-center gap-1 px-3 py-1 rounded bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <StepForward size={16} />
            Step
          </button>

          <button
            onClick={reset}
            className="flex items-center gap-1 px-3 py-1 rounded bg-gray-600 hover:bg-gray-700 text-white text-sm font-medium transition-colors"
          >
            <RotateCcw size={16} />
            Reset
          </button>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleAssemble}
            className="flex items-center gap-1 px-3 py-1 rounded bg-purple-600 hover:bg-purple-700 text-white text-sm font-medium transition-colors"
          >
            <Download size={16} />
            Assemble
          </button>

          <div className="relative">
            <button
              onClick={() => setShowExamples(!showExamples)}
              className="flex items-center gap-1 px-3 py-1 rounded bg-cyan-600 hover:bg-cyan-700 text-white text-sm font-medium transition-colors"
            >
              <BookOpen size={16} />
              Examples
            </button>

            {showExamples && (
              <div className="absolute top-full right-0 mt-1 w-56 bg-gray-800 rounded-lg shadow-xl border border-gray-700 z-50">
                {Object.keys(EXAMPLE_PROGRAMS).map((name) => (
                  <button
                    key={name}
                    onClick={() => handleLoadExample(name as keyof typeof EXAMPLE_PROGRAMS)}
                    className={`w-full text-left px-4 py-2 text-sm hover:bg-gray-700 transition-colors ${
                      selectedExample === name ? 'text-cyan-400' : 'text-gray-300'
                    }`}
                  >
                    {name.replace(/([A-Z])/g, ' $1').replace(/^./, (str) => str.toUpperCase())}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Assembly Errors */}
      {assemblyErrors.length > 0 && (
        <div className="px-4 py-2 bg-red-900/50 border-b border-red-700">
          <div className="text-red-400 text-sm font-semibold mb-1">Assembly Errors:</div>
          {assemblyErrors.map((error, idx) => (
            <div key={idx} className="text-red-300 text-xs">{error}</div>
          ))}
        </div>
      )}

      {/* Monaco Editor */}
      <div className="flex-1">
        <Editor
          height="100%"
          language="cpu32-asm"
          value={sourceCode}
          theme="cpu32-dark"
          onChange={(value) => setSourceCode(value || '')}
          onMount={handleEditorDidMount}
          options={{
            minimap: { enabled: false },
            fontSize: 14,
            lineNumbers: 'on',
            glyphMargin: true,
            folding: false,
            lineDecorationsWidth: 10,
            automaticLayout: true,
            scrollBeyondLastLine: false,
            renderWhitespace: 'boundary',
            tabSize: 2,
            insertSpaces: true,
          }}
        />
      </div>

      {/* CSS for line highlighting */}
      <style jsx global>{`
        .current-line-highlight {
          background-color: rgba(255, 255, 0, 0.1) !important;
          border-left: 3px solid #fbbf24 !important;
        }
        .current-line-glyph {
          background-color: #fbbf24;
          width: 10px !important;
          margin-left: 5px;
        }
        .breakpoint-glyph {
          background-color: #ef4444;
          width: 10px !important;
          height: 10px !important;
          border-radius: 50%;
          margin-left: 5px;
        }
      `}</style>
    </div>
  );
}
