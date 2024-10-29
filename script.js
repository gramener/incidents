import * as d3 from "https://cdn.jsdelivr.net/npm/d3@7/+esm";
import { sankey } from "https://cdn.jsdelivr.net/npm/@gramex/sankey@1";
import { network } from "https://cdn.jsdelivr.net/npm/@gramex/network@2/dist/network.js";
import { kpartite } from "https://cdn.jsdelivr.net/npm/@gramex/network@2/dist/kpartite.js";
import { num0, num2 } from "https://cdn.jsdelivr.net/npm/@gramex/ui@0.3/dist/format.js";
import { Marked } from "https://cdn.jsdelivr.net/npm/marked@13/+esm";
import { asyncLLM } from "https://cdn.jsdelivr.net/npm/asyncllm@1";

const $upload = document.getElementById("upload");
const $filters = document.getElementById("filters");
const $result = document.getElementById("result");
const $showLinks = document.getElementById("show-links");
const $threshold = document.getElementById("threshold");
const $sankey = document.getElementById("sankey");
const $network = document.getElementById("network");
const $summarize = document.getElementById("summarize");
const $summary = document.getElementById("summary");

let data = {};
let graphs = {};
let extent;
let threshold = $threshold.value;
let colorScale;
const marked = new Marked();

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
  drawFilters();
  update();
}

async function update() {
  drawSankey();
  if (data.relations) drawNetwork();
}

function drawFilters() {
  // Get all unique values for each column: Area, Shift, Team, Service
  const filters = {};
  for (const key of ["Area", "Shift", "Team", "Service"]) {
    filters[key] = [...new Set(data.incidents.map((d) => d[key]))];
  }
  // Render a dropdown for each filter
  $filters.innerHTML = Object.entries(filters)
    .map(
      ([key, values]) => `
      <div class="col-md-3">
        <select class="form-select" name="${key}">
          <option value="">All ${key}s</option>
          ${values.map((v) => `<option value="${v}">${v}</option>`).join("")}
        </select>
      </div>
    `
    )
    .join("");
}

function filteredIncidents() {
  return data.incidents.filter((row) => {
    return ["Area", "Shift", "Team", "Service"].every((key) => {
      const value = document.querySelector(`select[name="${key}"]`)?.value;
      return !value || row[key] === value;
    });
  });
}

$filters.addEventListener("change", update);

