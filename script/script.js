/**
 * APP STATE & GLOBAL DATA
 */
let allEvents = [];
let globalRawClasses = [];
let globalRawDescs = [];
let globalRawRooms = []; // This will hold the flattened room list
let calendar = null;

const CONFIG = {
  files: {
    classes: "Data/ClassList.json",
    descriptions: "Data/CourseDescriptions.json",
    rooms: "Data/rooms.json",
  },
  excelEpoch: Date.UTC(1899, 11, 30),
  msPerDay: 86400000,
};

/**
 * UTILITIES
 */
const utils = {
  excelToJS: (serial) => {
    const n = Number(serial);
    if (!isFinite(n)) return new Date(NaN);
    return new Date(CONFIG.excelEpoch + Math.round(n * CONFIG.msPerDay));
  },

  formatDate: (d) => {
    if (!(d instanceof Date) || isNaN(d.getTime())) return "TBD";
    return new Intl.DateTimeFormat("en-GB", {
      day: "numeric",
      month: "short",
      year: "numeric",
    }).format(d);
  },

  formatDisplay: (val) => {
    if (val === null || val === undefined || val === "") return "N/A";
    const n = Number(val);
    if (!isNaN(n) && typeof val !== "boolean" && n > 30000 && n < 60000) {
      return utils.formatDate(utils.excelToJS(n));
    }
    return String(val);
  },

  cleanTitle: (str) =>
    String(str || "")
      .replace(/^376\s*/, "")
      .trim(),
};

/**
 * INITIALIZATION
 */
async function initApp() {
  try {
    console.log("🚀 Initializing Training Hub...");

    const [classRes, descRes, roomRes] = await Promise.all([
      fetch(`${CONFIG.files.classes}?v=${Date.now()}`),
      fetch(`${CONFIG.files.descriptions}?v=${Date.now()}`),
      fetch(`${CONFIG.files.rooms}?v=${Date.now()}`).catch(() => null),
    ]);

    globalRawClasses = await classRes.json();
    globalRawDescs = await descRes.json();
    const rawNestedRooms = roomRes ? await roomRes.json() : [];

    // --- FLATTEN ROOM DATA ---
    // This transforms your nested JSON into a flat list for the table
    globalRawRooms = [];
    rawNestedRooms.forEach((venue) => {
      if (venue.rooms && Array.isArray(venue.rooms)) {
        venue.rooms.forEach((room) => {
          globalRawRooms.push({
            Site: venue.site || "N/A",
            Venue: venue.venue || "N/A",
            Contact: venue.contact || "N/A",
            Address: venue.address || "N/A",
            RoomName: room.n || "N/A",
            Capacity: room.c || "N/A",
            // Helper for the Email button
            ContactEmail:
              venue.contact && venue.contact.includes("@")
                ? venue.contact.split("\n").find((s) => s.includes("@"))
                : "#",
          });
        });
      }
    });

    const descMap = new Map();
    globalRawDescs.forEach((d) => {
      const key = (d.Course || d.Title || "").trim().toLowerCase();
      if (key) descMap.set(key, d);
    });

    allEvents = globalRawClasses
      .map((item) => {
        const start = utils.excelToJS(item["Start Date"]);
        const end = utils.excelToJS(item["End Date"]);

        if (item["Start Time"] && !isNaN(start.getTime())) {
          const [h, m] = String(item["Start Time"]).split(":").map(Number);
          start.setHours(h || 0, m || 0, 0, 0);
        }
        if (item["End Time"] && !isNaN(end.getTime())) {
          const [h, m] = String(item["End Time"]).split(":").map(Number);
          end.setHours(h || 0, m || 0, 0, 0);
        }

        const courseKey = String(item.Course || "")
          .trim()
          .toLowerCase();
        const info = descMap.get(courseKey) || {};

        return {
          title: item.Course || item.Title || "Untitled Course",
          start: start,
          end: end,
          extendedProps: {
            ...item,
            Description: info.Description || "No description available.",
            TargetAudience: info.TargetAudience || "General Audience",
            Trainer: info.Trainer || "TBD",
            CourseLink: info.CourseLink || "#",
          },
        };
      })
      .filter((ev) => !isNaN(ev.start.getTime()));

    // Initial Renders
    renderUpcomingList("upcomingList");
    renderCatalogue(globalRawClasses, globalRawDescs);
    renderRoomDirectory(globalRawRooms);
    renderVideoVault(globalRawDescs);
    initCalendar();
    setupAlphabetNav();
    setupRoomSearch();

    console.log("✅ Hub Initialization Complete.");
  } catch (err) {
    console.error("❌ App Failure:", err);
  }
}

