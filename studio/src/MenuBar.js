import React from 'react';
import './MenuBar.css'
import MenuOption from './MenuOption'

class MenuBar extends React.Component {
  constructor(props) {
    super(props);
  }

  render() {
    return(
      <div className="MenuBar">
        <MenuOption optionText="Collaborations" />
        <MenuOption optionText="Calendar" />
        <MenuOption optionText="Network" />
        <MenuOption optionText="Application" />
      </div>
    );
  }
}

export default MenuBar;
