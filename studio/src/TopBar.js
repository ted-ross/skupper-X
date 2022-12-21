import React from 'react';
import './TopBar.css'

class TopBar extends React.Component {
  constructor(props) {
    super(props);

    this.state = {
      mode: props.mode,
    };
  }

  render() {
    return(
      <div className="TopBar">
      </div>
    );
  }
}

export default TopBar;
