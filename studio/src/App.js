import logo from './logo.svg';
import './App.css';
import PanelMode from './PanelMode';
import React from 'react';

function App() {
  var [mode, setMode] = React.useState("participant");

  return (
    <div className="App">
      <h3 align="left">vStudio</h3>
      <PanelMode mode={mode} />
    </div>
  );
}

export default App;
