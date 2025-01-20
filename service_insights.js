import * as d3 from "https://cdn.jsdelivr.net/npm/d3@7/+esm";
import { asyncLLM } from "https://cdn.jsdelivr.net/npm/asyncllm@1";
import "https://cdn.jsdelivr.net/npm/vis-network@9.1.2/dist/vis-network.min.js";

let serviceData = [];
let networkInstance = null;
const fileInput = document.getElementById("fileInput");
const dropdown = document.getElementById("serviceDropdown");
const problemText = document.getElementById("problemText");
const recurringList = document.getElementById("recurringList");
const container = document.getElementById("network");

const spinnerHTML = `
  <div class="d-flex align-items-center">
    <div class="spinner-border text-primary me-2" role="status">
      <span class="visually-hidden">Loading...</span>
    </div>
    <span>Loading...</span>
  </div>
`;

// Handle File Upload and Process CSV
fileInput.addEventListener("change", async (e) => {
  const file = e.target.files[0];
  if (!file) return;

  const text = await file.text();
  const data = d3.csvParse(text, d3.autoType);

  // Ensure "Service" column exists
  if (!data.columns.includes("Service")) {
    alert("No 'Service' column found in the CSV.");
    return;
  }

  serviceData = data;
  populateDropdown();
});

// Populate Dropdown with Unique Services
function populateDropdown() {
  dropdown.innerHTML = '<option value="">Select Service</option>';

  const services = [...new Set(serviceData.map(item => item.Service))].filter(s => s);
  services.sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));

  for (const service of services) {
    const option = document.createElement("option");
    option.value = service;
    option.textContent = service;
    dropdown.appendChild(option);
  }
}

// Extract only the Incident Data column
function extractIncidentData(filteredData) {
  return filteredData.map(d => d["Incident Data"]);
}

const detailSection = document.getElementById("detail-section");

// Whenever the user selects a service
dropdown.addEventListener("change", (e) => {
  const service = e.target.value;
  if (service) {
    // Show the detail boxes
    detailSection.classList.remove("d-none");
    updateContent(service); // Your existing logic
  } else {
    // Hide the detail boxes if no service is selected
    detailSection.classList.add("d-none");
  }
});



function delay(ms){
  return new Promise((resolve)=>{
    setTimeout(resolve,ms);
  });

}

// Generic function to fetch info from the LLM
async function askLLMQuestion(filteredData, questionPrompt, useFullData = false) {
  const selectedService = filteredData[0]?.Service || "Unknown Service";
  const systemMessage = `You are a financial analyst for incident management.

  Given a JSON array of incidents for the service: "${selectedService}",

  ${questionPrompt}

  Return your answer in plain JSON format without any code fences or markdown formatting. 
  Only return raw JSON.`;

  const dataToSend = useFullData ? filteredData : extractIncidentData(filteredData);

  const userMessage = `Service: ${selectedService}
Data:
${JSON.stringify(dataToSend)}`;

  let fullContent = "";
  let lastContent = "";

  try {
    for await (const { content } of asyncLLM(
      "https://llmfoundry.straive.com/gemini/v1beta/openai/chat/completions",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          model: "gemini-1.5-pro-latest",
          stream: true,
          messages: [
            { role: "system", content: systemMessage },
            { role: "user", content: userMessage },
          ],
        }),
      }
    )) {
      if (content && content !== lastContent) {
        lastContent = content;
        fullContent = content;
      }
    }
  } catch (error) {
    console.error("Error in askLLMQuestion:", error);
    throw error;
  }

  // Clean up the response
  let jsonStr = fullContent.trim();
  jsonStr = jsonStr.replace(/```[\s\S]*?```/g, '').trim();

  try {
    const json = JSON.parse(jsonStr);
    return json;
  } catch (parseError) {
    console.error("Failed to parse JSON from LLM response:", parseError);
    console.error("Raw response was:", jsonStr);
    throw parseError;
  }
}

function updateUI(upstream, downstream, mainProblem, recurringPatterns) {
  // Problem Description
  problemText.textContent = mainProblem || "No problem description found.";
  recurringList.innerHTML = ""; // clear recurring patterns

  if (recurringPatterns && recurringPatterns.recurringPatterns) {
    const rp = recurringPatterns.recurringPatterns;
    const items = [
      `<li><strong>Time of Incidents:</strong> ${rp.Time || "Not available"}</li>`,
      `<li><strong>Country:</strong> ${rp.Country || "Not available"}</li>`,
      `<li><strong>Feeds:</strong> ${rp.Feeds || "Not available"}</li>`
    ];
    recurringList.innerHTML = items.join("");
  } else {
    recurringList.innerHTML = "<li>No recurring patterns found.</li>";
  }

  if (!upstream.length) {
    problemText.insertAdjacentHTML(
      "beforeend",
      `<p class="mt-2 text-danger">No upstream data found for this service.</p>`
    );
  }
  if (!downstream.length) {
    problemText.insertAdjacentHTML(
      "beforeend",
      `<p class="mt-2 text-danger">No downstream data found for this service.</p>`
    );
  }

  // Finally draw the network
  drawNetwork(upstream, downstream);
}

