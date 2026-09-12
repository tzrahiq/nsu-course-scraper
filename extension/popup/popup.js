/**
 * NSU RDS Course Scraper & Filter - Popup Script
 */

(function () {
  'use strict';

  const RDS_URL = 'https://rds4.northsouth.ac.bd/offered_courses';
  let activeTabId = null;
  let isNSUTab = false;
  let cachedCourses = [];
  let filteredResults = [];

  // DOM Elements
  const statusText = document.getElementById('status-text');
  const statusDot = document.querySelector('.status-dot');
  const btnSyncTab = document.getElementById('btn-sync-tab');
  const btnOpenRds = document.getElementById('btn-open-rds');

  const courseInput = document.getElementById('popup-course-input');
  const facultyInput = document.getElementById('popup-faculty-input');
  const toggleOpen = document.getElementById('popup-toggle-open');
  const toggleLabs = document.getElementById('popup-toggle-labs');
  const btnSearch = document.getElementById('btn-search');
  const btnClear = document.getElementById('btn-clear');

  const resultsHeader = document.getElementById('results-header');
  const resultsCount = document.getElementById('results-count');
  const btnExportCsv = document.getElementById('btn-export-csv');
  const btnCopyTsv = document.getElementById('btn-copy-tsv');

  const loadingSpinner = document.getElementById('loading-spinner');
  const emptyPlaceholder = document.getElementById('empty-placeholder');
  const courseList = document.getElementById('course-list');

  document.addEventListener('DOMContentLoaded', async () => {
    await initTabContext();
    await restoreInputs();
    bindEvents();

    // Auto-search if user previously had inputs saved
    if (courseInput.value.trim() || facultyInput.value.trim()) {
      handleSearch();
    }
  });

  async function initTabContext() {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab && tab.id) {
        activeTabId = tab.id;
        if (tab.url && tab.url.includes('rds4.northsouth.ac.bd/offered_courses')) {
          isNSUTab = true;
          statusDot.className = 'status-dot status-online';
          statusText.textContent = 'Active NSU RDS tab connected';
          btnSyncTab.style.display = 'inline-block';
          btnSyncTab.textContent = 'Sync with Page';
          return;
        }
      }
    } catch (e) {
      console.warn('Could not query active tab:', e);
    }

    statusDot.className = 'status-dot status-offline';
    statusText.textContent = 'Standalone Mode (Global Search)';
    btnSyncTab.style.display = 'none';
  }

  function bindEvents() {
    btnSearch.addEventListener('click', handleSearch);
    btnClear.addEventListener('click', handleClear);

    courseInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') handleSearch();
    });
    facultyInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') handleSearch();
    });

    btnSyncTab.addEventListener('click', syncWithActiveTab);
    btnOpenRds.addEventListener('click', () => {
      chrome.tabs.create({ url: RDS_URL });
    });

    btnExportCsv.addEventListener('click', exportCSV);
    btnCopyTsv.addEventListener('click', copyTSV);

    const btnPopupSchedule = document.getElementById('btn-popup-schedule');
    if (btnPopupSchedule) {
      btnPopupSchedule.addEventListener('click', handleOpenScheduleBuilder);
    }

    toggleOpen.addEventListener('change', () => {
      if (cachedCourses.length > 0) applyFilter();
    });
    toggleLabs.addEventListener('change', () => {
      if (cachedCourses.length > 0) applyFilter();
    });
  }

  async function handleOpenScheduleBuilder() {
    const coursesText = courseInput.value.trim();
    if (isNSUTab && activeTabId) {
      try {
        await chrome.tabs.sendMessage(activeTabId, {
          type: 'OPEN_SCHEDULE_MODAL',
          payload: { courses: coursesText }
        });
        window.close(); // Focus active tab with open modal
      } catch (err) {
        chrome.tabs.create({ url: RDS_URL });
      }
    } else {
      chrome.tabs.create({ url: RDS_URL });
    }
  }

  async function restoreInputs() {
    try {
      const data = await chrome.storage.local.get(['popup_courses', 'popup_faculties', 'popup_open_only', 'popup_labs']);
      if (data.popup_courses) courseInput.value = data.popup_courses;
      if (data.popup_faculties) facultyInput.value = data.popup_faculties;
      if (data.popup_open_only !== undefined) toggleOpen.checked = data.popup_open_only;
      if (data.popup_labs !== undefined) toggleLabs.checked = data.popup_labs;
    } catch (e) {}
  }

  async function saveInputs() {
    try {
      await chrome.storage.local.set({
        popup_courses: courseInput.value.trim(),
        popup_faculties: facultyInput.value.trim(),
        popup_open_only: toggleOpen.checked,
        popup_labs: toggleLabs.checked
      });
    } catch (e) {}
  }

  function parseTokens(str) {
    if (!str) return [];
    return str
      .split(/[\s,]+/)
      .map(s => s.trim().toUpperCase())
      .filter(Boolean);
  }

  async function handleSearch() {
    await saveInputs();

    // If we already have courses cached and active tab is connected, sync page
    if (isNSUTab && activeTabId) {
      chrome.tabs.sendMessage(activeTabId, {
        type: 'APPLY_FILTER_TO_PAGE',
        payload: {
          courses: courseInput.value.trim(),
          faculties: facultyInput.value.trim(),
          openOnly: toggleOpen.checked
        }
      }).catch(() => {});
    }

    if (cachedCourses.length === 0) {
      await fetchAllCourses();
    } else {
      applyFilter();
    }
  }

  function handleClear() {
    courseInput.value = '';
    facultyInput.value = '';
    toggleOpen.checked = false;
    toggleLabs.checked = true;
    saveInputs();

    if (isNSUTab && activeTabId) {
      chrome.tabs.sendMessage(activeTabId, {
        type: 'APPLY_FILTER_TO_PAGE',
        payload: { courses: '', faculties: '', openOnly: false }
      }).catch(() => {});
    }

    filteredResults = [];
    renderResults();
    showToast('Filters cleared');
  }

  async function syncWithActiveTab() {
    if (!isNSUTab || !activeTabId) return;

    try {
      showLoading(true);
      await chrome.tabs.sendMessage(activeTabId, {
        type: 'APPLY_FILTER_TO_PAGE',
        payload: {
          courses: courseInput.value.trim(),
          faculties: facultyInput.value.trim(),
          openOnly: toggleOpen.checked
        }
      });
      showToast('Filters synced to live RDS table!');
      // Also perform local search for popup preview
      if (cachedCourses.length === 0) {
        await fetchAllCourses();
      } else {
        applyFilter();
      }
    } catch (err) {
      console.warn('Sync tab error:', err);
      showToast('Could not reach page script. Refreshing tab...');
    } finally {
      showLoading(false);
    }
  }

  async function fetchAllCourses() {
    showLoading(true);
    try {
      const response = await fetch(RDS_URL);
      if (!response.ok) {
        throw new Error(`HTTP Error ${response.status}`);
      }
      const html = await response.text();
      const parser = new DOMParser();
      const doc = parser.parseFromString(html, 'text/html');
      const table = doc.getElementById('offeredCourseTbl');

      if (!table) {
        throw new Error('Course table not found in page response.');
      }

      const rows = table.querySelectorAll('tbody tr');
      const parsed = [];

      rows.forEach(tr => {
        const tds = tr.querySelectorAll('td');
        if (tds.length >= 7) {
          const serial = tds[0].textContent.trim();
          const course = tds[1].textContent.trim();
          const section = tds[2].textContent.trim();
          const faculty = tds[3].textContent.trim();
          const time = tds[4].textContent.trim().replace(/\s+/g, ' ');
          const room = tds[5].textContent.trim();
          const seatVal = parseInt(tds[6].textContent.trim(), 10);

          parsed.push({
            serial,
            course,
            section,
            faculty,
            time,
            room,
            seats: isNaN(seatVal) ? 0 : seatVal
          });
        }
      });

      cachedCourses = parsed;
      applyFilter();
    } catch (err) {
      console.error('Fetch error:', err);
      showToast(`Failed to load courses: ${err.message}`);
      emptyPlaceholder.innerHTML = `
        <div class="empty-icon">⚠️</div>
        <p style="color:#cf222e;">Could not load NSU courses.<br><small>${err.message}</small></p>
      `;
      emptyPlaceholder.style.display = 'flex';
      courseList.style.display = 'none';
      resultsHeader.style.display = 'none';
    } finally {
      showLoading(false);
    }
  }

  function applyFilter() {
    const courseTokens = parseTokens(courseInput.value);
    const facultyTokens = parseTokens(facultyInput.value);
    const openOnly = toggleOpen.checked;
    const includeLabs = toggleLabs.checked;

    if (courseTokens.length === 0 && facultyTokens.length === 0 && !openOnly) {
      // Don't show 3,000 items in tiny popup unless requested
      filteredResults = [];
      resultsHeader.style.display = 'none';
      emptyPlaceholder.style.display = 'flex';
      courseList.style.display = 'none';
      return;
    }

    filteredResults = cachedCourses.filter(row => {
      const courseUpper = row.course.toUpperCase();
      const facultyUpper = row.faculty.toUpperCase();

      // Open seats filter
      if (openOnly && row.seats <= 0) {
        return false;
      }

      // Course filter
      let courseMatch = true;
      if (courseTokens.length > 0) {
        courseMatch = courseTokens.some(c => {
          if (includeLabs) {
            return courseUpper === c || courseUpper.startsWith(c) || courseUpper.includes('/' + c) || courseUpper.includes(c + '/');
          }
          return courseUpper === c || courseUpper.includes('/' + c) || courseUpper.includes(c + '/');
        });
      }

      // Faculty filter
      let facultyMatch = true;
      if (facultyTokens.length > 0) {
        facultyMatch = facultyTokens.some(f => {
          return facultyUpper === f || facultyUpper.includes(f);
        });
      }

      // Combine conditions
      if (courseTokens.length > 0 && facultyTokens.length > 0) {
        return courseMatch && facultyMatch;
      } else if (courseTokens.length > 0) {
        return courseMatch;
      } else if (facultyTokens.length > 0) {
        return facultyMatch;
      }
      return true;
    });

    renderResults();
  }

  function renderResults() {
    if (filteredResults.length === 0) {
      resultsHeader.style.display = 'none';
      emptyPlaceholder.style.display = 'flex';
      emptyPlaceholder.innerHTML = `
        <div class="empty-icon">🔍</div>
        <p>No courses matched your filter criteria.</p>
      `;
      courseList.style.display = 'none';
      return;
    }

    emptyPlaceholder.style.display = 'none';
    resultsHeader.style.display = 'flex';
    courseList.style.display = 'flex';

    let openCount = 0;
    let totalOpenSeats = 0;
    filteredResults.forEach(r => {
      if (r.seats > 0) {
        openCount++;
        totalOpenSeats += r.seats;
      }
    });

    resultsCount.textContent = `${filteredResults.length} sections (${openCount} open / ${totalOpenSeats} seats)`;

    let html = '';
    filteredResults.forEach(item => {
      let badgeClass = 'badge-open';
      let badgeText = `${item.seats} seats`;

      if (item.seats === 0) {
        badgeClass = 'badge-full';
        badgeText = 'FULL';
      } else if (item.seats < 0) {
        badgeClass = 'badge-waitlist';
        badgeText = `${item.seats} WL`;
      }

      html += `
        <div class="course-card">
          <div class="course-card-top">
            <div>
              <span class="course-title">${escapeHTML(item.course)}</span>
              <span class="section-tag">Sec ${escapeHTML(item.section)}</span>
            </div>
            <span class="badge ${badgeClass}">${badgeText}</span>
          </div>
          <div class="course-card-mid">
            <span class="faculty-name">👨‍🏫 ${escapeHTML(item.faculty)}</span>
            <span class="room-name">📍 ${escapeHTML(item.room || 'TBA')}</span>
          </div>
          <div class="course-card-bot">
            🕒 ${escapeHTML(item.time || 'TBA')}
          </div>
        </div>
      `;
    });

    courseList.innerHTML = html;
  }

  function exportCSV() {
    if (filteredResults.length === 0) {
      showToast('No results to export.');
      return;
    }

    const headers = ['#', 'Course', 'Section', 'Faculty', 'Time', 'Room', 'Seats Available'];
    const rows = [headers.map(h => `"${h}"`).join(',')];

    filteredResults.forEach(r => {
      rows.push([
        `"${r.serial}"`,
        `"${r.course}"`,
        `"${r.section}"`,
        `"${r.faculty}"`,
        `"${r.time}"`,
        `"${r.room}"`,
        `"${r.seats}"`
      ].join(','));
    });

    const csvContent = '\uFEFF' + rows.join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const dateStr = new Date().toISOString().slice(0, 10);
    a.download = `nsu_courses_${dateStr}.csv`;
    a.click();
    URL.revokeObjectURL(url);

    showToast(`Downloaded CSV with ${filteredResults.length} courses!`);
  }

  function copyTSV() {
    if (filteredResults.length === 0) {
      showToast('No results to copy.');
      return;
    }

    const headers = ['#', 'Course', 'Section', 'Faculty', 'Time', 'Room', 'Seats Available'];
    const lines = [headers.join('\t')];

    filteredResults.forEach(r => {
      lines.push([r.serial, r.course, r.section, r.faculty, r.time, r.room, r.seats].join('\t'));
    });

    navigator.clipboard.writeText(lines.join('\n')).then(() => {
      showToast(`Copied ${filteredResults.length} sections to clipboard!`);
    }).catch(() => {
      showToast('Copy failed.');
    });
  }

  function showLoading(show) {
    loadingSpinner.style.display = show ? 'flex' : 'none';
    if (show) {
      emptyPlaceholder.style.display = 'none';
      courseList.style.display = 'none';
    }
  }

  function showToast(msg) {
    const toast = document.getElementById('popup-toast');
    toast.textContent = msg;
    toast.classList.add('show');
    setTimeout(() => {
      toast.classList.remove('show');
    }, 2200);
  }

  function escapeHTML(str) {
    if (!str) return '';
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }
})();