/**
 * UI: RENDERING FUNCTIONS
 */
function renderUpcomingList(containerId, eventsSource = allEvents) {
  const container = document.getElementById(containerId);
  if (!container) return;

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const fourWeeksLater = new Date();
  fourWeeksLater.setDate(today.getDate() + 28);

  const upcoming = eventsSource
    .filter((ev) => ev.start >= today && ev.start <= fourWeeksLater)
    .sort((a, b) => a.start - b.start);

  if (upcoming.length === 0) {
    container.innerHTML =
      '<div class="p-4 text-center text-muted">No sessions in the next 4 weeks.</div>';
    return;
  }

  const isCataloguePage = containerId === "upcomingListCatalogue";

  container.innerHTML = upcoming
    .map((ev) => {
      const eventIndex = allEvents.indexOf(ev);
      const sTime = ev.extendedProps["Start Time"] || "??:??";
      const eTime = ev.extendedProps["End Time"] || "??:??";

      if (isCataloguePage) {
        return `
  <div class="card border-0 shadow-sm flex-shrink-0" style="width: 340px; cursor: pointer; border-left: 5px solid #0dcaf0 !important;" onclick="showEventDetailsFromData(${eventIndex})">
    <div class="card-body p-4">
      <span class="badge bg-soft-primary text-primary mb-3 fs-5 px-3 py-2 rounded-pill">${utils.formatDate(ev.start)}</span>
      
      <div class="fw-bold text-dark fs-4 mb-3 text-truncate-2" style="height: 75px; line-height: 1.2;">${ev.title}</div>
      
      <div class="text-info fw-bold mb-2 fs-5"><i class="bi bi-clock me-2"></i>${sTime}-${eTime}</div>
      
      <div class="text-muted fs-6"><i class="bi bi-geo-alt me-2"></i>${ev.extendedProps["Primary Venue"] || "Virtual"}</div>
    </div>
  </div>`;
      }
      return `
<button class="list-group-item list-group-item-action border-0 border-bottom py-3" onclick="showEventDetailsFromData(${eventIndex})">
    <div class="fw-bold small text-truncate">${ev.title}</div>
    <div class="d-flex justify-content-between mt-1">
      <span class="badge bg-light text-primary border">${utils.formatDate(ev.start)}</span>
      <small class="text-info fw-bold">${sTime}-${eTime}</small>
    </div>
</button>`;
    })
    .join("");

  if (!isCataloguePage)
    container.innerHTML = `<div class="list-group list-group-flush">${container.innerHTML}</div>`;
}

function renderCatalogue(classList, courseDescs) {
  const container = document.getElementById("courseList");
  if (!container) return;

  if (courseDescs.length === 0) {
    container.innerHTML = `<div class="col-12 text-center py-5"><i class="bi bi-search display-3 text-muted"></i><h4 class="mt-3">No matching courses.</h4></div>`;
    return;
  }

  const groups = {};
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  courseDescs.forEach((d) => {
    const name = (d.Course || d.Title || "").trim();
    if (name) groups[name] = { info: d, sessions: [] };
  });

  classList.forEach((s) => {
    const name = (s.Course || "").trim();
    if (groups[name] && utils.excelToJS(s["Start Date"]) >= today)
      groups[name].sessions.push(s);
  });

  container.innerHTML = Object.values(groups)
    .sort((a, b) =>
      utils
        .cleanTitle(a.info.Course)
        .localeCompare(utils.cleanTitle(b.info.Course)),
    )
    .map((group, idx) => {
      const id = `courseCollapse_${idx}`;
      const sessionCount = group.sessions.length;

      // Check if a valid link exists in the description JSON
      const hasLink =
        group.info.CourseLink &&
        group.info.CourseLink !== "#" &&
        group.info.CourseLink !== "awaiting link";

      return `
        <div class="card mb-3 border-0 shadow-sm prospectus-card">
            <button class="btn w-100 text-start p-3 d-flex justify-content-between align-items-center" data-bs-toggle="collapse" data-bs-target="#${id}">
                <div><span class="fw-bold d-block">${group.info.Course}</span><small class="text-muted">${group.info.Trainer || "Self-Directed"}</small></div>
                <span class="badge ${sessionCount > 0 ? "bg-info" : "bg-light text-muted"} rounded-pill">${sessionCount} Dates</span>
            </button>
            <div class="collapse" id="${id}">
                <div class="card-body bg-light border-top">
                    <p class="small text-dark mb-3" style="white-space: pre-line;">${group.info.Description}</p>
                    ${
                      sessionCount > 0
                        ? `
                        <div class="table-responsive">
                            <table class="table table-sm table-borderless bg-white rounded shadow-sm mb-0 align-middle">
                                <thead class="small border-bottom"><tr><th>Date</th><th>Time</th><th>Venue</th><th class="text-end">ESR</th></tr></thead>
                                <tbody class="small">
                                    ${group.sessions
                                      .map(
                                        (s) => `
                                        <tr>
                                            <td class="fw-bold">${utils.formatDate(utils.excelToJS(s["Start Date"]))}</td>
                                            <td>${s["Start Time"] || "TBD"} - ${s["End Time"] || "TBD"}</td>
                                            <td>${s["Primary Venue"] || "Virtual"}</td>
                                            <td class="text-end"><a href="${group.info.CourseLink}" target="_blank" class="btn btn-sm btn-info text-white py-0 px-3">Book</a></td>
                                        </tr>`,
                                      )
                                      .join("")}
                                </tbody>
                            </table>
                        </div>`
                        : `
                        <div class="d-flex justify-content-between align-items-center bg-white p-3 rounded shadow-sm">
                            <span class="small text-muted">No live dates currently scheduled.</span>
                            ${
                              hasLink
                                ? `<a href="${group.info.CourseLink}" target="_blank" class="btn btn-sm btn-outline-info px-4">View Content / Video</a>`
                                : `<span class="small fst-italic text-muted">Contact L&D for dates</span>`
                            }
                        </div>`
                    }
                </div>
            </div>
        </div>`;
    })
    .join("");
}

