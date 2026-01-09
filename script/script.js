// Top-level state (safe defaults)
let allEvents = [];
let calendar = null;
let calendarInitialized = false;
let listInitialized = false;

// Toggle page visibility and ensure FullCalendar lays out correctly
function showPage(pageId) {
  document
    .querySelectorAll(".page")
    .forEach((page) => page.classList.remove("active"));
  const pageEl = document.getElementById(pageId);
  if (!pageEl) return;
  pageEl.classList.add("active");

  if (pageId !== "Course_Catalogue") return;

  // Ensure calendar is initialized once the container is visible
  if (!window.calendar) {
    // run on next frame so the class change is applied
    requestAnimationFrame(() => initCalendar());
    return;
  }

  // Refresh helper: update size, render fallback, then dispatch resize event
  const refreshCalendar = () => {
    try {
      if (typeof window.calendar.updateSize === "function") {
        window.calendar.updateSize();
      } else if (typeof window.calendar.render === "function") {
        window.calendar.render();
      }

      // Final fallback: trigger a window resize event to force any listeners to recalc
      // (some FullCalendar builds listen for resize)
      try {
        window.dispatchEvent(new Event("resize"));
      } catch (e) {
        // older browsers: create and dispatch legacy event
        const evt = document.createEvent("UIEvents");
        evt.initUIEvent("resize", true, false, window, 0);
        window.dispatchEvent(evt);
      }

      // If events look missing after resize, uncomment to re-add them:
      // window.calendar.removeAllEvents();
      // window.calendar.addEventSource(allEvents);
    } catch (err) {
      console.error("showPage: calendar refresh failed", err);
    }
  };

  // If page uses CSS transitions, wait for transitionend; otherwise refresh next frame
  const computed = getComputedStyle(pageEl);
  const hasTransition =
    computed.transitionDuration && computed.transitionDuration !== "0s";

  if (hasTransition) {
    const onEnd = (e) => {
      if (e.target === pageEl) {
        pageEl.removeEventListener("transitionend", onEnd);
        // give one frame after transition to ensure layout is stable
        requestAnimationFrame(refreshCalendar);
      }
    };
    pageEl.addEventListener("transitionend", onEnd);
    // fallback in case transitionend doesn't fire
    setTimeout(refreshCalendar, 300);
  } else {
    // no transition: update on next frame and again shortly after as a safety net
    requestAnimationFrame(refreshCalendar);
    setTimeout(refreshCalendar, 60);
  }
}

// Search input: filters pages + cards
function searchPages() {
  const query = document.getElementById("searchInput").value.toLowerCase();
  const pages = document.querySelectorAll(".page");
  const homePage = document.getElementById("home");

  // Show all cards inside the currently active page
  function showAllCards() {
    document.querySelectorAll(".text-start").forEach((card) => {
      card.style.display = "block";
    });
  }

  // Filter cards inside active page
  function filterCards(query) {
    document.querySelectorAll(".page.active .text-start").forEach((card) => {
      const match = card.innerText.toLowerCase().includes(query);
      card.style.display = match ? "block" : "none";
    });
  }

  if (query === "") {
    // Reset state
    showPage("home");
    pages.forEach((page) => {
      if (page.id !== "home") page.classList.remove("active");
    });
    showAllCards();
  } else {
    // Show only pages that match query
    homePage.classList.remove("active");

    pages.forEach((page) => {
      // 1. EXCLUSION CHECK
      // If the page is Home or Course_Catalogue, force hide and skip search logic
      if (
        page.id === "home" ||
        page.id === "Course_Catalogue" ||
        page.id === "Training_Rooms"
      ) {
        page.classList.remove("active");
        return; // Skip to the next iteration
      }

      // 2. SEARCH LOGIC (For all other pages)
      const match = page.innerText.toLowerCase().includes(query);
      page.classList.toggle("active", match);
    });

    filterCards(query);
  }
}

