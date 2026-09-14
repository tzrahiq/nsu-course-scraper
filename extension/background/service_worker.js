/**
 * NSU Course Scraper & Routine Builder - Background Service Worker (Manifest V3)
 * Handles cross-origin GitHub update checks (bypassing page CORS/CSP) and extension reloads.
 */

const GITHUB_REPO = 'tzrahiq/nsu-course-scraper';

async function getRemoteManifest() {
  try {
    const url = `https://raw.githubusercontent.com/${GITHUB_REPO}/main/extension/manifest.json?t=${Date.now()}`;
    const res = await fetch(url, { cache: 'no-store' });
    if (res.ok) {
      return await res.json();
    }
  } catch (e) {
    console.warn('[NSU Scraper SW] Failed to fetch remote manifest:', e);
  }
  return null;
}

async function checkUpdateStatus() {
  const localManifest = chrome.runtime.getManifest();
  const localVersion = localManifest.version;
  const remoteManifest = await getRemoteManifest();
  if (remoteManifest && remoteManifest.version && remoteManifest.version !== localVersion) {
    return {
      hasUpdate: true,
      localVersion: localVersion,
      remoteVersion: remoteManifest.version
    };
  }
  return {
    hasUpdate: false,
    localVersion: localVersion,
    remoteVersion: remoteManifest ? remoteManifest.version : localVersion
  };
}

// Handle messages from content script bridge or popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || !message.type) return false;

  if (message.type === 'CHECK_UPDATE_REQUEST') {
    checkUpdateStatus().then(status => {
      sendResponse(status);
    }).catch(err => {
      sendResponse({ hasUpdate: false, error: err.message });
    });
    return true; // Keep message channel open for async response
  }

  if (message.type === 'RELOAD_EXTENSION_REQUEST') {
    // Notify sender we received the reload instruction
    sendResponse({ success: true });

    // Reload extension runtime
    setTimeout(() => {
      try {
        chrome.runtime.reload();
      } catch (e) {
        console.error('Failed to reload runtime:', e);
      }
    }, 150);
    return true;
  }

  return false;
});

// Periodic update check alarm (every 2 minutes)
chrome.alarms.create('checkUpdatesAlarm', { periodInMinutes: 2 });
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'checkUpdatesAlarm') {
    checkUpdateStatus().then(status => {
      if (status.hasUpdate) {
        // Broadcast update notification to all active NSU tabs
        chrome.tabs.query({ url: '*://rds4.northsouth.ac.bd/*' }, (tabs) => {
          tabs.forEach(tab => {
            chrome.tabs.sendMessage(tab.id, {
              type: 'UPDATE_AVAILABLE',
              payload: status
            }).catch(() => {});
          });
        });
      }
    });
  }
});

