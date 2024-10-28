import * as d3 from "https://cdn.jsdelivr.net/npm/d3@7/+esm";
import { render, html } from "https://cdn.jsdelivr.net/npm/lit-html@3/+esm";
import { sankey } from "https://cdn.jsdelivr.net/npm/@gramex/sankey@1";
import { layer } from "https://cdn.jsdelivr.net/npm/@gramex/chartbase@1";

const $upload = document.getElementById("upload");
const $result = document.getElementById("result");
const $showLinks = document.getElementById("show-links");
const $threshold = document.getElementById("threshold");
const $sankey = document.getElementById("sankey");
let data;
let graph;
let extent;
let threshold = $threshold.value;
let colorScale;

// When a file is uploaded, read it as CSV and parse it
$upload.addEventListener("change", async (e) => {
  const file = e.target.files[0];
  const fileReader = new FileReader();
  const result = await new Promise((resolve) => {
    fileReader.onload = (e) => resolve(d3.dsvFormat(",").parse(e.target.result, d3.autoType));
    fileReader.readAsText(file);
  });
  data = await result;

  $result.classList.remove("d-none");
  draw(data);
});

function draw(data) {
  graph = sankey($sankey, {
    data: data,
    labelWidth: 100,
    categories: { Shift: "Shift", Area: "Area impacted", "Team type": "Team type" },
    size: () => 1,
    text: (d) => (d.width > 20 ? d.key : null),
    d3,
  });

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
  layer(graph.nodes, "title", "tooltip").text((d) => d.Hours);
  layer(graph.links, "title", "tooltip").text((d) => d.Hours);

  colorScale = d3
    .scaleLinear()
    .domain(extent)
    .range(["red", "yellow", "green"])
    .interpolate(d3.interpolateLab)
    .clamp(true);

  // Style the Sankey
  graph.texts.attr("fill", "black");
  colorSankey();
}

function colorSankey() {
  graph.nodes.attr("fill", (d, i) => (d.percentrank > threshold ? colorScale(d.Hours) : "#e5e5e5"));
  graph.links.attr("fill", (d, i) => (d.percentrank > threshold ? colorScale(d.Hours) : "#e5e5e5"));
}

$showLinks.addEventListener("change", () => {
  graph.links.classed("show", $showLinks.checked);
});

$threshold.addEventListener("input", () => {
  threshold = $threshold.value;
  colorSankey();
});
