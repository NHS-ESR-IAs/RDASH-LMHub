// Top-level state
let allEvents = [];
let calendar = null;
let calendarInitialized = false;
let listInitialized = false;

// --- UTILITY: Date Formatting & Conversion ---

function excelDateToJSDate(serial) {
  const n = Number(serial);
  if (!isFinite(n)) return new Date(NaN);
  const excelEpoch = Date.UTC(1899, 11, 30);
  return new Date(excelEpoch + Math.round(n * 86400000));
}

function formatDate(d) {
  if (!(d instanceof Date) || isNaN(d.getTime())) return "";
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(d);
}

/** Aggressive Smart Formatter: Fixes the "Number Date" issue for ALL fields */
function formatValueForDisplay(value, key) {
  if (value === null || value === undefined || value === "") return "";

  const n = Number(value);
  // Detection for Excel serial dates (roughly 30,000 to 60,000)
  if (!isNaN(n) && typeof value !== "boolean" && n > 30000 && n < 60000) {
    return formatDate(excelDateToJSDate(n));
  }

  if (value instanceof Date) return formatDate(value);
  return String(value);
}

// --- CORE UI ---

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

// --- DATA LOADING ---

async function loadEvents() {
  if (allEvents.length) return allEvents;

  try {
    const [classRes, descRes] = await Promise.all([
      fetch("Data/ClassList.json", { cache: "no-store" }),
      fetch("Data/CourseDescriptions.json", { cache: "no-store" }),
    ]);

    const classData = await classRes.json();
    const descData = await descRes.json();

    const courseInfoMap = {};
    descData.forEach((d) => {
      if (d.Course) courseInfoMap[d.Course.trim()] = d;
    });

    allEvents = classData.map((item) => {
      const start = excelDateToJSDate(item["Start Date"]);
      const end = excelDateToJSDate(item["End Date"]);

      // Apply Times to start/end objects to fix 1-hour duration bug
      if (!isNaN(start.getTime()) && item["Start Time"]) {
        const [h = 0, m = 0] = String(item["Start Time"])
          .split(":")
          .map(Number);
        start.setHours(h, m, 0, 0);
      }
      if (!isNaN(end.getTime()) && item["End Time"]) {
        const [h = 0, m = 0] = String(item["End Time"]).split(":").map(Number);
        end.setHours(h, m, 0, 0);
      }

      // Cross-reference Description Data
      const info = courseInfoMap[(item.Course || "").trim()] || {};
      item["CourseLink"] = info.CourseLink || null;
      item["Description"] = info.Description || "No description available.";
      item["TargetAudience"] = info.TargetAudience || "General Audience";
      item["Trainer"] = info.Trainer || "TBD";

      return {
        title: item.Course || item.Title || "(Untitled)",
        start,
        end,
        extendedProps: item,
      };
    });

    return allEvents.filter((ev) => !isNaN(ev.start.getTime()));
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

// --- MODAL DISPLAY ---

function showEventDetailsFromData(data = {}) {
  const detailsEl = getVisibleById("modalDetails");
  if (!detailsEl) return;
  detailsEl.innerHTML = "";

  // Fields to hide from the lower technical list
  const excludedFields = [
    "Course",
    "Enrolment Start Date",
    "Enrolment End Date",
    "Primary Trainer",
    "Minimum Attendees",
    "Customers",
    "All Delegates Count",
    "Event Status",
    "Category",
    "Sub-Category",
    "Enable Learner Access",
    "Last Updated By",
    "Last Updated Date",
    "Offering link",
    "CourseLink",
    "Description",
    "TargetAudience",
    "Trainer",
  ];

  // 1. HEADER BLOCK (Course, Description, Target Audience, Trainer)
  const headerFields = [
    { label: "Course", value: data.Course || data.title },
    { label: "Description", value: data.Description },
    { label: "Target Audience", value: data.TargetAudience },
    { label: "Trainer", value: data.Trainer },
  ];

  headerFields.forEach((field) => {
    const dt = document.createElement("dt");
    dt.className = "col-sm-4 text-primary";
    dt.textContent = field.label;
    const dd = document.createElement("dd");
    dd.className = "col-sm-8 fw-bold";
    dd.textContent = field.value || "Not specified";
    detailsEl.appendChild(dt);
    detailsEl.appendChild(dd);
  });

  const hr = document.createElement("div");
  hr.className = "col-12 my-2 border-bottom";
  detailsEl.appendChild(hr);

  // 2. TECHNICAL INFO BLOCK (Filtered)
  Object.entries(data).forEach(([key, value]) => {
    if (!value || excludedFields.includes(key)) return;

    const dt = document.createElement("dt");
    dt.className = "col-sm-4 text-truncate";
    dt.textContent = key;
    const dd = document.createElement("dd");
    dd.className = "col-sm-8";
    dd.textContent = formatValueForDisplay(value, key);
    detailsEl.appendChild(dt);
    detailsEl.appendChild(dd);
  });

  // 3. BOOKING BUTTON
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

// --- CALENDAR & LIST ---

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
      eventClick: (info) => {
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

  const list = document.createElement("div");
  list.className = "list-group";

  upcoming.forEach((ev) => {
    const btn = document.createElement("button");
    btn.className =
      "list-group-item list-group-item-action d-flex justify-content-between align-items-center";
    btn.innerHTML = `<div><strong>${ev.title}</strong><br><small>${ev.extendedProps.Category || ""}</small></div>
                          <span class="badge bg-primary rounded-pill">${formatDate(ev.start)}</span>`;
    btn.onclick = () => showEventDetailsFromData(ev.extendedProps);
    list.appendChild(btn);
  });

  container.innerHTML = "";
  container.appendChild(list);
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
        const courseLink = data.details["CourseLink"] || "#";

        html += `
                <div class="course-item mb-2">
                    <button class="btn btn-primary w-100 text-start d-flex justify-content-between align-items-center" data-bs-toggle="collapse" data-bs-target="#${uid}">
                        <span class="fw-bold">${name}</span>
                        <span class="badge bg-light text-primary">${data.sessions.length} Sessions</span>
                    </button>
                    <div class="collapse" id="${uid}">
                        <div class="card card-body border-top-0">
                            <div class="mb-3">
                                <p><strong>Description:</strong> ${data.details.Description || "No description available."}</p>
                                <p><strong>Target Audience:</strong> ${data.details.TargetAudience || "General Audience"}</p>
                                <p><strong>Trainer:</strong> ${data.details.Trainer || "TBD"}</p>
                            </div>
                            ${
                              data.sessions.length > 0
                                ? `
                                <div class="table-responsive">
                                    <table class="table table-sm table-hover border">
                                        <thead class="table-light">
                                            <tr>
                                                <th>Date</th>
                                                <th>Start Time</th>
                                                <th>End Time</th>
                                                <th>Venue</th>
                                                <th class="text-center">Places Remaining</th>
                                                <th class="text-center">Booking</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            ${data.sessions
                                              .map(
                                                (s) => `
                                                <tr>
                                                    <td>${formatDate(excelDateToJSDate(s["Start Date"]))}</td>
                                                    <td>${s["Start Time"] || "--:--"}</td>
                                                    <td>${s["End Time"] || "--:--"}</td>
                                                    <td>${s["Primary Venue"] || "Virtual"}</td>
                                                    <td class="text-center">${s["Places Remaining"] ?? "N/A"}</td>
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
      loadEvents().then(() => renderUpcomingList());
    });
  });
})();

document.addEventListener("DOMContentLoaded", initCalendar);
