/**
 * NSU RDS Course Scraper & Filter - Isolated World Bridge Script
 * Handles communication between extension popup/background and the in-page script.
 */

(function () {
  'use strict';

  let latestStats = {
    totalSections: 0,
    filteredSections: 0,
    openSections: 0,
    totalSeats: 0
  };

  // Listen to messages from in-page script (world: "MAIN")
  window.addEventListener('message', (event) => {
    if (event.source !== window || !event.data) return;

    if (event.data.source === 'NSU_SCRAPER_INPAGE') {
      if (event.data.type === 'STATS_UPDATE') {
        latestStats = event.data.data;
        try {
          chrome.storage.local.set({ nsu_live_stats: latestStats });
        } catch (e) {}
      } else if (event.data.type === 'RELOAD_EXTENSION') {
        try {
          chrome.runtime.reload();
        } catch (e) {
          window.location.reload();
        }
      }
    }
  });

  // Check for updates from GitHub in isolated world
  async function checkForUpdates() {
    try {
      const manifest = chrome.runtime.getManifest();
      const localVersion = manifest.version;
      const res = await fetch('https://raw.githubusercontent.com/tzrahiq/nsu-course-scraper/main/extension/manifest.json?cache_bust=' + Date.now());
      if (res.ok) {
        const remoteManifest = await res.json();
        if (remoteManifest.version && remoteManifest.version !== localVersion) {
          window.postMessage({
            source: 'NSU_SCRAPER_BRIDGE',
            type: 'UPDATE_AVAILABLE',
            payload: {
              localVersion: localVersion,
              remoteVersion: remoteManifest.version
            }
          }, '*');
        }
      }
    } catch (e) {}
  }

  setTimeout(checkForUpdates, 2500);

  // Listen to messages from popup or service worker
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (!message || !message.type) return;

    if (message.type === 'GET_PAGE_STATUS') {
      sendResponse({
        isNSUPage: true,
        stats: latestStats
      });
      return true;
    }

    if (message.type === 'APPLY_FILTER_TO_PAGE') {
      window.postMessage({
        source: 'NSU_SCRAPER_BRIDGE',
        type: 'APPLY_FILTER',
        payload: message.payload
      }, '*');

      sendResponse({ success: true });
      return true;
    }

    if (message.type === 'OPEN_SCHEDULE_MODAL') {
      window.postMessage({
        source: 'NSU_SCRAPER_BRIDGE',
        type: 'OPEN_SCHEDULE_MODAL',
        payload: message.payload
      }, '*');

      sendResponse({ success: true });
      return true;
    }

    if (message.type === 'REQUEST_TABLE_DATA') {
      // Scrape raw rows directly from DOM table
      const rows = [];
      const trs = document.querySelectorAll('#offeredCourseTbl tbody tr');
      trs.forEach(tr => {
        const tds = tr.querySelectorAll('td');
        if (tds.length >= 7) {
          rows.push({
            serial: tds[0].textContent.trim(),
            course: tds[1].textContent.trim(),
            section: tds[2].textContent.trim(),
            faculty: tds[3].textContent.trim(),
            time: tds[4].textContent.trim(),
            room: tds[5].textContent.trim(),
            seats: tds[6].textContent.trim()
          });
        }
      });
      sendResponse({ rows });
      return true;
    }

    return true;
  });
})();