// Called when user selects a service
async function updateContent(service) {
  if (!service) return;

  const filteredData = serviceData.filter(item => item.Service === service);
  if (filteredData.length === 0) {
    problemText.textContent = "No data found for selected service.";
    recurringList.innerHTML = "<li>No issues available</li>";
    if (networkInstance) networkInstance.destroy();
    return;
  }

  // Show loading
  problemText.innerHTML = spinnerHTML;
  recurringList.innerHTML = spinnerHTML;

  const numIncidents = filteredData.length;

  try {
    // Upstream
    const upstreamResponse = await askLLMQuestion(
      filteredData,
      `Identify the correct array of "upstreams based on number of incident caused" which gives feeds to the service and return it as {"upstream": [ ... ]}`,
      false
    );
    let upstream = upstreamResponse.upstream || [];
    upstream = upstream.slice(0, 8);

    await delay(1000);


    // Downstream
    const downstreamResponse = await askLLMQuestion(
      filteredData,
      `Identify the correct array of "downstreams based on number of incidents caused" which takes feeds from the service and return it as {"downstream": [ ... ]}`,
      false
    );
    let downstream = downstreamResponse.downstream || [];
    downstream = downstream.slice(0, 8);

    await delay(1000);

    // Main problem
    const mainProblemResponse = await askLLMQuestion(
      filteredData,
      `Identify the main problem for this service and return it as {"mainProblem": "..." }`,
      false
    );
    const mainProblem = mainProblemResponse.mainProblem || "No problem identified.";

    await delay(1000);


    // Recurring patterns
    const recurringPatternsResponse = await askLLMQuestion(
      filteredData,
      `Identify and explain recurring patterns focusing on Time of the day(EST), Country, and Feeds. Return them as: {"recurringPatterns": {"Time": "...", "Country": "...", "Feeds": "..."}}`,
      true
    );

    updateUI(upstream, downstream, mainProblem, recurringPatternsResponse);
    drawNetwork(upstream, downstream, numIncidents);

  } catch (error) {
    console.error("Error:", error);
    problemText.textContent = "Failed to fetch details from the LLM. Please try again.";
    recurringList.innerHTML = "<li>Failed to fetch recurring issues.</li>";
    if (networkInstance) networkInstance.destroy();
  }
}

// Draw (or update) the network diagram
function drawNetwork(upstream, downstream, numIncidents = 0) {
  // If no CSV loaded or no data yet, just clear the network
  if (!upstream.length && !downstream.length && !numIncidents) {
    if (networkInstance) networkInstance.destroy();
    const dataVis = { nodes: [], edges: [] };
    const options = { interaction: { zoomView: false } };
    networkInstance = new vis.Network(container, dataVis, options);
    return;
  }

  const centralLabel = dropdown.value;
  const nodes = [
    {
      id: "central",
      label: centralLabel,
      shape: "box",
      borderWidth: 3,
      color: { border: "orange", background: "#ffffff" },
      font: { color: "black", face: "arial", size: 24, bold: true },
      x: -70,
      y: 0,
      fixed: true
    },
    {
      id: "incidentCount",
      label: `${numIncidents}`,
      shape: "box",
      borderWidth: 2,
      color: { border: "orange", background: "#e0e0ff" },
      font: { color: "black", face: "arial", size: 24 },
      x: 70,
      y: 0,
      fixed: true
    }
  ];

  // Upstream nodes
  const spacing = 120;
  const startX_up = -((upstream.length - 1) * spacing) / 2;
  upstream.forEach((item, i) => {
    nodes.push({
      id: `U${i}`,
      label: item,
      shape: "box",
      borderWidth: 2,
      color: { border: "orange", background: "#fff" },
      font: { color: "black", face: "arial", size: 20 },
      x: startX_up + i * spacing,
      y: -100,
      fixed: false
    });
  });

  // Downstream nodes
  const startX_down = -((downstream.length - 1) * spacing) / 2;
  downstream.forEach((item, i) => {
    nodes.push({
      id: `D${i}`,
      label: item,
      shape: "box",
      borderWidth: 2,
      color: { border: "orange", background: "#fff" },
      font: { color: "black", face: "arial", size: 20 },
      x: startX_down + i * spacing,
      y: 100,
      fixed: false
    });
  });

  // Edges
  const edges = [];
  upstream.forEach((_, i) => {
    edges.push({
      from: `U${i}`,
      to: "central",
      color: { color: "orange" },
      arrows: { to: true }
    });
  });
  downstream.forEach((_, i) => {
    edges.push({
      from: "central",
      to: `D${i}`,
      color: { color: "orange" },
      arrows: { to: true }
    });
  });

  const dataVis = {
    nodes: new vis.DataSet(nodes),
    edges: new vis.DataSet(edges)
  };

  const options = {
    physics: false,
    interaction: {
      zoomView: false,
      dragView: true,
      dragNodes: true,
      hover: true
    }
  };

  if (networkInstance) networkInstance.destroy();
  networkInstance = new vis.Network(container, dataVis, options);
}
