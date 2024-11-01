# Incident Analysis Dashboard

Interactive visualization tool for analyzing incident patterns and service impacts using Sankey diagrams and network graphs.

## Features

- Upload and analyze incident data and service impact relationships
- Interactive Sankey diagram showing incident flow across multiple dimensions
- Force-directed network graph displaying service dependencies
- AI-powered incident analysis and recommendations
- Dark/light theme support
- Responsive design
- Filter data by Area, Shift, Team, and Service
- Duration-based filtering with visual feedback

## Usage

1. Upload incidents and service impact CSV files. [Authorized users can download a sample here](https://drive.google.com/drive/folders/1qJXojKTsVfXAPVLApNV17tvY1Keexc0C).
2. Use the filters to narrow down the data
3. Use the Sankey diagram to understand incident flow
4. Use the network graph to understand service dependencies
5. Use the AI-powered analysis and recommendations to guide improvements

### Incidents CSV

Required columns:

- `Service`: Service name
- `Shift`: Shift name
- `Area`: Geographic/functional area
- `Team`: Team name
- `Count`: Number of incidents
- `Hours`: Resolution time in hours

### Service Impact CSV

Required columns:

- `Source`: Source service name
- `Target`: Target service name

## Setup

## Prerequisites

- Modern web browser with ES Modules support
- Web server for local development

### Local Setup

1. Clone this repository:

```bash
git clone https://github.com/gramener/incidents.git
cd incidents
```

2. Serve the files using any static web server. For example, using Python:

```bash
python -m http.server
```

3. Open `http://localhost:8000` in your web browser

## Deployment

On [Cloudflare DNS](https://dash.cloudflare.com/2c483e1dd66869c9554c6949a2d17d96/straive.app/dns/records),
proxy CNAME `incidents.straive.app` to `gramener.github.io`.

On this repository's [page settings](https://github.com/gramener/incidents/settings/pages), set

- Source: `Deploy from a branch`
- Branch: `main`
- Folder: `/`

## Technical Details

### Architecture

- Frontend: Vanilla JavaScript with lit-html for rendering
- LLM Integration: [LLM Foundry API](https://llmfoundry.straive.com/code) for query processing, specifically the `/openai/v1/chat/completions` endpoint with `gpt-4o-mini` model
- Styling: Bootstrap 5.3.3 with dark mode support

### Dependencies

All dependencies are loaded via CDN:

- [D3.js](https://www.npmjs.com/package/d3) v7 - Visualization
- [Bootstrap](https://www.npmjs.com/package/bootstrap) v5.3.3 - UI components
- [@gramex/sankey](https://www.npmjs.com/package/@gramex/sankey) v1 - Sankey diagram
- [@gramex/network](https://www.npmjs.com/package/@gramex/network) v2 - Network visualization
- [@gramex/ui](https://www.npmjs.com/package/@gramex/ui) v0.3 - Utilities
- [marked](https://www.npmjs.com/package/marked) v13 - Markdown parsing
- [asyncllm](https://www.npmjs.com/package/asyncllm) v1 - AI integration

## License

[MIT](LICENSE)
