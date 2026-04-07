/**
 * APP STATE & GLOBAL DATA
 */
let allEvents = [];
let globalRawClasses = [];
let globalRawDescs = [];
let globalVideoVault = [];
let globalQualityImprovement = [];
let globalRawRooms = []; // This will hold the flattened room list
let calendar = null;

const CONFIG = {
  files: {
    classes: "Data/ClassList.json",
    descriptions: "Data/CourseDescriptions.json",
    videoVault: "Data/VideoVault.json",
    rooms: "Data/rooms.json",
    qi: "Data/QualityImprovement.json",
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

  // Enhanced to remove both 376 and LHD prefixes (case-insensitive)
  cleanTitle: (str) =>
    String(str || "")
      .replace(/^(376|LHD - )\s*/gi, "")
      .trim(),
};

/**
 * INITIALIZATION
 */
async function initApp() {
  try {
    console.log("🚀 Initializing Training Hub...");

    // Fetch all files. .catch ensures one failure doesn't stop the whole script.
    const [classRes, descRes, videoRes, roomRes, qiRes] = await Promise.all([
      fetch(`${CONFIG.files.classes}?v=${Date.now()}`).catch((e) => e),
      fetch(`${CONFIG.files.descriptions}?v=${Date.now()}`).catch((e) => e),
      fetch(`${CONFIG.files.videoVault}?v=${Date.now()}`).catch((e) => e),
      fetch(`${CONFIG.files.rooms}?v=${Date.now()}`).catch((e) => e),
      fetch(`${CONFIG.files.qi}?v=${Date.now()}`).catch((e) => e),
    ]);

    // Safely assign data or empty array if fetch failed
    globalRawClasses = classRes.ok ? await classRes.json() : [];
    globalRawDescs = descRes.ok ? await descRes.json() : [];
    globalVideoVault = videoRes.ok ? await videoRes.json() : [];
    globalQualityImprovement = qiRes.ok ? await qiRes.json() : [];
    const rawNestedRooms = roomRes.ok ? await roomRes.json() : [];

    if (globalVideoVault.length === 0) {
      console.warn("⚠️ VideoVault.json could not be loaded or is empty.");
    }

    // --- FLATTEN ROOM DATA ---
    globalRawRooms = [];
    const siteOrder = {
      scunthorpe: 1,
      rotherham: 2,
      doncaster: 3,
    };
    rawNestedRooms.forEach((venue) => {
      if (venue.rooms && Array.isArray(venue.rooms)) {
        venue.rooms.forEach((room) => {
          globalRawRooms.push({
            Site: venue.site || "N/A",
            Venue: venue.venue || "N/A",
            Type: (venue.type || "internal").toLowerCase(), // <--- Capture the new field here
            Contact: venue.contact || "N/A",
            Address: venue.address || "N/A",
            RoomName: room.n || "N/A",
            Capacity: room.c || "N/A",
            ContactEmail:
              venue.contact && venue.contact.includes("@")
                ? venue.contact.split("\n").find((s) => s.includes("@"))
                : "#",
          });
        });
      }
    });
    globalRawRooms.sort((a, b) => {
      const siteA = a.Site.toLowerCase();
      const siteB = b.Site.toLowerCase();

      const getRank = (name) => {
        if (name.includes("scunthorpe")) return 1;
        if (name.includes("rotherham")) return 2;
        // This catches both "Doncaster" and "Tickhill Road"
        if (name.includes("doncaster") || name.includes("tickhill road"))
          return 3;
        return 999; // Everything else goes to the bottom
      };

      const rankA = getRank(siteA);
      const rankB = getRank(siteB);

      // If ranks are different, sort by Scunthorpe -> Rotherham -> Doncaster
      if (rankA !== rankB) {
        return rankA - rankB;
      }

      // If they are in the same group (e.g., both are Rank 3),
      // sort them alphabetically by Site name so Tickhill and Doncaster stay together
      return siteA.localeCompare(siteB);
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
          // Cleaned title for Calendar and Lists
          title: utils.cleanTitle(
            item.Course || item.Title || "Untitled Course",
          ),
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
    renderVideoVault(globalVideoVault);
    renderQI(globalQualityImprovement);
    initCalendar();
    setupAlphabetNav();
    setupRoomSearch();
    filterRooms();

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

  // Extended to 60 days (approx 2 months) to cover April requirements
  const twoMonthsLater = new Date();
  twoMonthsLater.setDate(today.getDate() + 60);

  const upcoming = eventsSource
    .filter((ev) => ev.start >= today && ev.start <= twoMonthsLater)
    .sort((a, b) => a.start - b.start);

  if (upcoming.length === 0) {
    container.innerHTML =
      '<div class="p-4 text-center text-muted">No sessions in the next 2 months.</div>';
    return;
  }

  const isCataloguePage = containerId === "upcomingListCatalogue";

  container.innerHTML = upcoming
    .map((ev) => {
      const eventIndex = allEvents.indexOf(ev);
      const sTime = ev.extendedProps["Start Time"] || "??:??";
      const eTime = ev.extendedProps["End Time"] || "??:??";
      const cleanTitle = utils.cleanTitle(ev.title);

      if (isCataloguePage) {
        return `
  <div class="card border-0 shadow-sm flex-shrink-0" style="width: 340px; cursor: pointer; border-left: 5px solid #0dcaf0 !important;" onclick="showEventDetailsFromData(${eventIndex})">
    <div class="card-body p-4">
      <span class="badge bg-soft-primary text-primary mb-3 fs-5 px-3 py-2 rounded-pill">${utils.formatDate(ev.start)}</span>
      
      <div class="fw-bold text-dark fs-4 mb-3 text-truncate-2" style="height: 75px; line-height: 1.2;">${cleanTitle}</div>
      
      <div class="text-info fw-bold mb-2 fs-5"><i class="bi bi-clock me-2"></i>${sTime}-${eTime}</div>
      
      <div class="text-muted fs-6"><i class="bi bi-geo-alt me-2"></i>${ev.extendedProps["Primary Venue"] || "Virtual"}</div>
    </div>
  </div>`;
      }
      return `
<button class="list-group-item list-group-item-action border-0 border-bottom py-3" onclick="showEventDetailsFromData(${eventIndex})">
    <div class="fw-bold small text-truncate">${cleanTitle}</div>
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
      const cleanCourseName = utils.cleanTitle(group.info.Course);

      const hasLink =
        group.info.CourseLink &&
        group.info.CourseLink !== "#" &&
        group.info.CourseLink !== "awaiting link";

      return `<div class="card mb-3 border border-info-subtle bg-info-subtle shadow-sm prospectus-card">
    <button class="btn w-100 text-start p-3 d-flex justify-content-between align-items-center bg-info-subtle text-info-emphasis border-0" data-bs-toggle="collapse" data-bs-target="#${id}">
        <div>
            <span class="fw-bold d-block">${cleanCourseName}</span>
            <small class="text-info-emphasis opacity-75">${group.info.Trainer || "Self-Directed"}</small>
        </div>
        <span class="badge ${sessionCount > 0 ? "bg-info text-light" : "bg-info text-light"} rounded-pill">${sessionCount} Dates</span>
    </button>
    
    <div class="collapse" id="${id}">
        <div class="card-body bg-white border-top border-info-subtle">
    <div class="mb-3">
        <span class="badge bg-light text-dark border small"><i class="bi bi-people me-1"></i> Audience: ${group.info.TargetAudience || "General"}</span>
    </div>
    <p class="small text-dark mb-3" style="white-space: pre-line;">${group.info.Description}</p>
            ${
              sessionCount > 0
                ? `
                <div class="table-responsive">
                    <table class="table table-sm table-hover bg-white rounded mb-0 align-middle">
                        <thead class="small bg-info-subtle text-info-emphasis">
                            <tr>
                                <th class="ps-2">Date</th>
                                <th>Time</th>
                                <th>Venue</th>
                                <th class="text-end pe-2">ESR</th>
                            </tr>
                        </thead>
                        <tbody class="small">
                            ${group.sessions
                              .map(
                                (s) => `
                                <tr>
                                    <td class="fw-bold ps-2">${utils.formatDate(utils.excelToJS(s["Start Date"]))}</td>
                                    <td>${s["Start Time"] || "TBD"} - ${s["End Time"] || "TBD"}</td>
                                    <td>${s["Primary Venue"] || "Virtual"}</td>
                                    <td class="text-end pe-2">
                                        <a href="${group.info.CourseLink}" target="_blank" class="btn btn-sm btn-info text-white py-0 px-3 fw-bold">Book</a>
                                    </td>
                                </tr>`,
                              )
                              .join("")}
                        </tbody>
                    </table>
                </div>`
                : `
                <div class="d-flex justify-content-between align-items-center bg-info-subtle p-3 rounded border border-info-subtle">
                    <span class="small text-info-emphasis">Book</span>
                    ${
                      hasLink
                        ? `<a href="${group.info.CourseLink}" target="_blank" class="btn btn-sm btn-info text-white px-4">View Content / Video</a>`
                        : `<span class="small fst-italic text-info-emphasis">Contact L&D for dates</span>`
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

/**
 * PROSPECTUS SEARCH & ALPHABET LOGIC
 */
function filterProspectus(query) {
  // If the query is empty (the "ALL" button), show everything
  if (!query || query === "") {
    renderCatalogue(globalRawClasses, globalRawDescs);
    return;
  }

  const term = query.toLowerCase();

  const filtered = globalRawDescs.filter((d) => {
    const title = utils.cleanTitle(d.Course || d.Title || "").toLowerCase();
    const desc = (d.Description || "").toLowerCase();

    // If query is 1 character, it's an Alphabet jump (check StartsWith)
    // Otherwise, it's a search term (check Includes)
    return query.length === 1
      ? title.startsWith(term)
      : title.includes(term) || desc.includes(term);
  });

  // Re-render the list using ONLY the filtered descriptions
  renderCatalogue(globalRawClasses, filtered);
}

function setupRoomSearch() {
  const input = document.getElementById("mrSearchInput");
  if (input) {
    input.addEventListener("input", (e) => {
      filterRooms();
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

  const linkEl = document.getElementById("modalLink");
  if (linkEl) {
    linkEl.href = url;
    linkEl.style.display = url && url !== "#" ? "inline-block" : "none";
  }

  // Use clean title in Modal
  const cleanTitle = utils.cleanTitle(data.Course || data.title);

  document.getElementById("modalDetails").innerHTML = `
    <div class="mb-4">
        <h3 class="fw-bold text-primary mb-2">${cleanTitle}</h3>
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

let currentVenueCategory = "internal";

/**
 * Handle Tab Switching for Venues
 */
function filterByVenueType(type, btn) {
  document
    .querySelectorAll(".venue-filter-btn")
    .forEach((b) => b.classList.remove("active"));
  btn.classList.add("active");

  currentVenueCategory = type === "trust" ? "internal" : "external";

  document.getElementById("mrSearchInput").value = "";
  filterRooms();
}

/**
 * Room Directory Search Logic (Updated for Tabs)
 */
function filterRooms() {
  const query = document.getElementById("mrSearchInput").value.toLowerCase();
  const tbody = document.getElementById("mrTableBody");
  const table = document.getElementById("mrTable");
  const noResults = document.getElementById("mrNoResults");

  if (!globalRawRooms || globalRawRooms.length === 0) return;

  const filtered = globalRawRooms.filter((room) => {
    // Exact match on the new Type field
    const categoryMatch = room.Type === currentVenueCategory;

    const searchMatch =
      (room.Site || "").toLowerCase().includes(query) ||
      (room.Venue || "").toLowerCase().includes(query) ||
      (room.RoomName || "").toLowerCase().includes(query);

    return categoryMatch && searchMatch;
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

  const videoData = courseDescs.filter(
    (d) =>
      d.Trainer === "Video" && d.CourseLink && d.CourseLink !== "awaiting link",
  );

  if (videoData.length > 0) {
    const featured = videoData[0];
    // Clean featured title
    document.getElementById("vvFeaturedTitle").innerText = utils.cleanTitle(
      featured.Course,
    );
    document.getElementById("vvFeaturedDesc").innerText = featured.Description;
    document.getElementById("vvFeaturedBtn").href = featured.CourseLink;

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

  tbody.innerHTML = videoData
    .map((v) => {
      let badgeClass = "bg-primary-subtle text-primary";
      const topic = (v.Topic || "General").toLowerCase();

      if (topic.includes("digital")) badgeClass = "bg-info-subtle text-info";
      if (topic.includes("informed"))
        badgeClass = "bg-success-subtle text-success";
      if (topic.includes("career"))
        badgeClass = "bg-warning-subtle text-warning";

      return `
      <tr>
        <td class="ps-4 fw-bold text-dark">${utils.cleanTitle(v.Course)}</td>
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

    document.body.classList.forEach((className) => {
      if (className.startsWith("theme-")) {
        document.body.classList.remove(className);
      }
    });

    document.body.classList.add(`theme-${selectedTheme}`);
    localStorage.setItem("user-theme", selectedTheme);
  });
}

// --- Text Scaling Logic ---
function setTextSize(scaleClass) {
  const scales = ["scale-small", "scale-medium", "scale-large", "scale-xlarge"];
  document.body.classList.remove(...scales);
  document.body.classList.add(scaleClass);
  localStorage.setItem("user-font-scale", scaleClass);
}

// --- Initialization on Page Load ---
window.addEventListener("DOMContentLoaded", () => {
  const savedTheme = localStorage.getItem("user-theme") || "blue";
  if (themeSelector) themeSelector.value = savedTheme;
  document.body.classList.add(`theme-${savedTheme}`);

  const savedScale = localStorage.getItem("user-font-scale") || "scale-medium";
  setTextSize(savedScale);
});

/**
 * VIDEO VAULT: RENDERING (PROSPECTUS STYLE)
 */
function renderVideoVault(videoData) {
  const container = document.getElementById("vvCourseList");
  const alphaContainer = document.getElementById("vvAlphabetNav");
  if (!container) return;

  // Since it's a dedicated file, we only filter out empty links
  const validVideos = videoData.filter(
    (d) => d.CourseLink && d.CourseLink !== "awaiting link",
  );

  if (validVideos.length === 0) {
    container.innerHTML = `<div class="col-12 text-center py-5"><h4 class="text-muted">No videos found.</h4></div>`;
    return;
  }

  // Setup Alphabet Nav
  if (alphaContainer) {
    alphaContainer.innerHTML =
      "ABCDEFGHIJKLMNOPQRSTUVWXYZ"
        .split("")
        .map(
          (l) =>
            `<button class="btn btn-sm text-white fw-bold border-0 p-1" onclick="filterVVByLetter('${l}')">${l}</button>`,
        )
        .join("") +
      `<button class="btn btn-sm btn-light ms-2 rounded-pill" style="color: #c68a12;" onclick="filterVVByLetter('ALL')">ALL</button>`;
  }

  container.innerHTML = validVideos
    .sort((a, b) =>
      utils.cleanTitle(a.Course).localeCompare(utils.cleanTitle(b.Course)),
    )
    .map((v, idx) => {
      const id = `vvCollapse_${idx}`;
      return `
<div class="card mb-3 border shadow-sm prospectus-card" style="border-left: 5px solid #c68a12 !important; background-color: #fef9ef;">
  <button class="btn w-100 text-start p-3 d-flex justify-content-between align-items-center border-0" 
          style="background-color: #fef9ef;" data-bs-toggle="collapse" data-bs-target="#${id}">
      <div>
          <span class="fw-bold d-block text-dark">${utils.cleanTitle(v.Course)}</span>
          <small class="text-muted">Category: ${v.Topic || "Tutorial"}</small>
      </div>
      <i class="bi bi-play-circle-fill fs-4" style="color: #c68a12;"></i>
  </button>
  <div class="collapse" id="${id}">
      <div class="card-body bg-white border-top">
          <div class="mb-2">
              <small class="fw-bold text-muted"><i class="bi bi-people me-1"></i> Target Audience: ${v.TargetAudience || "All Staff"}</small>
          </div>
          <p class="small text-dark mb-3">${v.Description || "No description available."}</p>
          <div class="d-flex justify-content-between align-items-center p-3 rounded" style="background-color: #fef9ef; border: 1px solid #faeecd;">
              <span class="small fw-bold" style="color: #c68a12;">Duration: ${v.Duration || "Varies"}</span>
              <a href="${v.CourseLink}" target="_blank" class="btn btn-sm text-white px-4 fw-bold" style="background-color: #c68a12;">
                  <i class="bi bi-play-fill me-1"></i> Watch Video
              </a>
          </div>
      </div>
  </div>
</div>`;
    })
    .join("");
}

// Global filter functions for Video Vault
function filterVVByLetter(letter) {
  const query = letter === "ALL" ? "" : letter.toLowerCase();
  const filtered = globalVideoVault.filter((d) => {
    const title = utils.cleanTitle(d.Course || d.Title).toLowerCase();
    return query === "" ? true : title.startsWith(query);
  });
  renderVideoVault(filtered);
}

function filterVideoVaultNew() {
  const query = document.getElementById("vvSearchInputNew").value.toLowerCase();
  const filtered = globalVideoVault.filter((d) => {
    const title = utils.cleanTitle(d.Course || d.Title).toLowerCase();
    const desc = (d.Description || "").toLowerCase();
    return title.includes(query) || desc.includes(query);
  });
  renderVideoVault(filtered);
}

/**
 * QUALITY IMPROVEMENT: RENDERING
 */
function renderQI(qiData) {
  const container = document.getElementById("qiContentList");
  const alphaContainer = document.getElementById("qiAlphabetNav");
  if (!container) return;

  if (qiData.length === 0) {
    container.innerHTML = `<div class="col-12 text-center py-5"><h4 class="text-muted">No QI resources found.</h4></div>`;
    return;
  }

  // Setup Alphabet Nav (Purple Theme)
  if (alphaContainer) {
    alphaContainer.innerHTML =
      "ABCDEFGHIJKLMNOPQRSTUVWXYZ"
        .split("")
        .map(
          (l) =>
            `<button class="btn btn-sm text-white fw-bold border-0 p-1" onclick="filterQIByLetter('${l}')">${l}</button>`,
        )
        .join("") +
      `<button class="btn btn-sm btn-light ms-2 rounded-pill" style="color: #6f42c1;" onclick="filterQIByLetter('ALL')">ALL</button>`;
  }

  container.innerHTML = qiData
    .sort((a, b) =>
      utils
        .cleanTitle(a.Course || a.Title)
        .localeCompare(utils.cleanTitle(b.Course || b.Title)),
    )
    .map((item, idx) => {
      const id = `qiCollapse_${idx}`;
      const cleanName = utils.cleanTitle(item.Course || item.Title);

      return `
<div class="card mb-3 border shadow-sm prospectus-card" style="border-left: 5px solid #6f42c1 !important; background-color: #f9f6ff;">
  <button class="btn w-100 text-start p-3 d-flex justify-content-between align-items-center border-0" 
          style="background-color: #f9f6ff;" data-bs-toggle="collapse" data-bs-target="#${id}">
      <div>
          <span class="fw-bold d-block text-dark">${cleanName}</span>
          <small class="text-muted">Methodology: ${item.Methodology || "QI Tool"}</small>
      </div>
      <i class="bi bi-chevron-down fs-5" style="color: #6f42c1;"></i>
  </button>
  <div class="collapse" id="${id}">
      <div class="card-body bg-white border-top">
          <div class="mb-2">
              <small class="fw-bold" style="color: #6f42c1;"><i class="bi bi-people me-1"></i> Intended for: ${item.TargetAudience || "General"}</small>
          </div>
          <p class="small text-dark mb-3" style="white-space: pre-line;">${item.Description || "No description available."}</p>
          <div class="d-flex justify-content-between align-items-center p-3 rounded" style="background-color: #f9f6ff; border: 1px solid #e9dcfc;">
              <span class="small fw-bold" style="color: #6f42c1;">Type: ${item.Topic || "Resource"}</span>
              <a href="${item.CourseLink || "#"}" target="_blank" class="btn btn-sm text-white px-4 fw-bold" style="background-color: #6f42c1;">
                  <i class="bi bi-box-arrow-up-right me-1"></i> Access Resource
              </a>
          </div>
      </div>
  </div>
</div>`;
    })
    .join("");
}

// Search and Filter for QI
function filterQI() {
  const query = document.getElementById("qiSearchInput").value.toLowerCase();
  const filtered = globalQualityImprovement.filter((d) => {
    const title = utils.cleanTitle(d.Course || d.Title).toLowerCase();
    const desc = (d.Description || "").toLowerCase();
    return title.includes(query) || desc.includes(query);
  });
  renderQI(filtered);
}

function filterQIByLetter(letter) {
  const query = letter === "ALL" ? "" : letter.toLowerCase();
  const filtered = globalQualityImprovement.filter((d) => {
    const title = utils.cleanTitle(d.Course || d.Title).toLowerCase();
    return query === "" ? true : title.startsWith(query);
  });
  renderQI(filtered);
}

document.addEventListener("DOMContentLoaded", initApp);
