import logo from './logo.svg';
import './App.css';
import TopBar from './TopBar';
import MenuBar from './MenuBar'
import React from 'react';

function App() {
  var [mode, setMode] = React.useState("participant");

  return (
    <div className="App">
      <TopBar />
      <MenuBar />
    </div>
  );
}

export default App;
