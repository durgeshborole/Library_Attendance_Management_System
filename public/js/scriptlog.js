document.addEventListener("DOMContentLoaded", () => {
    const barcodeInput = document.getElementById("barcodeInput");
    const visitorDetails = document.getElementById("visitorDetails");
    const logTable = document.getElementById("logTable");
    const statusMsg = document.createElement("p");
    statusMsg.style.marginTop = "10px";
    barcodeInput.insertAdjacentElement("afterend", statusMsg);

    const bannerMsg = document.createElement("div");
    bannerMsg.id = "entryExitBanner";
    bannerMsg.style.cssText = `
   display: none;
  margin: 0 0 12px;
  padding: 10px 16px;
  border-radius: 6px;
  font-weight: 600;
  background: rgba(0,0,0,0.05);
  color: #222;
  position: relative;
  text-align: center;
  `;
    visitorDetails.prepend(bannerMsg);

    function showBannerMessage(text, bgColor) {
        bannerMsg.textContent = text;
        bannerMsg.style.background = bgColor;
        bannerMsg.style.color = "#fff";
        bannerMsg.style.display = "block";

        clearTimeout(bannerMsg._hideTimeout);
        bannerMsg._hideTimeout = setTimeout(() => {
            bannerMsg.style.display = "none";
        }, 2500);
    }


    let barcode = "";
    let typingTimer;
    let db;

    // --- IndexedDB Initialization ---
    const request = indexedDB.open("offline_scans", 1);

    request.onerror = (event) => {
        console.error("IndexedDB error:", event.target.error);
    };

    request.onupgradeneeded = (event) => {
        const db = event.target.result;
        db.createObjectStore("scans", { autoIncrement: true });
    };

    request.onsuccess = (event) => {
        db = event.target.result;
        if (navigator.onLine) {
            syncOfflineScans();
        }
    };

    // --- Online/Offline Event Listeners ---
    window.addEventListener('online', syncOfflineScans);
    window.addEventListener('offline', () => {
        statusMsg.textContent = "🔌 You are currently offline. Scans will be saved locally.";
        statusMsg.style.color = "orange";
    });


    // Barcode scanning functionality
    barcodeInput.addEventListener("input", () => {
        clearTimeout(typingTimer);
        barcode = barcodeInput.value.trim();

        typingTimer = setTimeout(() => {
            if (barcode) {
                if (navigator.onLine) {
                    submitBarcode(barcode);
                } else {
                    saveScanOffline(barcode);
                }
                barcodeInput.value = "";
                barcode = "";
            }
        }, 200);
    });

    function saveScanOffline(barcode) {
        if (!db) return;
        const transaction = db.transaction(["scans"], "readwrite");
        const store = transaction.objectStore("scans");
        store.add({ barcode, timestamp: new Date() });

        transaction.oncomplete = () => {
            statusMsg.textContent = "💾 Scan saved locally.";
            statusMsg.style.color = "orange";
        };

        transaction.onerror = (event) => {
            console.error("Error saving scan offline:", event.target.error);
            statusMsg.textContent = "❌ Error saving scan locally.";
            statusMsg.style.color = "red";
        };
    }

    async function syncOfflineScans() {
        if (!db) return;
        const transaction = db.transaction(["scans"], "readwrite");
        const store = transaction.objectStore("scans");
        const getAll = store.getAll();

        getAll.onsuccess = async (event) => {
            const offlineScans = event.target.result;
            if (offlineScans.length > 0) {
                statusMsg.textContent = `🔄 Syncing ${offlineScans.length} offline scans...`;
                statusMsg.style.color = "blue";

                for (const scan of offlineScans) {
                    await submitBarcode(scan.barcode);
                }

                const clearTransaction = db.transaction(["scans"], "readwrite");
                const clearStore = clearTransaction.objectStore("scans");
                clearStore.clear();

                statusMsg.textContent = "✅ All offline scans have been synced.";
                statusMsg.style.color = "green";
                fetchLiveLog();
            }
        };

        getAll.onerror = (event) => {
            console.error("Error fetching offline scans:", event.target.error);
        };
    }

    async function submitBarcode(barcode) {
        try {
            const response = await fetch("/scan", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ barcode }),
            });

            const data = await response.json();

            if (data.error) {
                statusMsg.textContent = data.error;
                statusMsg.style.color = "red";
            } else {
                displayVisitor(data);
                fetchLiveLog();
                statusMsg.textContent = `${data.status === 'entry' ? '✅ Entry' : '🚪 Exit'} recorded for ${data.name}`;
                statusMsg.style.color = "green";
            }

            if (data.status === 'entry') {
                showBannerMessage(`✅ Welcome ${data.name}! Entry recorded.`, "#2e7d32");
            } else if (data.status === 'exit') {
                showBannerMessage(`🚪 Thanks for coming, ${data.name}! Visit again.`, "#1565c0");
            }

        } catch (err) {
            console.error("Scan error:", err);
            statusMsg.textContent = "Error connecting to server";
            statusMsg.style.color = "red";
            saveScanOffline(barcode);
        }
    }

    async function fetchLiveLog() {
        try {
            const response = await fetch("/live-log");
            const log = await response.json();
            updateLiveLog(log);
        } catch (err) {
            console.error("Error fetching live log:", err);
            logTable.innerHTML = `<tr><td colspan="8" style="text-align: center; color: red;">Could not load live log.</td></tr>`;
        }
    }

    function displayVisitor(visitor) {
        const imageUrl = visitor.photoUrl || "./images/default.jpg";
        visitorDetails.innerHTML = `
      <h2>Visitor Details</h2>
      <div class="visitor-card">
        <div class="photo-side"><img src="${imageUrl}" alt="Visitor Photo" class="visitor-photo" /></div>
        <div class="info-side">
          <p><strong>Name:</strong> ${visitor.name}</p>
          <p><strong>Department:</strong> ${visitor.department}</p>
          <p><strong>Year:</strong> ${visitor.year || "-"}</p>
          <p><strong>Designation:</strong> ${visitor.designation}</p>
        </div>
      </div>`;
    }

    function updateLiveLog(log) {
        logTable.innerHTML = "";
        if (!log || log.length === 0) {
            const row = document.createElement("tr");
            row.innerHTML = `<td colspan="8" style="text-align: center;">No entries recorded for today.</td>`;
            logTable.appendChild(row);
        } else {
            log.forEach((entry) => {
                const row = document.createElement("tr");
                const duration = entry.exitTime ? ((new Date(entry.exitTime) - new Date(entry.entryTime)) / 1000).toFixed(0) : "-";
                row.innerHTML = `
          <td>${entry.barcode}</td>
          <td>${entry.name}</td>
          <td>${entry.department}</td>
          <td>${entry.year || "-"}</td>
          <td>${entry.designation}</td>
          <td>${formatDate(entry.entryTime)}</td>
          <td>${entry.exitTime ? formatDate(entry.exitTime) : "-"}</td>
          <td>${duration !== "-" ? formatSeconds(duration) : "-"}</td>`;
                logTable.appendChild(row);
            });
        }
    }

    function formatDate(dateStr) {
        if (!dateStr) return "-";
        return new Date(dateStr).toLocaleTimeString();
    }

    function formatSeconds(seconds) {
        if (seconds < 60) return `${seconds} sec`;
        if (seconds < 3600) return `${Math.floor(seconds / 60)} min`;
        const hours = Math.floor(seconds / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        return `${hours} hr ${minutes} min`;
    }

// 1. The Drawing Function (Simplified to match your ID)
function updateLiveLog(logs) {
    const tableBody = document.getElementById('logTable'); // MATCHES YOUR HTML
    
    if (!tableBody) {
        console.error("❌ Error: Could not find <tbody id='logTable'>");
        return;
    }

    tableBody.innerHTML = ''; // Clear old rows

    if (!logs || logs.length === 0) {
        tableBody.innerHTML = `<tr><td colspan="8" style="text-align: center;">No entries recorded for today.</td></tr>`;
        return;
    }

    logs.forEach(log => {
        // Calculate duration safely
        const duration = log.exitTime ? calculateDuration(log.entryTime, log.exitTime) : "-";
        
        const row = `
            <tr>
                <td>${log.barcode}</td>
                <td>${log.name}</td>
                <td>${log.department || "-"}</td>
                <td>${log.year || "-"}</td>
                <td>${log.designation || "-"}</td>
                <td>${formatTime(log.entryTime)}</td>
                <td>${log.exitTime ? formatTime(log.exitTime) : '<b style="color: green;">In Library</b>'}</td>
                <td>${duration}</td>
            </tr>
        `;
        tableBody.insertAdjacentHTML('beforeend', row);
    });
}

// 2. The Fetching Function
async function autoRefreshLogs() {
    try {
        const response = await fetch('https://library-attendance-management-system-8h3i.onrender.com/api/logs/attendance'); 
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);

        const data = await response.json();
        updateLiveLog(data);
        
        console.log("🔄 Table Synced");
    } catch (error) {
        console.error("❌ Auto-refresh failed:", error);
    }
}

