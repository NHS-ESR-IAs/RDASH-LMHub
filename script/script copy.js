// Top-level state (safe defaults)
let allEvents = [];
let calendar = null;
let calendarInitialized = false;
let listInitialized = false;

// --- UTILITY: Date Formatting & Conversion ---

/** Convert Excel serial date to JS Date */
function excelDateToJSDate(serial) {
  const n = Number(serial);
  if (!isFinite(n)) return new Date(NaN);
  const excelEpoch = Date.UTC(1899, 11, 30); // 1899-12-30 UTC
  return new Date(excelEpoch + Math.round(n * 86400000));
}

/** Standardized UK Date Formatter */
function formatDate(d) {
  if (!(d instanceof Date) || isNaN(d.getTime())) return "";
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(d);
}

/** Smart Formatter for Modal: Detects if a number is actually an Excel Date */
function formatValueForDisplay(value, key) {
  if (value === null || value === undefined || value === "") return "";

  // Check if it's a number that is likely an Excel Date (roughly years 1982 to 2064)
  const n = Number(value);
  if (!isNaN(n) && typeof value !== "boolean" && n > 30000 && n < 60000) {
    return formatDate(excelDateToJSDate(n));
  }

  // Handle JS Date objects
  if (value instanceof Date) {
    return formatDate(value);
  }

  return String(value);
}

// --- CORE NAVIGATION & UI ---

