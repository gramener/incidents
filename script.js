import * as d3 from "https://cdn.jsdelivr.net/npm/d3@7/+esm";
import { layer } from "https://cdn.jsdelivr.net/npm/@gramex/chartbase@1";
import { sankey } from "https://cdn.jsdelivr.net/npm/@gramex/sankey@1";
import { network } from "https://cdn.jsdelivr.net/npm/@gramex/network@2/dist/network.js";
import { kpartite } from "https://cdn.jsdelivr.net/npm/@gramex/network@2/dist/kpartite.js";
import { num0, num2 } from "https://cdn.jsdelivr.net/npm/@gramex/ui@0.3/dist/format.js";

const $upload = document.getElementById("upload");
const $result = document.getElementById("result");
const $showLinks = document.getElementById("show-links");
const $threshold = document.getElementById("threshold");
const $sankey = document.getElementById("sankey");
const $network = document.getElementById("network");
let data = {};
let graphs = {};
let extent;
let threshold = $threshold.value;
let colorScale;

// When incidents or network are uploaded, read it as CSV and parse it
$upload.addEventListener("change", async (e) => {
  data[e.target.getAttribute("name")] = await readCSV(e.target.files[0]);
  draw();
});

async function readCSV(file) {
  const fileReader = new FileReader();
  return new Promise((resolve) => {
    fileReader.onload = (e) => resolve(d3.dsvFormat(",").parse(e.target.result, d3.autoType));
    fileReader.readAsText(file);
  });
}

function draw() {
  $result.classList.remove("d-none");
  if (!data.incidents) return;
  drawSankey();
  if (data.relations) drawNetwork();
}

function drawSankey() {
  const graph = sankey($sankey, {
    data: data.incidents,
    labelWidth: 100,
    categories: ["Shift", "Area", "Team"],
    size: (d) => d.Count,
    text: (d) => (d.width > 20 ? d.key : null),
    d3,
  });
  graphs.sankey = graph;

  // Calculate average duration
  graph.nodeData.forEach((d) => (d.Hours = d3.sum(d.group, (d) => d.Hours) / d.group.length));
  graph.linkData.forEach((d) => (d.Hours = d3.sum(d.group, (d) => d.Hours) / d.group.length));

  // Calculate the 5th and 95th percentiles of d.Hours, weighted by d.size
  const sorted = d3.sort(graph.nodeData, (d) => d.Hours);
  const totalSize = d3.sum(sorted, (d) => d.size);
  let cumulative = 0;
  for (const [i, d] of sorted.entries()) {
    cumulative += d.size / totalSize;
    d.cumulative = cumulative;
    d.percentrank = i / (sorted.length - 1);
  }
  const p5 = sorted.find((d) => d.cumulative >= 0.05).Hours;
  const p95 = [...sorted].reverse().find((d) => d.cumulative <= 0.95).Hours;
  extent = [p95, (p95 + p5) / 2, p5];
  d3.sort(graph.linkData, (d) => d.Hours).forEach((d, i) => (d.percentrank = i / (graph.linkData.length - 1)));

  // Add tooltip
  graph.nodes.attr("data-bs-toggle", "tooltip").attr("title", (d) => `${d.key}: ${num2(d.Hours)} hours`);
  graph.links
    .attr("data-bs-toggle", "tooltip")
    .attr("title", (d) => `${d.source.key} - ${d.target.key}: ${num2(d.Hours)} hours`);

  // Define the color scale
  colorScale = d3
    .scaleLinear()
    .domain(extent)
    .range(["red", "yellow", "green"])
    .interpolate(d3.interpolateLab)
    .clamp(true);

  // Style the text labels
  graph.texts.attr("fill", "black");
  colorSankey();
}

function colorSankey() {
  graphs.sankey.nodes.attr("fill", (d) => (d.percentrank > threshold ? colorScale(d.Hours) : "var(--disabled-node)"));
  graphs.sankey.links.attr("fill", (d) => (d.percentrank > threshold ? colorScale(d.Hours) : "var(--disabled-link)"));
}

$showLinks.addEventListener("change", () => {
  graphs.sankey.links.classed("show", $showLinks.checked);
});

$threshold.addEventListener("input", () => {
  threshold = $threshold.value;
  colorSankey();
});

function drawNetwork() {
  const { nodes, links } = kpartite(
    data.relations,
    [
      ["name", "Source"],
      ["name", "Target"],
    ],
    { count: 1 }
  );
  const serviceStats = d3.rollup(
    data.incidents,
    (v) => ({ TotalHours: d3.sum(v, (d) => d.Hours), Count: v.length }),
    (d) => d.Service
  );

  for (const node of nodes) {
    Object.assign(node, serviceStats.get(node.value) || { TotalHours: 0, Count: 0 });
    node.Hours = node.TotalHours / node.Count;
  }

  const forces = {
    charge: () => d3.forceManyBody().strength(-200),
  };
  const graph = network($network, { nodes, links, forces, d3 });
  graphs.network = graph;
  const rScale = d3
    .scaleSqrt()
    .domain([0, d3.max(nodes, (d) => d.Count)])
    .range([1, 30]);
  // const colorScale = d3.scaleSequential(d3.interpolateRdYlGn).domain([0, d3.max(nodes, (d) => d.Hours)]);
  graph.nodes
    .attr("fill", (d) => colorScale(d.Hours))
    .attr("stroke", "white")
    .attr("r", (d) => rScale(d.Count))
    .attr("data-bs-toggle", "tooltip")
    .attr("title", (d) => `${d.value}: ${num2(d.Hours)} hours, ${num0(d.Count)} incidents`);
  graph.links.attr("marker-end", "url(#triangle)").attr("stroke", "rgba(0,0,0,0.2)");
}

new bootstrap.Tooltip($sankey, { selector: '[data-bs-toggle="tooltip"]' });
new bootstrap.Tooltip($network, { selector: '[data-bs-toggle="tooltip"]' });
