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
const $thresholdDisplay = document.getElementById("threshold-display");
const $sankey = document.getElementById("sankey");
const $network = document.getElementById("network");
const $summarize = document.getElementById("summarize");
const $summary = document.getElementById("summary");

const data = {};
const graphs = {};
const minDuration = 0;
const maxDuration = 10;
let threshold = parseFloat($threshold.value) || 3;
const marked = new Marked();

const filters = {};

// Function to create the color scale
function createColorScale() {
  return d3
    .scaleLinear()
    .domain([minDuration, 2, threshold, 4, maxDuration])
    .range(["green", "green", "yellow", "red", "red"])
    .interpolate(d3.interpolateLab)
    .clamp(true);
}

let colorScale = createColorScale();

// Function to read CSV files
async function readCSV(file) {
  const text = await file.text();
  return d3.csvParse(text, (d) => {
    const row = d3.autoType(d);

    if (row["Incident Data"]) {
      const [Incident, DescriptionCleaned, ImpactCleaned, ResolutionDetails] = row["Incident Data"].split("|");
      Object.assign(row, { Incident, DescriptionCleaned, ImpactCleaned, ResolutionDetails });
    }

    row["Time of Day"] = row["Time of Day"] || "";

    return row;
  });
}

// Event listener for file upload
$upload.addEventListener("change", async (e) => {
  const name = e.target.getAttribute("name");
  data[name] = await readCSV(e.target.files[0]);
  draw();
});

function draw() {
  if (!data.incidents) return;
  $result.classList.remove("d-none");
  drawFilters();
  update();
}

function update() {
  drawSankey();
  drawNetwork();
}

function drawFilters() {
  const filterKeys = ["Area", "Shift", "Team", "Service"];
  const preSelectedServices = ["CTR", "LOGAN", "VaR", "GRT", "LIQ", "RWH", "Argos", "PXV", "TLM", "K2", "TARDIS"];

  filterKeys.forEach((key) => {
    const values = [...new Set(data.incidents.map((d) => d[key]))].sort();
    filters[key] = values.map((value, index) => ({
      value,
      selected: key === "Service" ? preSelectedServices.includes(value) : key !== "Team",
      index,
    }));
  });

  $filters.innerHTML = filterKeys
    .map(
      (key) => /* html */ `
    <div class="col-md-3">
      <div class="dropdown">
        <button class="btn btn-secondary dropdown-toggle w-100" type="button" data-bs-toggle="dropdown" data-bs-auto-close="outside">
          ${key}
        </button>
        <div class="dropdown-menu w-100" id="dropdown-menu-${key}">
          <div class="dropdown-search">
            <input type="text" placeholder="Search ${key}..." class="search-filter">
          </div>
          <div class="dropdown-item">
            <input type="checkbox" class="select-all" id="all-${key}" ${
        key !== "Service" && key !== "Team" ? "checked" : ""
      }>
            <label for="all-${key}">Select All</label>
          </div>
          ${
            key === "Service"
              ? /* html */ `<div class="dropdown-item">
                   <input type="checkbox" class="top-10" id="top-10-${key}">
                   <label for="top-10-${key}">Top 10</label>
                 </div>`
              : ""
          }
          <div id="filter-options-${key}"></div>
        </div>
      </div>
    </div>
  `
    )
    .join("");

  filterKeys.forEach((key) => renderFilterOptions(key));
  addFilterEventListeners();
  selectTopTeams();
}

function renderFilterOptions(key) {
  const optionsContainer = document.getElementById(`filter-options-${key}`);
  const options = filters[key];

  options.sort((a, b) => (a.selected === b.selected ? a.index - b.index : b.selected - a.selected));

  optionsContainer.innerHTML = options
    .map(
      (option) => /* html */`
    <div class="dropdown-item">
      <input type="checkbox" class="filter-checkbox" name="${key}" value="${option.value}" id="${key}-${
        option.value
      }" ${option.selected ? "checked" : ""}>
      <label for="${key}-${option.value}">${option.value}</label>
    </div>
  `
    )
    .join("");

  optionsContainer.querySelectorAll(".filter-checkbox").forEach((checkbox) => {
    checkbox.addEventListener("change", () => {
      const option = filters[key].find((opt) => opt.value === checkbox.value);
      if (option) option.selected = checkbox.checked;
      if (key === "Service") selectTopTeams();
      renderFilterOptions(key);
      update();
    });
  });
}

