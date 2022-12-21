import React from 'react';
import './MenuOption.css'

class MenuOption extends React.Component {
  constructor(props) {
    super(props);

    this.state = {
        text : props.optionText
    }
  }

  render() {
    return(
      <div className="MenuOption">
        {this.state.text}
      </div>
    );
  }
}

export default MenuOption;
