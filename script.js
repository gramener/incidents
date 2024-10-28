import * as d3 from "https://cdn.jsdelivr.net/npm/d3@7/+esm";
import { render, html } from "https://cdn.jsdelivr.net/npm/lit-html@3/+esm";
import { sankey } from "https://cdn.jsdelivr.net/npm/@gramex/sankey@1";

const $upload = document.getElementById("upload");
const $scale = document.getElementById("scale");
const $result = document.getElementById("result");
const $sankey = document.getElementById("sankey");
let data;
let graph;
let scale = 0.5;
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
    labelWidth: 60,
    categories: { Shift: "Shift", Area: "Area impacted", "Team type": "Team type" },
    size: () => 1,
    d3,
  });

  // Calculate average duration
  graph.nodeData.forEach((d) => (d.Hours = d3.sum(d.group, (d) => d.Hours) / d.group.length));
  graph.linkData.forEach((d) => (d.Hours = d3.sum(d.group, (d) => d.Hours) / d.group.length));
}

function colorSankey() {
  const extent = d3.extent(graph.linkData, (d) => Math.pow(d.Hours, scale));
  colorScale = d3.scaleSequential(d3.interpolateRdYlGn).domain(extent);
  graph.nodes.attr("fill", (d, i) => colorScale(Math.pow(d.Hours, scale)));
  graph.links.attr("fill", (d, i) => colorScale(Math.pow(d.Hours, scale)));
}

$scale.addEventListener("input", (e) => {
  scale = e.target.value;
  console.log(scale);
  colorSankey();
});
