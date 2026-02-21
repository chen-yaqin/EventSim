import ReactFlow, { Background, Controls, MiniMap } from "reactflow";
import "reactflow/dist/style.css";

export default function GraphCanvas({ nodes, edges, onNodeClick }) {
  return (
    <div className="card graph-canvas">
      <ReactFlow nodes={nodes} edges={edges} onNodeClick={onNodeClick} fitView>
        <MiniMap pannable zoomable />
        <Controls />
        <Background gap={24} />
      </ReactFlow>
    </div>
  );
}