function renderRoomDirectory(rooms) {
  const tbody = document.getElementById("mrTableBody");
  if (!tbody) return;

  tbody.innerHTML = rooms
    .map(
      (room) => `
    <tr>
      <td class="px-4">
        <span class="venue-site-label d-block fw-bold">${room.Site}</span>
        <span class="venue-sub-label small text-muted">${room.Venue}</span>
      </td>
      <td>
        <div class="small text-muted" style="white-space: pre-line; font-size: 0.75rem;">${room.Contact}</div>
      </td>
      <td class="small text-muted">${room.Address}</td>
      <td>
        <div class="fw-bold text-dark">${room.RoomName}</div>
      </td>
      <td class="text-center">
        <span class="capacity-pill badge rounded-pill bg-light text-danger border">${room.Capacity}</span>
      </td>
    </tr>`,
    )
    .join("");
}

/**
 * LOGIC: FILTERING & NAVIGATION
 */
function filterCalendar() {
  const q = document.getElementById("calendarSearch").value.toLowerCase();
  const filtered = allEvents.filter(
    (ev) =>
      ev.title.toLowerCase().includes(q) ||
      (ev.extendedProps["Primary Venue"] || "").toLowerCase().includes(q),
  );
  if (calendar) {
    calendar.removeAllEvents();
    calendar.addEventSource(filtered);
  }
  renderUpcomingList("upcomingListCatalogue", filtered);
}

function filterProspectus(query) {
  const term = query.toLowerCase();
  const filtered = globalRawDescs.filter((d) => {
    const clean = utils.cleanTitle(d.Course || d.Title).toLowerCase();
    const raw = (d.Course || d.Title || "").toLowerCase();
    return query.length === 1
      ? clean.startsWith(term)
      : raw.includes(term) ||
          (d.Description || "").toLowerCase().includes(term);
  });
  renderCatalogue(globalRawClasses, filtered);
}

function setupRoomSearch() {
  const input = document.getElementById("mrSearchInput");
  if (input) {
    input.addEventListener("input", (e) => {
      filterRooms(); // Direct call to our robust filter
    });
  }
}

function setupAlphabetNav() {
  const nav = document.querySelector(".alphabet-nav");
  if (!nav) return;
  nav.innerHTML =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZ"
      .split("")
      .map(
        (l) =>
          `<button class="btn btn-sm btn-outline-light border-0" onclick="filterProspectus('${l}')">${l}</button>`,
      )
      .join("") +
    `<button class="btn btn-sm btn-info ms-2 rounded-pill" onclick="filterProspectus('')">ALL</button>`;
}

function showPage(pageId) {
  document
    .querySelectorAll(".page")
    .forEach((p) => p.classList.toggle("active", p.id === pageId));
  window.scrollTo(0, 0);
  if (pageId === "Course_Catalogue" && calendar) {
    setTimeout(() => {
      calendar.updateSize();
      renderUpcomingList("upcomingListCatalogue");
    }, 150);
  }
}

