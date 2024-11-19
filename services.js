class SupplyChainViz {
  constructor() {
    this.nodes = [];
    this.links = [];
    this.hoveredNode = null;

    this.STAGES = ["Node 1", "Node 2", "Node 3", "Node 4", "Node 5"];
    this.STAGE_COLORS = {
      0: "#4299E1",
      1: "#ED8936",
      2: "#48BB78",
      3: "#E53E3E",
      4: "#805AD5",
    };

    this.STAGE_SPACING = 200;
    this.NODE_SPACING = 70;
    this.MARGIN = 60;
    this.MAX_NODE_SIZE = 20;
    this.MIN_NODE_SIZE = 8;

    this.svg = document.getElementById("chart");
    this.setupEventListeners();
  }

  setupEventListeners() {
    document.getElementById("nodesFile").addEventListener("change", (e) => this.handleNodesFile(e));
    document.getElementById("linksFile").addEventListener("change", (e) => this.handleLinksFile(e));
  }

  async handleNodesFile(event) {
    const file = event.target.files[0];
    if (file) {
      Papa.parse(file, {
        header: true,
        dynamicTyping: true,
        complete: (results) => {
          this.nodes = results.data.filter((node) => node.id);
          if (this.links.length > 0) {
            this.render();
          }
        },
      });
    }
  }

  async handleLinksFile(event) {
    const file = event.target.files[0];
    if (file) {
      Papa.parse(file, {
        header: true,
        dynamicTyping: true,
        complete: (results) => {
          this.links = results.data.filter((link) => link.source && link.target);
          if (this.nodes.length > 0) {
            this.render();
          }
        },
      });
    }
  }

  getNodePosition(stage, position) {
    return {
      x: this.MARGIN + stage * this.STAGE_SPACING,
      y: this.MARGIN + position * this.NODE_SPACING,
    };
  }

  getNodeSize(value) {
    if (!value) return this.MIN_NODE_SIZE;
    const maxValue = Math.max(...this.nodes.map((n) => n.value || 0));
    const minValue = Math.min(...this.nodes.map((n) => n.value || 0));
    const scale = (value - minValue) / (maxValue - minValue);
    return this.MIN_NODE_SIZE + scale * (this.MAX_NODE_SIZE - this.MIN_NODE_SIZE);
  }

  createPath(sourceNode, targetNode) {
    const source = this.getNodePosition(sourceNode.stage, sourceNode.position);
    const target = this.getNodePosition(targetNode.stage, targetNode.position);
    const midX = (source.x + target.x) / 2;

    return `M ${source.x} ${source.y}
                        C ${midX} ${source.y},
                          ${midX} ${target.y},
                          ${target.x} ${target.y}`;
  }

  getLinkWidth(value) {
    const maxValue = Math.max(...this.links.map((l) => l.value || 0));
    const minValue = Math.min(...this.links.map((l) => l.value || 0));
    const scale = (value - minValue) / (maxValue - minValue);
    return 2 + scale * 6;
  }

  render() {
    // Clear previous content
    this.svg.innerHTML = "";

    // Add stage labels
    this.STAGES.forEach((stage, index) => {
      const text = document.createElementNS("http://www.w3.org/2000/svg", "text");
      text.setAttribute("x", this.MARGIN + index * this.STAGE_SPACING);
      text.setAttribute("y", 20);
      text.setAttribute("text-anchor", "middle");
      text.classList.add("node-label");
      text.textContent = stage;
      this.svg.appendChild(text);
    });

    // Add links
    this.links.forEach((link) => {
      const sourceNode = this.nodes.find((n) => n.id === link.source);
      const targetNode = this.nodes.find((n) => n.id === link.target);
      if (!sourceNode || !targetNode) return;

      const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
      path.setAttribute("d", this.createPath(sourceNode, targetNode));
      path.setAttribute("fill", "none");
      path.setAttribute("stroke", this.STAGE_COLORS[sourceNode.stage]);
      path.setAttribute("stroke-width", this.getLinkWidth(link.value));
      path.setAttribute("opacity", "0.6");
      path.classList.add("link");
      path.dataset.source = link.source;
      path.dataset.target = link.target;
      path.dataset.value = link.value;
      this.svg.appendChild(path);
    });

    // Add nodes
    this.nodes.forEach((node) => {
      const pos = this.getNodePosition(node.stage, node.position);
      const group = document.createElementNS("http://www.w3.org/2000/svg", "g");
      group.setAttribute("transform", `translate(${pos.x},${pos.y})`);
      group.classList.add("node");

      const circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
      circle.setAttribute("r", this.getNodeSize(node.value));
      circle.setAttribute("fill", this.STAGE_COLORS[node.stage]);
      circle.setAttribute("opacity", "0.8");

      const label = document.createElementNS("http://www.w3.org/2000/svg", "text");
      label.setAttribute("y", -this.getNodeSize(node.value) - 5);
      label.setAttribute("text-anchor", "middle");
      label.classList.add("node-label");
      label.textContent = node.id;

      group.appendChild(circle);
      group.appendChild(label);

      // Add hover events
      group.addEventListener("mouseenter", () => this.handleNodeHover(node.id));
      group.addEventListener("mouseleave", () => this.handleNodeHover(null));

      this.svg.appendChild(group);
    });
  }

  handleNodeHover(nodeId) {
    this.hoveredNode = nodeId;

    // Update links visibility
    const links = this.svg.querySelectorAll(".link");
    links.forEach((link) => {
      if (!nodeId) {
        link.setAttribute("opacity", "0.6");
      } else if (link.dataset.source === nodeId || link.dataset.target === nodeId) {
        link.setAttribute("opacity", "0.8");
      } else {
        link.setAttribute("opacity", "0.01");
      }
    });

    // Update value labels
    const valueLabels = this.svg.querySelectorAll(".value-label");
    valueLabels.forEach((label) => label.remove());

    if (nodeId) {
      const relevantLinks = this.links.filter((link) => link.source === nodeId || link.target === nodeId);

      relevantLinks.forEach((link) => {
        const sourceNode = this.nodes.find((n) => n.id === link.source);
        const targetNode = this.nodes.find((n) => n.id === link.target);
        const source = this.getNodePosition(sourceNode.stage, sourceNode.position);
        const target = this.getNodePosition(targetNode.stage, targetNode.position);

        const label = document.createElementNS("http://www.w3.org/2000/svg", "text");
        label.setAttribute("x", (source.x + target.x) / 2);
        label.setAttribute("y", (source.y + target.y) / 2 - 10);
        label.setAttribute("text-anchor", "middle");
        label.classList.add("value-label");
        label.textContent = `${link.value.toLocaleString()}`;
        this.svg.appendChild(label);
      });
    }
  }
}

// Initialize visualization
const viz = new SupplyChainViz();
