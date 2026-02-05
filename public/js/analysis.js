// document.addEventListener("DOMContentLoaded", () => {
//     const departmentFilter = document.getElementById("departmentFilter");
//     const designationFilter = document.getElementById("designationFilter");
//     const startDate = document.getElementById("startDate");
//     const endDate = document.getElementById("endDate");
//     const exportBtn = document.getElementById("exportBtn");
//     const tableBody = document.getElementById("analysisTable");

//     let data = [];

//     async function fetchData() {
//       try {
//         const res = await fetch("/all-logs");
//         data = await res.json();
//         renderTable(data);
//       } catch (err) {
//         console.error("Failed to load data", err);
//       }
//     }

//     function applyFilters() {
//       const dept = departmentFilter.value;
//       const desg = designationFilter.value;
//       const start = startDate.value ? new Date(startDate.value) : null;
//       const end = endDate.value ? new Date(endDate.value) : null;

//       const filtered = data.filter(entry => {
//         const entryDate = new Date(entry.entryTime);
//         return (!dept || entry.department === dept) &&
//                (!desg || entry.designation === desg) &&
//                (!start || entryDate >= start) &&
//                (!end || entryDate <= end);
//       });

//       renderTable(filtered);
//     }

//     function renderTable(filtered) {
//       tableBody.innerHTML = "";
//       filtered.forEach(entry => {
//         const row = document.createElement("tr");
//         row.innerHTML = `
//           <td>${entry.name}</td>
//           <td>${entry.department}</td>
//           <td>${entry.designation}</td>
//           <td>${new Date(entry.entryTime).toLocaleDateString()}</td>
//           <td>${new Date(entry.entryTime).toLocaleTimeString()}</td>
//           <td>${entry.exitTime ? new Date(entry.exitTime).toLocaleTimeString() : '-'}</td>
//         `;
//         tableBody.appendChild(row);
//       });
//     }

//     function exportToCSV() {
//       let csv = "Name,Department,Designation,Entry Date,Entry Time,Exit Time\n";
//     }
//   });

document.addEventListener("DOMContentLoaded", () => {
  const departmentFilter = document.getElementById("departmentFilter");
  const designationFilter = document.getElementById("designationFilter");
  const startDate = document.getElementById("startDate");
  const endDate = document.getElementById("endDate");
  const exportBtn = document.getElementById("exportBtn");
  const tableBody = document.getElementById("analysisTable");
  const clearDbBtn = document.getElementById("clearDbBtn");

  let data = [];

  // Fetch data from backend
  async function fetchData() {
    try {
      const res = await fetch("/all-logs");
      data = await res.json();
      renderTable(data);
    } catch (err) {
      console.error("Failed to load data", err);
    }
  }

  // Apply all selected filters
  function applyFilters() {
    const dept = departmentFilter.value;
    const desg = designationFilter.value;
    const start = startDate.value ? new Date(startDate.value) : null;
    const end = endDate.value ? new Date(endDate.value) : null;

    const filtered = data.filter(entry => {
      const entryDate = new Date(entry.entryTime);
      return (!dept || entry.department === dept) &&
        (!desg || entry.designation === desg) &&
        (!start || entryDate >= start) &&
        (!end || entryDate <= end);
    });

    renderTable(filtered);
  }

  // Render the filtered or full table
  function renderTable(filtered) {
    tableBody.innerHTML = "";
    if (filtered.length === 0) {
      tableBody.innerHTML = "<tr><td colspan='6'>No matching entries found.</td></tr>";
      return;
    }

    filtered.forEach(entry => {
      const row = document.createElement("tr");
      row.innerHTML = `
        <td>${entry.name}</td>
        <td>${entry.department}</td>
        <td>${entry.designation}</td>
        <td>${new Date(entry.entryTime).toLocaleDateString()}</td>
        <td>${new Date(entry.entryTime).toLocaleTimeString()}</td>
        <td>${entry.exitTime ? new Date(entry.exitTime).toLocaleTimeString() : '-'}</td>
      `;
      tableBody.appendChild(row);
    });
  }

  // Export visible table to CSV
  function exportToCSV() {
    let csv = "Name,Department,Designation,Entry Date,Entry Time,Exit Time\n";
    const rows = tableBody.querySelectorAll("tr");

    rows.forEach(row => {
      const cols = row.querySelectorAll("td");
      const rowData = Array.from(cols).map(td => `"${td.innerText}"`).join(",");
      csv += rowData + "\n";
    });

    const blob = new Blob([csv], { type: "text/csv" });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "entry_logs.csv";
    a.click();
    window.URL.revokeObjectURL(url);
  }

  // ✅ MODIFIED: Updated the confirmation message to be more accurate.
  async function clearDatabase() {
    const token = sessionStorage.getItem('authToken');
    if (!token) {
        alert('Authentication error. Please log in as an administrator.');
        return;
    }

    // This confirmation text is now more specific.
    const isConfirmed = confirm('⚠️ ARE YOU SURE? \n\nThis will permanently delete ALL entry and exit logs.');

    if (isConfirmed) {
        try {
            const response = await fetch('/api/clear-database', {
                method: 'DELETE',
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });

            const result = await response.json();

            if (!response.ok) {
                throw new Error(result.message || 'Failed to clear logs.');
            }

            alert(result.message);
            fetchData(); // Refresh the table to show it's empty
        } catch (error) {
            alert('Error: ' + error.message);
        }
    }
  }



  // Attach event listeners
  departmentFilter.addEventListener("change", applyFilters);
  designationFilter.addEventListener("change", applyFilters);
  startDate.addEventListener("change", applyFilters);
  endDate.addEventListener("change", applyFilters);
  exportBtn.addEventListener("click", exportToCSV);
  clearDbBtn.addEventListener("click", clearDatabase);
  // Load initial data
  fetchData();
});
