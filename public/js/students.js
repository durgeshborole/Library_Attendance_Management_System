document.addEventListener("DOMContentLoaded", () => {
  const container = document.getElementById("studentsCardContainer");
  const searchInput = document.getElementById("searchInput");
  const paginationContainer = document.createElement("div");
  paginationContainer.id = "pagination";
  paginationContainer.style.textAlign = "center";
  paginationContainer.style.margin = "20px";
  document.body.appendChild(paginationContainer);

  let currentPage = 1;
  const limit = 20;
  let currentSearch = "";

  async function loadStudents(page = 1, search = "") {
    try {
      const res = await fetch(`/students?page=${page}&limit=${limit}&search=${encodeURIComponent(search)}`);
      const data = await res.json();
      renderTable(data.students);
      renderPagination(data.totalPages, data.currentPage);
    } catch (err) {
      console.error("Failed to load students", err);
      container.innerHTML = "<p>Error loading students.</p>";
    }
  }

  function renderTable(data) {
    container.innerHTML = "";

    if (!data || data.length === 0) {
      container.innerHTML = "<p style='text-align:center;'>No students found.</p>";
      return;
    }

    const fragment = document.createDocumentFragment();

    data.forEach(student => {
      const imgSrc = student.photoUrl;
      const card = document.createElement("div");
      card.className = "visitor-card";
      card.innerHTML = `
        <div class="photo-side">
          <img class="visitor-photo" src="${imgSrc}" loading="lazy" alt="Photo of ${student.name}" onerror="this.src='/images/default.jpg'" />

        </div>
        <div class="info-side">
          <h3>${student.name}</h3>
          <p><strong>Department:</strong> ${student.department}</p>
          <p><strong>Year:</strong> ${student.year}</p>
        </div>
      `;
      fragment.appendChild(card);
    });

    container.appendChild(fragment);
  }

  function renderPagination(totalPages, current) {
    paginationContainer.innerHTML = "";

    if (totalPages <= 1) return;

    const prev = document.createElement("button");
    prev.textContent = "⏪ Prev";
    prev.disabled = current === 1;
    prev.onclick = () => {
      currentPage--;
      loadStudents(currentPage, currentSearch);
    };

    const next = document.createElement("button");
    next.textContent = "Next ⏩";
    next.disabled = current === totalPages;
    next.onclick = () => {
      currentPage++;
      loadStudents(currentPage, currentSearch);
    };

    const pageInfo = document.createElement("span");
    pageInfo.textContent = ` Page ${current} of ${totalPages} `;
    pageInfo.style.margin = "0 10px";

    paginationContainer.appendChild(prev);
    paginationContainer.appendChild(pageInfo);
    paginationContainer.appendChild(next);
  }

  searchInput.addEventListener("input", () => {
    currentSearch = searchInput.value.toLowerCase();
    currentPage = 1;
    loadStudents(currentPage, currentSearch);
  });

  loadStudents(currentPage, currentSearch);
});
