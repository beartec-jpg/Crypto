import React from 'react'
import { Router } from 'wouter'
import { useLocation } from 'wouter'

function App() {
  const [location] = useLocation()

  return (
    <Router base="/">
      {location === '/' ? (
        <div style={{ textAlign: 'center', padding: '50px', fontFamily: 'Arial', background: '#f0f0f0', minHeight: '100vh' }}>
          <style>{`
            @keyframes fadeInUp {
              from { opacity: 0; transform: translateY(30px); }
              to { opacity: 1; transform: translateY(0); }
            }
            .landing { animation: fadeInUp 1s ease-out; }
            .button { background: linear-gradient(45deg, #667eea, #764ba2); color: white; padding: 15px 30px; border: none; border-radius: 50px; cursor: pointer; transition: transform 0.3s; font-size: 18px; }
            .button:hover { transform: scale(1.05); }
          `}</style>
          <div className="landing">
            <h1>BearTec Crypto Platform</h1>
            <p>Push to enter the world of crypto trading</p>
            <img src="/logo.svg" alt="Crypto Image" style={{ borderRadius: '10px', margin: '20px', boxShadow: '0 4px 8px rgba(0,0,0,0.1)', width: '400px' }} />
            <button className="button" onClick={() => window.location.href = '/dashboard'}>
              Push to Enter Crypto
            </button>
          </div>
        </div>
      ) : (
        <div style={{ padding: '20px' }}>Dashboard (Add Elliott Wave content here)</div>
      )}
    </Router>
  )
}

export default App
