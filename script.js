// Toggle page visibility
function showPage(pageId) {
  document
    .querySelectorAll(".page")
    .forEach((page) => page.classList.remove("active"));
  document.getElementById(pageId)?.classList.add("active");
  if (pageId === "Course_Catalogue") {
    initCalendar();
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

// ===== DARK MODE TOGGLE =====
const toggleDark = document.getElementById("toggleDark");
let isDarkMode = localStorage.getItem("dark-mode") === "true";

function updateDarkMode() {
  document.body.classList.toggle("dark-mode", isDarkMode);
  toggleDark.innerText = isDarkMode ? "☀️ Light Mode" : "🌙 Dark Mode";
  localStorage.setItem("dark-mode", isDarkMode);
}

toggleDark.addEventListener("click", function () {
  isDarkMode = !isDarkMode;
  updateDarkMode();
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
  updateDarkMode();
});