function drawSankey() {
  // Filter data based on selected values
  const graph = sankey($sankey, {
    data: filteredIncidents(),
    labelWidth: 100,
    categories: ["Shift", "Area", "Team", "Service"],
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
  const serviceStats = d3.rollup(
    filteredIncidents(),
    (v) => ({ TotalHours: d3.sum(v, (d) => d.Hours), Count: v.length }),
    (d) => d.Service
  );

  const { nodes, links } = kpartite(
    data.relations,
    [
      ["name", "Source"],
      ["name", "Target"],
    ],
    { count: 1 }
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

$summarize.addEventListener("click", summarize);

async function summarize() {
  const totalSize = d3.sum(graphs.sankey.nodeData, (d) => d.size);
  function top(data, n, sort, name) {
    return (
      d3
        .sort(data, sort)
        // Skip anything less than 0.5% of the total
        .filter((d) => d.size / totalSize > 0.005)
        .slice(0, n)
        .map((d) => `- ${name(d)}: ${num2(d.Hours)} hrs, ${num0(d.size)} incidents`)
        .join("\n")
    );
  }
  const nodeName = (d) => `${d.cat}=${d.key}`;
  const linkName = (d) => `${d.source.cat}=${d.source.key} & ${d.target.cat}=${d.target.key}`;
  const system = `Identify and suggest specific improvement actions for areas with the highest impact based on incident count, resolution time, and combined metrics.

# Steps

1. **Detailed Data Analysis**: Evaluate the provided incident data across dimensions like area, team, shift, and service.
   - Calculate total outage hours and incident count for each dimension and combination of dimensions.
   - Identify areas, teams, shifts, and services with the highest impact, focusing on both frequency and resolution time.

2. **Root Cause Identification**: Dive into potential root causes behind high-impact areas, teams, or services.
   - Analyze infrastructure dependencies, support processes, staffing adequacy, and cross-team coordination.
   - Identify whether specific tools, services, or operational workflows contribute to extended resolution times or frequent incidents.

3. **Recommend Targeted Improvement Actions**: Suggest actionable interventions based on identified patterns to reduce outages and enhance resolution times.
   - Recommendations should target specific services, teams, shifts, and tools, covering infrastructure upgrades, process improvements, resource adjustments, and targeted training.
   - Clearly differentiate between immediate, short-term, and long-term actions, focusing on feasibility and impact.

# Output Format

Provide a structured analysis with precise, actionable recommendations, categorized by type (infrastructure, process, training, etc.) and timeframe (immediate, short-term, long-term). Use bullet points or numbered lists to enhance clarity.

# Examples

<INPUT>
Top impact by incident count:
- Area=North America: 14.94 hrs, 2,043 incidents
- Team=Internal: 15.44 hrs, 1,615 incidents
- Shift=Morning: 14.30 hrs, 1,497 incidents
- Service=Global Market Network Services: 8.68 hrs, 468 incidents
- Service=Argos: 55.40 hrs, 103 incidents
</INPUT>

<OUTPUT>
## Analysis

- **North America** shows the highest incident count (2,043 incidents) and prolonged resolution times. Likely issues include legacy systems and insufficient support capacity during peak hours.
- **Internal Team** has significant outage hours (15.44 hrs) across 1,615 incidents, indicating operational inefficiencies or resource shortages, particularly affecting critical services like Argos and Global Market Network Services.
- **Morning Shift** experiences a high number of incidents (1,497), suggesting challenges in resource management, communication gaps, or lack of proactive monitoring.
- **Argos** has the longest average resolution time (55.40 hrs), pointing to potential complexity in the system architecture or inadequate technical expertise for incident handling.

## Common Issues

- **Infrastructure Constraints**: Outdated network hardware, low redundancy, and limited capacity in North America.
- **Team Inefficiencies**: Lack of expertise in handling complex incidents within the Internal Team, particularly for services like Argos and Data Center Network Services.
- **Process Delays**: Gaps in the incident handover process during Morning and EOD Shifts, leading to delays in triaging and resolution.

## Recommended Actions

### Service-Specific Improvements

- **Argos**:
  - Conduct a detailed architecture review to identify potential bottlenecks.
  - Assign specialized support teams with additional training on Argos-related issues.
  - Implement predictive analytics tools to preemptively detect anomalies.

- **Global Market Network Services**:
  - Enhance network monitoring using tools like SolarWinds or PRTG Network Monitor for real-time alerts.
  - Schedule routine maintenance during low-impact hours to prevent unplanned outages.

### Infrastructure & Staffing Enhancements

- **North America**:
  - Upgrade legacy infrastructure and increase network redundancy.
  - Increase staffing during peak hours, specifically for the Internal Team and EOD shifts, to ensure faster resolution times.
  - Deploy cloud-based solutions to improve scalability and resilience, especially for critical services.

### Process & Tool Improvements

- **Enhanced Incident Management**:
  - Use automated triaging tools like PagerDuty or ServiceNow to prioritize incidents based on severity and impact.
  - Improve handover protocols during shift changes (e.g., Morning and EOD) with streamlined communication tools like Slack or Microsoft Teams integrated with incident management systems.

### Preventive Maintenance & Training

- **Scheduled Maintenance for Data Center Network Services**: Regular preventive checks to reduce incident rates and downtime.
- **Targeted Training for the Internal Team**: Focus on advanced troubleshooting for services like Argos, utilizing online simulation tools or hands-on workshops.
- **Proactive Monitoring**: Implement tools like Nagios or Zabbix for early detection of potential failures in services experiencing high incident rates.

## Immediate Actions

- Rapid deployment of additional resources in North America during peak times.
- Quick assessment of current incident management processes to identify and rectify gaps.

### Short-term Actions

- Deploy automated monitoring and triaging tools to facilitate faster incident response.
- Optimize staffing models for shifts with high incident volumes, ensuring adequate coverage and expertise.

### Long-term Actions

- Plan infrastructure overhauls, especially for North America, focusing on network upgrades and cloud integration.
- Build a culture of continuous improvement through feedback loops, regular training, and better cross-team collaboration.
<OUTPUT>

# Notes

- Recommendations should be precise, actionable, and aligned with industry best practices in service management and incident reduction.
- Tailor actions based on the nuances of each area, team, shift, or service, prioritizing high-impact areas and leveraging specific tools mentioned.
- Aim for holistic improvements that enhance both service stability and team performance.`;
  const message = `
Top impact by incident count:
${top(graphs.sankey.nodeData, 10, (d) => -d.size, nodeName)}

Top impact by time to resolve each incident:
${top(graphs.sankey.nodeData, 10, (d) => -d.Hours, nodeName)}

Top combined impact by incident count:
${top(graphs.sankey.linkData, 10, (d) => -d.size, linkName)}

Top combined impact by time to resolve each incident:
${top(graphs.sankey.linkData, 10, (d) => -d.Hours, linkName)}
`;
  $summary.innerHTML = /* html */ `<div class="spinner-border" role="status">
    <span class="visually-hidden">Loading...</span>
  </div>`;
  for await (const { content } of asyncLLM("https://llmfoundry.straive.com/openai/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({
      model: "gpt-4o-mini",
      stream: true,
      messages: [
        { role: "system", content: system },
        { role: "user", content: message },
      ],
    }),
  })) {
    $summary.innerHTML = marked.parse(content);
  }
}