// Open a popup window with provided URL
function openPopup(url) {
  window.open(url, "popupWindow", "width=auto,height=auto,scrollbars=yes");
}

// ===== THEME SWITCHER =====
const themeSelector = document.getElementById("themeSelector");
themeSelector.addEventListener("change", function () {
  document.body.className = ""; // Clear existing theme classes
  document.body.classList.add("theme-" + this.value);
  if (isDarkMode) document.body.classList.add("dark-mode");
  localStorage.setItem("theme", this.value);
});

// ===== TEXT SIZE SWITCHER =====
function setTextSize(sizeClass) {
  document.body.classList.remove(
    "scale-small",
    "scale-medium",
    "scale-large",
    "scale-xlarge"
  );
  document.body.classList.add(sizeClass);
  localStorage.setItem("text-size", sizeClass);
}

// ===== RESTORE SETTINGS ON LOAD =====
window.addEventListener("DOMContentLoaded", () => {
  const savedTheme = localStorage.getItem("theme") || "blue";
  const savedSize = localStorage.getItem("text-size") || "scale-medium";
  isDarkMode = localStorage.getItem("dark-mode") === "true";

  themeSelector.value = savedTheme;
  document.body.classList.add("theme-" + savedTheme, savedSize);
});

// calendar.js

// --- Calendar helpers and initialization (rewritten) ---

/** Convert Excel serial date to JS Date (handles numbers and strings) */
function excelDateToJSDate(serial) {
  const n = Number(serial);
  if (!isFinite(n)) return new Date(NaN);
  const excelEpoch = Date.UTC(1899, 11, 30); // 1899-12-30 UTC
  return new Date(excelEpoch + Math.round(n * 86400000));
}

/** Load and normalize events from JSON (returns a Promise resolving to allEvents) */
async function loadEvents() {
  // Return cached events if already loaded
  if (Array.isArray(allEvents) && allEvents.length) return allEvents;

  try {
    const res = await fetch("Data/ClassList.json", { cache: "no-store" });
    if (!res.ok) throw new Error(`Failed to fetch events: ${res.status}`);
    const classData = await res.json();
    if (!Array.isArray(classData)) {
      allEvents = [];
      return allEvents;
    }

    allEvents = classData.map((item = {}) => {
      // Convert Excel serials to Date; guard against invalid values
      const startDate = excelDateToJSDate(item["Start Date"]);
      const endDate = excelDateToJSDate(item["End Date"]);

      const start = isNaN(startDate.getTime()) ? null : new Date(startDate);
      const end = isNaN(endDate.getTime()) ? null : new Date(endDate);

      // Parse times safely (HH:MM)
      if (start && item["Start Time"]) {
        const [hRaw = "0", mRaw = "0"] = String(item["Start Time"]).split(":");
        const h = parseInt(hRaw, 10) || 0;
        const m = parseInt(mRaw, 10) || 0;
        start.setHours(h, m, 0, 0);
      }
      if (end && item["End Time"]) {
        const [hRaw = "0", mRaw = "0"] = String(item["End Time"]).split(":");
        const h = parseInt(hRaw, 10) || 0;
        const m = parseInt(mRaw, 10) || 0;
        end.setHours(h, m, 0, 0);
      }

      return {
        title: item.Course || item.Title || "(Untitled)",
        start,
        end,
        extendedProps: item,
      };
    });

    // Filter out entries without a valid start date (FullCalendar expects Date or ISO)
    allEvents = allEvents.filter(
      (ev) => ev.start instanceof Date && !isNaN(ev.start.getTime())
    );

    return allEvents;
  } catch (err) {
    console.error("loadEvents error:", err);
    allEvents = [];
    return allEvents;
  }
}

function isVisible(el) {
  if (!el) return false;
  const style = getComputedStyle(el);
  if (
    style.display === "none" ||
    style.visibility === "hidden" ||
    style.opacity === "0"
  )
    return false;
  return el.getClientRects().length > 0;
}