// 3. The Execution (Heartbeat)
window.onload = autoRefreshLogs;    // Initial load

// Function to calculate time spent in library
function calculateDuration(entryTime, exitTime) {
    if (!exitTime) return "-";
    const start = new Date(entryTime);
    const end = new Date(exitTime);
    const diffInSeconds = Math.floor((end - start) / 1000);
    return formatSeconds(diffInSeconds);
}

// Function to convert seconds into HH:MM:SS format
function formatSeconds(seconds) {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    return [h, m, s].map(v => v < 10 ? "0" + v : v).filter((v, i) => v !== "00" || i > 0).join(":");
}

// Function to format the timestamp for the table (e.g., 10:30 AM)
function formatTime(dateString) {
    if (!dateString) return "-";
    const date = new Date(dateString);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}



    // Connect to the socket server
const socket = io();

socket.on("connect", () => {
    console.log("✅ Connected to Live Update Server!");
});

// This is what calls your manual function
socket.on('attendanceUpdate', (data) => {
    console.log("⚡ New data received from Socket!");
    
    // Check if the data is an array (the list of logs)
    if (Array.isArray(data)) {
        updateLiveLog(data); // Calls your manual barcode function
    } else {
        console.error("Data received is not an array:", data);
    }
});



    // Initial log fetch on page load
    fetchLiveLog();
});