import React from 'react';
import { createRoot } from 'react-dom/client';
import './binaural-data.js';
import './blob-store.js';
import './audio-engine.js';
import './soundscape-engine.js';
import './tts-engine.js';
import './reference.css';
import './styles.css';
import App from './App.jsx';

createRoot(document.getElementById('root')).render(<App/>);