function getVisibleById(id) {
  const els = document.querySelectorAll(`#${id}`);
  for (const el of els) {
    if (isVisible(el)) return el;
  }
  // fallback to first if none are visible
  return els[0] || null;
}

/** Initialize FullCalendar (id="calendar") */
// Rewritten initCalendar
function initCalendar() {
  if (calendarInitialized) return;
  calendarInitialized = true;

  // Configurable constants
  const SEARCH_MIN_LENGTH = 1; // set to 3 to require longer queries
  const DEBOUNCE_MS = 250;
  const LIST_VIEW_NAME = "listYear"; // change to listAll or listMonth if desired

  // Simple debounce helper
  function debounce(fn, wait) {
    let timer = null;
    return function (...args) {
      clearTimeout(timer);
      timer = setTimeout(() => fn.apply(this, args), wait);
    };
  }

  // Utility to compute min/max dates from an events array
  function getMinMaxDates(events) {
    if (!Array.isArray(events) || events.length === 0) return null;
    const times = events
      .map(
        (e) => e.start || e.startStr || e.date || (e._start ? e._start : null)
      )
      .filter(Boolean)
      .map((d) => new Date(d).getTime())
      .filter((t) => !Number.isNaN(t));
    if (times.length === 0) return null;
    return {
      min: new Date(Math.min(...times)),
      max: new Date(Math.max(...times)),
    };
  }

  // Helper to show/hide a no-results element if present
  function setNoResultsVisible(visible) {
    const el = document.getElementById("calendarNoResults");
    if (!el) return;
    el.style.display = visible ? "" : "none";
  }

  loadEvents()
    .then(() => {
      const calendarEl = document.getElementById("calendar");
      if (!calendarEl) {
        console.debug("initCalendar: #calendar element not found");
        return;
      }

      // Destroy existing instance if present (safe re-init)
      if (calendar && typeof calendar.destroy === "function") {
        try {
          calendar.destroy();
        } catch (e) {
          /* ignore */
        }
        calendar = null;
      }

      // Compute a visibleRange for a custom "listAll" if you ever want it
      const span = getMinMaxDates(allEvents);

      // Create calendar
      calendar = new FullCalendar.Calendar(calendarEl, {
        // Ensure you have the list plugin loaded in your build
        initialView: "timeGridWeek",
        headerToolbar: {
          left: "prev,next today",
          center: "title",
          right: "timeGridDay,timeGridWeek,dayGridMonth," + LIST_VIEW_NAME,
        },
        views: {
          // Example of a custom listAll view if you want to use it later
          listAll: {
            type: "list",
            buttonText: "All events",
            visibleRange: span
              ? function () {
                  // include last day by adding one day to end
                  return {
                    start: span.min,
                    end: new Date(span.max.getTime() + 24 * 60 * 60 * 1000),
                  };
                }
              : undefined,
          },
        },
        events: allEvents,
        eventClick(info) {
          try {
            info.jsEvent.preventDefault();
            showEventDetailsFromData(info.event.extendedProps);
          } catch (e) {
            console.error("calendar eventClick handler error:", e);
          }
        },
      });

      calendar.render();

      // Search/filter input handling
      const searchEl = document.getElementById("calendarSearch");
      let previousView = null;

      if (searchEl) {
        const onSearch = debounce(function () {
          const q = String(this.value || "")
            .toLowerCase()
            .trim();

          // Filter events
          const filtered = allEvents.filter((ev) => {
            const p = ev.extendedProps || {};
            return (
              (ev.title || "").toLowerCase().includes(q) ||
              (p.Category && String(p.Category).toLowerCase().includes(q)) ||
              (p["Last Updated By"] &&
                String(p["Last Updated By"]).toLowerCase().includes(q))
            );
          });

          try {
            // Update calendar events
            calendar.removeAllEvents();
            calendar.addEventSource(filtered);

            // Show/hide no results message
            setNoResultsVisible(filtered.length === 0);

            // Flip to list view when search begins, restore when cleared
            const currentView = calendar.view && calendar.view.type;
            if (q.length >= SEARCH_MIN_LENGTH) {
              if (currentView !== LIST_VIEW_NAME) {
                previousView = currentView || previousView;
                // If the list view is not present in your build, this will throw; ensure plugin is loaded
                calendar.changeView(LIST_VIEW_NAME);
              }
            } else {
              // empty query: restore previous view if we changed it
              if (previousView && currentView !== previousView) {
                calendar.changeView(previousView);
                previousView = null;
              }
              // If search cleared, restore full event set
              if (!q) {
                calendar.removeAllEvents();
                calendar.addEventSource(allEvents);
                setNoResultsVisible(false);
              }
            }
          } catch (e) {
            console.error("calendar search update error:", e);
          }
        }, DEBOUNCE_MS);

        searchEl.addEventListener("input", onSearch);
      }
    })
    .catch((err) => {
      console.error("initCalendar: loadEvents failed", err);
    });
}
/** Format date/time for list display */
function formatEventDateTime(dt) {
  if (!(dt instanceof Date)) dt = new Date(dt);
  if (isNaN(dt.getTime())) return "";
  const optionsDate = { year: "numeric", month: "short", day: "numeric" };
  const optionsTime = { hour: "2-digit", minute: "2-digit" };
  const datePart = dt.toLocaleDateString(undefined, optionsDate);
  const hasTime = dt.getHours() || dt.getMinutes();
  const timePart = hasTime ? dt.toLocaleTimeString(undefined, optionsTime) : "";
  return timePart ? `${datePart} • ${timePart}` : datePart;
}

