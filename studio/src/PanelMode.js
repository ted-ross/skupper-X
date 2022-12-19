import './Panel.css'

function PanelMode(props) {
  return (
    <div className="Panel">
      Mode: {props.mode}
    </div>
  );
}

export default PanelMode;
