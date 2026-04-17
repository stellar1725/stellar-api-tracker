# ✦ Stellar — API Signal Tracker

A browser extension for capturing XHR/Fetch API calls during web app pentesting and QA crawling.

## Features
- Captures all XHR/Fetch calls via the webRequest API (no injection, no timing issues)
- Multi-tab awareness — track multiple targets simultaneously
- Dashboard with Table, Timeline, and Endpoints views
- Filter by method, status code, URL
- Export to CSV or JSON
- Pause/Resume capture per tab
- Works on Chrome and Firefox

## Installation

### Chrome
1. Unzip the `stellar-api-tracker-main/` folder
2. Go to `chrome://extensions` → enable Developer Mode
3. Click **Load unpacked** → select the `stellar-chrome/` folder

### Firefox
1. Go to `about:debugging` → This Firefox
2. Click **Load Temporary Add-on**
3. Select the `stellar-firefox.zip` file directly → click **Open**

## Usage
1. Install the extension
2. Browse the target web application normally
3. Click the ✦ Stellar icon in the toolbar
4. Click **Open Stellar Dashboard** to view all captured signals

## Built For
- Pentesters mapping API surface during crawling
- Developers auditing API calls
- QA teams verifying API coverage