function searchPages() {
  const query = document.getElementById("searchInput").value.toLowerCase();
  const pages = document.querySelectorAll(".page");
  const homePage = document.getElementById("home");

  if (query === "") {
    showPage("home");
    pages.forEach((page) => {
      if (page.id !== "home") page.classList.remove("active");
    });
  } else {
    homePage.classList.remove("active");
    pages.forEach((page) => {
      if (["home", "Course_Catalogue", "Training_Rooms"].includes(page.id)) {
        page.classList.remove("active");
        return;
      }
      const match = page.innerText.toLowerCase().includes(query);
      page.classList.toggle("active", match);
    });
  }
}

/**
 * CALENDAR & MODALS
 */
function initCalendar() {
  const el = document.getElementById("calendar");
  if (!el || calendar) return;
  calendar = new FullCalendar.Calendar(el, {
    initialView: "dayGridMonth",
    headerToolbar: {
      left: "prev,next today",
      center: "title",
      right: "dayGridMonth,timeGridWeek,listYear",
    },
    events: (info, success) => success(allEvents),
    eventClick: (info) => {
      info.jsEvent.preventDefault();
      showEventDetailsFromData(null, info.event.extendedProps);
    },
  });
  calendar.render();
}

function showEventDetailsFromData(idx, directData) {
  const data = directData || allEvents[idx]?.extendedProps;
  if (!data) return;

  const modal = bootstrap.Modal.getOrCreateInstance(
    document.getElementById("classModal"),
  );
  const url = (data.CourseLink || data["Offering link"] || "").trim();

  // Update the Booking Link
  const linkEl = document.getElementById("modalLink");
  if (linkEl) {
    linkEl.href = url;
    linkEl.style.display = url && url !== "#" ? "inline-block" : "none";
  }

  // Build the "Spiffy" Internal Layout
  document.getElementById("modalDetails").innerHTML = `
    <div class="mb-4">
        <h3 class="fw-bold text-primary mb-2">${data.Course || data.title}</h3>
        <p class="text-dark lead mb-4" style="white-space: pre-line; font-size: 1rem;">${data.Description}</p>
    </div>

    <div class="row g-3 mb-4">
        <div class="col-sm-6">
            <div class="p-3 bg-light rounded-3 h-100 border-start border-primary border-4">
                <small class="text-uppercase fw-bold text-muted d-block mb-1" style="font-size: 0.7rem;">Instructor</small>
                <div class="fw-bold"><i class="bi bi-person-badge me-2"></i>${data.Trainer || "TBD"}</div>
            </div>
        </div>
        <div class="col-sm-6">
            <div class="p-3 bg-light rounded-3 h-100 border-start border-success border-4">
                <small class="text-uppercase fw-bold text-muted d-block mb-1" style="font-size: 0.7rem;">Target Audience</small>
                <div class="fw-bold"><i class="bi bi-people me-2"></i>${data.TargetAudience || "All Staff"}</div>
            </div>
        </div>
    </div>

    <div class="card border-0 bg-light p-3">
        <div class="row small text-muted">
            <div class="col-6 mb-2">
                <strong><i class="bi bi-geo-alt me-1"></i> Venue:</strong> ${data["Primary Venue"] || "Virtual / Online"}
            </div>
            <div class="col-6 mb-2">
                <strong><i class="bi bi-clock me-1"></i> Time:</strong> ${data["Start Time"] || "??:??"} - ${data["End Time"] || "??:??"}
            </div>
            <div class="col-12">
                <i class="bi bi-info-circle me-1"></i> 
                <span class="fst-italic">Please ensure you have manager approval before booking on ESR.</span>
            </div>
        </div>
    </div>
  `;

  modal.show();
}

function scrollUpcoming(dist) {
  document
    .getElementById("upcomingListCatalogue")
    ?.scrollBy({ left: dist, behavior: "smooth" });
}

/**
 * Room Directory Search Logic
 */
function filterRooms() {
  const query = document.getElementById("mrSearchInput").value.toLowerCase();
  const tbody = document.getElementById("mrTableBody");
  const table = document.getElementById("mrTable");
  const noResults = document.getElementById("mrNoResults");

  if (!globalRawRooms || globalRawRooms.length === 0) return;

  const filtered = globalRawRooms.filter((room) => {
    return (
      (room.Site || "").toLowerCase().includes(query) ||
      (room.Venue || "").toLowerCase().includes(query) ||
      (room.RoomName || "").toLowerCase().includes(query) ||
      (room.Capacity || "").toString().includes(query) ||
      (room.Address || "").toLowerCase().includes(query)
    );
  });

  renderRoomDirectory(filtered);

  if (filtered.length === 0) {
    noResults.classList.remove("d-none");
    table.classList.add("d-none");
  } else {
    noResults.classList.add("d-none");
    table.classList.remove("d-none");
  }
}

