/**
 * NSU RDS Course Scraper & Filter - In-Page Main World Script
 * Injected into https://rds4.northsouth.ac.bd/offered_courses
 */

(function () {
  'use strict';

  // Prevent double injection
  if (window.__NSU_SCRAPER_INJECTED__) return;
  window.__NSU_SCRAPER_INJECTED__ = true;

  let dataTableInstance = null;
  let customSearchFilterActive = false;

  // Shortlist and Generated Schedules State (Course + Faculty specific)
  let shortlistedItems = new Map();
  let generatedSchedules = [];
  let currentScheduleIndex = 0;
  let activeShortlistPopover = null;
  let filterShortlistedOnly = false;
  let selectedFacultyPreferences = new Map(); // Course -> Set of selected faculty initials

  // Filter State
  const filterState = {
    courses: [],
    faculties: [],
    openOnly: false,
    includeLabs: true,
    matchMode: 'AND' // 'AND' | 'OR'
  };

  // Wait for jQuery and DataTable to be ready
  function initWhenReady() {
    if (window.jQuery && window.jQuery.fn && window.jQuery.fn.DataTable && window.jQuery('#offeredCourseTbl').length) {
      const $tbl = window.jQuery('#offeredCourseTbl');
      
      // If already initialized as DataTable
      if (window.jQuery.fn.DataTable.isDataTable('#offeredCourseTbl')) {
        dataTableInstance = $tbl.DataTable();
        setupFilterExtension();
      } else {
        // Wait for page's script to initialize it
        const checkInterval = setInterval(() => {
          if (window.jQuery.fn.DataTable.isDataTable('#offeredCourseTbl')) {
            clearInterval(checkInterval);
            dataTableInstance = $tbl.DataTable();
            setupFilterExtension();
          }
        }, 150);

        // Fallback after 2.5s if not initialized yet
        setTimeout(() => {
          clearInterval(checkInterval);
          if (!dataTableInstance) {
            dataTableInstance = $tbl.DataTable({
              pageLength: 50,
              lengthMenu: [[25, 50, 100, -1], [25, 50, 100, 'All']],
              order: [[1, 'asc']]
            });
            setupFilterExtension();
          }
        }, 2500);
      }
    } else {
      setTimeout(initWhenReady, 200);
    }
  }

  function setupFilterExtension() {
    loadShortlist();
    injectControlPanel();
    injectScheduleModal();
    registerDataTableFilter();
    loadSavedState();
    decorateSeatsBadges();

    // Hook redraw event to re-apply badges and update stats
    dataTableInstance.on('draw.dt', function () {
      decorateSeatsBadges();
      updateStats();
    });

    // Initial stats calculation
    updateStats();

    // Setup bridge communication for popup messages
    window.addEventListener('message', handleWindowMessages);
  }

  function injectControlPanel() {
    const tableWrap = document.querySelector('.table-wrap');
    if (!tableWrap) return;

    // Check if panel already exists
    if (document.getElementById('nsu-filter-panel')) return;

    const panel = document.createElement('div');
    panel.id = 'nsu-filter-panel';
    panel.innerHTML = `
      <div class="nsu-panel-header">
        <div class="nsu-panel-title">
          <span>⚡ NSU Course Scraper & Quick Filter</span>
          <span class="nsu-badge-version">v1.5</span>
        </div>
        <div class="nsu-stats-bar" id="nsu-stats-bar">
          <button type="button" class="nsu-btn nsu-btn-amber" id="nsu-btn-open-shortlist">
            ⭐ Routine Builder <span class="nsu-shortlist-badge" id="nsu-shortlist-count">0</span>
          </button>
          <span class="nsu-stat-pill nsu-stat-showing" id="nsu-stat-showing">Showing: All</span>
          <span class="nsu-stat-pill nsu-stat-open" id="nsu-stat-open">Open Seats: ...</span>
        </div>
      </div>

      <div class="nsu-filter-grid">
        <div class="nsu-input-group">
          <label for="nsu-input-courses">
            <span>Course Codes:</span>
            <span class="nsu-input-hint">Separate by comma or space (e.g. CSE115, MAT120)</span>
          </label>
          <div class="nsu-input-wrapper">
            <input type="text" id="nsu-input-courses" placeholder="e.g. CSE115, MAT120, ENG102, PHY107" autocomplete="off" />
          </div>
          <div class="nsu-quick-chips">
            <span class="nsu-chip" data-course="CSE115">CSE115</span>
            <span class="nsu-chip" data-course="CSE215">CSE215</span>
            <span class="nsu-chip" data-course="MAT120">MAT120</span>
            <span class="nsu-chip" data-course="ENG102">ENG102</span>
            <span class="nsu-chip" data-course="PHY107">PHY107</span>
            <span class="nsu-chip" data-course="ACT201">ACT201</span>
          </div>
        </div>

        <div class="nsu-input-group">
          <label for="nsu-input-faculties">
            <span>Faculty Initial / Name:</span>
            <span class="nsu-input-hint">Separate by comma or space (e.g. NvA, Shaifur)</span>
          </label>
          <div class="nsu-input-wrapper">
            <input type="text" id="nsu-input-faculties" placeholder="e.g. NvA, Shaifur, ARM, HAS" autocomplete="off" />
          </div>
          <div class="nsu-quick-chips">
            <span class="nsu-chip" data-faculty="NvA">NvA</span>
            <span class="nsu-chip" data-faculty="Shaifur">Shaifur</span>
            <span class="nsu-chip" data-faculty="ARM">ARM</span>
            <span class="nsu-chip" data-faculty="HAS">HAS</span>
          </div>
        </div>
      </div>

      <div class="nsu-options-bar">
        <div class="nsu-toggles">
          <label class="nsu-checkbox-label">
            <input type="checkbox" id="nsu-toggle-open" />
            <span>Available Seats Only (&gt; 0)</span>
          </label>

          <label class="nsu-checkbox-label" title="Typing CSE115 will automatically match both CSE115 and CSE115L">
            <input type="checkbox" id="nsu-toggle-labs" checked />
            <span>Include Labs / Sub-codes</span>
          </label>
        </div>

        <div class="nsu-actions">
          <button type="button" class="nsu-btn nsu-btn-shortlist-toggle" id="nsu-btn-toggle-shortlist" title="Filter table to show only your shortlisted courses">
            ⭐ Show Shortlisted (<span id="nsu-shortlist-btn-count">0</span>)
          </button>
          <button type="button" class="nsu-btn nsu-btn-primary" id="nsu-btn-filter">
            🔍 Filter
          </button>
          <button type="button" class="nsu-btn nsu-btn-secondary" id="nsu-btn-reset">
            🔄 Reset
          </button>
          <button type="button" class="nsu-btn nsu-btn-success" id="nsu-btn-export-csv" title="Export currently filtered table to CSV">
            📥 Export CSV
          </button>
          <button type="button" class="nsu-btn nsu-btn-outline" id="nsu-btn-copy" title="Copy to clipboard for Excel / Google Sheets">
            📋 Copy TSV
          </button>
        </div>
      </div>
    `;

    // Insert directly above the table
    tableWrap.insertBefore(panel, tableWrap.firstChild);

    bindUIEvents();
  }

  function bindUIEvents() {
    const courseInput = document.getElementById('nsu-input-courses');
    const facultyInput = document.getElementById('nsu-input-faculties');
    const openToggle = document.getElementById('nsu-toggle-open');
    const labsToggle = document.getElementById('nsu-toggle-labs');
    const filterBtn = document.getElementById('nsu-btn-filter');
    const resetBtn = document.getElementById('nsu-btn-reset');
    const exportBtn = document.getElementById('nsu-btn-export-csv');
    const copyBtn = document.getElementById('nsu-btn-copy');

    // Debounced live typing
    let debounceTimer = null;
    const triggerDebouncedFilter = () => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        applyFilterFromUI();
      }, 300);
    };

    courseInput.addEventListener('input', triggerDebouncedFilter);
    facultyInput.addEventListener('input', triggerDebouncedFilter);
    openToggle.addEventListener('change', () => applyFilterFromUI());
    labsToggle.addEventListener('change', () => applyFilterFromUI());
    const toggleShortlistBtn = document.getElementById('nsu-btn-toggle-shortlist');
    if (toggleShortlistBtn) {
      toggleShortlistBtn.addEventListener('click', () => toggleShowShortlisted());
    }

    filterBtn.addEventListener('click', () => {
      if (filterShortlistedOnly) {
        toggleShowShortlisted(false);
      }
      applyFilterFromUI();
    });

    resetBtn.addEventListener('click', () => {
      courseInput.value = '';
      facultyInput.value = '';
      openToggle.checked = false;
      labsToggle.checked = true;
      if (filterShortlistedOnly) {
        toggleShowShortlisted(false);
      }
      saveState();
      applyFilterFromUI();
      showToast('Filters cleared');
    });

    exportBtn.addEventListener('click', exportFilteredCSV);
    copyBtn.addEventListener('click', copyFilteredTSV);

    const openShortlistBtn = document.getElementById('nsu-btn-open-shortlist');
    if (openShortlistBtn) {
      openShortlistBtn.addEventListener('click', openScheduleModal);
    }

    // Clickable quick chips
    document.querySelectorAll('.nsu-chip[data-course]').forEach((chip) => {
      chip.addEventListener('click', () => {
        const val = chip.getAttribute('data-course');
        addTokenToInput(courseInput, val);
        applyFilterFromUI();
      });
    });

    document.querySelectorAll('.nsu-chip[data-faculty]').forEach((chip) => {
      chip.addEventListener('click', () => {
        const val = chip.getAttribute('data-faculty');
        addTokenToInput(facultyInput, val);
        applyFilterFromUI();
      });
    });
  }

  function addTokenToInput(input, token) {
    const current = input.value.trim();
    if (!current) {
      input.value = token;
    } else {
      const tokens = current.split(/[\s,]+/).filter(Boolean);
      if (!tokens.some(t => t.toUpperCase() === token.toUpperCase())) {
        input.value = current + ', ' + token;
      }
    }
  }

  function parseTokens(str) {
    if (!str) return [];
    return str
      .split(/[\s,]+/)
      .map(s => s.trim().toUpperCase())
      .filter(Boolean);
  }

  function applyFilterFromUI() {
    const courseVal = document.getElementById('nsu-input-courses').value;
    const facultyVal = document.getElementById('nsu-input-faculties').value;
    const openVal = document.getElementById('nsu-toggle-open').checked;
    const labsVal = document.getElementById('nsu-toggle-labs').checked;

    filterState.courses = parseTokens(courseVal);
    filterState.faculties = parseTokens(facultyVal);
    filterState.openOnly = openVal;
    filterState.includeLabs = labsVal;

    customSearchFilterActive = (filterState.courses.length > 0 || filterState.faculties.length > 0 || filterState.openOnly);

    saveState();

    if (dataTableInstance) {
      // If actively searching courses or faculties, show all matching rows on one page for convenience
      if (filterShortlistedOnly || filterState.courses.length > 0 || filterState.faculties.length > 0) {
        dataTableInstance.page.len(-1); // Show all matching rows
      } else {
        dataTableInstance.page.len(50); // Default pagination
      }
      dataTableInstance.draw();
    }
  }

  function isRowShortlisted(courseCol, secCol, facultyCol) {
    if (!shortlistedItems || shortlistedItems.size === 0) return false;

    const rawCourse = (courseCol || '').trim().split(/[\s\n\r]+/)[0].toUpperCase();
    const cleanSec = (secCol || '').toString().trim();
    const cleanFac = (facultyCol || '').trim().toUpperCase();

    for (const item of shortlistedItems.values()) {
      if (!item || !item.course) continue;
      const itemCourse = (item.course || '').trim().toUpperCase();
      const itemFac = (item.faculty || '').trim().toUpperCase();

      const courseMatches = (rawCourse === itemCourse ||
        rawCourse.startsWith(itemCourse + '/') ||
        rawCourse.endsWith('/' + itemCourse) ||
        rawCourse.includes('/' + itemCourse + '/'));

      if (!courseMatches) continue;

      if (itemFac && cleanFac !== itemFac) continue;

      if (item.timingMode === 'all_faculty') {
        return true;
      }

      const secArr = item.sections && Array.isArray(item.sections) ? item.sections : (item.section ? [item.section] : []);
      if (secArr.length === 0 || secArr.includes(cleanSec)) {
        return true;
      }
    }

    return false;
  }

  function toggleShowShortlisted(forceState) {
    if (typeof forceState === 'boolean') {
      filterShortlistedOnly = forceState;
    } else {
      filterShortlistedOnly = !filterShortlistedOnly;
    }

    if (filterShortlistedOnly && shortlistedItems.size === 0) {
      filterShortlistedOnly = false;
      updateShortlistToggleBtn();
      showToast('⚠️ No courses shortlisted yet! Click "+ Shortlist" on any course row first.');
      return;
    }

    updateShortlistToggleBtn();

    if (dataTableInstance) {
      if (filterShortlistedOnly) {
        dataTableInstance.page.len(-1); // Show all shortlisted courses on 1 page
      } else {
        if (filterState.courses.length > 0 || filterState.faculties.length > 0) {
          dataTableInstance.page.len(-1);
        } else {
          dataTableInstance.page.len(50);
        }
      }
      dataTableInstance.draw();
    }

    if (filterShortlistedOnly) {
      showToast(`⭐ Displaying ${shortlistedItems.size} shortlisted item(s) in table`);
    } else {
      showToast('Showing all courses');
    }
  }

  function updateShortlistToggleBtn() {
    const btn = document.getElementById('nsu-btn-toggle-shortlist');
    const countSpan = document.getElementById('nsu-shortlist-btn-count');
    if (countSpan) {
      countSpan.textContent = shortlistedItems.size;
    }
    if (btn) {
      if (filterShortlistedOnly) {
        btn.classList.add('active');
        btn.innerHTML = `👁️ Show All Courses`;
        btn.title = `Currently showing only shortlisted courses. Click to restore full table view.`;
      } else {
        btn.classList.remove('active');
        btn.innerHTML = `⭐ Show Shortlisted (<span id="nsu-shortlist-btn-count">${shortlistedItems.size}</span>)`;
        btn.title = `Filter table to only show your shortlisted courses (${shortlistedItems.size} shortlisted)`;
      }
    }
  }

  function registerDataTableFilter() {
    const $ = window.jQuery;
    if (!$.fn.dataTable.ext.search) return;

    // Push our custom filter function
    $.fn.dataTable.ext.search.push(function (settings, data, dataIndex) {
      // If table is not offeredCourseTbl, skip
      if (settings.sTableId !== 'offeredCourseTbl') return true;
      if (!customSearchFilterActive && !filterShortlistedOnly) return true;

      const courseCol = (data[1] || '').trim().toUpperCase();
      const secCol = (data[2] || '').trim();
      const facultyCol = (data[3] || '').trim().toUpperCase();
      const seatText = (data[6] || '').trim();
      const seats = parseInt(seatText, 10);

      // If Shortlisted Only filter is active
      if (filterShortlistedOnly) {
        if (!isRowShortlisted(courseCol, secCol, facultyCol)) {
          return false;
        }
        if (filterState.openOnly) {
          if (isNaN(seats) || seats <= 0) {
            return false;
          }
        }
        return true;
      }

      // Check Open Seats filter
      if (filterState.openOnly) {
        if (isNaN(seats) || seats <= 0) {
          return false;
        }
      }

      // Check Course Match
      let courseMatches = true;
      if (filterState.courses.length > 0) {
        courseMatches = filterState.courses.some(c => {
          if (filterState.includeLabs) {
            // Check if exact match, or starts with term (e.g. CSE115 -> CSE115 or CSE115L), or term in cross-listed (e.g. MAT483 in AMCS510/MAT483)
            return courseCol === c || courseCol.startsWith(c) || courseCol.includes('/' + c) || courseCol.includes(c + '/');
          } else {
            // Strict match
            return courseCol === c || courseCol.includes('/' + c) || courseCol.includes(c + '/');
          }
        });
      }

      // Check Faculty Match
      let facultyMatches = true;
      if (filterState.faculties.length > 0) {
        facultyMatches = filterState.faculties.some(f => {
          return facultyCol === f || facultyCol.includes(f);
        });
      }

      // Combine conditions
      if (filterState.courses.length > 0 && filterState.faculties.length > 0) {
        return courseMatches && facultyMatches;
      } else if (filterState.courses.length > 0) {
        return courseMatches;
      } else if (filterState.faculties.length > 0) {
        return facultyMatches;
      }

      return true;
    });
  }

  function decorateSeatsBadges() {
    const rows = document.querySelectorAll('#offeredCourseTbl tbody tr');
    rows.forEach(tr => {
      const tds = tr.querySelectorAll('td');
      if (tds.length >= 7) {
        // Decorate Course cell with shortlist button (specific to Course + Faculty)
        const courseTd = tds[1];
        const rawCourse = courseTd.childNodes[0] ? courseTd.childNodes[0].textContent.trim() : courseTd.textContent.trim();
        const courseCode = rawCourse.split(/\s+/)[0].toUpperCase();

        const sectionTd = tds[2];
        const section = sectionTd ? sectionTd.textContent.trim() : '';

        const facultyTd = tds[3];
        const faculty = facultyTd ? facultyTd.textContent.trim().toUpperCase() : '';

        const timeTd = tds[4];
        const time = timeTd ? timeTd.textContent.trim().replace(/\s+/g, ' ') : '';

        const roomTd = tds[5];
        const room = roomTd ? roomTd.textContent.trim() : '';

        if (courseCode && faculty) {
          const item = getShortlistedItem(courseCode, faculty);
          let btn = courseTd.querySelector('.nsu-row-shortlist-btn');
          if (!btn) {
            btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'nsu-row-shortlist-btn';
            btn.addEventListener('click', (e) => {
              e.stopPropagation();
              openShortlistPopover(btn, courseCode, section, faculty, time, room);
            });
            courseTd.appendChild(btn);
          }

          if (item) {
            const secList = item.sections && Array.isArray(item.sections) ? item.sections : (item.section ? [item.section] : []);
            if (item.timingMode === 'all_faculty') {
              btn.className = 'nsu-row-shortlist-btn active';
              btn.textContent = `⭐ All ${faculty}`;
              btn.title = `Shortlisted: All timings of ${faculty}. Click to adjust or remove.`;
            } else if (secList.includes(section)) {
              btn.className = 'nsu-row-shortlist-btn active';
              if (secList.length === 1) {
                btn.textContent = `⭐ Sec ${section} Only`;
                btn.title = `Shortlisted: Sec ${section} only. Click to adjust or remove.`;
              } else {
                btn.textContent = `⭐ Sec ${section} (${secList.length} sel)`;
                btn.title = `Shortlisted: ${secList.length} sections of ${faculty} (Sec ${secList.join(', ')}). Click to adjust.`;
              }
            } else {
              btn.className = 'nsu-row-shortlist-btn';
              btn.textContent = `+ Shortlist`;
              btn.title = secList.length > 0
                ? `${faculty} has ${secList.length} other section(s) shortlisted. Click to add or adjust.`
                : `Shortlist ${courseCode} (${faculty}) with timing options`;
            }
          } else {
            btn.className = 'nsu-row-shortlist-btn';
            btn.textContent = `+ Shortlist`;
            btn.title = `Shortlist ${courseCode} (${faculty}) with timing options`;
          }
        }

        // Decorate Seats cell
        const seatTd = tds[6];
        const val = parseInt(seatTd.textContent.trim(), 10);

        if (!isNaN(val)) {
          let badgeClass = 'nsu-seat-open';
          let label = `${val} seats`;

          if (val === 0) {
            badgeClass = 'nsu-seat-full';
            label = 'FULL';
          } else if (val < 0) {
            badgeClass = 'nsu-seat-waitlist';
            label = `${val} (Waitlist)`;
          }

          seatTd.innerHTML = `<span class="nsu-seat-badge ${badgeClass}">${label}</span>`;
        }
      }
    });
  }

  function updateStats() {
    if (!dataTableInstance) return;

    const filteredData = dataTableInstance.rows({ search: 'applied' }).data();
    const totalCount = dataTableInstance.rows().count();
    const filteredCount = filteredData.length;

    let openCount = 0;
    let totalSeats = 0;

    for (let i = 0; i < filteredData.length; i++) {
      const row = filteredData[i];
      const s = parseInt((row[6] || '').toString().trim(), 10);
      if (!isNaN(s) && s > 0) {
        openCount++;
        totalSeats += s;
      }
    }

    const showingEl = document.getElementById('nsu-stat-showing');
    const openEl = document.getElementById('nsu-stat-open');

    if (showingEl) {
      if (filterShortlistedOnly) {
        showingEl.textContent = `Showing: ${filteredCount} shortlisted row(s)`;
      } else {
        showingEl.textContent = `Showing: ${filteredCount} of ${totalCount} sections`;
      }
    }
    if (openEl) {
      openEl.textContent = `Open Sections: ${openCount} (${totalSeats} available seats)`;
      if (openCount === 0 && filteredCount > 0) {
        openEl.className = 'nsu-stat-pill nsu-stat-full';
      } else {
        openEl.className = 'nsu-stat-pill nsu-stat-open';
      }
    }

    // Post update to isolated world bridge
    window.postMessage({
      source: 'NSU_SCRAPER_INPAGE',
      type: 'STATS_UPDATE',
      data: {
        totalSections: totalCount,
        filteredSections: filteredCount,
        openSections: openCount,
        totalSeats: totalSeats
      }
    }, '*');
  }

  function exportFilteredCSV() {
    if (!dataTableInstance) return;

    const filteredData = dataTableInstance.rows({ search: 'applied' }).data();
    if (!filteredData || filteredData.length === 0) {
      showToast('No matching courses to export!');
      return;
    }

    const headers = ['#', 'Course', 'Section', 'Faculty', 'Time', 'Room', 'Seats Available'];
    const csvRows = [];
    csvRows.push(headers.map(h => `"${h}"`).join(','));

    for (let i = 0; i < filteredData.length; i++) {
      const row = filteredData[i];
      // Clean up any HTML tags if present in row items
      const cleanRow = [];
      for (let j = 0; j < 7; j++) {
        let cell = (row[j] || '').toString().replace(/<[^>]*>/g, '').trim();
        cleanRow.push(`"${cell.replace(/"/g, '""')}"`);
      }
      csvRows.push(cleanRow.join(','));
    }

    const csvContent = '\uFEFF' + csvRows.join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const dateStr = new Date().toISOString().slice(0, 10);
    a.download = `nsu_offered_courses_${dateStr}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    showToast(`Exported ${filteredData.length} sections to CSV!`);
  }

  function copyFilteredTSV() {
    if (!dataTableInstance) return;

    const filteredData = dataTableInstance.rows({ search: 'applied' }).data();
    if (!filteredData || filteredData.length === 0) {
      showToast('No matching courses to copy!');
      return;
    }

    const headers = ['#', 'Course', 'Section', 'Faculty', 'Time', 'Room', 'Seats Available'];
    const lines = [headers.join('\t')];

    for (let i = 0; i < filteredData.length; i++) {
      const row = filteredData[i];
      const cleanRow = [];
      for (let j = 0; j < 7; j++) {
        let cell = (row[j] || '').toString().replace(/<[^>]*>/g, '').trim();
        cleanRow.push(cell);
      }
      lines.push(cleanRow.join('\t'));
    }

    const tsvContent = lines.join('\n');
    navigator.clipboard.writeText(tsvContent).then(() => {
      showToast(`Copied ${filteredData.length} sections to clipboard!`);
    }).catch(err => {
      showToast('Failed to copy to clipboard.');
      console.error(err);
    });
  }

  function saveState() {
    try {
      localStorage.setItem('nsu_scraper_state', JSON.stringify({
        courseText: document.getElementById('nsu-input-courses').value,
        facultyText: document.getElementById('nsu-input-faculties').value,
        openOnly: document.getElementById('nsu-toggle-open').checked,
        includeLabs: document.getElementById('nsu-toggle-labs').checked
      }));
    } catch (e) {}
  }

  function loadSavedState() {
    try {
      const saved = localStorage.getItem('nsu_scraper_state');
      if (saved) {
        const state = JSON.parse(saved);
        if (state.courseText) document.getElementById('nsu-input-courses').value = state.courseText;
        if (state.facultyText) document.getElementById('nsu-input-faculties').value = state.facultyText;
        if (state.openOnly !== undefined) document.getElementById('nsu-toggle-open').checked = state.openOnly;
        if (state.includeLabs !== undefined) document.getElementById('nsu-toggle-labs').checked = state.includeLabs;

        if (state.courseText || state.facultyText || state.openOnly) {
          applyFilterFromUI();
        }
      }
    } catch (e) {}
  }

  function handleWindowMessages(event) {
    if (!event.data || event.data.source !== 'NSU_SCRAPER_BRIDGE') return;

    if (event.data.type === 'APPLY_FILTER') {
      const { courses, faculties, openOnly } = event.data.payload;
      if (courses !== undefined) document.getElementById('nsu-input-courses').value = courses;
      if (faculties !== undefined) document.getElementById('nsu-input-faculties').value = faculties;
      if (openOnly !== undefined) document.getElementById('nsu-toggle-open').checked = openOnly;
      applyFilterFromUI();
      showToast('Filter updated from extension popup!');
    } else if (event.data.type === 'OPEN_SCHEDULE_MODAL') {
      if (event.data.payload && event.data.payload.courses) {
        const tokens = event.data.payload.courses.split(/[\s,]+/).filter(Boolean);
        tokens.forEach(t => shortlistedCourses.add(t.toUpperCase()));
        saveShortlist();
      }
      openScheduleModal();
    } else if (event.data.type === 'REQUEST_STATS') {
      updateStats();
    } else if (event.data.type === 'UPDATE_AVAILABLE') {
      showUpdateNotice(event.data.payload);
    }
  }

  function showUpdateNotice(payload) {
    if (document.getElementById('nsu-update-banner')) return;
    const panel = document.getElementById('nsu-filter-panel');
    if (!panel) return;

    const banner = document.createElement('div');
    banner.id = 'nsu-update-banner';
    banner.style.cssText = 'background: #eff6ff; border: 1.5px solid #3b82f6; border-radius: 6px; padding: 6px 12px; margin-bottom: 8px; font-size: 0.8rem; display: flex; align-items: center; justify-content: space-between; color: #1e40af;';
    banner.innerHTML = `
      <span>🎉 <strong>Update Available (v${escapeHTML(payload.remoteVersion)})</strong>! Run <code>Update_NSU_Extension.bat</code> on your Desktop to update.</span>
      <button type="button" id="nsu-reload-ext-btn" style="background:#3b82f6; color:#fff; border:none; border-radius:4px; padding:3px 10px; cursor:pointer; font-size:0.75rem; font-weight:700; margin-left:8px;">🔄 Reload Extension</button>
    `;
    panel.insertBefore(banner, panel.firstChild);

    document.getElementById('nsu-reload-ext-btn').addEventListener('click', () => {
      window.postMessage({
        source: 'NSU_SCRAPER_INPAGE',
        type: 'RELOAD_EXTENSION'
      }, '*');
    });
  }

  function showToast(message) {
    let toast = document.getElementById('nsu-toast');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'nsu-toast';
      toast.className = 'nsu-toast';
      document.body.appendChild(toast);
    }
    toast.textContent = message;
    toast.classList.add('nsu-toast-show');
    setTimeout(() => {
      toast.classList.remove('nsu-toast-show');
    }, 2500);
  }

  // ==========================================================================
  // Shortlist and Routine Builder Implementation
  // ==========================================================================

  const DAY_NAMES = {
    'S': 'Sunday',
    'M': 'Monday',
    'T': 'Tuesday',
    'W': 'Wednesday',
    'R': 'Thursday',
    'F': 'Friday',
    'A': 'Saturday'
  };
  const DAYS_ORDER = ['S', 'M', 'T', 'W', 'R', 'A'];

  function loadShortlist() {
    try {
      const saved = localStorage.getItem('nsu_shortlist_items_v2');
      if (saved) {
        const arr = JSON.parse(saved);
        if (Array.isArray(arr)) {
          shortlistedItems.clear();
          arr.forEach(item => {
            if (item && item.course && item.faculty) {
              if (!item.sections || !Array.isArray(item.sections)) {
                item.sections = item.section ? [item.section] : [];
              }
              if (!item.timingMode) {
                item.timingMode = item.sections.length === 0 ? 'all_faculty' : (item.sections.length === 1 ? 'specific' : 'multiple');
              }
              shortlistedItems.set(item.id || `${item.course}__${item.faculty}`, item);
            }
          });
        }
      }
    } catch (e) {}
    updateShortlistBadge();
  }

  function saveShortlist() {
    try {
      const arr = Array.from(shortlistedItems.values());
      localStorage.setItem('nsu_shortlist_items_v2', JSON.stringify(arr));
    } catch (e) {}
    updateShortlistBadge();
  }

  function updateShortlistBadge() {
    const badge = document.getElementById('nsu-shortlist-count');
    if (badge) {
      badge.textContent = shortlistedItems.size;
    }
    updateShortlistToggleBtn();
    if (filterShortlistedOnly) {
      if (shortlistedItems.size === 0) {
        filterShortlistedOnly = false;
        updateShortlistToggleBtn();
        if (dataTableInstance) {
          dataTableInstance.page.len(50);
          dataTableInstance.draw();
        }
      } else if (dataTableInstance) {
        dataTableInstance.draw();
      }
    }
  }

  function getShortlistedItem(courseCode, faculty) {
    const cleanCourse = courseCode.trim().toUpperCase();
    const cleanFac = faculty.trim().toUpperCase();
    return shortlistedItems.get(`${cleanCourse}__${cleanFac}`) || null;
  }

  function isItemShortlisted(courseCode, faculty) {
    return !!getShortlistedItem(courseCode, faculty);
  }

  function getFacultySections(courseCode, faculty) {
    if (!dataTableInstance) return [];
    const allRows = dataTableInstance.rows().data();
    const matched = [];
    const codeUpper = courseCode.trim().toUpperCase();
    const facUpper = faculty.trim().toUpperCase();

    for (let i = 0; i < allRows.length; i++) {
      const row = allRows[i];
      const c = (row[1] || '').trim().toUpperCase();
      const f = (row[3] || '').trim().toUpperCase();
      if ((c === codeUpper || c.startsWith(codeUpper + '/') || c.endsWith('/' + codeUpper) || c.includes('/' + codeUpper + '/')) && f === facUpper) {
        matched.push({
          section: (row[2] || '').trim(),
          time: (row[4] || '').trim().replace(/\s+/g, ' '),
          room: (row[5] || '').trim(),
          seats: parseInt((row[6] || '').toString().trim(), 10) || 0
        });
      }
    }
    return matched;
  }

  function findMatchingLab(courseCode, sections, faculty, timingMode = 'all_faculty') {
    if (courseCode.endsWith('L') && courseCode.length > 3) {
      return null;
    }

    const labCode = courseCode + 'L';
    if (!dataTableInstance) return null;

    const allRows = dataTableInstance.rows().data();
    const labRows = [];

    for (let i = 0; i < allRows.length; i++) {
      const row = allRows[i];
      const c = (row[1] || '').trim().toUpperCase();
      if (c === labCode || c.startsWith(labCode + '/') || c.endsWith('/' + labCode)) {
        labRows.push({
          course: labCode,
          section: (row[2] || '').trim(),
          faculty: (row[3] || '').trim().toUpperCase(),
          time: (row[4] || '').trim().replace(/\s+/g, ' '),
          room: (row[5] || '').trim()
        });
      }
    }

    if (labRows.length === 0) {
      return null;
    }

    const secArr = Array.isArray(sections) ? sections : (sections ? [sections] : []);

    // 1. If specific or multiple sections, find lab sections with matching section numbers
    if (timingMode !== 'all_faculty' && secArr.length > 0) {
      const matchingSecLabs = labRows.filter(r => secArr.includes(r.section));
      if (matchingSecLabs.length > 0) {
        return {
          labCode: labCode,
          labFaculty: matchingSecLabs[0].faculty,
          labSections: matchingSecLabs.map(r => r.section),
          timingMode: matchingSecLabs.length === 1 ? 'specific' : 'multiple'
        };
      }
    }

    // 2. Priority: Same faculty lab sections
    const sameFacultyLabs = labRows.filter(r => r.faculty === faculty);
    if (sameFacultyLabs.length > 0) {
      return {
        labCode: labCode,
        labFaculty: faculty,
        labSections: sameFacultyLabs.map(r => r.section),
        timingMode: timingMode === 'all_faculty' ? 'all_faculty' : (sameFacultyLabs.length === 1 ? 'specific' : 'multiple')
      };
    }

    // 3. Fallback: all available lab sections
    return {
      labCode: labCode,
      labFaculty: labRows[0].faculty,
      labSections: [labRows[0].section],
      timingMode: 'all_faculty'
    };
  }

  function closeShortlistPopover() {
    if (activeShortlistPopover) {
      activeShortlistPopover.remove();
      activeShortlistPopover = null;
    }
  }

  function openShortlistPopover(btn, courseCode, section, faculty, time, room) {
    if (activeShortlistPopover && activeShortlistPopover._anchorBtn === btn) {
      closeShortlistPopover();
      return;
    }
    closeShortlistPopover();

    const cleanCourse = courseCode.trim().toUpperCase();
    const cleanFac = faculty.trim().toUpperCase();
    const existingItem = getShortlistedItem(cleanCourse, cleanFac);

    const facSections = getFacultySections(cleanCourse, cleanFac);
    const labInfo = findMatchingLab(cleanCourse, section ? [section] : [], cleanFac, 'specific');
    const hasLab = !!labInfo;

    // Build the set of initially selected section numbers
    const selectedSet = new Set();
    if (existingItem) {
      if (existingItem.timingMode === 'all_faculty') {
        facSections.forEach(s => selectedSet.add(s.section));
      } else if (existingItem.sections && existingItem.sections.length > 0) {
        existingItem.sections.forEach(s => selectedSet.add(s));
      } else if (existingItem.section) {
        selectedSet.add(existingItem.section);
      }
    } else {
      if (section) selectedSet.add(section);
    }

    const isThisSecChecked = selectedSet.has(section);
    const allCount = facSections.length > 0 ? facSections.length : 1;

    const popover = document.createElement('div');
    popover.id = 'nsu-shortlist-popover';
    popover.className = 'nsu-shortlist-popover';
    popover._anchorBtn = btn;

    popover.innerHTML = `
      <div class="nsu-popover-header">
        <span>⭐ Shortlist ${escapeHTML(cleanCourse)} (${escapeHTML(cleanFac)})</span>
        <button type="button" class="nsu-popover-close" id="nsu-popover-close-btn">&times;</button>
      </div>

      <div class="nsu-popover-quick-row">
        ${section ? `
          <button type="button" class="nsu-popover-quick-btn" id="nsu-quick-this">
            ⏱️ Only Sec ${escapeHTML(section)}
          </button>
        ` : ''}
        <button type="button" class="nsu-popover-quick-btn" id="nsu-quick-all">
          👨‍🏫 All (${allCount})
        </button>
        ${section && !isThisSecChecked ? `
          <button type="button" class="nsu-popover-quick-btn" id="nsu-quick-add-this">
            + Add Sec ${escapeHTML(section)}
          </button>
        ` : `
          <button type="button" class="nsu-popover-quick-btn" id="nsu-quick-clear">
            Clear
          </button>
        `}
      </div>

      <div style="font-size:0.7rem; color:#64748b; font-weight:600; margin-top:2px;">
        Choose one or multiple sections:
      </div>

      <div class="nsu-popover-sec-list" id="nsu-popover-sec-list">
        ${facSections.map(s => {
          const isChecked = selectedSet.has(s.section);
          const isCurrentRow = s.section === section;
          return `
            <label class="nsu-popover-sec-item ${isChecked ? 'selected' : ''}">
              <input type="checkbox" class="nsu-sec-checkbox" value="${escapeHTML(s.section)}" ${isChecked ? 'checked' : ''} />
              <div class="nsu-popover-sec-body">
                <div class="nsu-popover-sec-main">
                  <span><strong>Sec ${escapeHTML(s.section)}</strong>${isCurrentRow ? ' <span style="font-size:0.68rem; color:#2563eb; font-weight:700;">(this row)</span>' : ''}</span>
                  <span class="nsu-popover-sec-time">${escapeHTML(s.time || 'TBA')}</span>
                </div>
                <div class="nsu-popover-sec-sub">
                  <span>📍 ${escapeHTML(s.room || 'TBA')}</span>
                  <span class="${s.seats > 0 ? 'nsu-sec-open' : 'nsu-sec-full'}">${s.seats > 0 ? s.seats + ' open' : 'FULL'}</span>
                </div>
              </div>
            </label>
          `;
        }).join('')}
      </div>

      ${hasLab ? `
        <label class="nsu-popover-lab-toggle">
          <input type="checkbox" id="nsu-popover-lab-checkbox" checked />
          <span>Auto-include paired lab (<strong>${escapeHTML(labInfo.labCode)}</strong>)</span>
        </label>
      ` : ''}

      <div class="nsu-popover-actions">
        <button type="button" class="nsu-btn nsu-btn-primary" id="nsu-popover-save-btn" style="flex:1;">
          Save Shortlist (<span id="nsu-popover-count">${selectedSet.size}</span>)
        </button>
        ${existingItem ? `
          <button type="button" class="nsu-popover-remove-btn" id="nsu-popover-remove-btn">
            🗑️ Remove
          </button>
        ` : ''}
      </div>
    `;

    document.body.appendChild(popover);
    activeShortlistPopover = popover;

    // Positioning
    const rect = btn.getBoundingClientRect();
    const popoverWidth = 320;
    let top = rect.bottom + window.scrollY + 6;
    let left = rect.left + window.scrollX - 20;

    if (left + popoverWidth > window.innerWidth - 10) {
      left = window.innerWidth - popoverWidth - 10;
    }
    if (left < 10) left = 10;

    popover.style.top = `${top}px`;
    popover.style.left = `${left}px`;

    const updateCountUI = () => {
      const checkedBoxes = popover.querySelectorAll('.nsu-sec-checkbox:checked');
      const countEl = document.getElementById('nsu-popover-count');
      if (countEl) countEl.textContent = checkedBoxes.length;
    };

    // Close
    document.getElementById('nsu-popover-close-btn').addEventListener('click', (e) => {
      e.stopPropagation();
      closeShortlistPopover();
    });

    // Checkboxes change
    popover.querySelectorAll('.nsu-sec-checkbox').forEach(cb => {
      cb.addEventListener('change', () => {
        const itemLabel = cb.closest('.nsu-popover-sec-item');
        if (itemLabel) {
          if (cb.checked) itemLabel.classList.add('selected');
          else itemLabel.classList.remove('selected');
        }
        updateCountUI();
      });
    });

    // Quick action: Only This Sec
    const quickThisBtn = document.getElementById('nsu-quick-this');
    if (quickThisBtn) {
      quickThisBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const labCheckbox = document.getElementById('nsu-popover-lab-checkbox');
        const incLab = labCheckbox ? labCheckbox.checked : false;
        applyShortlistSelection(cleanCourse, [section], cleanFac, 'specific', incLab);
        closeShortlistPopover();
      });
    }

    // Quick action: All
    document.getElementById('nsu-quick-all').addEventListener('click', (e) => {
      e.stopPropagation();
      const allSecs = facSections.map(s => s.section);
      const labCheckbox = document.getElementById('nsu-popover-lab-checkbox');
      const incLab = labCheckbox ? labCheckbox.checked : false;
      applyShortlistSelection(cleanCourse, allSecs, cleanFac, 'all_faculty', incLab);
      closeShortlistPopover();
    });

    // Quick action: Add This Sec
    const quickAddThisBtn = document.getElementById('nsu-quick-add-this');
    if (quickAddThisBtn) {
      quickAddThisBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const currentlyChecked = Array.from(popover.querySelectorAll('.nsu-sec-checkbox:checked')).map(c => c.value);
        if (!currentlyChecked.includes(section)) currentlyChecked.push(section);
        const labCheckbox = document.getElementById('nsu-popover-lab-checkbox');
        const incLab = labCheckbox ? labCheckbox.checked : false;
        const mode = currentlyChecked.length === facSections.length ? 'all_faculty' : (currentlyChecked.length === 1 ? 'specific' : 'multiple');
        applyShortlistSelection(cleanCourse, currentlyChecked, cleanFac, mode, incLab);
        closeShortlistPopover();
      });
    }

    // Quick action: Clear
    const quickClearBtn = document.getElementById('nsu-quick-clear');
    if (quickClearBtn) {
      quickClearBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        popover.querySelectorAll('.nsu-sec-checkbox').forEach(cb => {
          cb.checked = false;
          const itemLabel = cb.closest('.nsu-popover-sec-item');
          if (itemLabel) itemLabel.classList.remove('selected');
        });
        updateCountUI();
      });
    }

    // Save button
    document.getElementById('nsu-popover-save-btn').addEventListener('click', (e) => {
      e.stopPropagation();
      const checkedSecs = Array.from(popover.querySelectorAll('.nsu-sec-checkbox:checked')).map(c => c.value);
      const labCheckbox = document.getElementById('nsu-popover-lab-checkbox');
      const incLab = labCheckbox ? labCheckbox.checked : false;

      if (checkedSecs.length === 0) {
        removeShortlistEntry(cleanCourse, cleanFac);
      } else {
        const mode = checkedSecs.length === facSections.length ? 'all_faculty' : (checkedSecs.length === 1 ? 'specific' : 'multiple');
        applyShortlistSelection(cleanCourse, checkedSecs, cleanFac, mode, incLab);
      }
      closeShortlistPopover();
    });

    // Remove button
    const removeBtn = document.getElementById('nsu-popover-remove-btn');
    if (removeBtn) {
      removeBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        removeShortlistEntry(cleanCourse, cleanFac);
        closeShortlistPopover();
      });
    }
  }

  function applyShortlistSelection(courseCode, sections, faculty, timingMode = 'all_faculty', includeLab = true) {
    const cleanCourse = courseCode.trim().toUpperCase();
    const cleanFac = faculty.trim().toUpperCase();
    const key = `${cleanCourse}__${cleanFac}`;

    const secArr = Array.isArray(sections) ? sections : (sections ? [sections] : []);

    if (timingMode !== 'all_faculty' && secArr.length === 0) {
      removeShortlistEntry(cleanCourse, cleanFac);
      return;
    }

    // Clean up previous linked lab if present
    const oldItem = shortlistedItems.get(key);
    if (oldItem && oldItem.linkedLabKey && shortlistedItems.has(oldItem.linkedLabKey)) {
      shortlistedItems.delete(oldItem.linkedLabKey);
    }

    let effectiveMode = timingMode;
    if (effectiveMode !== 'all_faculty') {
      effectiveMode = secArr.length === 1 ? 'specific' : 'multiple';
    }

    let linkedLabKey = null;
    let labInfo = null;

    if (includeLab) {
      labInfo = findMatchingLab(cleanCourse, secArr, cleanFac, effectiveMode);
      if (labInfo) {
        linkedLabKey = `${labInfo.labCode}__${labInfo.labFaculty}`;
        shortlistedItems.set(linkedLabKey, {
          id: linkedLabKey,
          course: labInfo.labCode,
          faculty: labInfo.labFaculty,
          section: labInfo.labSections && labInfo.labSections[0] ? labInfo.labSections[0] : '',
          sections: labInfo.labSections || [],
          timingMode: labInfo.timingMode || effectiveMode,
          isLab: true,
          linkedTheoryKey: key
        });
      }
    }

    shortlistedItems.set(key, {
      id: key,
      course: cleanCourse,
      faculty: cleanFac,
      section: secArr[0] || '',
      sections: secArr,
      timingMode: effectiveMode, // 'all_faculty' | 'specific' | 'multiple'
      isLab: cleanCourse.endsWith('L') && cleanCourse.length > 3,
      linkedLabKey: linkedLabKey
    });

    saveShortlist();
    decorateSeatsBadges();
    renderShortlistChips();

    let toastMsg = '';
    if (effectiveMode === 'all_faculty') {
      toastMsg = `⭐ Shortlisted all timings of ${cleanCourse} (${cleanFac})!`;
    } else if (secArr.length === 1) {
      toastMsg = `⭐ Shortlisted ${cleanCourse} (${cleanFac}) - Sec ${secArr[0]} only!`;
    } else {
      toastMsg = `⭐ Shortlisted ${cleanCourse} (${cleanFac}) - ${secArr.length} sections (Sec ${secArr.join(', ')})!`;
    }
    if (labInfo) {
      toastMsg += ` + Lab ${labInfo.labCode} (${labInfo.labFaculty})`;
    }
    showToast(toastMsg);
  }

  function removeShortlistEntry(courseCode, faculty) {
    const cleanCourse = courseCode.trim().toUpperCase();
    const cleanFac = faculty.trim().toUpperCase();
    const key = `${cleanCourse}__${cleanFac}`;

    const item = shortlistedItems.get(key);
    if (item) {
      shortlistedItems.delete(key);
      if (item.linkedLabKey && shortlistedItems.has(item.linkedLabKey)) {
        shortlistedItems.delete(item.linkedLabKey);
      }
      if (item.linkedTheoryKey && shortlistedItems.has(item.linkedTheoryKey)) {
        shortlistedItems.delete(item.linkedTheoryKey);
      }
      saveShortlist();
      decorateSeatsBadges();
      renderShortlistChips();
      showToast(`Removed ${cleanCourse} (${cleanFac}) from shortlist`);
    }
  }

  function toggleShortlistRow(courseCode, section, faculty) {
    const cleanCourse = courseCode.trim().toUpperCase();
    const cleanFac = faculty.trim().toUpperCase();
    const key = `${cleanCourse}__${cleanFac}`;

    if (shortlistedItems.has(key)) {
      const item = shortlistedItems.get(key);
      const secArr = item.sections && Array.isArray(item.sections) ? [...item.sections] : (item.section ? [item.section] : []);
      if (item.timingMode === 'all_faculty') {
        removeShortlistEntry(cleanCourse, cleanFac);
      } else if (secArr.includes(section)) {
        const nextSecs = secArr.filter(s => s !== section);
        if (nextSecs.length === 0) {
          removeShortlistEntry(cleanCourse, cleanFac);
        } else {
          applyShortlistSelection(cleanCourse, nextSecs, cleanFac, nextSecs.length === 1 ? 'specific' : 'multiple', true);
        }
      } else {
        secArr.push(section);
        applyShortlistSelection(cleanCourse, secArr, cleanFac, 'multiple', true);
      }
    } else {
      applyShortlistSelection(cleanCourse, section ? [section] : [], cleanFac, section ? 'specific' : 'all_faculty', true);
    }
  }

  function injectScheduleModal() {
    if (document.getElementById('nsu-schedule-modal')) return;

    const modalOverlay = document.createElement('div');
    modalOverlay.id = 'nsu-schedule-modal';
    modalOverlay.className = 'nsu-modal-overlay';
    modalOverlay.innerHTML = `
      <div class="nsu-modal-container">
        <div class="nsu-modal-header">
          <div class="nsu-modal-title">
            <span>⭐ NSU Conflict-Free Routine &amp; Schedule Builder</span>
          </div>
          <button type="button" class="nsu-modal-close" id="nsu-modal-close-btn">&times;</button>
        </div>

        <div class="nsu-modal-body">
          <!-- Shortlist Control Section -->
          <div class="nsu-shortlist-section">
            <div class="nsu-shortlist-header-line">
              <strong>Shortlisted Courses &amp; Faculties for This Semester:</strong>
              <div class="nsu-shortlist-input-row">
                <input type="text" id="nsu-shortlist-add-input" placeholder="Add course:faculty or course:faculty:sec (e.g. CSE115:NvA or CSE115:NvA:1)..." autocomplete="off" />
                <button type="button" class="nsu-btn nsu-btn-primary" id="nsu-shortlist-add-btn">+ Add</button>
              </div>
            </div>

            <div class="nsu-shortlist-chips" id="nsu-shortlist-chips-container">
              <!-- Rendered dynamically -->
            </div>

            <!-- Specific Faculty Options Section -->
            <div class="nsu-faculty-selection-box" id="nsu-faculty-selection-box" style="display:none;">
              <div class="nsu-faculty-selection-header">
                <div class="nsu-faculty-header-title">
                  <span>👨‍🏫 <strong>Specific Faculty Options:</strong></span>
                  <span class="nsu-faculty-header-sub">Select which shortlisted faculties to include in your routine</span>
                </div>
                <div class="nsu-faculty-header-actions">
                  <button type="button" class="nsu-btn-text" id="nsu-btn-faculty-select-all" title="Reset all courses to include all their shortlisted faculties">
                    ✨ Select All Faculties
                  </button>
                </div>
              </div>
              <div class="nsu-faculty-courses-grid" id="nsu-faculty-courses-grid">
                <!-- Injected dynamically based on shortlisted courses & faculties -->
              </div>
            </div>

            <div class="nsu-generator-actions">
              <div class="nsu-toggles">
                <label class="nsu-checkbox-label">
                  <input type="checkbox" id="nsu-sched-open-only" checked />
                  <span>Available Seats Only (&gt; 0)</span>
                </label>
                <label class="nsu-checkbox-label" title="Ensures no two classes in the routine have their final exams on the same day (e.g. classes with 1-slot gaps on the same day).">
                  <input type="checkbox" id="nsu-sched-avoid-finals" />
                  <span>🎓 Avoid Same-Day Finals</span>
                </label>
              </div>

              <div class="nsu-actions">
                <button type="button" class="nsu-btn nsu-btn-outline" id="nsu-btn-modal-view-table" title="View these shortlisted courses in the main table">
                  🔍 View in Table
                </button>
                <button type="button" class="nsu-btn nsu-btn-secondary" id="nsu-btn-clear-shortlist">
                  🗑️ Clear All
                </button>
                <button type="button" class="nsu-btn nsu-btn-amber" id="nsu-btn-generate-schedules" title="Generate clash-free routines using your chosen faculty preferences">
                  ⚡ Generate with Selected Faculties
                </button>
              </div>
            </div>
          </div>

          <!-- Schedule Viewer Area -->
          <div id="nsu-schedule-viewer" style="display:none; flex-direction:column; gap:12px;">
            <!-- Navigator Bar -->
            <div class="nsu-schedule-nav-bar">
              <div class="nsu-nav-controls">
                <button type="button" class="nsu-btn nsu-btn-secondary" id="nsu-sched-prev">&larr; Prev</button>
                <span class="nsu-schedule-counter" id="nsu-sched-counter">Schedule 1 of 1</span>
                <button type="button" class="nsu-btn nsu-btn-secondary" id="nsu-sched-next">Next &rarr;</button>
              </div>

              <div class="nsu-schedule-summary-tags" id="nsu-sched-tags">
                <!-- Tags: Days, Seats -->
              </div>

              <div class="nsu-actions">
                <button type="button" class="nsu-btn nsu-btn-success" id="nsu-sched-copy-codes" title="Copy course & section codes for advising">
                  📋 Copy for Advising
                </button>
                <button type="button" class="nsu-btn nsu-btn-outline" id="nsu-sched-export-csv">
                  📥 Export CSV
                </button>
              </div>
            </div>

            <!-- Weekly Calendar Grid -->
            <div class="nsu-weekly-grid" id="nsu-weekly-calendar">
              <!-- Injected dynamically -->
            </div>

            <!-- Table breakdown of chosen schedule -->
            <table class="nsu-modal-table">
              <thead>
                <tr>
                  <th>Course</th>
                  <th>Section</th>
                  <th>Faculty</th>
                  <th>Time</th>
                  <th>Room</th>
                  <th>Seats</th>
                </tr>
              </thead>
              <tbody id="nsu-sched-table-body">
                <!-- Injected dynamically -->
              </tbody>
            </table>
          </div>

          <!-- Empty or Notice State -->
          <div id="nsu-sched-placeholder" style="text-align:center; padding:30px; color:#64748b;">
            <p style="font-size:1.1rem; font-weight:600; color:#003e7e; margin-bottom:6px;">Build your ideal clash-free routine in 1 click!</p>
            <p>Click <strong>+ Shortlist</strong> on the course rows of your preferred faculties (its lab will be shortlisted automatically), then click <strong>Generate Clash-Free Schedules</strong>.</p>
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(modalOverlay);

    // Bind modal events
    document.getElementById('nsu-modal-close-btn').addEventListener('click', closeScheduleModal);
    modalOverlay.addEventListener('click', (e) => {
      if (e.target === modalOverlay) closeScheduleModal();
    });

    const addInput = document.getElementById('nsu-shortlist-add-input');
    const addBtn = document.getElementById('nsu-shortlist-add-btn');

    const handleAdd = () => {
      const val = addInput.value.trim();
      if (!val) return;
      const tokens = val.split(/[\s,]+/).filter(Boolean);

      tokens.forEach(t => {
        let coursePart = t.toUpperCase();
        let facPart = '';
        let secPart = '';
        if (t.includes(':')) {
          const parts = t.split(':');
          coursePart = parts[0].trim().toUpperCase();
          facPart = (parts[1] || '').trim().toUpperCase();
          secPart = (parts[2] || '').trim();
        }

        // If faculty was not provided, find first available section for that course
        if (!facPart && dataTableInstance) {
          const allRows = dataTableInstance.rows().data();
          for (let i = 0; i < allRows.length; i++) {
            if ((allRows[i][1] || '').trim().toUpperCase() === coursePart) {
              facPart = (allRows[i][3] || '').trim().toUpperCase();
              if (!secPart) secPart = (allRows[i][2] || '').trim();
              break;
            }
          }
        }

        if (coursePart && facPart) {
          const secs = secPart ? secPart.split(',').map(s => s.trim()).filter(Boolean) : [];
          const timingMode = secs.length === 0 ? 'all_faculty' : (secs.length === 1 ? 'specific' : 'multiple');
          applyShortlistSelection(coursePart, secs, facPart, timingMode, true);
        }
      });

      addInput.value = '';
    };

    addBtn.addEventListener('click', handleAdd);
    addInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') handleAdd();
    });

    const modalViewTableBtn = document.getElementById('nsu-btn-modal-view-table');
    if (modalViewTableBtn) {
      modalViewTableBtn.addEventListener('click', () => {
        closeScheduleModal();
        toggleShowShortlisted(true);
        const tbl = document.getElementById('offeredCourseTbl');
        if (tbl) tbl.scrollIntoView({ behavior: 'smooth' });
      });
    }

    const selectAllFacBtn = document.getElementById('nsu-btn-faculty-select-all');
    if (selectAllFacBtn) {
      selectAllFacBtn.addEventListener('click', () => {
        const displayCourses = getDisplayCoursesForFacultySelection();
        displayCourses.forEach((info, course) => {
          selectedFacultyPreferences.set(course, new Set(info.faculties));
        });
        renderFacultySelectionUI();
        showToast('All shortlisted faculties selected!');
      });
    }

    document.getElementById('nsu-btn-clear-shortlist').addEventListener('click', () => {
      shortlistedItems.clear();
      selectedFacultyPreferences.clear();
      saveShortlist();
      decorateSeatsBadges();
      renderShortlistChips();
      document.getElementById('nsu-schedule-viewer').style.display = 'none';
      document.getElementById('nsu-sched-placeholder').style.display = 'block';
      showToast('Shortlist cleared');
    });

    document.getElementById('nsu-btn-generate-schedules').addEventListener('click', () => {
      runScheduleGeneration();
    });

    document.getElementById('nsu-sched-prev').addEventListener('click', () => {
      if (currentScheduleIndex > 0) {
        currentScheduleIndex--;
        displayCurrentSchedule();
      }
    });

    document.getElementById('nsu-sched-next').addEventListener('click', () => {
      if (currentScheduleIndex < generatedSchedules.length - 1) {
        currentScheduleIndex++;
        displayCurrentSchedule();
      }
    });

    document.getElementById('nsu-sched-copy-codes').addEventListener('click', () => {
      if (!generatedSchedules[currentScheduleIndex]) return;
      const sch = generatedSchedules[currentScheduleIndex];
      const text = sch.map(s => `${s.course}.${s.section} (${s.faculty})`).join(', ');
      navigator.clipboard.writeText(text).then(() => {
        showToast('📋 Copied advising codes to clipboard!');
      });
    });

    document.getElementById('nsu-sched-export-csv').addEventListener('click', () => {
      if (!generatedSchedules[currentScheduleIndex]) return;
      exportSingleScheduleCSV(generatedSchedules[currentScheduleIndex]);
    });

    const chkAvoid = document.getElementById('nsu-sched-avoid-finals');
    if (chkAvoid) {
      if (localStorage.getItem('nsu_avoid_same_day_finals') === '1') {
        chkAvoid.checked = true;
      }
      chkAvoid.addEventListener('change', () => {
        try {
          localStorage.setItem('nsu_avoid_same_day_finals', chkAvoid.checked ? '1' : '0');
        } catch (e) {}
      });
    }
  }

  function openScheduleModal() {
    injectScheduleModal();
    renderShortlistChips();
    renderFacultySelectionUI();
    const modal = document.getElementById('nsu-schedule-modal');
    if (modal) modal.classList.add('open');
  }

  function closeScheduleModal() {
    const modal = document.getElementById('nsu-schedule-modal');
    if (modal) modal.classList.remove('open');
  }

  function getDisplayCoursesForFacultySelection() {
    const coursesMap = new Map();
    shortlistedItems.forEach(item => {
      // If it's a linked lab, skip top-level entry (it follows its parent theory course)
      if (item.isLab && item.linkedTheoryKey && shortlistedItems.has(item.linkedTheoryKey)) {
        return;
      }
      const course = (item.course || '').trim().toUpperCase();
      const fac = (item.faculty || '').trim().toUpperCase();
      if (!course) return;

      if (!coursesMap.has(course)) {
        coursesMap.set(course, {
          course: course,
          isLab: !!item.isLab,
          linkedLabCode: null,
          faculties: new Set()
        });
      }
      const entry = coursesMap.get(course);
      if (fac) entry.faculties.add(fac);

      if (item.linkedLabKey && shortlistedItems.has(item.linkedLabKey)) {
        const labItem = shortlistedItems.get(item.linkedLabKey);
        if (labItem && labItem.course) {
          entry.linkedLabCode = labItem.course;
        }
      }
    });
    return coursesMap;
  }

  function renderFacultySelectionUI() {
    const box = document.getElementById('nsu-faculty-selection-box');
    const grid = document.getElementById('nsu-faculty-courses-grid');
    if (!box || !grid) return;

    if (shortlistedItems.size === 0) {
      box.style.display = 'none';
      selectedFacultyPreferences.clear();
      return;
    }

    const displayCourses = getDisplayCoursesForFacultySelection();
    if (displayCourses.size === 0) {
      box.style.display = 'none';
      return;
    }

    box.style.display = 'flex';

    // Synchronize selectedFacultyPreferences with currently shortlisted courses & faculties
    displayCourses.forEach((info, course) => {
      if (!selectedFacultyPreferences.has(course)) {
        selectedFacultyPreferences.set(course, new Set(info.faculties));
      } else {
        const currentSet = selectedFacultyPreferences.get(course);
        // Remove any faculties that are no longer shortlisted
        for (const f of currentSet) {
          if (!info.faculties.has(f)) {
            currentSet.delete(f);
          }
        }
        // If empty, restore all
        if (currentSet.size === 0) {
          info.faculties.forEach(f => currentSet.add(f));
        }
      }
    });

    for (const c of selectedFacultyPreferences.keys()) {
      if (!displayCourses.has(c)) {
        selectedFacultyPreferences.delete(c);
      }
    }

    let html = '';
    displayCourses.forEach((info, course) => {
      const facList = Array.from(info.faculties).sort();
      const selectedSet = selectedFacultyPreferences.get(course) || new Set(facList);

      let dropdownVal = '__ALL__';
      if (selectedSet.size === facList.length) {
        dropdownVal = '__ALL__';
      } else if (selectedSet.size === 1) {
        dropdownVal = Array.from(selectedSet)[0];
      } else {
        dropdownVal = '__CUSTOM__';
      }

      html += `
        <div class="nsu-faculty-course-card" data-course="${escapeHTML(course)}">
          <div class="nsu-faculty-course-badge-wrap">
            <span class="nsu-course-badge">${escapeHTML(course)}</span>
            ${info.linkedLabCode ? `<span class="nsu-lab-badge">+ ${escapeHTML(info.linkedLabCode)}</span>` : ''}
            <span class="nsu-faculty-count-badge">${facList.length} faculty option${facList.length > 1 ? 's' : ''}</span>
          </div>

          <div class="nsu-faculty-control-group">
            <div class="nsu-faculty-select-wrap">
              <label class="nsu-faculty-label">Faculty:</label>
              <select class="nsu-faculty-dropdown" data-course="${escapeHTML(course)}">
                <option value="__ALL__" ${dropdownVal === '__ALL__' ? 'selected' : ''}>✨ Any Shortlisted (${facList.join(', ')})</option>
                ${facList.map(f => `
                  <option value="${escapeHTML(f)}" ${dropdownVal === f ? 'selected' : ''}>👨‍🏫 Only ${escapeHTML(f)}</option>
                `).join('')}
                ${dropdownVal === '__CUSTOM__' ? `<option value="__CUSTOM__" selected>⚙️ Custom (${selectedSet.size} of ${facList.length})</option>` : ''}
              </select>
            </div>

            <div class="nsu-faculty-pills-list" data-course="${escapeHTML(course)}">
              ${facList.map(f => {
                const isChecked = selectedSet.has(f);
                return `
                  <label class="nsu-faculty-pill ${isChecked ? 'active' : ''}" title="Include ${escapeHTML(f)} for ${escapeHTML(course)}">
                    <input type="checkbox" data-course="${escapeHTML(course)}" data-faculty="${escapeHTML(f)}" ${isChecked ? 'checked' : ''} />
                    <span>${escapeHTML(f)}</span>
                  </label>
                `;
              }).join('')}
            </div>
          </div>
        </div>
      `;
    });

    grid.innerHTML = html;

    // Bind dropdown change events
    grid.querySelectorAll('.nsu-faculty-dropdown').forEach(select => {
      select.addEventListener('change', () => {
        const course = select.getAttribute('data-course');
        const val = select.value;
        const info = displayCourses.get(course);
        if (!info) return;

        const facList = Array.from(info.faculties);
        let selectedSet = selectedFacultyPreferences.get(course);
        if (!selectedSet) {
          selectedSet = new Set();
          selectedFacultyPreferences.set(course, selectedSet);
        }

        if (val === '__ALL__') {
          selectedSet.clear();
          facList.forEach(f => selectedSet.add(f));
        } else if (val === '__CUSTOM__') {
          // Keep current custom selection
        } else {
          selectedSet.clear();
          selectedSet.add(val);
        }

        // Sync pills
        const card = grid.querySelector(`.nsu-faculty-course-card[data-course="${CSS.escape(course)}"]`);
        if (card) {
          card.querySelectorAll('input[type="checkbox"]').forEach(chk => {
            const f = chk.getAttribute('data-faculty');
            chk.checked = selectedSet.has(f);
            const pillLabel = chk.closest('.nsu-faculty-pill');
            if (pillLabel) {
              if (chk.checked) pillLabel.classList.add('active');
              else pillLabel.classList.remove('active');
            }
          });
        }
      });
    });

    // Bind checkbox change events
    grid.querySelectorAll('input[type="checkbox"]').forEach(chk => {
      chk.addEventListener('change', () => {
        const course = chk.getAttribute('data-course');
        const fac = chk.getAttribute('data-faculty');
        const info = displayCourses.get(course);
        if (!info) return;

        const facList = Array.from(info.faculties);
        let selectedSet = selectedFacultyPreferences.get(course);
        if (!selectedSet) {
          selectedSet = new Set(facList);
          selectedFacultyPreferences.set(course, selectedSet);
        }

        if (chk.checked) {
          selectedSet.add(fac);
        } else {
          if (selectedSet.size <= 1) {
            chk.checked = true;
            showToast(`At least one faculty must be selected for ${course}!`);
            return;
          }
          selectedSet.delete(fac);
        }

        const pillLabel = chk.closest('.nsu-faculty-pill');
        if (pillLabel) {
          if (chk.checked) pillLabel.classList.add('active');
          else pillLabel.classList.remove('active');
        }

        // Sync dropdown
        const card = grid.querySelector(`.nsu-faculty-course-card[data-course="${CSS.escape(course)}"]`);
        if (card) {
          const select = card.querySelector('.nsu-faculty-dropdown');
          if (select) {
            if (selectedSet.size === facList.length) {
              select.value = '__ALL__';
            } else if (selectedSet.size === 1) {
              select.value = Array.from(selectedSet)[0];
            } else {
              let customOpt = select.querySelector('option[value="__CUSTOM__"]');
              if (!customOpt) {
                customOpt = document.createElement('option');
                customOpt.value = '__CUSTOM__';
                select.appendChild(customOpt);
              }
              customOpt.textContent = `⚙️ Custom (${selectedSet.size} of ${facList.length})`;
              select.value = '__CUSTOM__';
            }
          }
        }
      });
    });
  }

  function renderShortlistChips() {
    const container = document.getElementById('nsu-shortlist-chips-container');
    if (!container) return;

    if (shortlistedItems.size === 0) {
      container.innerHTML = `<span style="color:#94a3b8; font-size:0.82rem; font-style:italic;">No courses shortlisted yet. Click '+ Shortlist' on any table row to choose timing options!</span>`;
      renderFacultySelectionUI();
      return;
    }

    let html = '';
    shortlistedItems.forEach((item, key) => {
      const labBadge = item.isLab ? '<span style="background:#e9d5ff; color:#6b21a8; font-size:0.68rem; font-weight:700; padding:1px 5px; border-radius:4px; margin-right:4px;">LAB</span>' : '';
      const secArr = item.sections && Array.isArray(item.sections) ? item.sections : (item.section ? [item.section] : []);

      let timingTagText = '';
      let timingTagTitle = '';

      if (item.timingMode === 'all_faculty') {
        timingTagText = '👨‍🏫 All Timings';
        timingTagTitle = `Allows all timings of ${item.faculty}. Click to customize sections.`;
      } else if (secArr.length === 1) {
        timingTagText = `⏱️ Sec ${secArr[0]} Only`;
        timingTagTitle = `Locked to Sec ${secArr[0]}. Click to customize sections.`;
      } else if (secArr.length > 1) {
        timingTagText = `⏱️ Sec ${secArr.join(', ')} (${secArr.length})`;
        timingTagTitle = `Allowed sections: Sec ${secArr.join(', ')}. Click to customize sections.`;
      } else {
        timingTagText = '👨‍🏫 All Timings';
        timingTagTitle = 'Click to customize sections';
      }

      const timingBtn = `<button type="button" class="nsu-timing-tag" data-action="edit-sections" data-key="${escapeHTML(key)}" data-course="${escapeHTML(item.course)}" data-faculty="${escapeHTML(item.faculty)}" data-section="${escapeHTML(secArr[0] || '')}" title="${escapeHTML(timingTagTitle)}">${escapeHTML(timingTagText)}</button>`;

      html += `
        <span class="nsu-shortlist-chip ${item.isLab ? 'nsu-chip-lab' : ''}">
          ${labBadge}
          <span><strong>${escapeHTML(item.course)}</strong> (${escapeHTML(item.faculty)})</span>
          ${timingBtn}
          <button type="button" class="remove-btn" data-key="${escapeHTML(key)}" title="Remove">&times;</button>
        </span>
      `;
    });
    container.innerHTML = html;

    // Timing tag button in chip opens the section selector popover directly from modal!
    container.querySelectorAll('button[data-action="edit-sections"]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const course = btn.getAttribute('data-course');
        const faculty = btn.getAttribute('data-faculty');
        const section = btn.getAttribute('data-section');
        openShortlistPopover(btn, course, section, faculty);
      });
    });

    container.querySelectorAll('.remove-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const k = btn.getAttribute('data-key');
        const item = shortlistedItems.get(k);
        if (item) {
          removeShortlistEntry(item.course, item.faculty);
        }
      });
    });

    renderFacultySelectionUI();
  }

  // --- Clash Detection Logic ---
  function parseTimeToSlots(timeStr) {
    if (!timeStr || timeStr.trim().toUpperCase() === 'TBA') return [];
    const m = timeStr.trim().match(/^([A-Za-z]+)\s+(\d{1,2}):(\d{2})\s*([AP]M)\s*-\s*(\d{1,2}):(\d{2})\s*([AP]M)/i);
    if (!m) return [];

    const daysStr = m[1];
    const shS = m[2];
    const smS = m[3];
    const sp = m[4];
    const ehS = m[5];
    const emS = m[6];
    const ep = m[7];

    const days = daysStr.toUpperCase().split('').filter(d => 'SMTWRFA'.includes(d));

    let sh = parseInt(shS, 10);
    const sm = parseInt(smS, 10);
    const spU = sp.toUpperCase();
    if (spU === 'PM' && sh !== 12) sh += 12;
    else if (spU === 'AM' && sh === 12) sh = 0;
    const startMin = sh * 60 + sm;

    let eh = parseInt(ehS, 10);
    const em = parseInt(emS, 10);
    const epU = ep.toUpperCase();
    if (epU === 'PM' && eh !== 12) eh += 12;
    else if (epU === 'AM' && eh === 12) eh = 0;
    const endMin = eh * 60 + em;

    const rawTime = `${shS.padStart(2, '0')}:${smS} ${spU} - ${ehS.padStart(2, '0')}:${emS} ${epU}`;
    return days.map(d => ({ day: d, startMin, endMin, rawTime }));
  }

  function sectionsClash(secA, secB) {
    if (!secA._slots) secA._slots = parseTimeToSlots(secA.time);
    if (!secB._slots) secB._slots = parseTimeToSlots(secB.time);

    for (let i = 0; i < secA._slots.length; i++) {
      const sA = secA._slots[i];
      for (let j = 0; j < secB._slots.length; j++) {
        const sB = secB._slots[j];
        if (sA.day === sB.day) {
          // Overlap: startA < endB and startB < endA
          if (sA.startMin < sB.endMin && sB.startMin < sA.endMin) {
            return true;
          }
        }
      }
    }
    return false;
  }

  function isLabCourse(courseCode) {
    if (!courseCode) return false;
    const clean = courseCode.trim().toUpperCase();
    return clean.endsWith('L') || clean.endsWith('LAB');
  }

  function getFinalExamDayKey(section) {
    if (!section) return null;
    const course = (section.course || '').trim().toUpperCase();
    if (isLabCourse(course)) return null;

    const timeStr = (section.time || '').trim();
    if (!timeStr || timeStr.toUpperCase() === 'TBA') return null;

    const slots = section._slots || parseTimeToSlots(timeStr);
    if (!slots || slots.length === 0) return null;

    // Day cluster
    const daysSet = new Set(slots.map(s => s.day));
    let dayGroup = '';
    if (daysSet.has('S') && daysSet.has('T')) {
      dayGroup = 'ST';
    } else if (daysSet.has('R') && daysSet.has('A')) {
      dayGroup = 'ST'; // Treat RA as standard ST cluster at NSU
    } else if (daysSet.has('M') && daysSet.has('W')) {
      dayGroup = 'MW';
    } else if (daysSet.has('S')) {
      dayGroup = 'S';
    } else if (daysSet.has('M')) {
      dayGroup = 'M';
    } else if (daysSet.has('T')) {
      dayGroup = 'T';
    } else if (daysSet.has('W')) {
      dayGroup = 'W';
    } else if (daysSet.has('R')) {
      dayGroup = 'R';
    } else if (daysSet.has('A')) {
      dayGroup = 'A';
    } else {
      dayGroup = Array.from(daysSet).sort().join('');
    }

    const startMin = slots[0].startMin;
    let parity = 'ODD';
    if (startMin >= 450 && startMin <= 540) {        // ~08:00 AM (Slot 1)
      parity = 'ODD';
    } else if (startMin >= 550 && startMin <= 640) { // ~09:40 AM (Slot 2)
      parity = 'EVEN';
    } else if (startMin >= 650 && startMin <= 740) { // ~11:20 AM (Slot 3)
      parity = 'ODD';
    } else if (startMin >= 750 && startMin <= 840) { // ~01:00 PM (Slot 4)
      parity = 'EVEN';
    } else if (startMin >= 850 && startMin <= 940) { // ~02:40 PM (Slot 5)
      parity = 'ODD';
    } else if (startMin >= 950 && startMin <= 1040) { // ~04:20 PM (Slot 6)
      parity = 'EVEN';
    } else if (startMin >= 1050 && startMin <= 1140) { // ~06:00 PM (Slot 7)
      parity = 'ODD';
    } else {
      const slotNum = Math.floor((startMin - 480) / 100) + 1;
      parity = (slotNum % 2 !== 0) ? 'ODD' : 'EVEN';
    }

    return `${dayGroup}_${parity}`;
  }

  function sectionsShareFinalExamDay(secA, secB) {
    const courseA = (secA.course || '').trim().toUpperCase();
    const courseB = (secB.course || '').trim().toUpperCase();
    if (courseA === courseB) return false;

    const keyA = getFinalExamDayKey(secA);
    const keyB = getFinalExamDayKey(secB);
    if (!keyA || !keyB) return false;
    return keyA === keyB;
  }

  function findSameDayFinalPairs(schedule) {
    const clashes = [];
    for (let i = 0; i < schedule.length; i++) {
      for (let j = i + 1; j < schedule.length; j++) {
        if (sectionsShareFinalExamDay(schedule[i], schedule[j])) {
          clashes.push({ secA: schedule[i], secB: schedule[j] });
        }
      }
    }
    return clashes;
  }

  function getAllSectionsForCourse(courseCode, openOnly, itemsForCourse = null) {
    const codeUpper = courseCode.trim().toUpperCase();
    const allRows = dataTableInstance.rows().data();
    const matched = [];

    for (let i = 0; i < allRows.length; i++) {
      const row = allRows[i];
      const c = (row[1] || '').trim().toUpperCase();
      if (c === codeUpper || c.startsWith(codeUpper + '/') || c.endsWith('/' + codeUpper) || c.includes('/' + codeUpper + '/')) {
        const seats = parseInt((row[6] || '').toString().trim(), 10) || 0;
        if (openOnly && seats <= 0) continue;

        const fac = (row[3] || '').trim().toUpperCase();
        const sec = (row[2] || '').trim();

        if (itemsForCourse && itemsForCourse.length > 0) {
          const matchesAnyRule = itemsForCourse.some(rule => {
            if (rule.faculty && rule.faculty !== fac) return false;
            if (rule.timingMode === 'specific' && rule.section && rule.section !== sec) return false;
            return true;
          });
          if (!matchesAnyRule) continue;
        }

        matched.push({
          serial: (row[0] || '').toString().trim(),
          course: (row[1] || '').toString().trim(),
          section: sec,
          faculty: fac,
          time: (row[4] || '').toString().trim().replace(/\s+/g, ' '),
          room: (row[5] || '').toString().trim(),
          seats: seats
        });
      }
    }
    return matched;
  }

  function runScheduleGeneration() {
    if (shortlistedItems.size === 0) {
      showToast('Please shortlist at least one course first!');
      return;
    }

    const openOnly = document.getElementById('nsu-sched-open-only').checked;
    const avoidSameDayFinals = document.getElementById('nsu-sched-avoid-finals') ? document.getElementById('nsu-sched-avoid-finals').checked : false;

    // Filter shortlisted items based on user's selected faculty preferences
    const activeItems = [];
    shortlistedItems.forEach((item, key) => {
      // Linked labs will be included along with their parent theory course
      if (item.isLab && item.linkedTheoryKey && shortlistedItems.has(item.linkedTheoryKey)) {
        return;
      }

      const courseCode = (item.course || '').trim().toUpperCase();
      const fac = (item.faculty || '').trim().toUpperCase();
      const prefs = selectedFacultyPreferences.get(courseCode);

      // If user selected specific faculties for this course, check if item.faculty is included
      if (prefs && prefs.size > 0 && !prefs.has(fac)) {
        return; // Excluded by user faculty preference
      }

      // Include this theory or standalone lab item
      activeItems.push(item);

      // Include its linked lab if present
      if (item.linkedLabKey && shortlistedItems.has(item.linkedLabKey)) {
        activeItems.push(shortlistedItems.get(item.linkedLabKey));
      }
    });

    if (activeItems.length === 0) {
      showToast('No courses match your selected faculty preferences! Please select at least one faculty.');
      return;
    }

    // Group active items by course code -> Array of rules
    const courseItemsMap = new Map();
    activeItems.forEach(item => {
      if (!courseItemsMap.has(item.course)) {
        courseItemsMap.set(item.course, []);
      }
      courseItemsMap.get(item.course).push(item);
    });

    // Gather sections restricted to chosen faculties and timings
    const groups = [];
    for (const [course, items] of courseItemsMap.entries()) {
      const secs = getAllSectionsForCourse(course, openOnly, items);

      if (secs.length === 0) {
        const desc = items.map(it => it.timingMode === 'specific' ? `${it.faculty} Sec ${it.section}` : `${it.faculty}`).join(' / ');
        showToast(`No sections found for ${course} (${desc})!`);
        const placeholder = document.getElementById('nsu-sched-placeholder');
        placeholder.innerHTML = `
          <p style="color:#cf222e; font-weight:700;">⚠️ Cannot generate schedule</p>
          <p>Course <strong>${escapeHTML(course)}</strong> with preference [${escapeHTML(desc)}] has 0 sections available${openOnly ? ' with open seats' : ''}.</p>
          <p style="font-size:0.8rem; color:#64748b;">Tip: Try choosing another faculty option in the "Specific Faculty Options" section above or unchecking "Available Seats Only".</p>
        `;
        placeholder.style.display = 'block';
        document.getElementById('nsu-schedule-viewer').style.display = 'none';
        return;
      }

      secs.forEach(s => { s._slots = parseTimeToSlots(s.time); });
      groups.push({ course, sections: secs, items });
    }

    // Sort groups by sections count ascending (most constrained first = faster search)
    groups.sort((a, b) => a.sections.length - b.sections.length);

    const validSchedules = [];
    const maxResults = 100;

    function backtrack(idx, current) {
      if (idx === groups.length) {
        validSchedules.push([...current]);
        return;
      }
      const candidates = groups[idx].sections;
      for (let i = 0; i < candidates.length; i++) {
        const sec = candidates[i];
        let clash = false;
        for (let j = 0; j < current.length; j++) {
          if (sectionsClash(sec, current[j])) {
            clash = true;
            break;
          }
          if (avoidSameDayFinals && sectionsShareFinalExamDay(sec, current[j])) {
            clash = true;
            break;
          }
        }
        if (!clash) {
          current.push(sec);
          backtrack(idx + 1, current);
          current.pop();
          if (validSchedules.length >= maxResults) return;
        }
      }
    }

    backtrack(0, []);

    if (validSchedules.length === 0) {
      const placeholder = document.getElementById('nsu-sched-placeholder');
      const finalsHint = avoidSameDayFinals
        ? '<p style="font-size:0.85rem; color:#b45309; margin-top:6px;">💡 Note: <strong>Avoid Same-Day Finals</strong> is enabled. Try unchecking it to see schedules where finals occur on the same day.</p>'
        : '';
      placeholder.innerHTML = `
        <p style="color:#cf222e; font-weight:700;">⚠️ No Clash-Free Schedules Found</p>
        <p>The sections of your shortlisted faculties have conflicting class times with each other.</p>
        ${finalsHint}
        <p style="font-size:0.82rem; color:#64748b;">Tip: Try toggling specific section locks to "All Timings" using the chips above, or unchecking "Available Seats Only".</p>
      `;
      placeholder.style.display = 'block';
      document.getElementById('nsu-schedule-viewer').style.display = 'none';
      return;
    }

    // Sort schedules
    validSchedules.forEach(sch => {
      const days = new Set();
      let allOpen = true;
      let minSeats = 999;
      sch.forEach(s => {
        s._slots.forEach(sl => days.add(sl.day));
        if (s.seats <= 0) allOpen = false;
        if (s.seats < minSeats) minSeats = s.seats;
      });
      sch._daysCount = days.size;
      sch._daysSet = days;
      sch._allOpen = allOpen;
      sch._minSeats = minSeats === 999 ? 0 : minSeats;
      sch._finalClashes = findSameDayFinalPairs(sch);
      sch._hasFinalClash = sch._finalClashes.length > 0;
    });

    validSchedules.sort((a, b) => {
      if (a._allOpen !== b._allOpen) return a._allOpen ? -1 : 1;
      if (a._hasFinalClash !== b._hasFinalClash) return a._hasFinalClash ? 1 : -1;
      if (a._daysCount !== b._daysCount) return a._daysCount - b._daysCount;
      return b._minSeats - a._minSeats;
    });

    generatedSchedules = validSchedules;
    currentScheduleIndex = 0;

    document.getElementById('nsu-sched-placeholder').style.display = 'none';
    document.getElementById('nsu-schedule-viewer').style.display = 'flex';
    displayCurrentSchedule();
    showToast(`⚡ Generated ${validSchedules.length} conflict-free schedule(s)!`);
  }

  function displayCurrentSchedule() {
    if (!generatedSchedules[currentScheduleIndex]) return;
    const sch = generatedSchedules[currentScheduleIndex];
    const total = generatedSchedules.length;

    // Update Nav
    document.getElementById('nsu-sched-counter').textContent = `Schedule ${currentScheduleIndex + 1} of ${total}`;

    const tagsEl = document.getElementById('nsu-sched-tags');
    const daysArr = DAYS_ORDER.filter(d => sch._daysSet.has(d)).map(d => DAY_NAMES[d].slice(0, 3));
    let finalsTag = '';
    if (sch._hasFinalClash) {
      const clashCourses = sch._finalClashes.map(c => `${c.secA.course} & ${c.secB.course}`).join(', ');
      finalsTag = `<span class="nsu-tag nsu-tag-finals-clash" title="These courses share a final exam day due to a 1-slot gap on the same day: ${escapeHTML(clashCourses)}">⚠️ Same-Day Finals: ${escapeHTML(clashCourses)}</span>`;
    } else {
      finalsTag = `<span class="nsu-tag nsu-tag-finals-ok" title="All theory courses have finals on separate days!">✅ Finals Spread Out (No Same-Day Finals)</span>`;
    }

    tagsEl.innerHTML = `
      <span class="nsu-tag nsu-tag-days">📅 ${sch._daysCount} Days on Campus (${daysArr.join(', ')})</span>
      <span class="nsu-tag ${sch._allOpen ? 'nsu-tag-open' : 'nsu-tag-full'}">
        ${sch._allOpen ? '🟢 All Sections Open' : '🔴 Some Sections Full'} (${sch._minSeats} min seats)
      </span>
      ${finalsTag}
    `;

    // Render Weekly Grid
    renderWeeklyCalendar(sch);

    // Render Table Body
    const tbody = document.getElementById('nsu-sched-table-body');
    let tbodyHtml = '';
    sch.forEach(s => {
      const badgeClass = s.seats > 0 ? 'nsu-seat-open' : (s.seats === 0 ? 'nsu-seat-full' : 'nsu-seat-waitlist');
      const badgeText = s.seats > 0 ? `${s.seats} open` : (s.seats === 0 ? 'FULL' : `${s.seats} WL`);
      tbodyHtml += `
        <tr>
          <td><strong style="color:#003e7e;">${escapeHTML(s.course)}</strong></td>
          <td>Sec ${escapeHTML(s.section)}</td>
          <td><strong>${escapeHTML(s.faculty)}</strong></td>
          <td>${escapeHTML(s.time)}</td>
          <td>${escapeHTML(s.room)}</td>
          <td><span class="nsu-seat-badge ${badgeClass}">${badgeText}</span></td>
        </tr>
      `;
    });
    tbody.innerHTML = tbodyHtml;
  }

  function renderWeeklyCalendar(schedule) {
    const calendarEl = document.getElementById('nsu-weekly-calendar');
    if (!calendarEl) return;

    // Course to color class mapping
    const courseColorMap = {};
    let colorIdx = 0;
    schedule.forEach(s => {
      if (courseColorMap[s.course] === undefined) {
        courseColorMap[s.course] = colorIdx % 6;
        colorIdx++;
      }
    });

    // Group items by day
    const dayMap = { 'S': [], 'M': [], 'T': [], 'W': [], 'R': [], 'A': [] };
    schedule.forEach(sec => {
      const slots = sec._slots || parseTimeToSlots(sec.time);
      slots.forEach(sl => {
        if (dayMap[sl.day]) {
          dayMap[sl.day].push({
            course: sec.course,
            section: sec.section,
            faculty: sec.faculty,
            room: sec.room,
            time: sl.rawTime,
            startMin: sl.startMin,
            colorClass: `nsu-color-${courseColorMap[sec.course]}`,
            seats: sec.seats
          });
        }
      });
    });

    // Sort items by startMin
    DAYS_ORDER.forEach(d => {
      dayMap[d].sort((a, b) => a.startMin - b.startMin);
    });

    let gridHtml = '';
    DAYS_ORDER.forEach(d => {
      const dayName = DAY_NAMES[d];
      const classes = dayMap[d];

      gridHtml += `
        <div class="nsu-day-col">
          <div class="nsu-day-header">${dayName}</div>
          <div class="nsu-day-classes">
      `;

      if (classes.length === 0) {
        gridHtml += `<div class="nsu-day-off-banner">🌴 Day Off</div>`;
      } else {
        classes.forEach(c => {
          gridHtml += `
            <div class="nsu-class-card ${c.colorClass}">
              <div class="nsu-class-card-top">
                <span class="nsu-class-title">${escapeHTML(c.course)}</span>
                <span class="nsu-class-sec">Sec ${escapeHTML(c.section)}</span>
              </div>
              <div style="display:flex; justify-content:space-between; align-items:center;">
                <span class="nsu-class-faculty">👨‍🏫 ${escapeHTML(c.faculty)}</span>
                <span class="nsu-class-room">📍 ${escapeHTML(c.room)}</span>
              </div>
              <div class="nsu-class-time">🕒 ${escapeHTML(c.time)}</div>
            </div>
          `;
        });
      }

      gridHtml += `
          </div>
        </div>
      `;
    });

    calendarEl.innerHTML = gridHtml;
  }

  function exportSingleScheduleCSV(schedule) {
    const headers = ['Course', 'Section', 'Faculty', 'Time', 'Room', 'Seats'];
    const rows = [headers.map(h => `"${h}"`).join(',')];

    schedule.forEach(s => {
      rows.push([
        `"${s.course}"`,
        `"${s.section}"`,
        `"${s.faculty}"`,
        `"${s.time}"`,
        `"${s.room}"`,
        `"${s.seats}"`
      ].join(','));
    });

    const csvContent = '\uFEFF' + rows.join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `nsu_routine_schedule_${currentScheduleIndex + 1}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    showToast(`Downloaded Schedule #${currentScheduleIndex + 1} CSV!`);
  }

  function escapeHTML(str) {
    if (!str) return '';
    return str
      .toString()
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  // Close popover when clicking outside or pressing Escape
  document.addEventListener('click', (e) => {
    if (activeShortlistPopover && !activeShortlistPopover.contains(e.target) && (!activeShortlistPopover._anchorBtn || !activeShortlistPopover._anchorBtn.contains(e.target))) {
      closeShortlistPopover();
    }
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closeShortlistPopover();
    }
  });

  // Start initialization
  initWhenReady();
})();

