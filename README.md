# html-to-pptx

A tool to process and convert HTML content into PPTX format. It involves extracting content, capturing images/screenshots, stitching them together, and mapping vectors.

## Features

- **Extract**: Parse and extract layout and content from HTML (`extract.mjs`, `extract-page.js`).
- **Capture**: Render and capture components into images (`capture.mjs`).
- **Stitch**: Combine processed assets into presentation slides (`stitch.mjs`).
- **Build**: Orchestrate the build process (`build.mjs`).
- **Vector Mapping**: Python script for mapping and handling vector conversions (`map_vec.py`).

## Requirements

- Node.js
- Python 3.x
- `sharp` (Node.js dependency for image processing)

## Installation

```bash
npm install
```

## Usage

You can run the individual scripts using Node.js:

```bash
node build.mjs
```