function showPage(pageId) {
  document
    .querySelectorAll(".page")
    .forEach((page) => page.classList.remove("active"));
  const pageEl = document.getElementById(pageId);
  if (!pageEl) return;
  pageEl.classList.add("active");

  if (pageId !== "Course_Catalogue") return;

  if (!window.calendar) {
    requestAnimationFrame(() => initCalendar());
    return;
  }

  const refreshCalendar = () => {
    try {
      if (typeof window.calendar.updateSize === "function")
        window.calendar.updateSize();
      window.dispatchEvent(new Event("resize"));
    } catch (err) {
      console.error("showPage: calendar refresh failed", err);
    }
  };

  requestAnimationFrame(refreshCalendar);
  setTimeout(refreshCalendar, 100);
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

// --- DATA LOADING ---

async function loadEvents() {
  if (Array.isArray(allEvents) && allEvents.length) return allEvents;

  try {
    const [classRes, descRes] = await Promise.all([
      fetch("Data/ClassList.json", { cache: "no-store" }),
      fetch("Data/CourseDescriptions.json", { cache: "no-store" }),
    ]);

    if (!classRes.ok || !descRes.ok)
      throw new Error("Failed to fetch data files");

    const classData = await classRes.json();
    const descData = await descRes.json();

    // Map Course names to their Links from Descriptions
    const linkMap = {};
    descData.forEach((d) => {
      if (d.Course) linkMap[d.Course.trim()] = d.CourseLink;
    });

    allEvents = classData.map((item = {}) => {
      const start = excelDateToJSDate(item["Start Date"]);
      const end = excelDateToJSDate(item["End Date"]);

      if (!isNaN(start.getTime()) && item["Start Time"]) {
        const [h = 0, m = 0] = String(item["Start Time"])
          .split(":")
          .map(Number);
        start.setHours(h, m, 0, 0);
      }

      // Inject the Link from Description file
      const courseName = (item.Course || "").trim();
      item["CourseLink"] = linkMap[courseName] || null;

      return {
        title: item.Course || item.Title || "(Untitled)",
        start,
        end,
        extendedProps: item,
      };
    });

    allEvents = allEvents.filter((ev) => !isNaN(ev.start.getTime()));
    return allEvents;
  } catch (err) {
    console.error("loadEvents error:", err);
    return [];
  }
}

function getVisibleById(id) {
  const els = document.querySelectorAll(`#${id}`);
  for (const el of els) {
    if (getComputedStyle(el).display !== "none") return el;
  }
  return els[0] || null;
}

// --- CALENDAR & UPCOMING LIST ---

function initCalendar() {
  if (calendarInitialized) return;
  calendarInitialized = true;

  loadEvents().then(() => {
    const calendarEl = document.getElementById("calendar");
    if (!calendarEl) return;

    calendar = new FullCalendar.Calendar(calendarEl, {
      initialView: "timeGridWeek",
      headerToolbar: {
        left: "prev,next today",
        center: "title",
        right: "timeGridDay,timeGridWeek,dayGridMonth,listYear",
      },
      events: allEvents,
      eventClick(info) {
        info.jsEvent.preventDefault();
        showEventDetailsFromData(info.event.extendedProps);
      },
    });
    calendar.render();
  });
}

function renderUpcomingList() {
  const container = document.getElementById("upcomingList");
  if (!container) return;

  const now = new Date();
  const upcoming = allEvents
    .filter((ev) => ev.start >= now)
    .sort((a, b) => a.start - b.start)
    .slice(0, 15);

  if (upcoming.length === 0) {
    container.innerHTML =
      '<div class="alert alert-secondary">No upcoming events found.</div>';
    return;
  }

  let html = '<div class="list-group">';
  upcoming.forEach((ev) => {
    html += `
      <button class="list-group-item list-group-item-action d-flex justify-content-between align-items-center" onclick='showEventDetailsFromData(${JSON.stringify(ev.extendedProps)})'>
        <div><strong>${ev.title}</strong><br><small>${ev.extendedProps.Category || ""}</small></div>
        <span class="badge bg-primary rounded-pill">${formatDate(ev.start)}</span>
      </button>`;
  });
  html += "</div>";
  container.innerHTML = html;
}

// --- MODAL DISPLAY ---

function showEventDetailsFromData(data = {}) {
  const detailsEl = getVisibleById("modalDetails");
  if (!detailsEl) return;
  detailsEl.innerHTML = "";

  for (const [key, value] of Object.entries(data)) {
    // Hide links and empty fields from the raw list
    if (!value || key === "CourseLink" || key === "Offering link") continue;

    const dt = document.createElement("dt");
    dt.className = "col-sm-4 text-truncate";
    dt.textContent = key;

    const dd = document.createElement("dd");
    dd.className = "col-sm-8";
    dd.textContent = formatValueForDisplay(value, key);

    detailsEl.appendChild(dt);
    detailsEl.appendChild(dd);
  }

  const linkEl = getVisibleById("modalLink");
  if (linkEl) {
    const link = data["CourseLink"];
    if (link && link !== "#") {
      linkEl.href = link;
      linkEl.style.display = "inline-block";
    } else {
      linkEl.style.display = "none";
    }
  }

  const modalEl = getVisibleById("classModal");
  if (modalEl && window.bootstrap) {
    bootstrap.Modal.getOrCreateInstance(modalEl).show();
  }
}

// --- PROSPECTUS / CATALOGUE ---

(function () {
  const CONTAINER_ID = "courseList";

  function _local_renderCatalogue(classList, courseDescriptions) {
    const container = document.getElementById(CONTAINER_ID);
    if (!container) return;

    const combinedData = {};
    courseDescriptions.forEach((desc) => {
      combinedData[desc.Course.trim()] = { details: desc, sessions: [] };
    });

    classList.forEach((session) => {
      const name = (session.Course || "Unknown").trim();
      if (!combinedData[name])
        combinedData[name] = {
          details: { Course: name, Description: "N/A" },
          sessions: [],
        };
      combinedData[name].sessions.push(session);
    });

    let html = "";
    Object.keys(combinedData)
      .sort()
      .forEach((name, idx) => {
        const data = combinedData[name];
        const uid = `cat_course_${idx}`;
        const courseLink = data.details["CourseLink"] || "#"; // Use link from descriptions

        html += `
        <div class="course-item mb-2">
          <button class="btn btn-primary w-100 text-start d-flex justify-content-between align-items-center" data-bs-toggle="collapse" data-bs-target="#${uid}">
            <span class="fw-bold">${name}</span>
            <span class="badge bg-light text-primary">${data.sessions.length} Sessions</span>
          </button>
          <div class="collapse" id="${uid}">
            <div class="card card-body border-top-0">
              <h5>Course Overview</h5>
              <p>${data.details.Description || "No description available."}</p>
              <small class="text-muted"><strong>Target Audience:</strong> ${data.details.TargetAudience || "General"}</small>
              
              ${
                data.sessions.length > 0
                  ? `
                <div class="table-responsive mt-3">
                  <table class="table table-sm table-hover border">
                    <thead class="table-light"><tr><th>Date</th><th>Venue</th><th class="text-center">Booking</th></tr></thead>
                    <tbody>
                      ${data.sessions
                        .map(
                          (s) => `
                        <tr>
                          <td>${formatDate(excelDateToJSDate(s["Start Date"]))}</td>
                          <td>${s["Primary Venue"] || "Virtual"}</td>
                          <td class="text-center"><a href="${courseLink}" class="btn btn-sm btn-primary" target="_blank">Book</a></td>
                        </tr>`,
                        )
                        .join("")}
                    </tbody>
                  </table>
                </div>`
                  : '<div class="alert alert-warning mt-2">No dates currently scheduled.</div>'
              }
            </div>
          </div>
        </div>`;
      });
    container.innerHTML = html;
  }

  document.addEventListener("DOMContentLoaded", () => {
    Promise.all([
      fetch("Data/ClassList.json").then((r) => r.json()),
      fetch("Data/CourseDescriptions.json").then((r) => r.json()),
    ]).then(([classes, descs]) => {
      _local_renderCatalogue(classes, descs);
      initUpcomingList();
    });
  });

  function initUpcomingList() {
    if (listInitialized) return;
    listInitialized = true;
    loadEvents().then(() => renderUpcomingList());
  }
})();

// Auto-init Calendar
document.addEventListener("DOMContentLoaded", () => {
  initCalendar();
});
