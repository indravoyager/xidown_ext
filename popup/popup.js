document.addEventListener('DOMContentLoaded', () => {
  const toggle = document.getElementById('toggle-btn');
  const btnSync = document.getElementById('btn-cookies');
  const btnReload = document.getElementById('btn-reload');
  const btnClear = document.getElementById('btn-clear');
  const statusMsg = document.getElementById('status-msg');
  const m3u8Container = document.getElementById('m3u8-container');
  const m3u8List = document.getElementById('m3u8-list');

  // Load toggle state
  chrome.storage.local.get(['xidownEnabled'], (result) => {
    toggle.checked = result.xidownEnabled !== undefined ? result.xidownEnabled : true;
  });

  toggle.addEventListener('change', () => {
    const status = toggle.checked;
    chrome.storage.local.set({ xidownEnabled: status });
    chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
      if (tabs[0]) chrome.tabs.sendMessage(tabs[0].id, { action: "toggle_status", status: status });
    });
  });

  // Reload Page
  btnReload.addEventListener('click', () => {
    chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
      if (tabs[0]) chrome.tabs.reload(tabs[0].id);
      window.close();
    });
  });

  // Clear List
  btnClear.addEventListener('click', () => {
    chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
      if (tabs[0]) {
        chrome.runtime.sendMessage({ action: "clear_list", tabId: tabs[0].id });
        m3u8List.innerHTML = '';
        m3u8Container.style.display = 'none';
        statusMsg.innerText = "List Cleared.";
      }
    });
  });

  // Cookie Sync Logic
  btnSync.addEventListener('click', () => {
    chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
      const currentTab = tabs[0];
      if (!currentTab || !currentTab.url || currentTab.url.startsWith('chrome://')) {
        statusMsg.style.color = "#f59e0b";
        statusMsg.innerText = "Invalid Page!";
        return;
      }
      statusMsg.style.color = "#888";
      statusMsg.innerText = "Extracting Cookies...";
      
      chrome.cookies.getAll({url: currentTab.url}, (cookies) => {
        if (cookies.length === 0) {
          statusMsg.style.color = "#f59e0b"; statusMsg.innerText = "No cookies found."; return;
        }
        let netscapeContent = "# Netscape HTTP Cookie File\n\n";
        cookies.forEach(c => {
          netscapeContent += `${c.domain}\t${c.domain.startsWith('.')?"TRUE":"FALSE"}\t${c.path}\t${c.secure?"TRUE":"FALSE"}\t${c.expirationDate||0}\t${c.name}\t${c.value}\n`;
        });
        
        fetch('http://localhost:3000/update_cookies', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            domain: new URL(currentTab.url).hostname,
            content: netscapeContent 
          })
        })
        .then(response => response.json())
        .then(data => {
          if(data.status === 'success') {
            statusMsg.style.color = "#10b981"; statusMsg.innerText = "Cookies Saved!";
          } else { throw new Error(data.message); }
        })
        .catch(err => {
          statusMsg.style.color = "#ef4444"; statusMsg.innerText = "App Offline!";
        });
      });
    });
  });

  // [MARIBEL LOGIC] Find highest resolution in URL
  function getQualityScore(url) {
    const matches = url.match(/(\d{3,4})[pP]/g); 
    if (matches && matches.length > 0) {
        const scores = matches.map(m => parseInt(m));
        return Math.max(...scores);
    }
    if (url.includes('master') || url.includes('.m3u8')) return 9999; 
    return 0; 
  }

  // [MORE ACCURATE DETECTION LOGIC]
function getMediaCategory(url) {
    const low = url.toLowerCase();
    
    // 1. If URL contains clear audio label
    if (low.includes('audio') || low.includes('/a/') || low.includes('.m4a')) {
        return "AUDIO ONLY";
    }
    
    // 2. If URL contains only video label (often in separate parts)
    if (low.includes('video_only') || low.includes('/v/') || (low.includes('video') && !low.includes('audio'))) {
        return "VIDEO ONLY";
    }

    // 3. If common MP4/M3U8 format, usually contains both
    if (low.includes('.mp4') || low.includes('.m3u8') || low.includes('master')) {
        return "VIDEO + AUDIO";
    }
    
    return "MEDIA";
}

  // Get media list from background script
  chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
    const currentTab = tabs[0];
    if (!currentTab) return;

    chrome.runtime.sendMessage({
      action: "get_m3u8_list", 
      tabId: currentTab.id
    }, (response) => {
      const list = response && response.list ? response.list : [];

      if (list.length > 0) {
        m3u8Container.style.display = 'block';
        m3u8List.innerHTML = ''; 

        // Sort by highest resolution
        list.sort((a, b) => {
            const scoreA = getQualityScore(a.url);
            const scoreB = getQualityScore(b.url);
            return scoreB - scoreA;
        });

        list.forEach((item) => {
          const url = item.url;
          const fullTitle = item.title || "Unknown Title";
          const headers = item.headers;
          const type = item.type || "M3U8"; 
          
          const tagClass = (type === "MP4") ? "mp4-tag" : "m3u8-tag";
          const displayTitle = fullTitle.length > 30 ? fullTitle.substring(0, 30) + '...' : fullTitle;
          const qScore = getQualityScore(url);
          const mediaCat = getMediaCategory(url);
          
          let qualityLabel = "";
          if (qScore > 0 && qScore < 9999) {
              qualityLabel = `<span class="quality-tag">${qScore}p</span>`;
          }

          const div = document.createElement('div');
          div.className = 'm3u8-item';
          
          div.innerHTML = `
            <div class="item-top">
               <div class="item-info-group">
                   <span class="${tagClass}">${type}</span>
                   ${qualityLabel} 
                   <span class="m3u8-title" title="${fullTitle}">${displayTitle}</span>
               </div>
            </div>
            <div class="item-bottom">
                <div class="m3u8-url">${url}</div>
                <span class="media-cat-tag">${mediaCat}</span>
            </div>
          `;

          div.addEventListener('click', () => {
             sendToXidown(url, fullTitle, headers);
          });

          m3u8List.appendChild(div);
        });
      }
    });
  });

  function sendToXidown(url, title, headers) { 
    statusMsg.innerText = "Sending...";
    statusMsg.style.color = "#db2777"; 

    let cleanTitle = title.replace(/ \[[A-Z0-9]{4}\]$/, "");
    cleanTitle = cleanTitle.replace('_哔哩哔哩_bilibili', ''); 
    cleanTitle = cleanTitle.replace(/[\\/:*?"<>|]/g, '_').substring(0, 100);

    fetch('http://localhost:3000/download', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        url: url, 
        filename: cleanTitle,
        headers: headers 
      })
    })
    .then(response => response.json())
    .then(data => {
      if(data.status === 'success') {
        statusMsg.style.color = "#10b981"; 
        statusMsg.innerText = "Sent!";
      } else {
        throw new Error("Rejected");
      }
    })
    .catch(err => {
      console.error(err);
      statusMsg.style.color = "#ef4444"; 
      statusMsg.innerText = "Check App!";
    });
  }
});