function addFilterEventListeners() {
  document.querySelectorAll(".search-filter").forEach((input) => {
    input.addEventListener("input", (e) => {
      const searchText = e.target.value.toLowerCase();
      const dropdownMenu = e.target.closest(".dropdown-menu");
      dropdownMenu.querySelectorAll(".dropdown-item").forEach((item) => {
        const label = item.querySelector("label");
        if (label) {
          item.style.display = label.textContent.toLowerCase().includes(searchText) ? "" : "none";
        }
      });
    });
  });

  document.querySelectorAll(".select-all").forEach((checkbox) => {
    checkbox.addEventListener("change", (e) => {
      const key = e.target.id.replace("all-", "");
      const checked = e.target.checked;
      filters[key].forEach((option) => (option.selected = checked));
      if (key === "Service") selectTopTeams();
      renderFilterOptions(key);
      update();
    });
  });

  document.querySelectorAll(".top-10").forEach((checkbox) => {
    checkbox.addEventListener("change", (e) => {
      const key = e.target.id.replace("top-10-", "");
      const checked = e.target.checked;
      const top10Services = ["CTR", "LOGAN", "VaR", "GRT", "LIQ", "RWH", "Argos", "PXV", "TLM", "K2", "TARDIS"];

      filters[key].forEach((option) => {
        option.selected = top10Services.includes(option.value) ? checked : false;
      });

      const selectAll = document.getElementById(`all-${key}`);
      if (selectAll) selectAll.checked = false;

      selectTopTeams();
      renderFilterOptions(key);
      update();
    });
  });

  document.querySelectorAll(".dropdown-menu").forEach((menu) => {
    menu.addEventListener("click", (e) => e.stopPropagation());
  });
}

function selectTopTeams() {
  const selectedServices = filters["Service"].filter((opt) => opt.selected).map((opt) => opt.value);

  filters["Team"].forEach((option) => (option.selected = false));

  if (selectedServices.length === 0) {
    renderFilterOptions("Team");
    return;
  }

  const incidentsByTeamService = d3.rollups(
    data.incidents,
    (v) => d3.sum(v, (d) => d.Count),
    (d) => d.Service,
    (d) => d.Team
  );

  const topTeams = new Set();

  incidentsByTeamService.forEach(([service, teams]) => {
    if (selectedServices.includes(service)) {
      teams
        .sort((a, b) => b[1] - a[1])
        .slice(0, 2)
        .forEach(([team]) => topTeams.add(team));
    }
  });

  filters["Team"].forEach((option) => {
    if (topTeams.has(option.value)) option.selected = true;
  });

  renderFilterOptions("Team");
}

function filteredIncidents() {
  const selectedValues = {};
  const filterKeys = ["Area", "Shift", "Team", "Service"];

  filterKeys.forEach((key) => {
    selectedValues[key] = filters[key].filter((opt) => opt.selected).map((opt) => opt.value);
  });

  return data.incidents.filter((row) =>
    filterKeys.every((key) => selectedValues[key].length === 0 || selectedValues[key].includes(row[key]))
  );
}

function drawSankey() {
  const incidents = filteredIncidents();
  const graph = sankey($sankey, {
    data: incidents,
    labelWidth: 100,
    categories: ["Shift", "Area", "Team", "Service"],
    size: (d) => d.Count,
    text: (d) => (d.key.length * 9 < d.width ? d.key : null),
    d3,
  });
  graphs.sankey = graph;

  graph.nodeData.forEach((d) => {
    const totalAdjustedHours = d3.sum(d.group, (d) => d.Hours * d.Count);
    const totalCount = d3.sum(d.group, (d) => d.Count);
    d.Hours = totalAdjustedHours / totalCount;
    d.size = totalCount;
  });

  graph.linkData.forEach((d) => {
    const totalAdjustedHours = d3.sum(d.group, (d) => d.Hours * d.Count);
    const totalCount = d3.sum(d.group, (d) => d.Count);
    d.Hours = totalAdjustedHours / totalCount;
    d.size = totalCount;
  });

  colorScale = createColorScale();

  graph.nodes.attr("data-bs-toggle", "tooltip").attr("title", (d) => `${d.key}: ${num2(d.Hours)} hours`);

  graph.links
    .attr("data-bs-toggle", "tooltip")
    .attr("title", (d) => `${d.source.key} - ${d.target.key}: ${num2(d.Hours)} hours`);

  graph.texts.attr("fill", "black");

  colorSankey();
}