/** Escape HTML for safe insertion (use when inserting into innerHTML) */
function escapeHtml(unsafe) {
  if (unsafe === null || unsafe === undefined) return "";
  return String(unsafe)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

/**
 * Render a vertical list of events starting within the next `weeksAhead` weeks.
 * containerId: id of the element where the list will be rendered
 */
function renderUpcomingList(
  containerId = "upcomingList",
  weeksAhead = 4,
  maxItems = 20
) {
  try {
    const container = document.getElementById(containerId);
    if (!container) {
      console.debug(`renderUpcomingList: container #${containerId} not found`);
      return;
    }

    container.innerHTML = "";
    const now = new Date();
    const endDate = new Date(now);
    endDate.setDate(endDate.getDate() + Math.max(0, Number(weeksAhead)) * 7);

    // Defensive normalization: ensure start is a valid Date
    const normalized = (Array.isArray(allEvents) ? allEvents : [])
      .map((ev) => {
        const s =
          ev && ev.start
            ? ev.start instanceof Date
              ? ev.start
              : new Date(ev.start)
            : null;
        return Object.assign({}, ev, { start: s });
      })
      .filter(
        (ev) => ev && ev.start instanceof Date && !isNaN(ev.start.getTime())
      );

    if (normalized.length === 0) {
      const empty = document.createElement("div");
      empty.className = "alert alert-secondary mb-0";
      empty.textContent = "No events loaded.";
      container.appendChild(empty);
      return;
    }

    // Events within the window
    const upcoming = normalized
      .filter((ev) => ev.start >= now && ev.start <= endDate)
      .sort((a, b) => a.start - b.start)
      .slice(0, maxItems);

    // If none in the window, show the next future events
    let listToShow = upcoming;
    if (listToShow.length === 0) {
      const future = normalized
        .filter((ev) => ev.start >= now)
        .sort((a, b) => a.start - b.start)
        .slice(0, maxItems);
      if (future.length > 0) listToShow = future;
    }

    if (listToShow.length === 0) {
      const empty = document.createElement("div");
      empty.className = "alert alert-secondary mb-0";
      empty.textContent = `No upcoming events in the next ${weeksAhead} weeks.`;
      container.appendChild(empty);
      return;
    }

    const frag = document.createDocumentFragment();
    const list = document.createElement("div");
    list.className = "list-group";

    listToShow.forEach((ev) => {
      const item = document.createElement("button");
      item.type = "button";
      item.className =
        "list-group-item list-group-item-action upcoming-item d-flex justify-content-between align-items-center";
      // Build content without using innerHTML to avoid accidental injection
      // LEFT SIDE (title + category)
      const left = document.createElement("div");
      left.className = "upcoming-left";

      const title = document.createElement("div");
      title.className = "upcoming-title";
      title.textContent = ev.title || "(Untitled)";

      const meta = document.createElement("div");
      meta.className = "upcoming-meta";
      meta.textContent = (ev.extendedProps && ev.extendedProps.Category) || "";

      left.appendChild(title);
      left.appendChild(meta);

      // RIGHT SIDE (date badge)
      const right = document.createElement("div");
      right.className = "upcoming-right";

      const when = document.createElement("span");
      when.className = "upcoming-badge";
      when.textContent = formatEventDateTime(ev.start);

      right.appendChild(when);

      item.appendChild(left);
      item.appendChild(right);

      item.addEventListener("click", () => {
        try {
          if (ev.extendedProps) showEventDetailsFromData(ev.extendedProps);
        } catch (e) {
          console.error("renderUpcomingList click handler error:", e);
        }
      });

      list.appendChild(item);
    });

    frag.appendChild(list);
    container.appendChild(frag);
  } catch (err) {
    console.error("renderUpcomingList unexpected error:", err);
    const container = document.getElementById(containerId);
    if (container) {
      container.innerHTML = "";
      const errEl = document.createElement("div");
      errEl.className = "alert alert-danger mb-0";
      errEl.textContent = "Unable to render upcoming events.";
      container.appendChild(errEl);
    }
  }
}

/** Initialize the upcoming list (resilient) */
function initUpcomingList(
  containerId = "upcomingList",
  weeksAhead = 4,
  maxItems = 20
) {
  if (listInitialized) return;
  listInitialized = true;

  loadEvents()
    .then(() => {
      renderUpcomingList(containerId, weeksAhead, maxItems);
    })
    .catch((err) => {
      console.error("initUpcomingList: loadEvents failed", err);
      // attempt to render fallback (empty) list so UI shows something
      renderUpcomingList(containerId, weeksAhead, maxItems);
    });
}

/** Auto-init on DOM ready */
document.addEventListener("DOMContentLoaded", () => {
  try {
    initCalendar();
  } catch (e) {
    console.error("DOMContentLoaded initCalendar error:", e);
  }
  try {
    initUpcomingList();
  } catch (e) {
    console.error("DOMContentLoaded initUpcomingList error:", e);
  }
});

/** Shared modal renderer: populate modal details and show it (Bootstrap) */
function formatValueForDisplay(value, key) {
  // Date object
  if (value instanceof Date && !isNaN(value)) return formatDate(value);

  // Numbers (epoch seconds or ms)
  if (typeof value === "number" && Number.isFinite(value)) {
    return formatEpoch(value);
  }

  // Arrays: try to format first element if it's date-like, otherwise join
  if (Array.isArray(value)) {
    if (value.length === 0) return "";
    const first = value[0];
    const formattedFirst = formatValueForDisplay(first, key);
    // if first was formatted to something different than raw, use it
    if (formattedFirst !== String(first)) return formattedFirst;
    return value.map((v) => String(v)).join(", ");
  }

  // Strings: many possible date encodings
  if (typeof value === "string") {
    const s = value.trim();

    // 1) /Date(1234567890000)/ (ASP.NET style)
    const msMatch = /\/Date\((\d+)(?:[+-]\d+)?\)\//.exec(s);
    if (msMatch) {
      const n = Number(msMatch[1]);
      if (!isNaN(n)) return formatEpoch(n);
    }

    // 2) any contiguous run of 10-13 digits inside the string (e.g. "ts:1671907200000")
    const digitsMatch = s.match(/\d{10,13}/);
    if (digitsMatch) {
      const n = Number(digitsMatch[0]);
      if (!isNaN(n)) return formatEpoch(n);
    }

    // 3) ISO-like date at start (2023-12-24 or 2023-12-24T12:34:56Z)
    const isoLike = /^\d{4}-\d{2}-\d{2}(T|$)/;
    if (isoLike.test(s)) {
      const parsed = Date.parse(s);
      if (!isNaN(parsed)) return formatDate(new Date(parsed));
    }

    // 4) If key hints it's a date/time, try parsing the whole string
    if (/date|time|start|end|timestamp/i.test(key)) {
      const parsed = Date.parse(s);
      if (!isNaN(parsed)) return formatDate(new Date(parsed));
    }

    // nothing date-like found — return original string
    return s;
  }

  // Objects: try to find nested date-like props
  if (typeof value === "object" && value !== null) {
    const candidates = ["date", "start", "end", "time", "timestamp", "ts"];
    for (const k of candidates) {
      if (k in value) {
        const nested = value[k];
        const formatted = formatValueForDisplay(nested, k);
        if (formatted !== String(nested)) return formatted;
      }
    }
    // fallback: pretty JSON
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }

  // Default
  return String(value);
}

function excelSerialToDate(serial, use1904 = false) {
  // Excel stores days; fractional part is time of day.
  // Use 1904 system if needed (Mac files sometimes use it).
  const epoch = use1904 ? Date.UTC(1904, 0, 1) : Date.UTC(1899, 11, 30); // 1899-12-30 handles Excel's 1900 bug
  const days = Math.floor(serial);
  const msFromDays = days * 86400000;
  const msFromFraction = Math.round((serial - days) * 86400000);
  return new Date(epoch + msFromDays + msFromFraction);
}

function formatEpoch(n) {
  // Excel serials are typically in the range ~1..3e6; treat them first
  if (Number.isFinite(n) && n > 100 && n < 3e6) {
    return formatDate(excelSerialToDate(n));
  }
  if (n >= 1e12) return formatDate(new Date(n)); // ms
  if (n >= 1e9) return formatDate(new Date(n * 1000)); // s
  return String(n);
}

function formatDate(d) {
  return new Intl.DateTimeFormat(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(d);
}

function showEventDetailsFromData(data = {}) {
  try {
    const detailsEl = getVisibleById("modalDetails");
    if (!detailsEl) return;

    detailsEl.innerHTML = "";

    for (const [key, value] of Object.entries(data)) {
      if (value === null || value === undefined) continue;
      if (key === "Offering link") continue;

      const dt = document.createElement("dt");
      dt.className = "col-sm-4";
      dt.textContent = key;

      const dd = document.createElement("dd");
      dd.className = "col-sm-8";
      dd.textContent = formatValueForDisplay(value, key);

      detailsEl.appendChild(dt);
      detailsEl.appendChild(dd);
    }

    const linkEl = getVisibleById("modalLink");
    if (linkEl) {
      if (data["Offering link"]) {
        linkEl.href = String(data["Offering link"]);
        linkEl.style.display = "inline-block";
      } else {
        linkEl.style.display = "none";
      }
    }

    const modalEl = getVisibleById("classModal");
    if (
      modalEl &&
      window.bootstrap &&
      typeof window.bootstrap.Modal === "function"
    ) {
      const modal = new bootstrap.Modal(modalEl);
      modal.show();
    }
  } catch (err) {
    console.error("showEventDetailsFromData error:", err);
  }
}

/* rooms code */

(function () {
  let roomData = []; // Store fetched data here
  const tableBody = document.getElementById("mrTableBody");
  const searchInput = document.getElementById("mrSearchInput");
  const noResultsMsg = document.getElementById("mrNoResults");

  // 1. Fetch the JSON data
  fetch("Data/rooms.json")
    .then((response) => {
      if (!response.ok) {
        throw new Error("HTTP error " + response.status);
      }
      return response.json();
    })
    .then((data) => {
      roomData = data; // Save to variable
      renderTable(roomData); // Initial Render
    })
    .catch((err) => {
      console.error("Error loading meeting room data: ", err);
      // Optional: Show error message in the table
      if (tableBody)
        tableBody.innerHTML =
          '<tr><td colspan="6">Error loading data. Please try again later.</td></tr>';
    });

  // 2. Render Function
  function renderTable(data) {
    if (!tableBody) return;
    tableBody.innerHTML = "";

    if (data.length === 0) {
      noResultsMsg.style.display = "block";
    } else {
      noResultsMsg.style.display = "none";
      data.forEach((row) => {
        let roomNamesHtml = "";
        let roomCapsHtml = "";

        row.rooms.forEach((r) => {
          roomNamesHtml += `<div class="mr-sub-row">${r.n}</div>`;
          roomCapsHtml += `<div class="mr-sub-row">${r.c}</div>`;
        });

        const tr = document.createElement("tr");
        tr.innerHTML = `
                    <td class="mr-site-cell">${row.site}</td>
                    <td class="mr-venue-name">${row.venue}</td>
                    <td class="mr-contact-cell">${row.contact}</td>
                    <td>${row.address}</td>
                    <td>${roomNamesHtml}</td>
                    <td>${roomCapsHtml}</td>
                `;
        tableBody.appendChild(tr);
      });
    }
  }

  // 3. Search Logic
  if (searchInput) {
    searchInput.addEventListener("keyup", function () {
      const filter = this.value.toLowerCase();
      const filteredData = roomData.filter((item) => {
        if (
          item.site.toLowerCase().includes(filter) ||
          item.venue.toLowerCase().includes(filter) ||
          item.contact.toLowerCase().includes(filter) ||
          item.address.toLowerCase().includes(filter)
        ) {
          return true;
        }
        const roomsMatch = item.rooms.some(
          (r) =>
            r.n.toLowerCase().includes(filter) ||
            r.c.toLowerCase().includes(filter)
        );
        return roomsMatch;
      });
      renderTable(filteredData);
    });
  }
})();

/* Prospectus */

// CONFIGURATION
// Set this to false if you ONLY want to show courses that have active dates
(function () {
  // --- Configuration (Local to this script only) ---
  const CONTAINER_ID = "courseList";
  const SHOW_COURSES_WITHOUT_DATES = true;

  // --- Helper Functions (Local) ---
  function _local_excelDateToJSDate(serial) {
    if (!serial) return null;
    const utc_days = Math.floor(serial - 25569);
    const utc_value = utc_days * 86400;
    const date_info = new Date(utc_value * 1000);
    return date_info.toLocaleDateString("en-GB");
  }

  function _local_renderCatalogue(classList, courseDescriptions) {
    const container = document.getElementById(CONTAINER_ID);
    if (!container) return; // Stop if container doesn't exist

    const combinedData = {};

    // 1. Process Descriptions
    courseDescriptions.forEach((desc) => {
      const courseName = desc["Course"].trim();
      combinedData[courseName] = {
        details: desc,
        sessions: [],
      };
    });

    // 2. Process Classes
    classList.forEach((session) => {
      const courseName = session["Course"]
        ? session["Course"].trim()
        : "Unknown Course";

      if (!combinedData[courseName]) {
        combinedData[courseName] = {
          details: {
            Course: courseName,
            Description:
              "Please contact the training team for full details on this module.",
            TargetAudience: "General Staff",
          },
          sessions: [],
        };
      }
      combinedData[courseName].sessions.push(session);
    });

    let htmlContent = "";
    let index = 0;

    // 3. Sort Alpha-Numerically
    const sortedCourseNames = Object.keys(combinedData).sort((a, b) =>
      a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" })
    );

    // 4. Generate HTML
    sortedCourseNames.forEach((courseName) => {
      const data = combinedData[courseName];

      // Filter check
      if (!SHOW_COURSES_WITHOUT_DATES && data.sessions.length === 0) return;

      index++;
      // Create a unique ID for the collapse element to avoid conflicts with other UI elements
      const uniqueId = `cat_course_${index}`;

      const sessionCount = data.sessions.length;
      const badgeClass = sessionCount > 0 ? "bg-primary" : "bg-secondary";
      const badgeText =
        sessionCount > 0 ? `${sessionCount} Session(s)` : "Coming Soon";

      // Sort sessions by date
      data.sessions.sort(
        (a, b) => (a["Start Date"] || 0) - (b["Start Date"] || 0)
      );

      htmlContent += `
            <div class="course-item mb-2">
                <button class="btn btn-primary w-100 text-start d-flex justify-content-between align-items-center" 
                        type="button" data-bs-toggle="collapse" data-bs-target="#${uniqueId}">
                    <span class="fw-bold">${courseName}</span>
                    <span class="badge ${badgeClass}">${badgeText}</span>
                </button>
                
                <div class="collapse" id="${uniqueId}">
                    <div class="card card-body border-top-0 rounded-0 rounded-bottom">
                        <div class="mb-3">
                            <h5>Course Overview</h5>
                            <p>${data.details.Description}</p>
                            <small class="text-muted"><strong>Audience:</strong> ${
                              data.details.TargetAudience || "Open to all"
                            }</small>
                        </div>
            `;

      if (sessionCount > 0) {
        htmlContent += `
                        <div class="table-responsive mt-3">
                            <table class="table table-hover align-middle table-sm border">
                                <thead class="table-light">
                                    <tr>
                                        <th>Date</th>
                                        <th>Time</th>
                                        <th>Venue</th>
                                        <th class="text-center">Booking</th>
                                    </tr>
                                </thead>
                                <tbody>`;

        data.sessions.forEach((session) => {
          const dateStr =
            _local_excelDateToJSDate(session["Start Date"]) || "TBD";
          let timeStr = "All Day";
          if (session["Start Time"]) {
            timeStr = `${session["Start Time"]}`;
            if (session["End Time"]) timeStr += ` - ${session["End Time"]}`;
          }
          const venue = session["Primary Venue"] || "Virtual / TBD";
          const link = session["Offering link"] || "#";

          htmlContent += `
                                    <tr>
                                        <td>${dateStr}</td>
                                        <td>${timeStr}</td>
                                        <td>${venue}</td>
                                        <td class="text-center">
                                            <a href="${link}" class="btn btn-primary btn-sm">Book</a>
                                        </td>
                                    </tr>`;
        });

        htmlContent += `</tbody></table></div>`;
      } else {
        htmlContent += `<div class="alert alert-warning mt-2">No active dates are currently scheduled for this course. Please check back later.</div>`;
      }

      htmlContent += `</div></div></div>`;
    });

    container.innerHTML = htmlContent || "<p>No courses found.</p>";
  }

  // --- Execution ---
  // We use Promise.all to fetch data, but variables 'classList' and 'courseDescriptions'
  // are now local to this scope.
  Promise.all([
    fetch("Data/ClassList.json").then((r) => r.json()),
    fetch("Data/CourseDescriptions.json").then((r) => r.json()),
  ])
    .then(([classList, courseDescriptions]) => {
      _local_renderCatalogue(classList, courseDescriptions);
    })
    .catch((error) => {
      console.error("Catalogue Script Error:", error);
      const container = document.getElementById(CONTAINER_ID);
      if (container) {
        container.innerHTML = `<div class="alert alert-danger">Error loading data: ${error.message}</div>`;
      }
    });
})(); // END OF ISOLATED SCRIPT
