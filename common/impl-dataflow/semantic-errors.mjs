export function implementationDataflowErrors(implementationDataflow, evaluated = false) {
  const semanticErrors = [];
  const entityIds = new Set();
  const containers = new Map();
  const containerNames = new Set();
  const nodes = new Map();
  const ownedNodeNames = new Set();
  const unownedNodeNames = new Set();

  for (const container of implementationDataflow.containers) {
    if (entityIds.has(container.id)) {
      semanticErrors.push(`Duplicate entity ID: ${container.id}`);
    } else {
      entityIds.add(container.id);
      containers.set(container.id, container);
    }
    if (containerNames.has(container.name)) {
      semanticErrors.push(`Duplicate container name: ${container.name}`);
    } else {
      containerNames.add(container.name);
    }
  }

  for (const node of implementationDataflow.nodes) {
    if (entityIds.has(node.id)) {
      semanticErrors.push(`Duplicate entity ID: ${node.id}`);
    } else {
      entityIds.add(node.id);
      nodes.set(node.id, node);
    }
    if (node.containerId !== undefined) {
      if (!containers.has(node.containerId)) {
        semanticErrors.push(`Unknown container for node ${node.id}: ${node.containerId}`);
      }
      const nameKey = JSON.stringify([node.containerId, node.type, node.name]);
      if (ownedNodeNames.has(nameKey)) {
        semanticErrors.push(`Duplicate ${node.type} name in container ${node.containerId}: ${node.name}`);
      } else {
        ownedNodeNames.add(nameKey);
      }
    } else if (node.containerId === undefined) {
      if (unownedNodeNames.has(node.name)) {
        semanticErrors.push(`Duplicate unowned node name: ${node.name}`);
      } else {
        unownedNodeNames.add(node.name);
      }
    }
  }

  for (const relationship of implementationDataflow.relationships) {
    for (const endpoint of [relationship.from, relationship.to]) {
      if (relationship.type === "dataflow") {
        if (!nodes.has(endpoint.nodeId)) {
          semanticErrors.push(`Unknown relationship node: ${endpoint.nodeId}`);
        } else if (nodes.get(endpoint.nodeId).type !== endpoint.type) {
          semanticErrors.push(`Relationship node type does not match ${endpoint.nodeId}: expected ${nodes.get(endpoint.nodeId).type}, received ${endpoint.type}`);
        }
      } else if (relationship.type === "composition") {
        if (!containers.has(endpoint.containerId)) {
          semanticErrors.push(`Unknown relationship container: ${endpoint.containerId}`);
        } else if (containers.get(endpoint.containerId).type !== endpoint.type) {
          semanticErrors.push(`Relationship container type does not match ${endpoint.containerId}: expected ${containers.get(endpoint.containerId).type}, received ${endpoint.type}`);
        }
      }
    }
  }

  if (implementationDataflow.stage === "code-review") {
    const diffHunkIds = new Set();
    const referencedDiffHunkIds = new Set();
    for (const hunk of implementationDataflow.diffHunks) {
      if (diffHunkIds.has(hunk.id)) {
        semanticErrors.push(`Diff hunk IDs must be unique: ${hunk.id}`);
      } else {
        diffHunkIds.add(hunk.id);
      }
    }
    const entries = [
      ...implementationDataflow.containers,
      ...implementationDataflow.nodes,
      ...implementationDataflow.relationships,
    ];
    for (const entry of entries) {
      for (const id of entry.diffHunkIds ?? []) {
        if (diffHunkIds.has(id)) {
          referencedDiffHunkIds.add(id);
        } else {
          semanticErrors.push(`Unknown diff hunk reference: ${id}`);
        }
      }
    }
    for (const id of diffHunkIds) {
      if (!referencedDiffHunkIds.has(id)) {
        semanticErrors.push(`Diff hunk must be referenced: ${id}`);
      }
    }
  }

  const changedNodes = implementationDataflow.nodes.filter((node) => ["added", "modified", "deleted"].includes(node.changeType));
  const changedContainerIds = new Set(changedNodes.filter((node) => node.containerId !== undefined).map((node) => node.containerId));
  const counts = {
    changedClassCount: implementationDataflow.containers.filter((container) => container.type === "class" && changedContainerIds.has(container.id)).length,
    changedFunctionCount: changedNodes.filter((node) => node.type === "function").length,
    changedComponentCount: changedNodes.filter((node) => ["ui-component", "system-input", "system-output", "external-dependency"].includes(node.type)).length,
    changedDataflowRelationshipCount: implementationDataflow.relationships.filter((relationship) => relationship.type === "dataflow" && ["added", "modified", "deleted"].includes(relationship.changeType)).length,
  };
  for (const [name, count] of Object.entries(counts)) {
    if (evaluated && implementationDataflow.stage === "high-level-design" && implementationDataflow[name] === undefined) {
      semanticErrors.push(`Evaluated high-level-design implementation dataflow requires non-null ${name}`);
    } else if (implementationDataflow[name] !== undefined && implementationDataflow[name] !== count) {
      semanticErrors.push(`${name} must equal the derived count: ${count}`);
    }
  }
  if (evaluated && implementationDataflow.stage === "code-review") {
    semanticErrors.push("--evaluated applies only to high-level-design implementation dataflows");
  }
  return semanticErrors;
}
