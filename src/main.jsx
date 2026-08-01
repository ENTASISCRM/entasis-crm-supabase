import React from 'react'
import { demarrerVerifVersion } from './lib/version-check.jsx'
import ReactDOM from 'react-dom/client'
import App from './App'
import './styles.css'

demarrerVerifVersion()

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
