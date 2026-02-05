// document.addEventListener("DOMContentLoaded", async () => {
//   const totalVisitorsEl = document.querySelector(".card:nth-child(1) p");
//   const currentlyInsideEl = document.querySelector(".card:nth-child(2) p");
//   const mostFrequentDeptEl = document.querySelector(".card:nth-child(3) p");
//   const lastEntryEl = document.querySelector(".card:nth-child(4) p");

//   try {
//     const res = await fetch("/stats");
//     const stats = await res.json();

//     totalVisitorsEl.textContent = stats.totalVisitorsToday;
//     currentlyInsideEl.textContent = stats.currentlyInside;
//     mostFrequentDeptEl.textContent = stats.mostFrequentDept || "-";
//     lastEntryEl.textContent = stats.lastEntry || "-";
//   } catch (error) {
//     console.error("Failed to load stats:", error);
//   }
// });

// document.addEventListener("DOMContentLoaded", async () => {
//   const totalVisitorsEl = document.querySelector(".card:nth-child(1) p");
//   const currentlyInsideEl = document.querySelector(".card:nth-child(2) p");
//   const mostFrequentDeptEl = document.querySelector(".card:nth-child(3) p");
//   const lastEntryEl = document.querySelector(".card:nth-child(4) p");

//   try {
//     const res = await fetch("/stats");
//     const stats = await res.json();

//     totalVisitorsEl.textContent = stats.totalVisitorsToday;
//     currentlyInsideEl.textContent = stats.currentlyInside;
//     mostFrequentDeptEl.textContent = stats.mostFrequentDept || "-";
//     lastEntryEl.textContent = stats.lastEntry || "-";
//   } catch (error) {
//     console.error("Failed to load stats:", error);
//   }

//   // 🚀 Load notices also
//   try {
//     const res = await fetch("/notices");
//     const notices = await res.json();

//     const noticeList = document.getElementById("noticeList");
//     noticeList.innerHTML = ""; // Clear old "Loading..."

//     if (notices.length === 0) {
//       noticeList.innerHTML = "<li>No notices available.</li>";
//     } else {
//       notices.forEach(notice => {
//         const li = document.createElement("li");
//         li.textContent = notice.text;
//         noticeList.appendChild(li);
//       });
//     }
//   } catch (error) {
//     console.error("Failed to load notices:", error);
//   }
// });


// const hamburger = document.querySelector('.hamburger');
// const navMenu = document.querySelector('.nav-menu');
// const navLinks = document.querySelectorAll('.nav-link');

// hamburger.addEventListener('click', () => {
//   hamburger.classList.toggle('active');
//   navMenu.classList.toggle('active');
// });

// navLinks.forEach(link => {
//   link.addEventListener('click', () => {
//     hamburger.classList.remove('active');
//     navMenu.classList.remove('active');
//   });
// });


// in stats.js

document.addEventListener("DOMContentLoaded", async () => {
  // --- Load Quick Stats ---
  const totalVisitorsEl = document.querySelector(".card:nth-child(1) p");
  const currentlyInsideEl = document.querySelector(".card:nth-child(2) p");
  const mostFrequentDeptEl = document.querySelector(".card:nth-child(3) p");
  const lastEntryEl = document.querySelector(".card:nth-child(4) p");

  try {
    const statsRes = await fetch("/stats");
    const stats = await statsRes.json();

    totalVisitorsEl.textContent = stats.totalVisitorsToday;
    currentlyInsideEl.textContent = stats.currentlyInside;
    mostFrequentDeptEl.textContent = stats.mostFrequentDept || "-";
    lastEntryEl.textContent = stats.lastEntry || "-";
  } catch (error) {
    console.error("Failed to load stats:", error);
  }

  // --- Load Notices ---
  const noticeList = document.getElementById("noticeList");
  if (noticeList) {
    try {
      const noticeRes = await fetch("/notices");
      const notices = await noticeRes.json();

      noticeList.innerHTML = ""; // Clear "Loading..."

      if (notices.length === 0) {
        noticeList.innerHTML = "<li>No recent notices available.</li>";
      } else {
        notices.forEach(notice => {
          const li = document.createElement("li");
          li.textContent = notice.text;
          noticeList.appendChild(li);
        });
      }
    } catch (error) {
      console.error("Failed to load notices:", error);
      noticeList.innerHTML = "<li>Could not load notices.</li>";
    }
  }
});

// --- Hamburger Menu Logic (if you have one) ---
const hamburger = document.querySelector('.hamburger');
const navMenu = document.querySelector('.nav-menu');
const navLinks = document.querySelectorAll('.nav-link');

if (hamburger && navMenu) {
  hamburger.addEventListener('click', () => {
    hamburger.classList.toggle('active');
    navMenu.classList.toggle('active');
  });

  navLinks.forEach(link => {
    link.addEventListener('click', () => {
      hamburger.classList.remove('active');
      navMenu.classList.remove('active');
    });
  });
}