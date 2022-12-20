import React from 'react';
import './Panel.css'

class PanelMode extends React.Component {
  constructor(props) {
    super(props);

    this.state = {
      mode: props.mode,
    };
  }

  render() {
    return(
      <div className="Panel">
        Mode: {this.state.mode}
      </div>
    );
  }
}

export default PanelMode;