function colorSankey() {
  $thresholdDisplay.textContent = num2(threshold);
  graphs.sankey.nodes.attr("fill", (d) => colorScale(d.Hours));
  graphs.sankey.links.attr("fill", (d) => colorScale(d.Hours));
}

$showLinks.addEventListener("change", () => {
  graphs.sankey.links.classed("show", $showLinks.checked);
});

$threshold.addEventListener("input", () => {
  threshold = parseFloat($threshold.value);
  colorScale = createColorScale();
  colorSankey();
});

function drawNetwork() {
  const incidents = data.incidents;

  const serviceStats = d3.rollup(
    incidents,
    (v) => ({
      TotalHours: d3.sum(v, (d) => d.Hours * d.Count),
      Count: d3.sum(v, (d) => d.Count),
    }),
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

  nodes.forEach((node) => {
    Object.assign(node, serviceStats.get(node.value) || { TotalHours: 0, Count: 0 });
    node.Hours = node.TotalHours / node.Count || 0;
  });

  const forces = {
    charge: () => d3.forceManyBody().strength(-200),
  };

  const graph = network($network, { nodes, links, forces, d3 });
  graphs.network = graph;

  const rScale = d3
    .scaleSqrt()
    .domain([0, d3.max(nodes, (d) => d.Count)])
    .range([1, 30]);

  graph.nodes
    .attr("fill", (d) => colorScale(d.Hours))
    .attr("stroke", "white")
    .attr("r", (d) => rScale(d.Count))
    .attr("data-bs-toggle", "tooltip")
    .attr("title", (d) => `${d.value}: ${num2(d.Hours)} hours, ${num0(d.Count)} incidents`);

  graph.links.attr("marker-end", "url(#triangle)").attr("stroke", "rgba(var(--bs-body-color-rgb), 0.2)");
}

new bootstrap.Tooltip($sankey, { selector: "[data-bs-toggle='tooltip']" });
new bootstrap.Tooltip($network, { selector: "[data-bs-toggle='tooltip']" });

$summarize.addEventListener("click", summarize);

async function summarize() {
  const selectedServices = filters["Service"].filter((opt) => opt.selected).map((opt) => opt.value);
  if (selectedServices.length === 0) {
    $summary.innerHTML = `<div class="alert alert-warning" role="alert">
      No services selected for summarization.
    </div>`;
    return;
  }

  const incidents = filteredIncidents();

  const serviceData = {};

  for (const service of selectedServices) {
    const serviceIncidents = incidents.filter((d) => d.Service === service);
    if (serviceIncidents.length === 0) continue;

    const getStats = (groupByKey) =>
      d3
        .rollups(
          serviceIncidents,
          (v) => ({
            Count: d3.sum(v, (d) => d.Count),
            Hours: d3.sum(v, (d) => d.Hours * d.Count),
          }),
          (d) => d[groupByKey]
        )
        .map(([key, stats]) => ({
          Key: key,
          Count: stats.Count,
          AvgHours: stats.Hours / stats.Count,
        }));

    const shiftStats = getStats("Shift");
    const timeOfDayStats = getStats("Time of Day");
    const areaStats = getStats("Area");
    const teamStats = getStats("Team");

    const descriptionStats = d3
      .rollups(
        serviceIncidents,
        (v) => d3.sum(v, (d) => d.Count),
        (d) => d.DescriptionCleaned
      )
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([description, count]) => ({
        Description: description,
        Count: count,
      }));

    const relatedServices = data.relations
      .filter((rel) => rel.Source === service || rel.Target === service)
      .map((rel) => (rel.Source === service ? rel.Target : rel.Source));

    serviceData[service] = {
      shiftStats,
      timeOfDayStats,
      areaStats,
      teamStats,
      descriptionStats,
      relatedServices,
    };
  }

  const system = `As an expert analyst, provide a concise summary for the selected services, focusing on:

- Problematic times (including specific times of day)
- Problematic areas
- Problematic teams
- Frequent issues or incidents
- Connections with other services that might have impacted it
- Recommendations on what can be done

Present the information concisely using bullet points under each service. Ensure that the summary is directly based on the data provided and is actionable.

Example for Output:
Summary for VaR Service

Problematic Times:
  Shifts:
    06:00-14:00: 27 incidents (Avg 4.04 hrs)
    14:00-22:00: 5 incidents (Avg 3.24 hrs)
  Time of Day:
    9 AM: 11 incidents (Avg 3.57 hrs)
    10 AM: 5 incidents (Avg 3.68 hrs)

Problematic Areas:
  Canada: 35 incidents (Avg 3.92 hrs)

Problematic Teams:

CMST: 17 incidents (Avg 3.92 hrs)
ECA: 17 incidents (Avg 3.92 hrs)

Frequent Issues or Incidents:
  Delays in VaR reports due to job failures and data issues from:
    Value job failure (1 occurrence) - Root cause under investigation.
    Power BI data refresh errors impacting report delays (2 occurrences).
    Scenario job issues preventing data loading (1 occurrence).
    Long-running jobs causing delays in data processing (1 occurrence).
    All value jobs failing in risk run (1 occurrence) - Root cause under investigation.

Connections with Other Services that Might Have Impacted It:
  GRT
  CTR
  Lancelot
  LOGAN (multiple connections)
  Anvil
  K2

Recommendations:
  Incident Time Optimization: Focus resources and monitoring on the 06:00-14:00 shift, and particularly around 9 AM to 10 AM since these times show the highest rate of incidents.
  Targeted Team Support: Provide additional support and resource allocation to the CMST and ECA teams to alleviate their incident load.
  Root Cause Analysis: Conduct a thorough analysis of recurring failures in data processing, especially related to job execution and dependencies on Power BI and other connections.
  Enhanced Communication: Streamline communication channels between VaR, VaRDevOps, MRM, and all impacted teams to reduce response times for issue triaging.
  Preventative Measures: Implement monitoring tools that provide early alerts for long-running jobs and data process delays. Regular simulations could also help identify weaknesses in the system before they lead to significant delays.
`;

  let message = `Selected Services:\n${selectedServices.join(", ")}\n\n`;

  for (const service of selectedServices) {
    const data = serviceData[service];
    if (!data) continue;

    message += `Service: ${service}\n`;

    const formatStats = (stats, label) =>
      stats
        .sort((a, b) => b.Count - a.Count)
        .slice(0, 2)
        .map((stat) => `${stat.Key} (${num0(stat.Count)} incidents, Avg ${num2(stat.AvgHours)} hrs)`)
        .join("; ");

    const shiftInfo = formatStats(data.shiftStats, "Shift");
    const timeInfo = formatStats(data.timeOfDayStats, "Time of Day");

    if (shiftInfo || timeInfo) {
      message += `- Problematic times: `;
      if (shiftInfo) message += `Shifts - ${shiftInfo}; `;
      if (timeInfo) message += `Time of Day - ${timeInfo}`;
      message += `\n`;
    }

    const areaInfo = formatStats(data.areaStats, "Area");
    if (areaInfo) message += `- Problematic areas: ${areaInfo}\n`;

    const teamInfo = formatStats(data.teamStats, "Team");
    if (teamInfo) message += `- Problematic teams: ${teamInfo}\n`;

    if (data.descriptionStats.length > 0) {
      message += `- Frequent issues: `;
      message += data.descriptionStats
        .map((desc) => `${desc.Description} (${num0(desc.Count)} occurrences)`)
        .join("; ");
      message += `\n`;
    }

    if (data.relatedServices.length > 0) {
      message += `- Impacting connections: ${data.relatedServices.join(", ")}\n`;
    } else {
      message += `- Impacting connections: None\n`;
    }

    message += `\n`;
  }

  $summary.innerHTML = /* html */ `<div class="spinner-border" role="status">
    <span class="visually-hidden">Loading...</span>
  </div>`;

  let fullContent = "";

  try {
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
      if (content) {
        fullContent = content;
        $summary.innerHTML = marked.parse(fullContent);
      }
    }
  } catch (error) {
    console.error("Error in summarize function:", error);
    $summary.innerHTML = /* html */`<div class="alert alert-danger" role="alert">
      An error occurred while generating the summary: ${error.message}
    </div>`;
  }
}
