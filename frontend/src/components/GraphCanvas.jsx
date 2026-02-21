import ReactFlow, { Background, Controls, MiniMap } from "reactflow";
import "reactflow/dist/style.css";
import WorldNode from "./WorldNode.jsx";

export default function GraphCanvas({ nodes, edges, onNodeClick }) {
  const nodeTypes = { worldNode: WorldNode };
  return (
    <div className="card graph-canvas">
      <ReactFlow nodes={nodes} edges={edges} onNodeClick={onNodeClick} fitView nodeTypes={nodeTypes}>
        <MiniMap pannable zoomable />
        <Controls />
        <Background gap={24} />
      </ReactFlow>
    </div>
  );
}
