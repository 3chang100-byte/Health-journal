import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import Tooltip from './Tooltip.jsx';
import './styles.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
    <Tooltip />
  </React.StrictMode>
);