/**
 * VIDEO VAULT LOGIC
 */
function renderVideoVault(courseDescs) {
  const tbody = document.getElementById("vvTableBody");
  if (!tbody) return;

  // 1. Filter only for items where Trainer is "Video"
  const videoData = courseDescs.filter(
    (d) =>
      d.Trainer === "Video" && d.CourseLink && d.CourseLink !== "awaiting link",
  );

  // 2. Handle the Featured Video (First item in the list)
  if (videoData.length > 0) {
    const featured = videoData[0];
    document.getElementById("vvFeaturedTitle").innerText = featured.Course;
    document.getElementById("vvFeaturedDesc").innerText = featured.Description;
    document.getElementById("vvFeaturedBtn").href = featured.CourseLink;

    // Convert YouTube URL to Embed format
    const player = document.getElementById("vvFeaturedPlayer");
    let videoUrl = featured.CourseLink;
    if (videoUrl.includes("youtube.com/watch?v=")) {
      const id = videoUrl.split("v=")[1].split("&")[0];
      player.src = `https://www.youtube.com/embed/${id}`;
    } else if (videoUrl.includes("youtu.be/")) {
      const id = videoUrl.split("/").pop();
      player.src = `https://www.youtube.com/embed/${id}`;
    }
  }

  // 3. Populate the Table
  tbody.innerHTML = videoData
    .map((v) => {
      // Generate color-coded badges based on the "Topic"
      let badgeClass = "bg-primary-subtle text-primary";
      const topic = (v.Topic || "General").toLowerCase();

      if (topic.includes("digital")) badgeClass = "bg-info-subtle text-info";
      if (topic.includes("informed"))
        badgeClass = "bg-success-subtle text-success";
      if (topic.includes("career"))
        badgeClass = "bg-warning-subtle text-warning";

      return `
      <tr>
        <td class="ps-4 fw-bold text-dark">${v.Course}</td>
        <td><span class="badge ${badgeClass} rounded-pill">${v.Topic || "Training"}</span></td>
        <td class="text-end pe-4">
          <a href="${v.CourseLink}" target="_blank" class="btn btn-sm btn-warning rounded-pill px-3 fw-bold shadow-sm">
            <i class="bi bi-play-circle me-1"></i> Watch
          </a>
        </td>
      </tr>`;
    })
    .join("");
}

/**
 * Search functionality for Video Vault
 */
function filterVideoVault() {
  const query = document.getElementById("vvSearchInput").value.toLowerCase();
  const rows = document.querySelectorAll("#vvTableBody tr");
  const noResults = document.getElementById("vvNoResults");
  let foundCount = 0;

  rows.forEach((row) => {
    const text = row.innerText.toLowerCase();
    const isMatch = text.includes(query);
    row.style.display = isMatch ? "" : "none";
    if (isMatch) foundCount++;
  });

  noResults.classList.toggle("d-none", foundCount > 0);
}

// --- Theme Selector Logic ---
const themeSelector = document.getElementById("themeSelector");

if (themeSelector) {
  themeSelector.addEventListener("change", (e) => {
    const selectedTheme = e.target.value;

    // 1. Remove any existing theme classes (theme-blue, theme-green, etc.)
    document.body.classList.forEach((className) => {
      if (className.startsWith("theme-")) {
        document.body.classList.remove(className);
      }
    });

    // 2. Add the new selected theme class
    document.body.classList.add(`theme-${selectedTheme}`);

    // Optional: Save to localStorage so it persists on refresh
    localStorage.setItem("user-theme", selectedTheme);
  });
}

// --- Text Scaling Logic ---
function setTextSize(scaleClass) {
  // 1. Remove all existing scale classes
  const scales = ["scale-small", "scale-medium", "scale-large", "scale-xlarge"];
  document.body.classList.remove(...scales);

  // 2. Add the selected scale class
  document.body.classList.add(scaleClass);

  // Optional: Save to localStorage
  localStorage.setItem("user-font-scale", scaleClass);
}

// --- Initialization on Page Load ---
window.addEventListener("DOMContentLoaded", () => {
  // Restore Theme
  const savedTheme = localStorage.getItem("user-theme") || "blue";
  if (themeSelector) themeSelector.value = savedTheme;
  document.body.classList.add(`theme-${savedTheme}`);

  // Restore Font Scale
  const savedScale = localStorage.getItem("user-font-scale") || "scale-medium";
  setTextSize(savedScale);
});

document.addEventListener("DOMContentLoaded", initApp);
