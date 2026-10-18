import { loader } from '@monaco-editor/react';
import * as monaco from 'monaco-editor/editor/editor.api';
import 'monaco-editor/basic-languages/monaco.contribution';
import EditorWorker from 'monaco-editor/editor/editor.worker?worker';

self.MonacoEnvironment = { getWorker: () => new EditorWorker() };
loader.config({ monaco });
